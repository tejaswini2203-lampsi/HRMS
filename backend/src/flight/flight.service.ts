import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EmployeeService } from '../employee/employee.service';
import {
  optionalDateString,
  optionalPositiveInt,
  parsePositiveInt,
  requireDateString,
  requireNonEmptyString,
} from '../common/validation.util';
import { CreateFlightTicketDto } from './dto/create-flight-ticket.dto';
import { UpdateFlightTicketDto } from './dto/update-flight-ticket.dto';

export interface FlightTicketRecord {
  TicketID: number;
  EmpID: number;
  TicketType: string;
  TravelDate: Date;
  ReturnDate: Date | null;
  Sector: string;
  BookingStatus: string;
  MarkedBy: number | null;
  MarkedDate: Date | null;
}

const FLIGHT_SELECT = `
  TicketID,
  EmpID,
  TicketType,
  TravelDate,
  ReturnDate,
  Sector,
  BookingStatus,
  MarkedBy,
  MarkedDate
`;

@Injectable()
export class FlightService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly employeeService: EmployeeService,
  ) {}

  async findByEmpId(
    empIdParam: string | number,
  ): Promise<FlightTicketRecord[]> {
    const empId = parsePositiveInt(empIdParam, 'empId');

    return this.databaseService.query<FlightTicketRecord>(
      `
        SELECT ${FLIGHT_SELECT}
        FROM FlightTicket
        WHERE EmpID = @empId
        ORDER BY TicketID DESC;
      `,
      { empId },
    );
  }

  async findById(id: number): Promise<FlightTicketRecord> {
    const ticketId = parsePositiveInt(id, 'id');
    const ticket = await this.databaseService.queryOne<FlightTicketRecord>(
      `
        SELECT ${FLIGHT_SELECT}
        FROM FlightTicket
        WHERE TicketID = @ticketId;
      `,
      { ticketId },
    );

    if (!ticket) {
      throw new NotFoundException('Flight ticket not found');
    }

    return ticket;
  }

  async create(dto: CreateFlightTicketDto): Promise<FlightTicketRecord> {
    const empId = parsePositiveInt(dto.empId, 'empId');
    const ticketType = requireNonEmptyString(dto.ticketType, 'ticketType', 100);
    const travelDate = requireDateString(dto.travelDate, 'travelDate');
    const returnDate =
      dto.returnDate !== undefined
        ? optionalDateString(dto.returnDate, 'returnDate')
        : null;
    const sector = requireNonEmptyString(dto.sector, 'sector', 200);
    const bookingStatus = dto.bookingStatus
      ? requireNonEmptyString(dto.bookingStatus, 'bookingStatus', 50)
      : 'Pending';
    const markedBy = optionalPositiveInt(dto.markedBy, 'markedBy');
    const markedDate =
      dto.markedDate !== undefined
        ? optionalDateString(dto.markedDate, 'markedDate')
        : markedBy !== null
          ? new Date().toISOString().slice(0, 10)
          : null;

    await this.ensureEmployeeExists(empId, 'empId');

    if (markedBy !== null) {
      await this.ensureEmployeeExists(markedBy, 'markedBy');
    }

    const created = await this.databaseService.queryOne<FlightTicketRecord>(
      `
        INSERT INTO FlightTicket (
          EmpID,
          TicketType,
          TravelDate,
          ReturnDate,
          Sector,
          BookingStatus,
          MarkedBy,
          MarkedDate
        )
        OUTPUT
          INSERTED.TicketID,
          INSERTED.EmpID,
          INSERTED.TicketType,
          INSERTED.TravelDate,
          INSERTED.ReturnDate,
          INSERTED.Sector,
          INSERTED.BookingStatus,
          INSERTED.MarkedBy,
          INSERTED.MarkedDate
        VALUES (
          @empId,
          @ticketType,
          @travelDate,
          @returnDate,
          @sector,
          @bookingStatus,
          @markedBy,
          @markedDate
        );
      `,
      {
        empId,
        ticketType,
        travelDate,
        returnDate,
        sector,
        bookingStatus,
        markedBy,
        markedDate,
      },
    );

    if (!created) {
      throw new BadRequestException('Failed to create flight ticket');
    }

    return created;
  }

  async update(
    id: number,
    dto: UpdateFlightTicketDto,
  ): Promise<FlightTicketRecord> {
    const ticketId = parsePositiveInt(id, 'id');
    const existing = await this.findById(ticketId);

    const hasUpdates =
      dto.ticketType !== undefined ||
      dto.travelDate !== undefined ||
      dto.returnDate !== undefined ||
      dto.sector !== undefined ||
      dto.bookingStatus !== undefined ||
      dto.markedBy !== undefined ||
      dto.markedDate !== undefined;

    if (!hasUpdates) {
      throw new BadRequestException('No fields provided to update');
    }

    const ticketType =
      dto.ticketType !== undefined
        ? requireNonEmptyString(dto.ticketType, 'ticketType', 100)
        : existing.TicketType;
    const travelDate =
      dto.travelDate !== undefined
        ? requireDateString(dto.travelDate, 'travelDate')
        : this.toDateOnly(existing.TravelDate);
    const returnDate =
      dto.returnDate !== undefined
        ? optionalDateString(dto.returnDate, 'returnDate')
        : existing.ReturnDate
          ? this.toDateOnly(existing.ReturnDate)
          : null;
    const sector =
      dto.sector !== undefined
        ? requireNonEmptyString(dto.sector, 'sector', 200)
        : existing.Sector;
    const bookingStatus =
      dto.bookingStatus !== undefined
        ? requireNonEmptyString(dto.bookingStatus, 'bookingStatus', 50)
        : existing.BookingStatus;
    const markedBy =
      dto.markedBy !== undefined
        ? optionalPositiveInt(dto.markedBy, 'markedBy')
        : existing.MarkedBy;
    const markedDate =
      dto.markedDate !== undefined
        ? optionalDateString(dto.markedDate, 'markedDate')
        : existing.MarkedDate
          ? this.toDateOnly(existing.MarkedDate)
          : null;

    if (markedBy !== null) {
      await this.ensureEmployeeExists(markedBy, 'markedBy');
    }

    const updated = await this.databaseService.queryOne<FlightTicketRecord>(
      `
        UPDATE FlightTicket
        SET
          TicketType = @ticketType,
          TravelDate = @travelDate,
          ReturnDate = @returnDate,
          Sector = @sector,
          BookingStatus = @bookingStatus,
          MarkedBy = @markedBy,
          MarkedDate = @markedDate
        OUTPUT
          INSERTED.TicketID,
          INSERTED.EmpID,
          INSERTED.TicketType,
          INSERTED.TravelDate,
          INSERTED.ReturnDate,
          INSERTED.Sector,
          INSERTED.BookingStatus,
          INSERTED.MarkedBy,
          INSERTED.MarkedDate
        WHERE TicketID = @ticketId;
      `,
      {
        ticketId,
        ticketType,
        travelDate,
        returnDate,
        sector,
        bookingStatus,
        markedBy,
        markedDate,
      },
    );

    if (!updated) {
      throw new NotFoundException('Flight ticket not found');
    }

    return updated;
  }

  private async ensureEmployeeExists(
    empId: number,
    fieldName: string,
  ): Promise<void> {
    const exists = await this.employeeService.exists(empId);
    if (!exists) {
      throw new BadRequestException(
        `${fieldName} does not reference a valid employee`,
      );
    }
  }

  private toDateOnly(value: Date | string): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
