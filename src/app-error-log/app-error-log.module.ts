import { Module } from '@nestjs/common';
import { AppErrorLogService } from './app-error-log.service';
import { AppErrorLogController } from './app-error-log.controller';
import { AppErrorLog } from './entities/app-error-log.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([AppErrorLog])],
  controllers: [AppErrorLogController],
  providers: [AppErrorLogService],
  exports: [AppErrorLogService],
})
export class AppErrorLogModule {}
