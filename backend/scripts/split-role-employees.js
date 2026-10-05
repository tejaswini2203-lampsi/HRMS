/**
 * Give Admin, HR, and HOD distinct Employee records.
 * Does not delete data or change usernames/passwords.
 */
const sql = require('mssql/msnodesqlv8')

const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;'

async function deptId(pool, name) {
  const r = await pool
    .request()
    .input('name', name)
    .query(`SELECT DepartmentID FROM dbo.Department WHERE DepartmentName = @name`)
  if (!r.recordset[0]) throw new Error('Missing department ' + name)
  return r.recordset[0].DepartmentID
}

async function ensureEmployee(pool, { firstName, lastName, email, departmentId }) {
  const existing = await pool
    .request()
    .input('email', email)
    .query(`SELECT EmpID FROM dbo.Employee WHERE Email = @email`)
  if (existing.recordset[0]) {
    const empId = existing.recordset[0].EmpID
    await pool
      .request()
      .input('empId', empId)
      .input('firstName', firstName)
      .input('lastName', lastName)
      .input('departmentId', departmentId)
      .query(`
        UPDATE dbo.Employee
        SET FirstName = @firstName, LastName = @lastName, MiddleName = NULL,
            DepartmentID = @departmentId, Status = 'Active', UpdatedAt = SYSDATETIME()
        WHERE EmpID = @empId
      `)
    return empId
  }

  const created = await pool
    .request()
    .input('firstName', firstName)
    .input('lastName', lastName)
    .input('email', email)
    .input('departmentId', departmentId)
    .query(`
      INSERT INTO dbo.Employee (FirstName, LastName, DepartmentID, Status, Email)
      OUTPUT INSERTED.EmpID
      VALUES (@firstName, @lastName, @departmentId, 'Active', @email)
    `)
  return created.recordset[0].EmpID
}

;(async () => {
  const pool = await sql.connect({ connectionString: CONNECTION })
  const digitalId = await deptId(pool, 'Digital')
  const financeId = await deptId(pool, 'Finance')

  const adminEmpId = await ensureEmployee(pool, {
    firstName: 'Arjun',
    lastName: 'Menon',
    email: 'admin@eicscomp.com',
    departmentId: digitalId,
  })
  const hrEmpId = await ensureEmployee(pool, {
    firstName: 'Ananya',
    lastName: 'Rao',
    email: 'hr@eicscomp.com',
    departmentId: financeId,
  })

  await pool
    .request()
    .input('empId', adminEmpId)
    .query(`UPDATE dbo.AppUser SET EmpID = @empId, UpdatedAt = SYSDATETIME() WHERE Username = 'admin@eicscomp.com'`)
  await pool
    .request()
    .input('empId', hrEmpId)
    .query(`UPDATE dbo.AppUser SET EmpID = @empId, UpdatedAt = SYSDATETIME() WHERE Username = 'hr@eicscomp.com'`)

  // HOD remains Priya Nair (EmpID 2)
  const users = await pool.request().query(`
    SELECT u.Username, u.Role, e.EmpID, e.FirstName, e.LastName
    FROM AppUser u
    INNER JOIN Employee e ON e.EmpID = u.EmpID
    ORDER BY CASE u.Role WHEN 'ADMIN' THEN 1 WHEN 'HR' THEN 2 WHEN 'HOD' THEN 3 ELSE 4 END, u.UserID
  `)
  console.log(JSON.stringify(users.recordset, null, 2))
  await pool.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
