import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../database/database.service';
import {
  buildRegionalUsername,
  parseSubsidiaryId,
} from '../common/subsidiary.util';
import {
  requireNonEmptyString,
  parsePositiveInt,
} from '../common/validation.util';
import { LoginDto } from './dto/login.dto';
import { APP_ROLES, AppRole, AppUserRecord, AuthUser } from './auth.types';

const USER_SELECT = `
  u.UserID,
  u.EmpID,
  u.Username,
  u.PasswordHash,
  u.Role,
  u.IsActive,
  u.CreatedAt,
  u.UpdatedAt,
  e.FirstName,
  e.MiddleName,
  e.LastName,
  e.Email,
  e.SubsidiaryID,
  e.Status AS EmployeeStatus
`;

@Injectable()
export class AuthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const username = requireNonEmptyString(dto.username, 'username', 100);
    const password = requireNonEmptyString(dto.password, 'password', 200);

    const user = await this.databaseService.queryOne<AppUserRecord>(
      `
        SELECT ${USER_SELECT}
        FROM AppUser u
        INNER JOIN Employee e ON e.EmpID = u.EmpID
        WHERE LOWER(u.Username) = LOWER(@username);
      `,
      { username },
    );

    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }

    if (!user.IsActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    const valid = await bcrypt.compare(password, user.PasswordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const authUser = this.toAuthUser(user);
    const accessToken = await this.jwtService.signAsync({
      sub: authUser.userId,
      empId: authUser.empId,
      username: authUser.username,
      role: authUser.role,
      name: authUser.name,
      email: authUser.email,
      subsidiaryId: authUser.subsidiaryId,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      user: authUser,
    };
  }

  logout() {
    return { message: 'Logged out successfully' };
  }

  /**
   * Creates an EMPLOYEE-role AppUser for a newly created employee.
   * Username prefers email; otherwise firstname.lastname+empid@eicscomp.com.
   * Password is hashed from EICS_DEFAULT_PASSWORD (never returned).
   */
  async ensureUserForEmployee(employee: {
    EmpID: number;
    FirstName: string;
    LastName: string;
    Email: string | null;
    Status: string;
    SubsidiaryID?: string | null;
  }): Promise<{ userId: number; username: string; role: string }> {
    const empId = Number(employee.EmpID);
    const existing = await this.databaseService.queryOne<{
      UserID: number;
      Username: string;
      Role: string;
    }>(
      `
        SELECT TOP 1 UserID, Username, Role
        FROM AppUser
        WHERE EmpID = @empId
        ORDER BY UserID;
      `,
      { empId },
    );
    if (existing) {
      return {
        userId: Number(existing.UserID),
        username: existing.Username,
        role: existing.Role,
      };
    }

    const subsidiaryId = parseSubsidiaryId(employee.SubsidiaryID) || 'uae';
    const baseFromEmail = employee.Email?.trim().toLowerCase() || '';
    let finalUsername = buildRegionalUsername(
      employee.FirstName,
      employee.LastName,
      empId,
      subsidiaryId,
      baseFromEmail || undefined,
    );

    const taken = await this.databaseService.queryOne<{ UserID: number }>(
      `SELECT UserID FROM AppUser WHERE LOWER(Username) = LOWER(@username)`,
      { username: finalUsername },
    );
    if (taken) {
      finalUsername = buildRegionalUsername(
        employee.FirstName,
        employee.LastName,
        empId,
        subsidiaryId,
      );
    }

    const password = process.env.EICS_DEFAULT_PASSWORD || 'eics@4321';
    const passwordHash = await bcrypt.hash(password, 10);
    const isActive = employee.Status !== 'Inactive';

    const created = await this.databaseService.queryOne<{
      UserID: number;
      Username: string;
      Role: string;
    }>(
      `
        INSERT INTO AppUser (EmpID, Username, PasswordHash, Role, IsActive)
        OUTPUT INSERTED.UserID, INSERTED.Username, INSERTED.Role
        VALUES (@empId, @username, @passwordHash, 'EMPLOYEE', @isActive);
      `,
      { empId, username: finalUsername, passwordHash, isActive },
    );

    if (!created) {
      throw new BadRequestException('Failed to create application user');
    }

    return {
      userId: Number(created.UserID),
      username: created.Username,
      role: created.Role,
    };
  }

  async listUsers() {
    const rows = await this.databaseService.query<AppUserRecord>(
      `
        SELECT ${USER_SELECT}
        FROM AppUser u
        INNER JOIN Employee e ON e.EmpID = u.EmpID
        ORDER BY
          CASE u.Role
            WHEN 'ADMIN' THEN 1
            WHEN 'HR' THEN 2
            WHEN 'HOD' THEN 3
            ELSE 4
          END,
          u.UserID;
      `,
    );
    return rows.map((row) => this.toPublicUser(row));
  }

  async updateRole(userId: number, roleRaw: string) {
    const id = parsePositiveInt(userId, 'id');
    const role = requireNonEmptyString(roleRaw, 'role', 20).toUpperCase();
    if (!APP_ROLES.includes(role as AppRole)) {
      throw new BadRequestException(
        `role must be one of: ${APP_ROLES.join(', ')}`,
      );
    }

    await this.findUserOrThrow(id);

    const updated = await this.databaseService.queryOne<AppUserRecord>(
      `
        UPDATE AppUser
        SET Role = @role, UpdatedAt = SYSDATETIME()
        OUTPUT
          INSERTED.UserID,
          INSERTED.EmpID,
          INSERTED.Username,
          INSERTED.PasswordHash,
          INSERTED.Role,
          INSERTED.IsActive,
          INSERTED.CreatedAt,
          INSERTED.UpdatedAt
        WHERE UserID = @id;
      `,
      { id, role },
    );

    if (!updated) {
      throw new NotFoundException('User not found');
    }

    return this.getPublicUserById(id);
  }

  async updateStatus(userId: number, isActive: boolean) {
    const id = parsePositiveInt(userId, 'id');
    if (typeof isActive !== 'boolean') {
      throw new BadRequestException('isActive must be a boolean');
    }

    await this.findUserOrThrow(id);

    const updated = await this.databaseService.queryOne<AppUserRecord>(
      `
        UPDATE AppUser
        SET IsActive = @isActive, UpdatedAt = SYSDATETIME()
        OUTPUT
          INSERTED.UserID,
          INSERTED.EmpID,
          INSERTED.Username,
          INSERTED.PasswordHash,
          INSERTED.Role,
          INSERTED.IsActive,
          INSERTED.CreatedAt,
          INSERTED.UpdatedAt
        WHERE UserID = @id;
      `,
      { id, isActive },
    );

    if (!updated) {
      throw new NotFoundException('User not found');
    }

    return this.getPublicUserById(id);
  }

  private async findUserOrThrow(id: number): Promise<void> {
    const row = await this.databaseService.queryOne<{ UserID: number }>(
      `SELECT UserID FROM AppUser WHERE UserID = @id`,
      { id },
    );
    if (!row) {
      throw new NotFoundException('User not found');
    }
  }

  private async getPublicUserById(id: number) {
    const row = await this.databaseService.queryOne<AppUserRecord>(
      `
        SELECT ${USER_SELECT}
        FROM AppUser u
        INNER JOIN Employee e ON e.EmpID = u.EmpID
        WHERE u.UserID = @id;
      `,
      { id },
    );
    if (!row) {
      throw new NotFoundException('User not found');
    }
    return this.toPublicUser(row);
  }

  private toAuthUser(row: AppUserRecord): AuthUser {
    const name = [row.FirstName, row.MiddleName, row.LastName]
      .filter(Boolean)
      .join(' ');
    return {
      userId: Number(row.UserID),
      empId: Number(row.EmpID),
      username: row.Username,
      role: row.Role as AppRole,
      name,
      email: row.Email ?? null,
      subsidiaryId: parseSubsidiaryId(row.SubsidiaryID),
    };
  }

  private toPublicUser(row: AppUserRecord) {
    const auth = this.toAuthUser(row);
    return {
      userId: auth.userId,
      empId: auth.empId,
      username: auth.username,
      role: auth.role,
      isActive: Boolean(row.IsActive),
      employeeName: auth.name,
      employeeEmail: row.Email ?? null,
      employeeStatus: row.EmployeeStatus ?? null,
      createdAt: row.CreatedAt,
      updatedAt: row.UpdatedAt,
    };
  }
}
