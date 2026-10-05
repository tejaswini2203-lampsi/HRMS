const sql = require('mssql/msnodesqlv8');
const DB_CONN =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function main() {
  const pool = await sql.connect({ connectionString: DB_CONN });

  const employees = await pool.request().query(`
    SELECT
      EmpID,
      FirstName,
      LastName,
      SubsidiaryID,
      EmploymentType,
      UAEEmployeeCategory,
      IqamaExpiry,
      VisaExpiry,
      ContractExpiry,
      ContractRenewalCount,
      IsSaudiNational,
      Status
    FROM dbo.Employee
    WHERE Status = 'Active';
  `);

  const today = new Date();
  const configRows = await pool.request().query(`SELECT ConfigKey, ConfigValue FROM dbo.SystemConfig;`);
  const configMap = Object.fromEntries(configRows.recordset.map(r => [r.ConfigKey, r.ConfigValue]));

  for (const emp of employees.recordset) {
    const region = emp.SubsidiaryID || 'uae';

    if (region === 'saudi' && emp.ContractExpiry) {
      console.log('Testing KSA Contract for EmpID:', emp.EmpID);
      const exp = new Date(emp.ContractExpiry);
      const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      console.log('DiffDays:', diffDays);
      if (diffDays <= 75 && diffDays >= -30) {
        const isSaudiOpen = emp.IsSaudiNational && (emp.ContractRenewalCount || 0) >= 3;
        const targetEvent = isSaudiOpen ? 'KSA_OPEN_CONTRACT' : 'KSA_CONTRACT_RENEWAL';
        const targetPipe = isSaudiOpen ? 'KSA_OPEN_CONTRACT' : 'KSA_CONTRACT_FIXED';

        console.log('Target pipe:', targetPipe);
        const firstStage = await pool.request()
          .input('pipelineCode', targetPipe)
          .query('SELECT TOP 1 * FROM dbo.PipelineStageMaster WHERE PipelineCode = @pipelineCode ORDER BY SequenceOrder ASC;');
        console.log('First stage:', firstStage.recordset[0]);
      }
    }

    if (region === 'uae' && emp.VisaExpiry) {
      console.log('Testing UAE Visa for EmpID:', emp.EmpID, emp.UAEEmployeeCategory);
      const exp = new Date(emp.VisaExpiry);
      const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const leadTime = emp.UAEEmployeeCategory === 'Manager' ? 180 : 90;
      if (diffDays <= leadTime && diffDays >= -30) {
        const firstStage = await pool.request()
          .input('pipelineCode', 'UAE_VISA_WORK_PERMIT')
          .query('SELECT TOP 1 * FROM dbo.PipelineStageMaster WHERE PipelineCode = @pipelineCode ORDER BY SequenceOrder ASC;');
        console.log('UAE First stage:', firstStage.recordset[0]?.StageKey);
      }
    }
  }

  // Now test passport loop
  const passportIntervals = [210, 90, 30];
  const passports = await pool.request().query(`
    SELECT
      p.PassportID,
      p.EmpID,
      p.PassportNumber,
      p.ExpiryDate,
      e.FirstName,
      e.LastName,
      e.SubsidiaryID
    FROM dbo.PassportDetail p
    INNER JOIN dbo.Employee e ON p.EmpID = e.EmpID
    WHERE p.IsActive = 1 AND e.Status = 'Active';
  `);

  for (const p of passports.recordset) {
    if (!p.ExpiryDate) continue;
    const expDate = new Date(p.ExpiryDate);
    const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    for (const interval of passportIntervals) {
      const lowerBound = interval === 30 ? 0 : interval - 60;
      if (diffDays <= interval && diffDays > lowerBound) {
        console.log('Passport alert matching for Emp:', p.EmpID, 'Interval:', interval);
        const appUser = await pool.request()
          .input('empId', p.EmpID)
          .query('SELECT TOP 1 UserID FROM dbo.AppUser WHERE EmpID = @empId;');
        console.log('AppUser for emp:', p.EmpID, 'is:', appUser.recordset[0]);
      }
    }
  }

  console.log('Simulation complete without error');
  await pool.close();
}

main().catch(console.error);
