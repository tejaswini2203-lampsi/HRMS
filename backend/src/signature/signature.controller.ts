import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SignatureService } from './signature.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import type { Request } from 'express';

@Controller('signatures')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SignatureController {
  constructor(private readonly signatureService: SignatureService) {}

  @Post()
  async sign(
    @Body() body: any,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    return this.signatureService.sign({
      ...body,
      user,
      ipAddress,
    });
  }

  @Get()
  async getSignatures(
    @Query('sourceModule') sourceModule: string,
    @Query('sourceId') sourceId: string,
  ) {
    return this.signatureService.getSignatures(sourceModule, sourceId);
  }
}
