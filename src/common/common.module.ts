import { Module } from '@nestjs/common';
import { TokenService } from './services/token.service';
import { MailgunService } from './services/mailgun.service';
import { FirebaseService } from './services/firebase.service';
import { HttpModule } from '@nestjs/axios';
import { FileManagerService } from './services/file-manager.service';
import { CsvService } from './services/csv.service';
import { AudioEngineService } from './services/audio_engine.service';

@Module({
  imports: [HttpModule],
  providers: [
    AudioEngineService,
    TokenService,
    MailgunService,
    FirebaseService,
    FileManagerService,
    CsvService,
  ],
  exports: [
    AudioEngineService,
    TokenService,
    MailgunService,
    FirebaseService,
    FileManagerService,
    CsvService,
  ],
})
export class CommonModule {}
