export class UpdateFlightTicketDto {
  ticketType?: string;
  travelDate?: string;
  returnDate?: string | null;
  sector?: string;
  bookingStatus?: string;
  markedBy?: number | null;
  markedDate?: string | null;
}
