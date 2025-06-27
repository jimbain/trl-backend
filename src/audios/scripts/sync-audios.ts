import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { AudioElasticsearchSyncService } from '../audio-elasticsearch-sync.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const syncService = app.get(AudioElasticsearchSyncService);

  await syncService.syncAudios();

  await app.close();
}
bootstrap();
