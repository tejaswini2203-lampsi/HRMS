import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EmployeeService } from '../employee/employee.service';
import { MailService } from '../mail/mail.service';
import { NotificationService } from '../notification/notification.service';
import {
  daysUntil,
  parsePositiveInt,
  requireDateString,
  requireNonEmptyString,
} from '../common/validation.util';
import { CreatePassportDto } from './dto/create-passport.dto';
import { UpdatePassportDto } from './dto/update-passport.dto';

export interface PassportRecord {
  PassportID: number;
  EmpID: number;
  PassportNumber: string;
  Nationality: string;
  IssueDate: Date;
  ExpiryDate: Date;
  IsActive: boolean;
}

export interface PassportAlertRecord {
  AlertID: number;
  PassportID: number;
  AlertType: string;
  SentDate: Date;
  RecipientList: string;
  Status: string;
}

const PASSPORT_SELECT = `
  PassportID,
  EmpID,
  PassportNumber,
  Nationality,
  IssueDate,
  ExpiryDate,
  IsActive
`;

/** Documented passport expiry alert windows (CHECK: 180d | 90d | 30d). */
const ALERT_THRESHOLDS = [
  { days: 180, alertType: '180d' },
  { days: 90, alertType: '90d' },
  { days: 30, alertType: '30d' },
] as const;

@Injectable()
export class PassportService {
  private readonly logger = new Logger(PassportService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly employeeService: EmployeeService,
    private readonly mailService: MailService,
    private readonly notificationService: NotificationService,
  ) {}

  async findByEmpId(empIdParam: string | number): Promise<PassportRecord[]> {
    const empId = parsePositiveInt(empIdParam, 'empId');

    const passports = await this.databaseService.query<PassportRecord>(
      `
        SELECT ${PASSPORT_SELECT}
        FROM PassportDetail
        WHERE EmpID = @empId
        ORDER BY PassportID DESC;
      `,
      { empId },
    );

    for (const passport of passports) {
      if (passport.IsActive) {
        await this.processExpiryAlertsForPassport(passport);
      }
    }

    return passports;
  }

  async findById(id: number): Promise<PassportRecord> {
    const passportId = parsePositiveInt(id, 'id');
    const passport = await this.databaseService.queryOne<PassportRecord>(
      `
        SELECT ${PASSPORT_SELECT}
        FROM PassportDetail
        WHERE PassportID = @passportId;
      `,
      { passportId },
    );

    if (!passport) {
      throw new NotFoundException('Passport not found');
    }

    return passport;
  }

  async create(dto: CreatePassportDto): Promise<PassportRecord> {
    const empId = parsePositiveInt(dto.empId, 'empId');
    const passportNumber = requireNonEmptyString(
      dto.passportNumber,
      'passportNumber',
      100,
    );
    const nationality = requireNonEmptyString(
      dto.nationality,
      'nationality',
      100,
    );
    const issueDate = requireDateString(dto.issueDate, 'issueDate');
    const expiryDate = requireDateString(dto.expiryDate, 'expiryDate');
    const isActive = dto.isActive === undefined ? true : Boolean(dto.isActive);

    if (expiryDate <= issueDate) {
      throw new BadRequestException(
        'expiryDate must be later than issueDate',
      );
    }

    await this.ensureEmployeeExists(empId);

    if (isActive) {
      await this.deactivateActivePassports(empId);
    }

    const created = await this.databaseService.queryOne<PassportRecord>(
      `
        INSERT INTO PassportDetail (
          EmpID,
          PassportNumber,
          Nationality,
          IssueDate,
          ExpiryDate,
          IsActive
        )
        OUTPUT
          INSERTED.PassportID,
          INSERTED.EmpID,
          INSERTED.PassportNumber,
          INSERTED.Nationality,
          INSERTED.IssueDate,
          INSERTED.ExpiryDate,
          INSERTED.IsActive
        VALUES (
          @empId,
          @passportNumber,
          @nationality,
          @issueDate,
          @expiryDate,
          @isActive
        );
      `,
      {
        empId,
        passportNumber,
        nationality,
        issueDate,
        expiryDate,
        isActive,
      },
    );

    if (!created) {
      throw new BadRequestException('Failed to create passport');
    }

    if (created.IsActive) {
      await this.processExpiryAlertsForPassport(created);
    }

    await this.notifyPassportChange(created, 'created');
    return created;
  }

