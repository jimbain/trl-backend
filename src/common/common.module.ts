import { Module } from '@nestjs/common';
import { TokenService } from './services/token.service';
import { MailgunService } from './services/mailgun.service';
import { FirebaseService } from './services/firebase.service';

@Module({
  providers: [TokenService, MailgunService, FirebaseService],
  exports: [TokenService, MailgunService, FirebaseService],
})
export class CommonModule {}
