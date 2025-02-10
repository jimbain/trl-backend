import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigService } from './app-config.service';
import { AppConfig } from './entities/app-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AppConfig])],
  controllers: [],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
