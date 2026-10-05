const sql = require('mssql/msnodesqlv8');
const DB_CONN =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function main() {
  const pool = await sql.connect({ connectionString: DB_CONN });

  const query = async (text, params = {}) => {
    const req = pool.request();
    for (const [k, v] of Object.entries(params)) {
      req.input(k, v === undefined ? null : v);
    }
    const r = await req.query(text);
    return r.recordset || [];
  };

  const queryOne = async (text, params = {}) => {
    const rows = await query(text, params);
    return rows[0] || null;
  };

  const createCase = async (data) => {
    const emp = await queryOne(
      `SELECT EmpID, FirstName, LastName, SubsidiaryID, EntityID, UAEEmployeeCategory, IqamaNumber,
              CONVERT(varchar(10), IqamaExpiry, 23) AS IqamaExpiry,
              CONVERT(varchar(10), JoiningDate, 23) AS JoiningDate,
              ContractRenewalCount, IsSaudiNational
       FROM dbo.Employee WHERE EmpID = @empId;`,
      { empId: data.empId },
    );

    const regionCode = data.regionCode || emp.SubsidiaryID || 'uae';
    let pipelineCode = data.pipelineCode || 'UAE_VISA_WORK_PERMIT';

    const firstStage = await queryOne(
      `SELECT TOP 1 * FROM dbo.PipelineStageMaster WHERE PipelineCode = @pipelineCode ORDER BY SequenceOrder ASC;`,
      { pipelineCode },
    );

    const stageKey = firstStage ? firstStage.StageKey : 'INITIAL';
    const assignedRole = firstStage ? firstStage.ActorRole : 'HR';

    const countRes = await queryOne(`SELECT COUNT(*) AS count FROM dbo.ComplianceCase;`);
    const caseNum = `CASE-${regionCode.toUpperCase()}-${String((countRes?.count ?? 0) + 1).padStart(4, '0')}`;

    const triggerDate = data.triggerDate || new Date().toISOString().slice(0, 10);
    const dueDate = new Date().toISOString().slice(0, 10);

    const newCase = await queryOne(
      `
        INSERT INTO dbo.ComplianceCase (
          CaseNumber, EmpID, RegionCode, EntityID, EventCode, PipelineCode, CurrentStageKey,
          Status, Priority, TriggerDate, DueDate, AssignedRole, BlockReason, Source, MetaJson
        )
        OUTPUT INSERTED.*
        VALUES (
          @caseNum, @empId, @regionCode, @entityId, @eventCode, @pipelineCode,
          @stageKey, 'OPEN', @priority, @triggerDate, @dueDate, @assignedRole, NULL, @source, @metaJson
        );
      `,
      {
        caseNum,
        empId: data.empId,
        regionCode,
        entityId: emp.EntityID || null,
        eventCode: data.eventCode,
        pipelineCode,
        stageKey,
        priority: data.priority || 'HIGH',
        triggerDate,
        dueDate,
        assignedRole,
        source: 'Scanner',
        metaJson: data.meta ? JSON.stringify(data.meta) : null,
      },
    );

    // Initial history
    await query(
      `
        INSERT INTO dbo.CaseStageHistory (
          CaseID, StageKey, StageName, ActorRole, ActorEmpID, ActionTaken, Comments, EnteredAt, SLAStatus
        ) VALUES (
          @caseId, @stageKey, @stageName, @actorRole, NULL, 'CASE_OPENED', 'Init', SYSDATETIME(), 'ON_TIME'
        );
      `,
      {
        caseId: newCase.CaseID,
        stageKey,
        stageName: firstStage?.StageName || stageKey,
        actorRole: 'SYSTEM',
      },
    );

    // Closure checklist
    const checklistItems = await query(
      `SELECT * FROM dbo.ClosureChecklistItemMaster WHERE PipelineCode = @pipelineCode;`,
      { pipelineCode },
    );
    for (const item of checklistItems) {
      const isLaborOnly = item.ApplicableCondition === 'Labor';
      const isSkilled = emp.UAEEmployeeCategory !== 'Labor';

      if (isLaborOnly && isSkilled) {
        await query(
          `
            INSERT INTO dbo.CaseChecklistProgress (CaseID, ChecklistID, ItemKey, ItemLabel, IsCompleted, CompletedAt)
            VALUES (@caseId, @checklistId, @itemKey, @itemLabel, 1, SYSDATETIME());
          `,
          {
            caseId: newCase.CaseID,
            checklistId: item.ChecklistID,
            itemKey: item.ItemKey,
            itemLabel: `${item.ItemLabel} (N/A - Skilled Employee)`,
          },
        );
      } else {
        await query(
          `
            INSERT INTO dbo.CaseChecklistProgress (CaseID, ChecklistID, ItemKey, ItemLabel, IsCompleted)
            VALUES (@caseId, @checklistId, @itemKey, @itemLabel, 0);
          `,
          {
            caseId: newCase.CaseID,
            checklistId: item.ChecklistID,
            itemKey: item.ItemKey,
            itemLabel: item.ItemLabel,
          },
        );
      }
    }

    // WorkQueueTask
    await query(
      `
        INSERT INTO dbo.WorkQueueTask (
          SourceModule, SourceID, ActionKey, TargetEmpID, RegionCode, AssignedRole,
          Title, Instruction, PrimaryActionLabel, Priority, DueDate, SLAStatus, Status
        ) VALUES (
          'Compliance', @sourceId, @actionKey, @targetEmpId, @regionCode, @assignedRole,
          @title, 'Test instruction', 'Proceed', 'HIGH', @dueDate, 'ON_TIME', 'OPEN'
        );
      `,
      {
        sourceId: String(newCase.CaseID),
        actionKey: stageKey,
        targetEmpId: emp.EmpID,
        regionCode,
        assignedRole,
        title: `${emp.FirstName} ${emp.LastName} - ${stageKey}`,
        dueDate,
      },
    );

    return newCase;
  };

  try {
    console.log('Testing full scan loop simulation...');
    const employees = await query(`
      SELECT EmpID, FirstName, LastName, SubsidiaryID, EmploymentType, UAEEmployeeCategory,
             IqamaExpiry, VisaExpiry, ContractExpiry, ContractRenewalCount, IsSaudiNational, Status
      FROM dbo.Employee WHERE Status = 'Active';
    `);

    const today = new Date();
    let created = 0;

    for (const emp of employees) {
      const region = emp.SubsidiaryID || 'uae';

      // 1. KSA Iqama Renewal
      if (region === 'saudi' && emp.IqamaExpiry) {
        const exp = new Date(emp.IqamaExpiry);
        const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 40 && diffDays >= -30) {
          const existing = await queryOne(
            `SELECT CaseID FROM dbo.ComplianceCase WHERE EmpID = @empId AND EventCode = 'KSA_IQAMA_RENEWAL' AND Status NOT IN ('COMPLETED', 'CANCELLED');`,
            { empId: emp.EmpID },
          );
          if (!existing) {
            console.log('Creating Iqama case for emp:', emp.EmpID);
            await createCase({
              empId: emp.EmpID,
              regionCode: 'saudi',
              eventCode: 'KSA_IQAMA_RENEWAL',
              pipelineCode: 'KSA_IQAMA',
            });
            created++;
          }
        }
      }

      // 2. KSA Contract Renewal
      if (region === 'saudi' && emp.ContractExpiry) {
        const exp = new Date(emp.ContractExpiry);
        const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 75 && diffDays >= -30) {
          const isSaudiOpen = emp.IsSaudiNational && (emp.ContractRenewalCount || 0) >= 3;
          const targetEvent = isSaudiOpen ? 'KSA_OPEN_CONTRACT' : 'KSA_CONTRACT_RENEWAL';
          const targetPipe = isSaudiOpen ? 'KSA_OPEN_CONTRACT' : 'KSA_CONTRACT_FIXED';

          const existing = await queryOne(
            `SELECT CaseID FROM dbo.ComplianceCase WHERE EmpID = @empId AND EventCode = @eventCode AND Status NOT IN ('COMPLETED', 'CANCELLED');`,
            { empId: emp.EmpID, eventCode: targetEvent },
          );
          if (!existing) {
            console.log('Creating contract case for emp:', emp.EmpID);
            await createCase({
              empId: emp.EmpID,
              regionCode: 'saudi',
              eventCode: targetEvent,
              pipelineCode: targetPipe,
            });
            created++;
          }
        }
      }

      // 3. UAE Visa
      if (region === 'uae' && emp.VisaExpiry) {
        const exp = new Date(emp.VisaExpiry);
        const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const leadTime = emp.UAEEmployeeCategory === 'Manager' ? 180 : 90;
        if (diffDays <= leadTime && diffDays >= -30) {
          const existing = await queryOne(
            `SELECT CaseID FROM dbo.ComplianceCase WHERE EmpID = @empId AND EventCode = 'UAE_VISA_RENEWAL' AND Status NOT IN ('COMPLETED', 'CANCELLED');`,
            { empId: emp.EmpID },
          );
          if (!existing) {
            console.log('Creating UAE Visa case for emp:', emp.EmpID);
            await createCase({
              empId: emp.EmpID,
              regionCode: 'uae',
              eventCode: 'UAE_VISA_RENEWAL',
              pipelineCode: 'UAE_VISA_WORK_PERMIT',
            });
            created++;
          }
        }
      }
    }

    console.log('Cases created in simulation:', created);
  } catch (err) {
    console.error('❌ Error caught:', err);
  }

  await pool.close();
}

main().catch(console.error);
