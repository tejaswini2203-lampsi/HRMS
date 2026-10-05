import { Injectable, Logger } from '@nestjs/common';

export interface IWhatsAppNotificationProvider {
  sendWhatsAppMessage(toPhone: string, templateName: string, params: Record<string, string>): Promise<boolean>;
}

@Injectable()
export class WhatsAppService implements IWhatsAppNotificationProvider {
  private readonly logger = new Logger(WhatsAppService.name);
  public readonly isEnabled = false;

  async sendWhatsAppMessage(
    toPhone: string,
    templateName: string,
    params: Record<string, string>,
  ): Promise<boolean> {
    if (!this.isEnabled) {
      this.logger.log(
        `WhatsApp notification provider is disabled (whatsAppEnabled=false). Message to ${toPhone} with template ${templateName} not sent.`,
      );
      return false;
    }
    return true;
  }
}
