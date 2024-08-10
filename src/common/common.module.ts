import { Module } from '@nestjs/common';
import { TokenService } from './services/token.service';
import { MailgunService } from './services/mailgun.service';

@Module({
  providers: [TokenService, MailgunService],
  exports: [TokenService, MailgunService],
})
export class CommonModule {}
