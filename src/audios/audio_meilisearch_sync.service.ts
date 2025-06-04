import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { MeiliSearch } from 'meilisearch';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Audio } from './entities/audio.entity';

@Injectable()
export class AudioMeilisearchSyncService implements OnModuleInit {
  private client: MeiliSearch;
  private readonly logger = new Logger(AudioMeilisearchSyncService.name);
  private readonly batchSize = 1000;

  constructor(
    @InjectRepository(Audio)
    private readonly audioRepo: Repository<Audio>,
  ) {
    this.client = new MeiliSearch({
      host: process.env.MEILISEARCH_HOST || 'http://localhost:7700',
      apiKey: process.env.MEILISEARCH_API_KEY || '',
    });
  }

  async onModuleInit() {
    await this.syncAudios();
  }

  async syncAudios() {
    // await this.client.index('audios').update({ primaryKey: 'id' });
    await this.client.deleteIndex('audios');
    await this.client.createIndex('audios', { primaryKey: 'id' });

    const index = this.client.index('audios');
    await index.updateSettings({
      pagination: {
        maxTotalHits: 1000000, // set higher than your total records
      },
    });

    const total = await this.audioRepo
      .createQueryBuilder('audio')
      .getCount();

    const totalPages = Math.ceil(total / this.batchSize);
    this.logger.log(`Total audios: ${total}, Syncing in ${totalPages} pages`);

    for (let page = 0; page < totalPages; page++) {
      const data = await this.audioRepo
        .createQueryBuilder('audio')
        .innerJoin('audio.metadata', 'metadata')
        .leftJoin('audio.primaryCategory', 'primaryCategory')
        .select([
          'audio.id AS id',
          'audio.sku AS sku',
          'audio.display_title AS title',
          'audio.display_authors AS authors',
          'metadata.publisher AS publisher',
          'audio.is_excluded AS is_excluded',
          'audio.is_featured AS is_featured',
          'audio.is_active AS is_active',
          'primaryCategory.name AS first_category_name',
          'metadata.findaway_retail_price AS fa_retail_price',
          'metadata.findaway_retail_content_cost AS fa_retail_content_cost',
          'audio.bookshelf_credit_cost AS bookshelf_credit_cost',
          'metadata.language AS language',
          'metadata.bisac_codes AS bisac_codes',
          'metadata.runtime AS runtime',
          'audio.display_copyright AS copyright',
          `TO_CHAR(metadata.street_date, 'MM-DD-YYYY') AS street_date`,
          `TO_CHAR(audio.activated_at, 'MM-DD-YYYY') AS activated_at`,
          `TO_CHAR(audio.curated_at, 'MM-DD-YYYY') AS curated_at`,
        ])
        .offset(page * this.batchSize)
        .limit(this.batchSize)
        .getRawMany();

      if (data.length > 0) {
        const task = await index.addDocuments(data);
        this.logger.log(`Synced batch ${page + 1}/${totalPages} (taskUid: ${task.taskUid})`);
      }
    }

    this.logger.log('Completed syncing all audios to Meilisearch');
  }
}
