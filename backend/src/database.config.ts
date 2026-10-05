import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig: TypeOrmModuleOptions = {
  type: 'mssql',
  host: 'localhost',
  port: 1433,
  username: '',
  password: '',
  database: 'EICS_DB',

  options: {
    instanceName: 'SQLEXPRESS02',
    trustServerCertificate: true,
  },

  synchronize: false,
  autoLoadEntities: true,
};