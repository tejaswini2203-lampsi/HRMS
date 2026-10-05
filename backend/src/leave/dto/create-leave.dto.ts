export class CreateLeaveDto {

  empId!: number;

  leaveType!: string;

  fromDate!: string;

  toDate!: string;

  leaveDayType!: string;

  initiatedBy?: number | null;

  initiatedRole?: string | null;

  remarks?: string | null;

}

