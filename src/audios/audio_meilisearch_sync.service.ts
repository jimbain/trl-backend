import { Injectable, Logger } from '@nestjs/common';
import { MeiliSearch, MeiliSearchApiError } from 'meilisearch';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Audio } from './entities/audio.entity';

@Injectable()
export class AudioMeilisearchSyncService {
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

  async ensureIndexExists(indexUid: string, primaryKey: string) {
    try {
      await this.client.getIndex(indexUid);
      console.log(`Index '${indexUid}' already exists.`);
    } catch (error) {
      await this.client.createIndex(indexUid, { primaryKey });
      console.log(`Index '${indexUid}' created.`);
    }
  }

  async syncAudios() {
    await this.ensureIndexExists('audios', 'id');

    const index = this.client.index('audios');

    await index.updateSettings({
      searchableAttributes: [
        'title',
        'description',
        'authors',
        'publisher',
        'bisac_codes',
      ],
      filterableAttributes: [
        'sku',
        'category_ids',
        'fa_retail_price',
        'fa_retail_content_cost',
        'bookshelf_credit_cost',
        'street_date',
        'is_active',
        'is_excluded',
        'is_featured',
      ],
      sortableAttributes: [
        'sku',
        'title',
        'category',
        'author',
        'bisac_code',
        'publisher',
        'language',
        'runtime',
        'copyright',
        'fa_retail_price',
        'fa_retail_content_cost',
        'bookshelf_credit_cost',
        'is_active',
        'is_excluded',
        'is_featured',
        'street_date',
        'activated_at',
        'curated_at',
      ],
      pagination: {
        maxTotalHits: 1000000,
      },
    });

    const total = await this.audioRepo.createQueryBuilder('audio').getCount();
    const totalPages = Math.ceil(total / this.batchSize);
    this.logger.log(`Total audios: ${total}, Syncing in ${totalPages} pages`);

    for (let page = 0; page < totalPages; page++) {
      const audios = await this.audioRepo
        .createQueryBuilder('audio')
        .innerJoin('audio.metadata', 'metadata')
        .leftJoin(
          'categories',
          'category',
          'category.id IN (SELECT jsonb_array_elements_text(audio.categories)) AND category.type = :categoryType',
          { categoryType: 'default' },
        )
        .groupBy('audio.id, metadata.sku')
        .select([
          'audio.id AS id',
          'audio.sku AS sku',
          'audio.display_title AS title',
          'audio.display_description AS description',
          'audio.display_authors AS authors',
          'metadata.publisher AS publisher',
          'audio.is_excluded AS is_excluded',
          'audio.is_featured AS is_featured',
          'audio.is_active AS is_active',
          'array_agg(category.id) AS category_ids',
          'MIN(category.name) AS primary_category',
          'metadata.findaway_retail_price AS fa_retail_price',
          'metadata.findaway_retail_content_cost AS fa_retail_content_cost',
          'audio.bookshelf_credit_cost AS bookshelf_credit_cost',
          'metadata.language AS language',
          'metadata.bisac_codes AS bisac_codes',
          'metadata.runtime AS runtime',
          'audio.display_copyright AS copyright',
          'EXTRACT(EPOCH FROM metadata.street_date)::BIGINT AS street_date',
          'EXTRACT(EPOCH FROM audio.activated_at)::BIGINT AS activated_at',
          'EXTRACT(EPOCH FROM audio.curated_at)::BIGINT AS curated_at',
        ])
        .offset(page * this.batchSize)
        .limit(this.batchSize)
        .getRawMany();

      // ✨ Format & Clean Data
      const transformed = audios.map((item) => ({
        id: item.id,
        sku: item.sku,
        title: item.title,
        description: item.description,
        authors: item.authors,
        author: item.authors?.[0] ?? null,
        publisher: item.publisher,
        is_excluded: Boolean(item.is_excluded),
        is_featured: Boolean(item.is_featured),
        is_active: Boolean(item.is_active),
        category: item.primary_category,
        category_ids: item.category_ids,
        fa_retail_price: parseFloat(item.fa_retail_price) || 0,
        fa_retail_content_cost: parseFloat(item.fa_retail_content_cost) || 0,
        bookshelf_credit_cost: parseInt(item.bookshelf_credit_cost) || 0,
        language: item.language,
        bisac_codes: item.bisac_codes,
        bisac_code: item.bisac_codes?.[0] ?? null,
        runtime: item.runtime,
        copyright: item.display_copyright,
        street_date: parseInt(item.street_date) || 0,
        activated_at: parseInt(item.activated_at) || 0,
        curated_at: parseInt(item.curated_at) || 0,
      }));

      if (transformed.length > 0) {
        const task = await index.addDocuments(transformed);
        this.logger.log(
          `Synced batch ${page + 1}/${totalPages} (taskUid: ${task.taskUid})`,
        );
      }
    }

    this.logger.log('✅ Completed syncing all audios to Meilisearch');
  }
}
