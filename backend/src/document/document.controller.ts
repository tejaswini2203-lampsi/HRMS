import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { DocumentService } from './document.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';
import type { Request, Response } from 'express';
import * as fs from 'fs';

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Get('types')
  async getDocumentTypes() {
    return this.documentService.getDocumentTypes();
  }

  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('category') category?: string,
    @Query('sourceModule') sourceModule?: string,
    @Query('sourceId') sourceId?: string,
    @Query('empId') empId?: string,
    @Query('regionCode') regionCode?: string,
    @Query('search') search?: string,
    @Query('signatureStatus') signatureStatus?: string,
    @Query('includeAllVersions') includeAllVersions?: string,
  ) {
    return this.documentService.findAll({
      category,
      sourceModule,
      sourceId,
      empId: empId ? Number(empId) : undefined,
      regionCode,
      search,
      signatureStatus,
      includeAllVersions: includeAllVersions === 'true' || includeAllVersions === '1',
      user,
    });
  }

  @Post('bulk')
  @Roles('HR', 'ADMIN')
  async bulkUpload(
    @Body('documents') documents: any[],
    @CurrentUser() user: AuthUser,
  ) {
    return this.documentService.bulkUpload(documents || [], user);
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
    const { filePath, fileName, mimeType } =
      await this.documentService.getDownloadStream(Number(id), user);

    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.status(404).send('File not found on disk');
    }
  }

  @Get(':id/versions')
  async getVersions(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documentService.getVersionHistory(Number(id), user);
  }

  @Post(':id/version')
  async uploadNewVersion(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documentService.uploadNewVersion(Number(id), {
      ...body,
      user,
    });
  }

  @Post(':id/sign')
  async signDocument(
    @Param('id') id: string,
    @Body('signatureData') signatureData: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    return this.documentService.signDocument(
      Number(id),
      signatureData,
      user,
      ipAddress,
    );
  }

  @Post()
  async create(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.documentService.create({
      ...body,
      user,
    });
  }
}
