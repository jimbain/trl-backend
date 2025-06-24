import { forwardRef, Module } from '@nestjs/common';
import { PharmaService } from './pharma.service';
import { PharmaController } from './pharma.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pharma } from './entities/pharma.entity';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Pharma]),
    forwardRef(() => StorageModule),
  ],
  controllers: [PharmaController],
  providers: [PharmaService],
  exports: [PharmaService],
})
export class PharmaModule {}
