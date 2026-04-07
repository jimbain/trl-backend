import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { ItemExtractorHelper } from '../helpers/item-extractor.helper';
import { Repository } from 'typeorm';
import { AppErrorLog } from '../entities/app-error-log.entity';
import { getRepositoryToken } from '@nestjs/typeorm';

const BATCH_SIZE = 100;

async function populateItemInfo(
  appErrorLogRepository: Repository<AppErrorLog>,
): Promise<void> {
  console.log('Starting to populate item_type and item_id...');
  console.log(`Processing in batches of ${BATCH_SIZE}`);

  let offset = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalProcessed = 0;

  while (true) {
    // Process records in batches
    const logs = await appErrorLogRepository.find({
      where: [{ item_type: null }, { item_id: null }],
      take: BATCH_SIZE,
      skip: offset,
    });

    if (logs.length === 0) {
      break;
    }

    console.log(`\nProcessing batch: ${offset + 1} to ${offset + logs.length}`);

    const updates: Array<{ id: number; item_type: string; item_id: string }> =
      [];

    for (const log of logs) {
      // Extract item info from stack trace
      const { item_type, item_id } = ItemExtractorHelper.extractItemInfo(
        log.stack_trace,
      );

      if (item_type && item_id) {
        updates.push({ id: log.id, item_type, item_id });
      } else {
        totalSkipped++;
      }
    }

    // Batch update using queryBuilder for better performance
    if (updates.length > 0) {
      const queryRunner =
        appErrorLogRepository.manager.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        for (const update of updates) {
          await queryRunner.manager
            .createQueryBuilder()
            .update(AppErrorLog)
            .set({ item_type: update.item_type, item_id: update.item_id })
            .where('id = :id', { id: update.id })
            .execute();
        }

        await queryRunner.commitTransaction();
        totalUpdated += updates.length;
        console.log(`Updated ${updates.length} records in this batch`);
      } catch (error) {
        await queryRunner.rollbackTransaction();
        console.error('Error in batch update:', error);
        throw error;
      } finally {
        await queryRunner.release();
      }
    }

    totalProcessed += logs.length;
    console.log(`Progress: ${totalProcessed} records processed`);

    // Move to next batch
    offset += BATCH_SIZE;
  }

  console.log('\n=== Summary ===');
  console.log(`Total records processed: ${totalProcessed}`);
  console.log(`Updated: ${totalUpdated}`);
  console.log(`Skipped (no item info found): ${totalSkipped}`);
  console.log('Done!');
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const appErrorLogRepository = app.get<Repository<AppErrorLog>>(
    getRepositoryToken(AppErrorLog),
  );

  try {
    await populateItemInfo(appErrorLogRepository);
  } catch (error) {
    console.error('Error populating item info:', error);
    process.exit(1);
  }

  await app.close();
}

bootstrap();
