import { Module } from '@nestjs/common';
import { AudioService } from './audio.service';
import { AudioController } from './audio.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AudioCategory } from './entities/audio_category.entity';
import { CompanyAudioCategory } from 'src/company/entities/company_audio_category.entity';
import { Audio } from './entities/audio.entity';

@Module({
  imports:[
    TypeOrmModule.forFeature([AudioCategory, CompanyAudioCategory, Audio]),
  ],
  controllers: [AudioController],
  providers: [AudioService],
})
export class AudioModule {}
