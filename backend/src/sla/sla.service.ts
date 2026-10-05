import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface SLARuleRecord {
  SLARuleID: number;
  RuleCode: string;
  RuleName: string;
  EventCode: string;
  RegionCode: string;
  TriggerLeadDays: number;
  SLADays: number;
  DayType: 'BUSINESS' | 'CALENDAR';
  ActorRole: string;
  VendorName: string | null;
  EscalationDays: number | null;
  PendingConfirmation: boolean;
  IsActive: boolean;
}

@Injectable()
export class SlaService {
  constructor(private readonly databaseService: DatabaseService) {}

  isBusinessDay(date: Date): boolean {
    const day = date.getDay(); // 0 is Sunday, 5 is Friday, 6 is Saturday
    // In GCC corporate standards (UAE/KSA): Sunday to Thursday are business days (5=Fri, 6=Sat are weekend)
    return day !== 5 && day !== 6;
  }

  addDays(date: Date, days: number, dayType: 'BUSINESS' | 'CALENDAR' = 'CALENDAR'): Date {
    const result = new Date(date);
    if (dayType === 'CALENDAR') {
      result.setDate(result.getDate() + days);
      return result;
    }

    let added = 0;
    while (added < days) {
      result.setDate(result.getDate() + 1);
      if (this.isBusinessDay(result)) {
        added++;
      }
    }
    return result;
  }

  calculateDueDate(startDate: Date, durationDays: number, dayType: 'BUSINESS' | 'CALENDAR'): Date {
    return this.addDays(startDate, durationDays, dayType);
  }

  getSLAStatus(dueDateStr: string | Date): 'ON_TIME' | 'NEAR_BREACH' | 'BREACHED' {
    const dueDate = new Date(dueDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return 'BREACHED';
    } else if (diffDays <= 2) {
      return 'NEAR_BREACH';
    } else {
      return 'ON_TIME';
    }
  }

  async getRuleByCode(ruleCode: string): Promise<SLARuleRecord | null> {
    return this.databaseService.queryOne<SLARuleRecord>(
      `SELECT * FROM dbo.SLARuleMaster WHERE RuleCode = @ruleCode AND IsActive = 1;`,
      { ruleCode },
    );
  }

  async getRulesByEvent(eventCode: string, regionCode?: string): Promise<SLARuleRecord[]> {
    let query = `SELECT * FROM dbo.SLARuleMaster WHERE EventCode = @eventCode AND IsActive = 1`;
    const params: Record<string, unknown> = { eventCode };
    if (regionCode) {
      query += ` AND (RegionCode = @regionCode OR RegionCode IS NULL)`;
      params.regionCode = regionCode;
    }
    return this.databaseService.query<SLARuleRecord>(query, params);
  }

  async getAllRules(): Promise<SLARuleRecord[]> {
    return this.databaseService.query<SLARuleRecord>(
      `SELECT * FROM dbo.SLARuleMaster ORDER BY SLARuleID ASC;`,
    );
  }
}
