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
    return r.recordset;
  };

  const queryOne = async (text, params = {}) => {
    const rows = await query(text, params);
    return rows[0] || null;
  };

  try {
    console.log('Testing createCase simulation for KSA_CONTRACT_RENEWAL on Emp 3...');
    const empId = 3;
    const emp = await queryOne(
      `SELECT EmpID, FirstName, LastName, SubsidiaryID, EntityID, UAEEmployeeCategory, IqamaNumber,
              CONVERT(varchar(10), IqamaExpiry, 23) AS IqamaExpiry,
              CONVERT(varchar(10), JoiningDate, 23) AS JoiningDate,
              ContractRenewalCount, IsSaudiNational
       FROM dbo.Employee WHERE EmpID = @empId;`,
      { empId },
    );
    console.log('Emp:', emp);

    const firstStage = await queryOne(
      `SELECT TOP 1 * FROM dbo.PipelineStageMaster WHERE PipelineCode = 'KSA_CONTRACT_FIXED' ORDER BY SequenceOrder ASC;`,
    );
    console.log('First stage:', firstStage);

    const countRes = await queryOne(`SELECT COUNT(*) AS count FROM dbo.ComplianceCase;`);
    const caseNum = `CASE-SAUDI-${String((countRes?.count ?? 0) + 1).padStart(4, '0')}`;

    console.log('Inserting case...');
    const newCase = await queryOne(
      `
        INSERT INTO dbo.ComplianceCase (
          CaseNumber, EmpID, RegionCode, EntityID, EventCode, PipelineCode, CurrentStageKey,
          Status, Priority, TriggerDate, DueDate, AssignedRole, BlockReason, Source, MetaJson
        )
        OUTPUT INSERTED.*
        VALUES (
          @caseNum, @empId, 'saudi', @entityId, 'KSA_CONTRACT_RENEWAL', 'KSA_CONTRACT_FIXED',
          @stageKey, 'OPEN', 'HIGH', @triggerDate, @dueDate, @assignedRole, NULL, 'Test', @metaJson
        );
      `,
      {
        caseNum,
        empId,
        entityId: emp.EntityID || null,
        stageKey: firstStage.StageKey,
        triggerDate: '2026-10-01',
        dueDate: '2026-10-05',
        assignedRole: firstStage.ActorRole,
        metaJson: JSON.stringify({ test: 1 }),
      },
    );
    console.log('Created case:', newCase.CaseID, newCase.CaseNumber);

    // Rollback test case
    await pool.request().query(`DELETE FROM dbo.ComplianceCase WHERE CaseID = ${newCase.CaseID}`);
    console.log('Cleaned up test case');

  } catch (err) {
    console.error('❌ Error caught:', err);
  }

  await pool.close();
}

main().catch(console.error);
