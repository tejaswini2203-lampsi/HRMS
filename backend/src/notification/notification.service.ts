import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { parsePositiveInt } from '../common/validation.util';
import { AuthUser } from '../auth/auth.types';
import { NotificationRecord, NotificationTarget } from './notification.types';

const NOTIFICATION_SELECT = `
  NotificationID,
  RecipientUserID,
  RecipientEmpID,
  Type,
  Title,
  Message,
  RelatedEntity,
  RelatedEntityID,
  IsRead,
  CreatedAt
`;

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async findForCurrentUser(user: AuthUser): Promise<NotificationRecord[]> {
    return this.databaseService.query<NotificationRecord>(
      `
        SELECT ${NOTIFICATION_SELECT}
        FROM Notification
        WHERE RecipientUserID = @userId
        ORDER BY CreatedAt DESC, NotificationID DESC;
      `,
      { userId: user.userId },
    );
  }

  async markRead(id: number, user: AuthUser): Promise<NotificationRecord> {
    const notificationId = parsePositiveInt(id, 'id');
    const existing = await this.databaseService.queryOne<NotificationRecord>(
      `
        SELECT ${NOTIFICATION_SELECT}
        FROM Notification
        WHERE NotificationID = @notificationId;
      `,
      { notificationId },
    );

    if (!existing) {
      throw new NotFoundException('Notification not found');
    }
    if (Number(existing.RecipientUserID) !== Number(user.userId)) {
      throw new ForbiddenException('Cannot access another user\'s notification');
    }

    const updated = await this.databaseService.queryOne<NotificationRecord>(
      `
        UPDATE Notification
        SET IsRead = 1
        OUTPUT
          INSERTED.NotificationID,
          INSERTED.RecipientUserID,
          INSERTED.RecipientEmpID,
          INSERTED.Type,
          INSERTED.Title,
          INSERTED.Message,
          INSERTED.RelatedEntity,
          INSERTED.RelatedEntityID,
          INSERTED.IsRead,
          INSERTED.CreatedAt
        WHERE NotificationID = @notificationId
          AND RecipientUserID = @userId;
      `,
      { notificationId, userId: user.userId },
    );

    return updated || { ...existing, IsRead: true };
  }

  async markAllRead(user: AuthUser): Promise<{ updated: number }> {
    await this.databaseService.query(
      `
        UPDATE Notification
        SET IsRead = 1
        WHERE RecipientUserID = @userId
          AND IsRead = 0;
      `,
      { userId: user.userId },
    );
    const row = await this.databaseService.queryOne<{ Cnt: number }>(
      `
        SELECT COUNT(*) AS Cnt
        FROM Notification
        WHERE RecipientUserID = @userId AND IsRead = 1;
      `,
      { userId: user.userId },
    );
    return { updated: Number(row?.Cnt || 0) };
  }

  async notify(options: {
    targets: NotificationTarget[];
    type: string;
    title: string;
    message: string;
    relatedEntity?: string | null;
    relatedEntityId?: number | null;
  }): Promise<void> {
    const unique = new Map<number, NotificationTarget>();
    for (const target of options.targets) {
      if (target?.UserID) unique.set(Number(target.UserID), target);
    }

    for (const target of unique.values()) {
      try {
        await this.databaseService.query(
          `
            INSERT INTO Notification (
              RecipientUserID,
              RecipientEmpID,
              Type,
              Title,
              Message,
              RelatedEntity,
              RelatedEntityID,
              IsRead
            )
            VALUES (
              @recipientUserId,
              @recipientEmpId,
              @type,
              @title,
              @message,
              @relatedEntity,
              @relatedEntityId,
              0
            );
          `,
          {
            recipientUserId: Number(target.UserID),
            recipientEmpId: Number(target.EmpID),
            type: options.type,
            title: options.title,
            message: options.message,
            relatedEntity: options.relatedEntity ?? null,
            relatedEntityId: options.relatedEntityId ?? null,
          },
        );
      } catch (error) {
        this.logger.warn(
          `Failed to create notification for user ${target.UserID}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    }
  }

  async findUsersByRole(role: string): Promise<NotificationTarget[]> {
    return this.databaseService.query<NotificationTarget>(
      `
        SELECT UserID, EmpID
        FROM AppUser
        WHERE Role = @role AND IsActive = 1;
      `,
      { role },
    );
  }

  async findHodUsersForDepartment(
    departmentId: number,
  ): Promise<NotificationTarget[]> {
    return this.databaseService.query<NotificationTarget>(
      `
        SELECT u.UserID, u.EmpID
        FROM AppUser u
        INNER JOIN Employee e ON e.EmpID = u.EmpID
        WHERE u.Role = 'HOD'
          AND u.IsActive = 1
          AND e.DepartmentID = @departmentId;
      `,
      { departmentId },
    );
  }

  async findUsersByEmpId(empId: number): Promise<NotificationTarget[]> {
    return this.databaseService.query<NotificationTarget>(
      `
        SELECT UserID, EmpID
        FROM AppUser
        WHERE EmpID = @empId AND IsActive = 1;
      `,
      { empId },
    );
  }
}
