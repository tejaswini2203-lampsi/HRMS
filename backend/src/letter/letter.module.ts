import { Module } from '@nestjs/common';
import { LetterService } from './letter.service';
import { LetterController } from './letter.controller';
import { DocumentModule } from '../document/document.module';
import { SignatureModule } from '../signature/signature.module';

@Module({
  imports: [DocumentModule, SignatureModule],
  controllers: [LetterController],
  providers: [LetterService],
  exports: [LetterService],
})
export class LetterModule {}
