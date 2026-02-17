import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { AudioElasticsearchSyncService } from '../audio-elasticsearch-sync.service';

async function bootstrap() {
  const categoryId = process.argv[2];

  if (!categoryId) {
    console.error('Usage: npm run elastic:sync-by-category <category-id>');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const syncService = app.get(AudioElasticsearchSyncService);

  console.log(`Syncing audios for category: ${categoryId}`);
  await syncService.syncAudiosByCategoryId(categoryId);

  await app.close();
}

bootstrap();
