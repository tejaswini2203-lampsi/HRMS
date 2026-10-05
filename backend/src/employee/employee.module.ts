import { Module } from '@nestjs/common';
import { EmployeeController } from './employee.controller';
import { EmployeeService } from './employee.service';
import { DepartmentModule } from '../department/department.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DepartmentModule, AuthModule],
  controllers: [EmployeeController],
  providers: [EmployeeService],
  exports: [EmployeeService],
})
export class EmployeeModule {}
