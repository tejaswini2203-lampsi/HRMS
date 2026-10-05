import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { DepartmentService } from '../department/department.service';
import {
  optionalEmail,
  optionalPositiveInt,
  optionalString,
  parsePositiveInt,
  requireNonEmptyString,
} from '../common/validation.util';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { AuthService } from '../auth/auth.service';
import { requireSubsidiaryId } from '../common/subsidiary.util';
import { AuthUser } from '../auth/auth.types';

export interface EmployeeRecord {
  EmpID: number;
  FirstName: string;
  MiddleName: string | null;
  LastName: string;
  DepartmentID: number;
  ReportsToEmpID: number | null;
  Status: string;
  Email: string | null;
  SubsidiaryID: string | null;
  CreatedAt: Date;
  UpdatedAt: Date;
  Username?: string;
  Role?: string;

  // HRMS Phase 1 Extensions
  Designation?: string | null;
  JoiningDate?: string | null;
  EmploymentType?: string | null;
  EntityID?: number | null;
  CountryRegion?: string | null;
  Salary?: number | null;
  IqamaNumber?: string | null;
  IqamaExpiry?: string | null;
  EmiratesID?: string | null;
  EmiratesIDExpiry?: string | null;
  VisaNumber?: string | null;
  VisaExpiry?: string | null;
  Sponsor?: string | null;
  KSAVendorType?: string | null;
  UAEEmployeeCategory?: string | null;
  UAEVisaType?: string | null;
}

const EMPLOYEE_SELECT = `
  EmpID,
  FirstName,
  MiddleName,
  LastName,
  DepartmentID,
  ReportsToEmpID,
  Status,
  Email,
  SubsidiaryID,
  CreatedAt,
  UpdatedAt,
  Designation,
  JoiningDate,
  EmploymentType,
  EntityID,
  CountryRegion,
  Salary,
  IqamaNumber,
  IqamaExpiry,
  EmiratesID,
  EmiratesIDExpiry,
  VisaNumber,
  VisaExpiry,
  Sponsor,
  KSAVendorType,
  UAEEmployeeCategory,
  UAEVisaType
`;

const EMPLOYEE_OUTPUT = `
  INSERTED.EmpID,
  INSERTED.FirstName,
  INSERTED.MiddleName,
  INSERTED.LastName,
  INSERTED.DepartmentID,
  INSERTED.ReportsToEmpID,
  INSERTED.Status,
  INSERTED.Email,
  INSERTED.SubsidiaryID,
  INSERTED.CreatedAt,
  INSERTED.UpdatedAt,
  INSERTED.Designation,
  INSERTED.JoiningDate,
  INSERTED.EmploymentType,
  INSERTED.EntityID,
  INSERTED.CountryRegion,
  INSERTED.Salary,
  INSERTED.IqamaNumber,
  INSERTED.IqamaExpiry,
  INSERTED.EmiratesID,
  INSERTED.EmiratesIDExpiry,
  INSERTED.VisaNumber,
  INSERTED.VisaExpiry,
  INSERTED.Sponsor,
  INSERTED.KSAVendorType,
  INSERTED.UAEEmployeeCategory,
  INSERTED.UAEVisaType
`;

