import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class PeopleStrongService {
  private readonly logger = new Logger(PeopleStrongService.name);
  public readonly isEnabled = false;

  constructor(private readonly databaseService: DatabaseService) {}

  async syncEmployee(empId: number): Promise<{ success: boolean; message: string }> {
    if (!this.isEnabled) {
      this.logger.log(`PeopleStrong integration is disabled (peopleStrongEnabled=false). Sync skipped for EmpID ${empId}.`);
      return {
        success: false,
        message: 'PeopleStrong integration is disabled via configuration boundary.',
      };
    }
    // Future integration placeholder
    return { success: true, message: 'Synced' };
  }
}
