import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { DataSource } from 'typeorm';
import { Audio } from '../entities/audio.entity';
import { Company } from 'src/companies/entities/company.entity';
import { BranchService } from 'src/common/services/branch.service';
import { DomainHelper } from 'src/common/helpers/domain.helper';

/**
 * Deep Link Generation Script
 * Generates Branch deep links for audios across all company domains
 *
 * Usage:
 * - Generate for all active audios:
 *   npm run deep-links:generate
 *
 * - Generate for specific audio:
 *   AUDIO_ID=audio_xxx npm run deep-links:generate
 *
 * - Generate for multiple specific audios:
 *   AUDIO_IDS=audio_xxx,audio_yyy npm run deep-links:generate
 *
 * - Generate for specific domain only:
 *   DOMAIN=biz.therentallibrary.com npm run deep-links:generate
 *
 * - Combine with custom batch settings:
 *   AUDIO_ID=audio_xxx DEEP_LINK_BATCH_SIZE=10 npm run deep-links:generate
 *
 * Environment Variables:
 * - AUDIO_ID: Single audio ID to process
 * - AUDIO_IDS: Comma-separated audio IDs to process
 * - DOMAIN: Filter deep links generation for a specific domain (optional)
 * - DEEP_LINK_BATCH_SIZE: Number of audios to process per batch (default: 50)
 * - DEEP_LINK_BATCH_DELAY_MS: Delay between batches in milliseconds (default: 2000)
 */
