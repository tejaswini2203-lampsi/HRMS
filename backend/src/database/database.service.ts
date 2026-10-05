import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import sql from 'mssql/msnodesqlv8';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: sql.ConnectionPool | null = null;

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async connect(): Promise<void> {
    const connectionString =
      'Driver={ODBC Driver 18 for SQL Server};' +
      'Server=localhost\\SQLEXPRESS02;' +
      'Database=EICS_DB;' +
      'Trusted_Connection=Yes;' +
      'TrustServerCertificate=Yes;';

    this.pool = await sql.connect({
      connectionString,
    });

    console.log('✅ EICS_DB database connected successfully');
  }

  private async getPool(): Promise<sql.ConnectionPool> {
    if (!this.pool) {
      await this.connect();
    }
    return this.pool!;
  }

  async query<T = any>(
    queryText: string,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    try {
      const pool = await this.getPool();
      const request = pool.request();

      if (params) {
        for (const [key, value] of Object.entries(params)) {
          request.input(key, value === undefined ? null : value);
        }
      }

      const result = await request.query(queryText);
      return (result.recordset ?? []) as T[];
    } catch (error) {
      this.logger.error('Database query failed', error instanceof Error ? error.stack : undefined);
      throw new InternalServerErrorException('A database error occurred');
    }
  }

  async queryOne<T = any>(
    queryText: string,
    params?: Record<string, unknown>,
  ): Promise<T | null> {
    const rows = await this.query<T>(queryText, params);
    return rows[0] ?? null;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }
}