  async update(id: number, dto: UpdatePassportDto): Promise<PassportRecord> {
    const passportId = parsePositiveInt(id, 'id');
    const existing = await this.findById(passportId);

    const hasUpdates =
      dto.passportNumber !== undefined ||
      dto.nationality !== undefined ||
      dto.issueDate !== undefined ||
      dto.expiryDate !== undefined ||
      dto.isActive !== undefined;

    if (!hasUpdates) {
      throw new BadRequestException('No fields provided to update');
    }

    const passportNumber =
      dto.passportNumber !== undefined
        ? requireNonEmptyString(dto.passportNumber, 'passportNumber', 100)
        : existing.PassportNumber;
    const nationality =
      dto.nationality !== undefined
        ? requireNonEmptyString(dto.nationality, 'nationality', 100)
        : existing.Nationality;
    const issueDate =
      dto.issueDate !== undefined
        ? requireDateString(dto.issueDate, 'issueDate')
        : this.toDateOnly(existing.IssueDate);
    const expiryDate =
      dto.expiryDate !== undefined
        ? requireDateString(dto.expiryDate, 'expiryDate')
        : this.toDateOnly(existing.ExpiryDate);
    const isActive =
      dto.isActive !== undefined ? Boolean(dto.isActive) : existing.IsActive;

    if (expiryDate <= issueDate) {
      throw new BadRequestException(
        'expiryDate must be later than issueDate',
      );
    }

    if (isActive && !existing.IsActive) {
      await this.deactivateActivePassports(existing.EmpID, passportId);
    }

    const updated = await this.databaseService.queryOne<PassportRecord>(
      `
        UPDATE PassportDetail
        SET
          PassportNumber = @passportNumber,
          Nationality = @nationality,
          IssueDate = @issueDate,
          ExpiryDate = @expiryDate,
          IsActive = @isActive
        OUTPUT
          INSERTED.PassportID,
          INSERTED.EmpID,
          INSERTED.PassportNumber,
          INSERTED.Nationality,
          INSERTED.IssueDate,
          INSERTED.ExpiryDate,
          INSERTED.IsActive
        WHERE PassportID = @passportId;
      `,
      {
        passportId,
        passportNumber,
        nationality,
        issueDate,
        expiryDate,
        isActive,
      },
    );

    if (!updated) {
      throw new NotFoundException('Passport not found');
    }

    if (updated.IsActive) {
      await this.processExpiryAlertsForPassport(updated);
    }

    await this.notifyPassportChange(updated, 'updated');
    return updated;
  }

  /**
   * Returns PassportAlertLog rows with EmpID for frontend notification views.
   */
  async findAllAlerts(): Promise<
    Array<PassportAlertRecord & { EmpID: number }>
  > {
    return this.databaseService.query<PassportAlertRecord & { EmpID: number }>(
      `
        SELECT
          a.AlertID,
          a.PassportID,
          a.AlertType,
          a.SentDate,
          a.RecipientList,
          a.Status,
          p.EmpID
        FROM PassportAlertLog a
        INNER JOIN PassportDetail p ON p.PassportID = a.PassportID
        ORDER BY a.SentDate DESC, a.AlertID DESC;
      `,
    );
  }

