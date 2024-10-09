import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { UserModule } from './users/user.module';
import { AuthModule } from './auth/auth.module';
import { ValidationModule } from './validation/validation.module';
import { CommonModule } from './common/common.module';
import { CompanyModule } from './company/company.module';
import { AudioModule } from './audios/audio.module';
import { CategoriesModule } from './categories/categories.module';

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
    CategoriesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