async function bootstrap() {
  const startTime = Date.now();

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const branchService = app.get(BranchService);

  // Configuration
  const batchSize = parseInt(process.env.DEEP_LINK_BATCH_SIZE || '50', 10);
  const batchDelayMs = parseInt(
    process.env.DEEP_LINK_BATCH_DELAY_MS || '2000',
    10,
  );

  // Audio filtering options
  const audioId = process.env.AUDIO_ID?.trim();
  const audioIds = process.env.AUDIO_IDS?.trim()
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  const domainFilter = process.env.DOMAIN?.trim();

  let processedCount = 0;
  let successCount = 0;
  let failureCount = 0;
  let batchNumber = 0;

  try {
    console.log('🚀 Starting deep link generation...');
    console.log(
      `Configuration: Batch size=${batchSize}, Delay=${batchDelayMs}ms`,
    );

    // Display input filters if provided
    if (audioId) {
      console.log(`📌 Filtering by single audio ID: ${audioId}`);
    } else if (audioIds && audioIds.length > 0) {
      console.log(`📌 Filtering by multiple audio IDs: ${audioIds.join(', ')}`);
    }
    if (domainFilter) {
      console.log(`📌 Filtering by domain: ${domainFilter}`);
    }

    // Step 1: Collect unique base domains from active companies
    console.log(
      '\n📍 Step 1: Collecting unique domains from active companies...',
    );
    const companies = await dataSource.getRepository(Company).find({
      where: { is_active: true },
      select: ['id', 'domain'],
    });

    let domains = DomainHelper.extractUniqueDomains(
      companies.map((c) => c.domain),
    );

    // Filter by specific domain if provided
    if (domainFilter) {
      const normalizedFilter = DomainHelper.extractBaseDomain(domainFilter);
      if (domains.has(normalizedFilter)) {
        domains = new Set([normalizedFilter]);
        console.log(`✓ Filtered to domain: ${normalizedFilter}`);
      } else {
        console.warn(
          `⚠️  Domain filter "${normalizedFilter}" not found in active companies. Available domains: ${Array.from(domains).join(', ')}`,
        );
        await app.close();
        return;
      }
    }

    console.log(`✓ Found ${companies.length} active companies`);
    console.log(
      `✓ Extracted ${domains.size} unique domains: ${Array.from(domains).join(', ')}`,
    );

    if (domains.size === 0) {
      console.warn(
        '⚠️  No valid domains found. Exiting without processing audios.',
      );
      await app.close();
      return;
    }

    const domainArray = Array.from(domains);

    // Step 2: Fetch audios based on filters
    console.log('\n📖 Step 2: Fetching audios and generating deep links...');

    let query = dataSource
      .getRepository(Audio)
      .createQueryBuilder('audio')
      .select('audio.id');

    // Apply filters
    if (audioId) {
      query = query.where('audio.id = :audioId', { audioId });
    } else if (audioIds && audioIds.length > 0) {
      query = query.where('audio.id IN (:...audioIds)', { audioIds });
    } else {
      // Default: all active audios
      query = query
        .where('audio.is_active = :isActive', { isActive: true })
        .andWhere('audio.deleted_at IS NULL');
    }

    const fetchedAudioIds = await query
      .orderBy('audio.created_at', 'DESC')
      .getRawMany()
      .then((rows) => rows.map((row) => row.audio_id));

    console.log(`✓ Found ${fetchedAudioIds.length} audios to process`);

    // Step 3: Process audios in batches
    console.log('\n⚙️  Step 3: Processing audios in batches...');

    if (fetchedAudioIds.length === 0) {
      console.warn('⚠️  No audios found to process.');
      console.log(
        'Try adjusting your filters (AUDIO_ID, AUDIO_IDS, or DOMAIN)',
      );
    } else {
      for (let i = 0; i < fetchedAudioIds.length; i += batchSize) {
        batchNumber++;
        const batchIds = fetchedAudioIds.slice(i, i + batchSize);
        const totalBatches = Math.ceil(fetchedAudioIds.length / batchSize);
        const batchProgress = `[${batchNumber}/${totalBatches}]`;

        console.log(
          `\n📦 Processing batch ${batchProgress}: ${batchIds.length} audios`,
        );

        for (const currentAudioId of batchIds) {
          try {
            // Generate deep links for this audio across all domains
            const deepLinks = await branchService.createDeepLinksForAudio(
              currentAudioId,
              domainArray,
            );

            // Only update if we have at least one successful deep link
            if (Object.keys(deepLinks).length > 0) {
              await dataSource
                .getRepository(Audio)
                .update(currentAudioId, { deep_link: deepLinks });
              successCount++;
            } else {
              console.warn(
                `  ⚠️  No deep links generated for audio ${currentAudioId} (all domains failed)`,
              );
              failureCount++;
            }

            processedCount++;
          } catch (error) {
            console.error(
              `  ✗ Failed to process audio ${currentAudioId}: ${error instanceof Error ? error.message : String(error)}`,
            );
            failureCount++;
            processedCount++;
          }
        }

        // Log batch completion
        console.log(
          `  ✓ Batch complete: ${successCount} successful, ${failureCount} failed`,
        );

        // Add delay between batches (except after the last batch)
        if (i + batchSize < fetchedAudioIds.length) {
          console.log(`  ⏳ Waiting ${batchDelayMs}ms before next batch...`);
          await delay(batchDelayMs);
        }
      }
    }

    // Step 4: Display summary
    const endTime = Date.now();
    const durationSec = ((endTime - startTime) / 1000).toFixed(2);

    console.log('\n✅ Deep link generation completed!');
    console.log('━'.repeat(50));
    console.log(`📊 Summary Statistics:`);
    console.log(
      `  Total Processed: ${processedCount}/${fetchedAudioIds.length}`,
    );
    console.log(`  ✓ Successful: ${successCount}`);
    console.log(`  ✗ Failed: ${failureCount}`);
    console.log(`  ⏱️  Duration: ${durationSec}s`);
    console.log(`  📍 Domains: ${domainArray.length}`);
    console.log('━'.repeat(50));

    if (processedCount > 0 && failureCount > 0) {
      const failureRate = ((failureCount / processedCount) * 100).toFixed(1);
      console.log(
        `⚠️  ${failureRate}% of audios had generation failures (see logs above)`,
      );
    }
  } catch (error) {
    console.error(
      '❌ Fatal error during deep link generation:',
      error instanceof Error ? error.message : String(error),
    );
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await app.close();
  }
}

/**
 * Helper function to add delay
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

bootstrap().catch((error) => {
  console.error('Script error:', error);
  process.exit(1);
});