  /**
   * Logs PassportAlertLog entries for documented 180/90/30-day windows
   * and emails the employee linked to the passport.
   * Does not create duplicate alerts for the same passport + alert type.
   */
  async processExpiryAlertsForPassport(
    passport: PassportRecord,
  ): Promise<PassportAlertRecord[]> {
    const expiryDate = this.toDateOnly(passport.ExpiryDate);
    const remainingDays = daysUntil(expiryDate);
    const createdAlerts: PassportAlertRecord[] = [];

    let employeeEmail: string | null = null;
    let employeeName = `Employee #${passport.EmpID}`;
    try {
      const employee = await this.employeeService.findById(passport.EmpID);
      employeeEmail = employee.Email ?? null;
      employeeName = [employee.FirstName, employee.MiddleName, employee.LastName]
        .filter(Boolean)
        .join(' ');
    } catch (error) {
      this.logger.warn(
        `Could not load employee ${passport.EmpID} for passport alert email`,
      );
    }

    for (const threshold of ALERT_THRESHOLDS) {
      if (remainingDays > threshold.days) {
        continue;
      }

      const alertType = threshold.alertType;
      const alreadyLogged = await this.databaseService.queryOne<{
        AlertID: number;
      }>(
        `
          SELECT AlertID
          FROM PassportAlertLog
          WHERE PassportID = @passportId
            AND AlertType = @alertType;
        `,
        { passportId: passport.PassportID, alertType },
      );

      if (alreadyLogged) {
        continue;
      }

      const recipientList = employeeEmail || `(no email on EmpID ${passport.EmpID})`;
      let status = 'Logged';

      const alert = await this.databaseService.queryOne<PassportAlertRecord>(
        `
          INSERT INTO PassportAlertLog (
            PassportID,
            AlertType,
            SentDate,
            RecipientList,
            Status
          )
          OUTPUT
            INSERTED.AlertID,
            INSERTED.PassportID,
            INSERTED.AlertType,
            INSERTED.SentDate,
            INSERTED.RecipientList,
            INSERTED.Status
          VALUES (
            @passportId,
            @alertType,
            SYSDATETIME(),
            @recipientList,
            @status
          );
        `,
        {
          passportId: passport.PassportID,
          alertType,
          recipientList,
          status,
        },
      );

      if (!alert) {
        continue;
      }

      if (!employeeEmail) {
        status = 'Failed';
        this.logger.warn(
          `Passport alert ${alertType} for PassportID ${passport.PassportID}: employee has no email`,
        );
      } else {
        const mailResult = await this.mailService.sendMail({
          to: employeeEmail,
          subject: `EICS Passport Expiry Alert (${alertType})`,
          text: [
            `Hello ${employeeName},`,
            '',
            `This is an automated EICS notification.`,
            `Your passport (PassportID ${passport.PassportID}, number ${passport.PassportNumber})`,
            `expires on ${expiryDate}.`,
            `Alert window: ${alertType} (${remainingDays} day(s) remaining).`,
            '',
            'Please renew your passport before it expires.',
          ].join('\n'),
        });

        if (mailResult.sent) {
          status = 'Sent';
        } else {
          status = 'Failed';
          this.logger.warn(
            `Passport alert email ${alertType} failed: ${mailResult.error || 'unknown'}`,
          );
        }
      }

      const updatedAlert =
        await this.databaseService.queryOne<PassportAlertRecord>(
          `
            UPDATE PassportAlertLog
            SET Status = @status
            OUTPUT
              INSERTED.AlertID,
              INSERTED.PassportID,
              INSERTED.AlertType,
              INSERTED.SentDate,
              INSERTED.RecipientList,
              INSERTED.Status
            WHERE AlertID = @alertId;
          `,
          { alertId: alert.AlertID, status },
        );

      createdAlerts.push(updatedAlert || { ...alert, Status: status });
      await this.notifyPassportExpiry(passport, alertType, expiryDate);
    }

    return createdAlerts;
  }

  private async notifyPassportChange(
    passport: PassportRecord,
    action: 'created' | 'updated',
  ): Promise<void> {
    try {
      const employee = await this.employeeService.findById(passport.EmpID);
      const name = [employee.FirstName, employee.MiddleName, employee.LastName]
        .filter(Boolean)
        .join(' ');
      const targets = await this.notificationService.findUsersByEmpId(
        passport.EmpID,
      );
      await this.notificationService.notify({
        targets,
        type: action === 'created' ? 'PASSPORT_CREATED' : 'PASSPORT_UPDATED',
        title:
          action === 'created'
            ? 'Passport record created'
            : 'Passport record updated',
        message: `${name}, your passport ${passport.PassportNumber} was ${action}. Expiry: ${this.toDateOnly(passport.ExpiryDate)}.`,
        relatedEntity: 'PassportDetail',
        relatedEntityId: Number(passport.PassportID),
      });
    } catch {
      // Notification failure must not block passport workflow
    }
  }

  private async notifyPassportExpiry(
    passport: PassportRecord,
    alertType: string,
    expiryDate: string,
  ): Promise<void> {
    try {
      const targets = await this.notificationService.findUsersByEmpId(
        passport.EmpID,
      );
      await this.notificationService.notify({
        targets,
        type: 'PASSPORT_ALERT',
        title: `Passport expiry alert (${alertType})`,
        message: `Passport ${passport.PassportNumber} expires on ${expiryDate}. Alert window: ${alertType}.`,
        relatedEntity: 'PassportAlertLog',
        relatedEntityId: Number(passport.PassportID),
      });
    } catch {
      // Keep passport alert logging even if in-app notify fails
    }
  }

  private async deactivateActivePassports(
    empId: number,
    exceptPassportId?: number,
  ): Promise<void> {
    if (exceptPassportId) {
      await this.databaseService.query(
        `
          UPDATE PassportDetail
          SET IsActive = 0
          WHERE EmpID = @empId
            AND IsActive = 1
            AND PassportID <> @exceptPassportId;
        `,
        { empId, exceptPassportId },
      );
      return;
    }

    await this.databaseService.query(
      `
        UPDATE PassportDetail
        SET IsActive = 0
        WHERE EmpID = @empId
          AND IsActive = 1;
      `,
      { empId },
    );
  }

  private async ensureEmployeeExists(empId: number): Promise<void> {
    const exists = await this.employeeService.exists(empId);
    if (!exists) {
      throw new BadRequestException('empId does not reference a valid employee');
    }
  }

  private toDateOnly(value: Date | string): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
