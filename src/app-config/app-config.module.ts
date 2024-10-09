import { Module } from '@nestjs/common';
import { AppConfigService } from './app-config.service';
import { AppConfigController } from './app-config.controller';

@Module({
  controllers: [AppConfigController],
  providers: [AppConfigService],
})
export class AppConfigModule {}
