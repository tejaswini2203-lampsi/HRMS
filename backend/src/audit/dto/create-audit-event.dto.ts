export class CreateAuditEventDto {
  actorEmpId?: number | null;
  actorName!: string;
  actorRole!: string;
  action!: string;
  module!: string;
  recordId!: string;
  beforeValue?: string | null;
  afterValue?: string | null;
  empId?: number | null;
  regionCode?: string | null;
  source?: string;
}
