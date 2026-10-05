export const APP_ROLES = ['EMPLOYEE', 'HOD', 'HR', 'ADMIN'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export interface AuthUser {
  userId: number;
  empId: number;
  username: string;
  role: AppRole;
  name: string;
  email: string | null;
  subsidiaryId: string | null;
}

export interface AppUserRecord {
  UserID: number;
  EmpID: number;
  Username: string;
  PasswordHash: string;
  Role: string;
  IsActive: boolean;
  CreatedAt: Date;
  UpdatedAt: Date;
  FirstName?: string;
  MiddleName?: string | null;
  LastName?: string;
  Email: string | null;
  SubsidiaryID?: string | null;
  EmployeeStatus?: string;
}
