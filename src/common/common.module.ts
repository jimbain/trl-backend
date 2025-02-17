import { Module } from '@nestjs/common';
import { TokenService } from './services/token.service';
import { MailgunService } from './services/mailgun.service';
import { FirebaseService } from './services/firebase.service';
import { HttpModule } from '@nestjs/axios';
import { FileManagerService } from './services/file-manager.service';

@Module({
  imports: [HttpModule],
  providers: [
    TokenService,
    MailgunService,
    FirebaseService,
    FileManagerService,
  ],
  exports: [TokenService, MailgunService, FirebaseService, FileManagerService],
})
export class CommonModule {}
