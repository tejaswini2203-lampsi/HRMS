export interface NotificationRecord {
  NotificationID: number;
  RecipientUserID: number;
  RecipientEmpID: number;
  Type: string;
  Title: string;
  Message: string;
  RelatedEntity: string | null;
  RelatedEntityID: number | null;
  IsRead: boolean;
  CreatedAt: Date;
}

export interface NotificationTarget {
  UserID: number;
  EmpID: number;
}
