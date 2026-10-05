import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { requireNonEmptyString } from '../common/validation.util';
import { CreateDepartmentDto } from './dto/create-department.dto';

export interface DepartmentRecord {
  DepartmentID: number;
  DepartmentName: string;
}

@Injectable()
export class DepartmentService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(): Promise<DepartmentRecord[]> {
    return this.databaseService.query<DepartmentRecord>(`
      SELECT DepartmentID, DepartmentName
      FROM Department
      ORDER BY DepartmentName;
    `);
  }

  async findById(id: number): Promise<DepartmentRecord> {
    const department = await this.databaseService.queryOne<DepartmentRecord>(
      `
        SELECT DepartmentID, DepartmentName
        FROM Department
        WHERE DepartmentID = @id;
      `,
      { id },
    );

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return department;
  }

  async create(dto: CreateDepartmentDto): Promise<DepartmentRecord> {
    const departmentName = requireNonEmptyString(
      dto.departmentName,
      'departmentName',
      200,
    );

    const existing = await this.databaseService.queryOne<{ DepartmentID: number }>(
      `
        SELECT DepartmentID
        FROM Department
        WHERE DepartmentName = @departmentName;
      `,
      { departmentName },
    );

    if (existing) {
      throw new BadRequestException('Department name already exists');
    }

    const created = await this.databaseService.queryOne<DepartmentRecord>(
      `
        INSERT INTO Department (DepartmentName)
        OUTPUT INSERTED.DepartmentID, INSERTED.DepartmentName
        VALUES (@departmentName);
      `,
      { departmentName },
    );

    if (!created) {
      throw new BadRequestException('Failed to create department');
    }

    return created;
  }

  async exists(id: number): Promise<boolean> {
    const row = await this.databaseService.queryOne<{ DepartmentID: number }>(
      `
        SELECT DepartmentID
        FROM Department
        WHERE DepartmentID = @id;
      `,
      { id },
    );
    return Boolean(row);
  }
}
