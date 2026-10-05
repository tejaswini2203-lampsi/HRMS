export class CreatePassportDto {
  empId!: number;
  passportNumber!: string;
  nationality!: string;
  issueDate!: string;
  expiryDate!: string;
  isActive?: boolean;
}
