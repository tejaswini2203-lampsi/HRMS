import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface SendMailResult {
  sent: boolean;
  skipped: boolean;
  error?: string;
  messageId?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  isConfigured(): boolean {
    return Boolean(process.env.MAIL_HOST && process.env.MAIL_FROM);
  }

  async sendMail(options: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<SendMailResult> {
    if (!this.isConfigured()) {
      this.logger.warn(
        'Mail not configured (MAIL_HOST / MAIL_FROM). Skipping send.',
      );
      return {
        sent: false,
        skipped: true,
        error: 'Mail service not configured',
      };
    }

    try {
      const port = Number(process.env.MAIL_PORT || 587);
      const secure =
        String(process.env.MAIL_SECURE || 'false').toLowerCase() === 'true';
      const transporter = nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port,
        secure,
        auth:
          process.env.MAIL_USER && process.env.MAIL_PASSWORD
            ? {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASSWORD,
              }
            : undefined,
      });

      const info = await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      return {
        sent: true,
        skipped: false,
        messageId: info.messageId,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown mail error';
      this.logger.error(`Failed to send email: ${message}`);
      return { sent: false, skipped: false, error: message };
    }
  }
}
