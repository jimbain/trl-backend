/**
 * Manual deep link generation.
 *
 *   npm run deep-links:generate
 *
 * Environment:
 *   AUDIO_ID                 single audio id
 *   AUDIO_IDS                comma-separated audio ids
 *   DOMAIN                   restrict to one company domain
 *   DEEP_LINK_BATCH_SIZE     titles per batch (default 50)
 *   DEEP_LINK_BATCH_DELAY_MS pause between batches (default 2000)
 *
 * The generation itself lives in DeepLinkGeneratorService, which the nightly
 * DeepLinkScheduler also calls. This file is only a command-line front end to
 * it — one implementation, so the cron and a manual run cannot drift apart.
 *
 * Deliberately NOT AppModule. Booting the whole application also starts
 * PythonRecommenderService, whose onModuleInit spawns the long-lived FAISS
 * child — on production a 2.7 GB index plus a 1.2 GB embedding model, loaded
 * a SECOND time alongside the copy the running API already holds. On an 8 GB
 * box with no swap that is an OOM kill, and the kernel takes the largest
 * process, which is the live recommender serving requests.
 *
 * DatabaseModule is not used either: it imports AudioModule, NotificationModule
 * and CompanyModule, which between them pull in Elasticsearch, storage and the
 * audio sync service. None of it is needed to write a jsonb column.
 */
import * as path from 'path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getDataSourceOptions } from 'src/database/data_source';
import { Audio } from '../entities/audio.entity';
import { Company } from 'src/companies/entities/company.entity';
import { BranchService } from 'src/common/services/branch.service';
import { DeepLinkGeneratorService } from '../services/deep-link-generator.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HttpModule,
    // The entity glob is anchored to this file rather than inherited from
    // getDataSourceOptions, which uses 'dist/**/entities/*.entity.js' resolved
    // against the working directory — fine for an npm script run from the
    // application root, wrong for anything launched from elsewhere. Listing
    // Audio and Company alone does not work: Audio has a `metadata` relation,
    // so the whole transitive set has to be present.
    TypeOrmModule.forRoot({
      ...getDataSourceOptions(),
      entities: [
        path.join(__dirname, '..', '..', '**', 'entities', '*.entity{.js,.ts}'),
      ],
    }),
    TypeOrmModule.forFeature([Audio, Company]),
  ],
  providers: [BranchService, DeepLinkGeneratorService],
})
class DeepLinkCliModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(DeepLinkCliModule);
  const generator = app.get(DeepLinkGeneratorService);

  const single = process.env.AUDIO_ID?.trim();
  const many = process.env.AUDIO_IDS?.trim()
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const audioIds = single ? [single] : many?.length ? many : undefined;

  const int = (raw: string | undefined, fallback: number) => {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  };

  console.log('🚀 Deep link generation');
  if (audioIds) console.log(`📌 Restricted to ${audioIds.length} audio id(s)`);

  try {
    const r = await generator.run({
      audioIds,
      domainFilter: process.env.DOMAIN?.trim(),
      batchSize: int(process.env.DEEP_LINK_BATCH_SIZE, 50),
      batchDelayMs: int(process.env.DEEP_LINK_BATCH_DELAY_MS, 2000),
      onProgress: (m) => console.log(`  ${m}`),
    });

    if (!r.ran) {
      console.warn('⚠️  Another run holds the lock — nothing was done.');
      await app.close();
      process.exit(0);
    }

    console.log('\n📊 Summary');
    console.log(`  Domains:               ${r.domains.join(', ') || '(none)'}`);
    console.log(`  Checked:               ${r.processed}/${r.found}`);
    console.log(`  ✓ Written:             ${r.written}`);
    console.log(`  = Already current:     ${r.unchanged}`);
    console.log(`  ✗ Failed:              ${r.failed}`);
    console.log(`  Duration:              ${Math.round(r.durationMs / 1000)}s`);

    await app.close();
    process.exit(r.failed > 0 && r.written === 0 && r.processed > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Fatal error during deep link generation:', error);
    await app.close();
    process.exit(1);
  }
}

void bootstrap();
