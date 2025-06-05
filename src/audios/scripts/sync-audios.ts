import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { AudioMeilisearchSyncService } from '../audio_meilisearch_sync.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const syncService = app.get(AudioMeilisearchSyncService);

  await syncService.syncAudios();

  await app.close();
}
bootstrap();
