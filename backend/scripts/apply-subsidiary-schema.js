/**
 * Multi-subsidiary schema + regional demo accounts with distinct names.
 * Password: EICS_SEED_PASSWORD or eics@4321
 *
 * admin.india  → Akshay Nair
 * admin.uae    → Ali Md
 * admin.saudi  → Rahul Kumar
 * hr.india     → Divya
 * hr.uae       → Shreya
 * hr.saudi     → Shaik Zayed
 * hod.india    → Sravan Kumar.V
 * hod.uae      → Sashi
 * hod.saudi    → Vyshnav
 * emp.india    → Nikhitha
 * emp.uae      → Saleem
 * emp.saudi    → Mudasiir
 */
const sql = require('mssql/msnodesqlv8')
const bcrypt = require('bcrypt')

const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;'

const DEMO_PASSWORD = process.env.EICS_SEED_PASSWORD || 'eics@4321'

/** @type {Array<{username: string, role: string, subsidiary: string, firstName: string, lastName: string, department: string}>} */
const REGIONAL_USERS = [
  {
    username: 'admin.india@eicscomp.com',
    role: 'ADMIN',
    subsidiary: 'india',
    firstName: 'Akshay',
    lastName: 'Nair',
    department: 'Digital',
  },
  {
    username: 'admin.uae@eicscomp.com',
    role: 'ADMIN',
    subsidiary: 'uae',
    firstName: 'Ali',
    lastName: 'Md',
    department: 'Digital',
  },
  {
    username: 'admin.saudi@eicscomp.com',
    role: 'ADMIN',
    subsidiary: 'saudi',
    firstName: 'Rahul',
    lastName: 'Kumar',
    department: 'Digital',
  },
  {
    username: 'hr.india@eicscomp.com',
    role: 'HR',
    subsidiary: 'india',
    firstName: 'Divya',
    lastName: '',
    department: 'Finance',
  },
  {
    username: 'hr.uae@eicscomp.com',
    role: 'HR',
    subsidiary: 'uae',
    firstName: 'Shreya',
    lastName: '',
    department: 'Finance',
  },
  {
    username: 'hr.saudi@eicscomp.com',
    role: 'HR',
    subsidiary: 'saudi',
    firstName: 'Shaik',
    lastName: 'Zayed',
    department: 'Finance',
  },
  {
    username: 'hod.india@eicscomp.com',
    role: 'HOD',
    subsidiary: 'india',
    firstName: 'Sravan',
    lastName: 'Kumar.V',
    department: 'Operations',
  },
  {
    username: 'hod.uae@eicscomp.com',
    role: 'HOD',
    subsidiary: 'uae',
    firstName: 'Sashi',
    lastName: '',
    department: 'Operations',
  },
  {
    username: 'hod.saudi@eicscomp.com',
    role: 'HOD',
    subsidiary: 'saudi',
    firstName: 'Vyshnav',
    lastName: '',
    department: 'Operations',
  },
  {
    username: 'employee.india@eicscomp.com',
    role: 'EMPLOYEE',
    subsidiary: 'india',
    firstName: 'Nikhitha',
    lastName: '',
    department: 'Digital',
  },
  {
    username: 'employee.uae@eicscomp.com',
    role: 'EMPLOYEE',
    subsidiary: 'uae',
    firstName: 'Saleem',
    lastName: '',
    department: 'Installation',
  },
  {
    username: 'employee.saudi@eicscomp.com',
    role: 'EMPLOYEE',
    subsidiary: 'saudi',
    firstName: 'Mudasiir',
    lastName: '',
    department: 'Production',
  },
]

async function deptId(pool, name) {
  const r = await pool
    .request()
    .input('name', name)
    .query(
      `SELECT TOP 1 DepartmentID FROM dbo.Department WHERE DepartmentName = @name`,
    )
  if (r.recordset[0]) return r.recordset[0].DepartmentID

  const any = await pool
    .request()
    .query(`SELECT TOP 1 DepartmentID FROM dbo.Department ORDER BY DepartmentID`)
  if (!any.recordset[0]) throw new Error('No departments found — seed departments first')
  console.warn(`Department "${name}" missing — using DepartmentID ${any.recordset[0].DepartmentID}`)
  return any.recordset[0].DepartmentID
}

