import { Module, forwardRef } from '@nestjs/common';
import { AdminAuthController } from './controllers/admin-auth.controller';
import { AdminAuthService } from './services/admin-auth.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser } from './entities/admin_user.entity';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtAdminStrategy } from './strategies/jwt-admin.strategy';
import { JwtAdminAuthGuard } from './guards/jwt-admin-auth.guard';
import { CompanyModule } from 'src/companies/company.module';
import { AdminCompanyController } from './controllers/admin-company.controller';
import { AppConfigModule } from 'src/app-config/app-config.module';
import { AdminConfigurationController } from './controllers/admin-configuration.controller';
import { CatalogModule } from 'src/catalog/catalog.module';
import { CategoryModule } from 'src/categories/category.module';
import { AdminCatalogController } from './controllers/admin-catalog.controller';
import { AdminCompanyUserController } from './controllers/admin-company-user.controller';
import { UserModule } from 'src/users/user.module';
import { AdminCompanyCatalogController } from './controllers/admin-company-catalog.controller';
import { AdminAudioController } from './controllers/admin-audio.controller';
import { Audio } from 'src/audios/entities/audio.entity';
import { AdminAudioService } from './services/admin-audio.service';
import { AdminCategoryController } from './controllers/admin-category.controller';
import { AdminReportController } from './controllers/admin-report.controller';
import { AdminReportService } from './services/admin-report.service';
import { Company } from 'src/companies/entities/company.entity';
import { User } from 'src/users/entities/user.entity';
import { AdminNotificationService } from './services/admin-notification.service';
import { AdminNotificationController } from './controllers/admin-notification.controller';
import { UserAudioStatus } from 'src/users/entities/user_audio_status.entity';
import { UserAudioplayerPosition } from 'src/users/entities/user_audioplayer_position.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { AdminCompanyCatalogService } from './services/admin-company-catalog.service';
import { AdminCatalogService } from './services/admin-catalog.service';
import { AdminVideoController } from './controllers/admin-video.controller';
import { AdminPharmaController } from './controllers/admin-pharma.controller';
import { CommonModule } from 'src/common/common.module';
import { UserActivityLog } from 'src/users/entities/user_activity_log.entity';
import { AdminUserController } from './controllers/admin-user.controller';
import { AdminAppErrorLogController } from './controllers/admin-app-error-log.controller';
import { AppErrorLogModule } from 'src/app-error-log/app-error-log.module';
import { AudioModule } from 'src/audios/audio.module';
import { AdminAudioElasticsearchService } from './services/admin-audio-elasticsearch.service';
import { AppElasticsearchModule } from 'src/app-elasticsearch/app-elasticsearch.module';
import { AdminPharmaService } from './services/admin-pharma.service';
import { Pharma } from 'src/pharma/entities/pharma.entity';
import { AdminVideoService } from './services/admin-video.service';
import { Video } from 'src/video/entities/video.entity';
import { StorageModule } from 'src/storage/storage.module';
import { PharmaModule } from 'src/pharma/pharma.module';
import { VideoModule } from 'src/video/video.module';
import { AdminStorageController } from './controllers/admin-storage.controller';
import { VideoUserStatus } from 'src/video/entities/video-user-status.entity';
import { PharmaUserStatus } from 'src/pharma/entities/pharma-user-status.entity';
import { IsDefaultAudioCategoriesConstraint } from './validators/is-default-audio-categories.validator';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.getOrThrow<string>(
            'JWT_ADMIN_ACCESS_TOKEN_EXPIRES_IN',
          ),
          algorithm: 'HS384',
        },
        verifyOptions: {
          algorithms: ['HS384'],
        },
      }),
    }),
    TypeOrmModule.forFeature([
      AdminUser,
      Audio,
      Pharma,
      Video,
      Company,
      User,
      UserAudioStatus,
      VideoUserStatus,
      PharmaUserStatus,
      UserAudioplayerPosition,
      UserActivityLog,
      Notification,
    ]),
    forwardRef(() => AppErrorLogModule),
    forwardRef(() => AudioModule),
    forwardRef(() => PharmaModule),
    forwardRef(() => VideoModule),
    forwardRef(() => CompanyModule),
    forwardRef(() => CatalogModule),
    forwardRef(() => CategoryModule),
    forwardRef(() => AppConfigModule),
    forwardRef(() => CommonModule),
    forwardRef(() => UserModule),
    forwardRef(() => AppElasticsearchModule),
    forwardRef(() => StorageModule),
  ],
  controllers: [
    AdminAuthController,
    AdminCompanyController,
    AdminConfigurationController,
    AdminCatalogController,
    AdminCompanyUserController,
    AdminCompanyCatalogController,
    AdminCategoryController,
    AdminAudioController,
    AdminVideoController,
    AdminPharmaController,
    AdminReportController,
    AdminNotificationController,
    AdminUserController,
    AdminAppErrorLogController,
    AdminStorageController,
  ],
  providers: [
    AdminAuthService,
    JwtAdminStrategy,
    JwtAdminAuthGuard,
    AdminAudioService,
    AdminReportService,
    AdminNotificationService,
    AdminCatalogService,
    AdminCompanyCatalogService,
    AdminAudioElasticsearchService,
    AdminPharmaService,
    AdminVideoService,
    IsDefaultAudioCategoriesConstraint,
  ],
  exports: [],
})
export class AdminModule {}
