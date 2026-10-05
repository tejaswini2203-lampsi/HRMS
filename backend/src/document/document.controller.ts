import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { DocumentService } from './document.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import type { Response } from 'express';
import * as fs from 'fs';

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('category') category?: string,
    @Query('sourceModule') sourceModule?: string,
    @Query('sourceId') sourceId?: string,
    @Query('empId') empId?: string,
    @Query('regionCode') regionCode?: string,
  ) {
    return this.documentService.findAll({
      category,
      sourceModule,
      sourceId,
      empId: empId ? Number(empId) : undefined,
      regionCode,
      user,
    });
  }

  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documentService.findById(Number(id), user);
  }

  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const doc = await this.documentService.findById(Number(id), user);
    if (fs.existsSync(doc.FilePath)) {
      res.setHeader('Content-Type', doc.MimeType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${doc.FileName}"`,
      );
      fs.createReadStream(doc.FilePath).pipe(res);
    } else {
      res.status(404).send('File not found on disk');
    }
  }

  @Post()
  async create(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.documentService.create({
      ...body,
      user,
    });
  }
}
