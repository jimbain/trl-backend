import { Injectable } from '@nestjs/common';
import { AudioSeedService } from 'src/audios/audio_seed.service';

@Injectable()
export class AudioSeeder {
  constructor(private readonly audioSeedService: AudioSeedService) {}

  async seed() {
    console.log(
      '###########################  AUDIO SEEDING START  ###########################',
    );

    await this.audioSeedService.seed();

    console.log(
      '###########################  AUDIO SEEDING END  ###########################',
    );
  }
}
