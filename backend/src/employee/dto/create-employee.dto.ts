export class CreateEmployeeDto {
  firstName!: string;
  middleName?: string | null;
  lastName!: string;
  departmentId!: number;
  reportsToEmpId?: number | null;
  status?: string;
  email?: string | null;
  subsidiaryId?: string | null;

  // HRMS Phase 1 Extensions
  designation?: string | null;
  joiningDate?: string | null;
  employmentType?: string | null;
  entityId?: number | null;
  countryRegion?: string | null;
  salary?: number | null;
  iqamaNumber?: string | null;
  iqamaExpiry?: string | null;
  emiratesId?: string | null;
  emiratesIdExpiry?: string | null;
  visaNumber?: string | null;
  visaExpiry?: string | null;
  sponsor?: string | null;
  ksaVendorType?: string | null;
  uaeEmployeeCategory?: string | null;
  uaeVisaType?: string | null;
}