@Injectable()
export class EmployeeService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly departmentService: DepartmentService,
    private readonly authService: AuthService,
  ) {}

  private maskSalary(record: EmployeeRecord, user?: AuthUser): EmployeeRecord {
    if (!user) return record;
    const isHrOrAdmin = user.role === 'HR' || user.role === 'ADMIN';
    const isSelf = user.empId === record.EmpID;
    if (!isHrOrAdmin && !isSelf) {
      return { ...record, Salary: null };
    }
    return record;
  }

  async findAll(user?: AuthUser, subsidiary?: string): Promise<EmployeeRecord[]> {
    let query = `
      SELECT ${EMPLOYEE_SELECT}
      FROM Employee
      WHERE 1=1
    `;
    const params: Record<string, unknown> = {};

    if (subsidiary && subsidiary !== 'all') {
      query += ` AND SubsidiaryID = @subsidiary`;
      params.subsidiary = subsidiary.toLowerCase();
    }

    // Role-based scoping for HOD & Employee
    if (user?.role === 'EMPLOYEE') {
      // Return self
      query += ` AND EmpID = @userEmpId`;
      params.userEmpId = user.empId;
    } else if (user?.role === 'HOD') {
      // Return team members and self
      query += ` AND (ReportsToEmpID = @userEmpId OR EmpID = @userEmpId)`;
      params.userEmpId = user.empId;
    }
    // HR and ADMIN have cross-region visibility

    query += ` ORDER BY EmpID DESC;`;

    const records = await this.databaseService.query<EmployeeRecord>(query, params);
    return records.map((r) => this.maskSalary(r, user));
  }

  async findById(id: number, user?: AuthUser): Promise<EmployeeRecord> {
    const empId = parsePositiveInt(id, 'id');

    const employee = await this.databaseService.queryOne<EmployeeRecord>(
      `
        SELECT ${EMPLOYEE_SELECT}
        FROM Employee
        WHERE EmpID = @empId;
      `,
      { empId },
    );

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    // Role check
    if (user?.role === 'EMPLOYEE' && user.empId !== empId) {
      throw new ForbiddenException('You can only view your own employee record');
    }
    if (user?.role === 'HOD' && user.empId !== empId && employee.ReportsToEmpID !== user.empId) {
      throw new ForbiddenException('You can only view members of your own team');
    }

    return this.maskSalary(employee, user);
  }

  async exists(id: number): Promise<boolean> {
    const row = await this.databaseService.queryOne<{ EmpID: number }>(
      `
        SELECT EmpID
        FROM Employee
        WHERE EmpID = @id;
      `,
      { id },
    );
    return Boolean(row);
  }

  async create(dto: CreateEmployeeDto): Promise<EmployeeRecord> {
    const firstName = requireNonEmptyString(dto.firstName, 'firstName', 100);
    const lastName = requireNonEmptyString(dto.lastName, 'lastName', 100);
    const middleName = optionalString(dto.middleName, 'middleName', 100);
    const departmentId = parsePositiveInt(dto.departmentId, 'departmentId');
    const reportsToEmpId = optionalPositiveInt(dto.reportsToEmpId, 'reportsToEmpId');
    const status = dto.status ? requireNonEmptyString(dto.status, 'status', 20) : 'Active';
    const email = optionalEmail(dto.email, 'email');
    const subsidiaryId = requireSubsidiaryId(dto.subsidiaryId, 'subsidiaryId');

    // HRMS fields
    const designation = optionalString(dto.designation, 'designation', 150);
    const joiningDate = dto.joiningDate || null;
    const employmentType = optionalString(dto.employmentType, 'employmentType', 50);
    const entityId = dto.entityId ? Number(dto.entityId) : null;
    const countryRegion = optionalString(dto.countryRegion || subsidiaryId, 'countryRegion', 50);
    const salary = dto.salary !== undefined && dto.salary !== null ? Number(dto.salary) : null;
    const iqamaNumber = optionalString(dto.iqamaNumber, 'iqamaNumber', 50);
    const iqamaExpiry = dto.iqamaExpiry || null;
    const emiratesId = optionalString(dto.emiratesId, 'emiratesId', 50);
    const emiratesIdExpiry = dto.emiratesIdExpiry || null;
    const visaNumber = optionalString(dto.visaNumber, 'visaNumber', 50);
    const visaExpiry = dto.visaExpiry || null;
    const sponsor = optionalString(dto.sponsor, 'sponsor', 150);
    const ksaVendorType = optionalString(dto.ksaVendorType, 'ksaVendorType', 100);
    const uaeEmployeeCategory = optionalString(dto.uaeEmployeeCategory, 'uaeEmployeeCategory', 50);
    const uaeVisaType = optionalString(dto.uaeVisaType, 'uaeVisaType', 50);

    await this.ensureDepartmentExists(departmentId);

    if (reportsToEmpId !== null) {
      await this.ensureEmployeeExists(reportsToEmpId, 'reportsToEmpId');
    }

    const created = await this.databaseService.queryOne<EmployeeRecord>(
      `
        INSERT INTO Employee (
          FirstName,
          MiddleName,
          LastName,
          DepartmentID,
          ReportsToEmpID,
          Status,
          Email,
          SubsidiaryID,
          Designation,
          JoiningDate,
          EmploymentType,
          EntityID,
          CountryRegion,
          Salary,
          IqamaNumber,
          IqamaExpiry,
          EmiratesID,
          EmiratesIDExpiry,
          VisaNumber,
          VisaExpiry,
          Sponsor,
          KSAVendorType,
          UAEEmployeeCategory,
          UAEVisaType
        )
        OUTPUT
          ${EMPLOYEE_OUTPUT}
        VALUES (
          @firstName,
          @middleName,
          @lastName,
          @departmentId,
          @reportsToEmpId,
          @status,
          @email,
          @subsidiaryId,
          @designation,
          @joiningDate,
          @employmentType,
          @entityId,
          @countryRegion,
          @salary,
          @iqamaNumber,
          @iqamaExpiry,
          @emiratesId,
          @emiratesIdExpiry,
          @visaNumber,
          @visaExpiry,
          @sponsor,
          @ksaVendorType,
          @uaeEmployeeCategory,
          @uaeVisaType
        );
      `,
      {
        firstName,
        middleName,
        lastName,
        departmentId,
        reportsToEmpId,
        status,
        email,
        subsidiaryId,
        designation,
        joiningDate,
        employmentType,
        entityId,
        countryRegion,
        salary,
        iqamaNumber,
        iqamaExpiry,
        emiratesId,
        emiratesIdExpiry,
        visaNumber,
        visaExpiry,
        sponsor,
        ksaVendorType,
        uaeEmployeeCategory,
        uaeVisaType,
      },
    );

    if (!created) {
      throw new BadRequestException('Failed to create employee');
    }

    const account = await this.authService.ensureUserForEmployee(created);
    return { ...created, Username: account.username, Role: account.role };
  }

  async update(id: number, dto: UpdateEmployeeDto): Promise<EmployeeRecord> {
    const empId = parsePositiveInt(id, 'id');
    const existing = await this.findById(empId);

    const firstName =
      dto.firstName !== undefined
        ? requireNonEmptyString(dto.firstName, 'firstName', 100)
        : existing.FirstName;
    const lastName =
      dto.lastName !== undefined
        ? requireNonEmptyString(dto.lastName, 'lastName', 100)
        : existing.LastName;
    const middleName =
      dto.middleName !== undefined
        ? optionalString(dto.middleName, 'middleName', 100)
        : existing.MiddleName;
    const departmentId =
      dto.departmentId !== undefined
        ? parsePositiveInt(dto.departmentId, 'departmentId')
        : existing.DepartmentID;
    const reportsToEmpId =
      dto.reportsToEmpId !== undefined
        ? optionalPositiveInt(dto.reportsToEmpId, 'reportsToEmpId')
        : existing.ReportsToEmpID;
    const status =
      dto.status !== undefined
        ? requireNonEmptyString(dto.status, 'status', 20)
        : existing.Status;
    const email =
      dto.email !== undefined
        ? optionalEmail(dto.email, 'email')
        : existing.Email;
    const subsidiaryId =
      dto.subsidiaryId !== undefined
        ? requireSubsidiaryId(dto.subsidiaryId, 'subsidiaryId')
        : existing.SubsidiaryID || 'uae';

    // HRMS fields
    const designation =
      dto.designation !== undefined
        ? optionalString(dto.designation, 'designation', 150)
        : existing.Designation ?? null;
    const joiningDate =
      dto.joiningDate !== undefined ? dto.joiningDate : existing.JoiningDate ?? null;
    const employmentType =
      dto.employmentType !== undefined
        ? optionalString(dto.employmentType, 'employmentType', 50)
        : existing.EmploymentType ?? null;
    const entityId =
      dto.entityId !== undefined ? (dto.entityId ? Number(dto.entityId) : null) : existing.EntityID ?? null;
    const countryRegion =
      dto.countryRegion !== undefined
        ? optionalString(dto.countryRegion, 'countryRegion', 50)
        : existing.CountryRegion ?? subsidiaryId;
    const salary =
      dto.salary !== undefined
        ? (dto.salary !== null ? Number(dto.salary) : null)
        : existing.Salary ?? null;
    const iqamaNumber =
      dto.iqamaNumber !== undefined
        ? optionalString(dto.iqamaNumber, 'iqamaNumber', 50)
        : existing.IqamaNumber ?? null;
    const iqamaExpiry =
      dto.iqamaExpiry !== undefined ? dto.iqamaExpiry : existing.IqamaExpiry ?? null;
    const emiratesId =
      dto.emiratesId !== undefined
        ? optionalString(dto.emiratesId, 'emiratesId', 50)
        : existing.EmiratesID ?? null;
    const emiratesIdExpiry =
      dto.emiratesIdExpiry !== undefined ? dto.emiratesIdExpiry : existing.EmiratesIDExpiry ?? null;
    const visaNumber =
      dto.visaNumber !== undefined
        ? optionalString(dto.visaNumber, 'visaNumber', 50)
        : existing.VisaNumber ?? null;
    const visaExpiry =
      dto.visaExpiry !== undefined ? dto.visaExpiry : existing.VisaExpiry ?? null;
    const sponsor =
      dto.sponsor !== undefined
        ? optionalString(dto.sponsor, 'sponsor', 150)
        : existing.Sponsor ?? null;
    const ksaVendorType =
      dto.ksaVendorType !== undefined
        ? optionalString(dto.ksaVendorType, 'ksaVendorType', 100)
        : existing.KSAVendorType ?? null;
    const uaeEmployeeCategory =
      dto.uaeEmployeeCategory !== undefined
        ? optionalString(dto.uaeEmployeeCategory, 'uaeEmployeeCategory', 50)
        : existing.UAEEmployeeCategory ?? null;
    const uaeVisaType =
      dto.uaeVisaType !== undefined
        ? optionalString(dto.uaeVisaType, 'uaeVisaType', 50)
        : existing.UAEVisaType ?? null;

    if (dto.departmentId !== undefined) {
      await this.ensureDepartmentExists(departmentId);
    }

    if (reportsToEmpId !== null) {
      if (reportsToEmpId === empId) {
        throw new BadRequestException('Employee cannot report to themselves');
      }
      await this.ensureEmployeeExists(reportsToEmpId, 'reportsToEmpId');
    }

    const updated = await this.databaseService.queryOne<EmployeeRecord>(
      `
        UPDATE Employee
        SET
          FirstName = @firstName,
          MiddleName = @middleName,
          LastName = @lastName,
          DepartmentID = @departmentId,
          ReportsToEmpID = @reportsToEmpId,
          Status = @status,
          Email = @email,
          SubsidiaryID = @subsidiaryId,
          Designation = @designation,
          JoiningDate = @joiningDate,
          EmploymentType = @employmentType,
          EntityID = @entityId,
          CountryRegion = @countryRegion,
          Salary = @salary,
          IqamaNumber = @iqamaNumber,
          IqamaExpiry = @iqamaExpiry,
          EmiratesID = @emiratesId,
          EmiratesIDExpiry = @emiratesIdExpiry,
          VisaNumber = @visaNumber,
          VisaExpiry = @visaExpiry,
          Sponsor = @sponsor,
          KSAVendorType = @ksaVendorType,
          UAEEmployeeCategory = @uaeEmployeeCategory,
          UAEVisaType = @uaeVisaType,
          UpdatedAt = SYSDATETIME()
        OUTPUT
          ${EMPLOYEE_OUTPUT}
        WHERE EmpID = @empId;
      `,
      {
        empId,
        firstName,
        middleName,
        lastName,
        departmentId,
        reportsToEmpId,
        status,
        email,
        subsidiaryId,
        designation,
        joiningDate,
        employmentType,
        entityId,
        countryRegion,
        salary,
        iqamaNumber,
        iqamaExpiry,
        emiratesId,
        emiratesIdExpiry,
        visaNumber,
        visaExpiry,
        sponsor,
        ksaVendorType,
        uaeEmployeeCategory,
        uaeVisaType,
      },
    );

    if (!updated) {
      throw new NotFoundException('Employee not found');
    }

    return updated;
  }

  async deactivate(id: number): Promise<EmployeeRecord> {
    const empId = parsePositiveInt(id, 'id');
    await this.findById(empId);

    const updated = await this.databaseService.queryOne<EmployeeRecord>(
      `
        UPDATE Employee
        SET
          Status = @status,
          UpdatedAt = SYSDATETIME()
        OUTPUT
          ${EMPLOYEE_OUTPUT}
        WHERE EmpID = @empId;
      `,
      { empId, status: 'Inactive' },
    );

    if (!updated) {
      throw new NotFoundException('Employee not found');
    }

    return updated;
  }

  private async ensureDepartmentExists(departmentId: number): Promise<void> {
    const exists = await this.departmentService.exists(departmentId);
    if (!exists) {
      throw new BadRequestException('Department not found');
    }
  }

  private async ensureEmployeeExists(
    empId: number,
    fieldName: string,
  ): Promise<void> {
    const exists = await this.exists(empId);
    if (!exists) {
      throw new BadRequestException(
        `${fieldName} does not reference a valid employee`,
      );
    }
  }
}
