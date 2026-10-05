import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LetterService } from './letter.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';

@Controller('letters')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LetterController {
  constructor(private readonly letterService: LetterService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('letterType') letterType?: string,
    @Query('status') status?: string,
    @Query('regionCode') regionCode?: string,
    @Query('empId') empId?: string,
  ) {
    return this.letterService.findAll(user, {
      letterType,
      status,
      regionCode,
      empId: empId ? Number(empId) : undefined,
    });
  }

  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.letterService.findById(Number(id), user);
  }

  @Post()
  async createLetterRequest(
    @Body() body: { letterType: string; remarks?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.letterService.createLetterRequest(body, user);
  }

  @Patch(':id/issue')
  async generateAndIssueLetter(
    @Param('id') id: string,
    @Body()
    body: {
      action: 'APPROVE' | 'REJECT';
      signatureData?: string;
      customContent?: string;
      remarks?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.letterService.generateAndIssueLetter(Number(id), body, user);
  }
}