async function ensureEmployee(pool, { firstName, lastName, email, departmentId, subsidiary }) {
  const existing = await pool
    .request()
    .input('email', email)
    .query(`SELECT EmpID FROM dbo.Employee WHERE LOWER(Email) = LOWER(@email)`)

  if (existing.recordset[0]) {
    const empId = existing.recordset[0].EmpID
    await pool
      .request()
      .input('empId', empId)
      .input('firstName', firstName)
      .input('lastName', lastName)
      .input('departmentId', departmentId)
      .input('subsidiary', subsidiary)
      .input('email', email)
      .query(`
        UPDATE dbo.Employee
        SET FirstName = @firstName,
            LastName = @lastName,
            MiddleName = NULL,
            DepartmentID = @departmentId,
            Email = @email,
            SubsidiaryID = @subsidiary,
            Status = 'Active',
            UpdatedAt = SYSDATETIME()
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
    .input('subsidiary', subsidiary)
    .query(`
      INSERT INTO dbo.Employee (
        FirstName, LastName, DepartmentID, Status, Email, SubsidiaryID
      )
      OUTPUT INSERTED.EmpID
      VALUES (
        @firstName, @lastName, @departmentId, 'Active', @email, @subsidiary
      )
    `)
  return created.recordset[0].EmpID
}

;(async () => {
  const pool = await sql.connect({ connectionString: CONNECTION })

  await pool.request().query(`
    IF COL_LENGTH('dbo.Employee', 'SubsidiaryID') IS NULL
    BEGIN
      ALTER TABLE dbo.Employee ADD SubsidiaryID nvarchar(10) NULL;
    END
  `)
  console.log('OK Employee.SubsidiaryID column')

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Employee_SubsidiaryID'
    )
    BEGIN
      ALTER TABLE dbo.Employee WITH NOCHECK
        ADD CONSTRAINT CK_Employee_SubsidiaryID
        CHECK (SubsidiaryID IS NULL OR SubsidiaryID IN ('uae', 'saudi', 'india'));
    END
  `)
  console.log('OK Employee SubsidiaryID CHECK')

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10)
  const deptCache = {}

  for (const u of REGIONAL_USERS) {
    if (!deptCache[u.department]) {
      deptCache[u.department] = await deptId(pool, u.department)
    }
    const departmentId = deptCache[u.department]
    const empId = await ensureEmployee(pool, {
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.username,
      departmentId,
      subsidiary: u.subsidiary,
    })

    const existing = await pool
      .request()
      .input('username', u.username)
      .query(`SELECT UserID FROM dbo.AppUser WHERE LOWER(Username) = LOWER(@username)`)

    if (existing.recordset.length) {
      await pool
        .request()
        .input('username', u.username)
        .input('hash', hash)
        .input('role', u.role)
        .input('empId', empId)
        .query(`
          UPDATE dbo.AppUser
          SET PasswordHash = @hash, Role = @role, EmpID = @empId,
              IsActive = 1, UpdatedAt = SYSDATETIME()
          WHERE LOWER(Username) = LOWER(@username)
        `)
      console.log(`Updated ${u.role} ${u.firstName} ${u.lastName} (${u.username})`)
    } else {
      await pool
        .request()
        .input('username', u.username)
        .input('hash', hash)
        .input('role', u.role)
        .input('empId', empId)
        .query(`
          INSERT INTO dbo.AppUser (EmpID, Username, PasswordHash, Role, IsActive)
          VALUES (@empId, @username, @hash, @role, 1)
        `)
      console.log(`Inserted ${u.role} ${u.firstName} ${u.lastName} (${u.username})`)
    }
  }

  // Keep legacy UAT logins usable; map to matching regional personas where possible
  const legacy = [
    { username: 'admin@eicscomp.com', link: 'admin.uae@eicscomp.com' },
    { username: 'hr@eicscomp.com', link: 'hr.uae@eicscomp.com' },
    { username: 'hod@eicscomp.com', link: 'hod.uae@eicscomp.com' },
    { username: 'employee@eicscomp.com', link: 'employee.india@eicscomp.com' },
  ]

  for (const item of legacy) {
    const source = await pool
      .request()
      .input('username', item.link)
      .query(`SELECT EmpID, Role FROM dbo.AppUser WHERE LOWER(Username) = LOWER(@username)`)
    if (!source.recordset[0]) continue
    const { EmpID, Role } = source.recordset[0]
    const existing = await pool
      .request()
      .input('username', item.username)
      .query(`SELECT UserID FROM dbo.AppUser WHERE LOWER(Username) = LOWER(@username)`)
    if (existing.recordset.length) {
      await pool
        .request()
        .input('username', item.username)
        .input('hash', hash)
        .input('role', Role)
        .input('empId', EmpID)
        .query(`
          UPDATE dbo.AppUser
          SET PasswordHash = @hash, Role = @role, EmpID = @empId,
              IsActive = 1, UpdatedAt = SYSDATETIME()
          WHERE LOWER(Username) = LOWER(@username)
        `)
    } else {
      await pool
        .request()
        .input('username', item.username)
        .input('hash', hash)
        .input('role', Role)
        .input('empId', EmpID)
        .query(`
          INSERT INTO dbo.AppUser (EmpID, Username, PasswordHash, Role, IsActive)
          VALUES (@empId, @username, @hash, @role, 1)
        `)
    }
    console.log(`Linked legacy ${item.username} → ${item.link}`)
  }

  await pool.close()
  console.log('Subsidiary demo accounts ready (password: ' + DEMO_PASSWORD + ')')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
