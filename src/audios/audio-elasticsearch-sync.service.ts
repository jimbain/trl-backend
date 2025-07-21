import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Audio } from './entities/audio.entity';
import { AppElasticsearchService } from 'src/app-elasticsearch/services/app-elasticsearch.service';

interface AudioTransformed {
  id: string;
  sku: string;
  title: string;
  description: string;
  authors: string[];
  author: string | null;
  publisher: string;
  is_excluded: boolean;
  is_featured: boolean;
  is_active: boolean;
  category: string;
  category_ids: string[];
  fa_retail_price: number;
  fa_retail_content_cost: number;
  bookshelf_credit_cost: number;
  language: string;
  bisac_codes: string[];
  bisac_code: string | null;
  runtime: string;
  copyright: string;
  street_date: number;
  activated_at: number;
  curated_at: number;
}

@Injectable()
export class AudioElasticsearchSyncService {
  private readonly logger = new Logger(AudioElasticsearchSyncService.name);
  private readonly index = 'es_audios';
  private readonly batchSize = 1000;

  constructor(
    @InjectRepository(Audio)
    private readonly audioRepo: Repository<Audio>,
    private readonly appElasticsearchService: AppElasticsearchService,
  ) {}

  private async buildAudioQuery(id?: string) {
    const query = this.audioRepo
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
      ]);

    if (id) {
      query.where('audio.id = :id', { id });
    }

    return query;
  }

  private transformAudio(audio: any): AudioTransformed {
    return {
      id: audio.id,
      sku: audio.sku,
      title: audio.title,
      description: audio.description,
      authors: audio.authors,
      author: audio.authors?.[0] ?? null,
      publisher: audio.publisher,
      is_excluded: Boolean(audio.is_excluded),
      is_featured: Boolean(audio.is_featured),
      is_active: Boolean(audio.is_active),
      category: audio.primary_category,
      category_ids: audio.category_ids,
      fa_retail_price: parseFloat(audio.fa_retail_price) || 0,
      fa_retail_content_cost: parseFloat(audio.fa_retail_content_cost) || 0,
      bookshelf_credit_cost: parseInt(audio.bookshelf_credit_cost) || 0,
      language: audio.language,
      bisac_codes: audio.bisac_codes,
      bisac_code: audio.bisac_codes?.[0] ?? null,
      runtime: audio.runtime,
      copyright: audio.copyright,
      street_date: parseInt(audio.street_date) || 0,
      activated_at: parseInt(audio.activated_at) || 0,
      curated_at: parseInt(audio.curated_at) || 0,
    };
  }

  async ensureIndexExists() {
    const indexExists = await this.appElasticsearchService.indexExists(
      this.index,
    );

    if (!indexExists) {
      await this.appElasticsearchService.createIndex(this.index, {
        id: { type: 'keyword' },
        sku: { type: 'keyword' },
        title: {
          type: 'text',
          fields: { keyword: { type: 'keyword' } },
        },
        description: { type: 'text' },
        authors: { type: 'text' },
        author: {
          type: 'text',
          fields: { keyword: { type: 'keyword' } },
        },
        publisher: {
          type: 'text',
          fields: { keyword: { type: 'keyword' } },
        },
        is_excluded: { type: 'boolean' },
        is_featured: { type: 'boolean' },
        is_active: { type: 'boolean' },
        category_ids: { type: 'keyword' },
        category: {
          type: 'text',
          fields: { keyword: { type: 'keyword' } },
        },
        fa_retail_price: { type: 'float' },
        fa_retail_content_cost: { type: 'float' },
        bookshelf_credit_cost: { type: 'integer' },
        language: {
          type: 'text',
          fields: { keyword: { type: 'keyword' } },
        },
        bisac_codes: { type: 'text' },
        bisac_code: {
          type: 'text',
          fields: { keyword: { type: 'keyword' } },
        },
        runtime: {
          type: 'text',
          fields: { keyword: { type: 'keyword' } },
        },
        copyright: {
          type: 'text',
          fields: { keyword: { type: 'keyword' } },
        },
        street_date: { type: 'long' },
        activated_at: { type: 'long' },
        curated_at: { type: 'long' },
      });
      this.logger.log(`Index '${this.index}' created`);
    } else {
      this.logger.log(`Index '${this.index}' already exists`);
    }
  }

  async syncAudios() {
    await this.ensureIndexExists();

    const total = await this.audioRepo.count();
    const totalPages = Math.ceil(total / this.batchSize);
    this.logger.log(`Total audios: ${total}, syncing in ${totalPages} batches`);

    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(4);
    const tasks = [];

    for (let page = 0; page < totalPages; page++) {
      tasks.push(
        limit(async () => {
          const query = await this.buildAudioQuery();
          const audios = await query
            .offset(page * this.batchSize)
            .limit(this.batchSize)
            .getRawMany();

          const transformed = audios.map((audio) => this.transformAudio(audio));

          if (transformed.length > 0) {
            const bulkBody = transformed.flatMap((doc) => [
              { index: { _index: this.index, _id: doc.id } },
              doc,
            ]);

            const bulkResponse = await this.appElasticsearchService.bulk({
              refresh: 'true',
              operations: bulkBody,
            });

            if (bulkResponse.errors) {
              this.logger.error(`Errors occurred syncing batch ${page + 1}`);
            } else {
              this.logger.log(`Synced batch ${page + 1}/${totalPages}`);
            }
          }
        }),
      );
    }

    await Promise.all(tasks);
    this.logger.log('✅ Completed syncing all audios to Elasticsearch');
  }

  async syncAudioById(id: string) {
    const query = await this.buildAudioQuery(id);
    const audio = await query.getRawOne();

    if (!audio) {
      this.logger.warn(`Audio with ID ${id} not found`);
      return;
    }

    const transformed = this.transformAudio(audio);

    await this.appElasticsearchService.update({
      index: this.index,
      id: transformed.id,
      doc: transformed,
      docAsUpsert: true,
      refresh: 'true',
    });

    this.logger.log(`Synced audio ID ${id} to Elasticsearch`);
  }
}
