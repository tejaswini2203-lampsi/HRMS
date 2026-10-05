import { Global, Module } from '@nestjs/common';
import { PeopleStrongService } from './people-strong.service';
import { WhatsAppService } from './whatsapp.service';

@Global()
@Module({
  providers: [PeopleStrongService, WhatsAppService],
  exports: [PeopleStrongService, WhatsAppService],
})
export class IntegrationsModule {}
