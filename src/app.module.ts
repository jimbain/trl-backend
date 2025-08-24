import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { UserModule } from './users/user.module';
import { AuthModule } from './auth/auth.module';
import { ValidationModule } from './validation/validation.module';
import { CommonModule } from './common/common.module';
import { CompanyModule } from './companies/company.module';
import { AudioModule } from './audios/audio.module';
import { CategoryModule } from './categories/category.module';
import { AppConfigModule } from './app-config/app-config.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationModule } from './notification/notification.module';
import { AdminModule } from './admin/admin.module';
import { CatalogModule } from './catalog/catalog.module';
import { AppErrorLogModule } from './app-error-log/app-error-log.module';
import { PharmaModule } from './pharma/pharma.module';
import { VideoModule } from './video/video.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.dev', '.env.stage', '.env.prod'],
    }),
    DatabaseModule,
    UserModule,
    AuthModule,
    CommonModule,
    ValidationModule,
    CompanyModule,
    AudioModule,
    CategoryModule,
    AppConfigModule,
    ScheduleModule.forRoot(),
    NotificationModule,
    AdminModule,
    CatalogModule,
    AppErrorLogModule,
    PharmaModule,
    VideoModule,
    StorageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
