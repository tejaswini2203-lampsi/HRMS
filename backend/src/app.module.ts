import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { NotificationModule } from './notification/notification.module';
import { DepartmentModule } from './department/department.module';
import { EmployeeModule } from './employee/employee.module';
import { LeaveModule } from './leave/leave.module';
import { PassportModule } from './passport/passport.module';
import { VehicleModule } from './vehicle/vehicle.module';
import { FlightModule } from './flight/flight.module';

// HRMS Phase 1 Modules
import { AuditModule } from './audit/audit.module';
import { SlaModule } from './sla/sla.module';
import { MasterModule } from './master/master.module';
import { ComplianceModule } from './compliance/compliance.module';
import { WorkQueueModule } from './work-queue/work-queue.module';
import { DocumentModule } from './document/document.module';
import { SignatureModule } from './signature/signature.module';
import { PerformanceModule } from './performance/performance.module';
import { RequestModule } from './request/request.module';
import { LetterModule } from './letter/letter.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { ReportModule } from './report/report.module';

@Module({
  imports: [
    DatabaseModule,
    MailModule,
    NotificationModule,
    AuthModule,
    DepartmentModule,
    EmployeeModule,
    LeaveModule,
    PassportModule,
    VehicleModule,
    FlightModule,
    // HRMS Phase 1 Extensions
    AuditModule,
    SlaModule,
    MasterModule,
    ComplianceModule,
    WorkQueueModule,
    DocumentModule,
    SignatureModule,
    PerformanceModule,
    RequestModule,
    LetterModule,
    IntegrationsModule,
    ReportModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
