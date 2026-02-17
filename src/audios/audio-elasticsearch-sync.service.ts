import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppElasticsearchService } from 'src/app-elasticsearch/services/app-elasticsearch.service';
import { ConfigService } from '@nestjs/config';
import { MappingProperty } from '@elastic/elasticsearch/lib/api/types';
import { Audio } from './entities/audio.entity';

interface RawAudioQueryResult {
  id: string;
  sku: string;
  display_title: string;
  display_description: string;
  display_short_description: string;
  display_authors: string[];
  display_copyright: string;
  is_excluded: boolean;
  is_featured: boolean;
  is_active: boolean;
  is_only_for_purchase: boolean;
  category_ids: string[];
  bookshelf_credit_cost: string | number;
  purchased_rental_license_limit: string | number;
  total_rented: string | number;
  avg_rating: string | number;
  suggestion_ids: string[];
  suggestions: { id: string; sku: string }[];
  activated_at: string | number;
  curated_at: string | number;
  default_categories: { id: string; name: string }[];
  primary_category: string;
  metadata_signature: string;
  title: string;
  description: string;
  authors: string[];
  product_id: string;
  retail_product_id: string;
  fa_price: string | number;
  fa_retail_price: string | number;
  fa_content_cost: string | number;
  fa_retail_content_cost: string | number;
  publisher: string;
  language: string;
  bisac_codes: string[];
  abridgement: string;
  narrators: string[];
  actual_size: string | number;
  runtime: string;
  is_for_sale: boolean;
  cover_url: string;
  available_for: string;
  copyright: string;
  isbn: string;
  sample_url: string;
  sales_locations: string[];
  retail_sales_locations: string[];
  purchased_rental_licenses: string | number;
  street_date: string | number;
}

interface CategoryResult {
  default_categories: { id: string; name: string }[];
  primary_category: string;
}

interface CategoryQueryResult {
  audio_id: string;
  default_categories: { id: string; name: string }[];
  primary_category: string;
}

interface SuggestionQueryResult {
  audio_id: string;
  suggestions: { id: string; sku: string }[];
}

interface AudioTransformed {
  id: string;
  sku: string;
  display_title: string;
  display_description: string;
  display_short_description: string;
  display_authors: string[];
  display_copyright: string;
  is_excluded: boolean;
  is_featured: boolean;
  is_active: boolean;
  is_only_for_purchase: boolean;
  category_ids: string[];
  bookshelf_credit_cost: number;
  purchased_rental_license_limit: number;
  total_rented: number;
  avg_rating: number;
  suggestion_ids: string[];
  suggestions: { id: string; sku: string }[];
  activated_at: number;
  curated_at: number;
  category: string;
  default_categories: { id: string; name: string }[];
  metadata_signature: string;
  title: string;
  description: string;
  authors: string[];
  author: string | null;
  product_id: string;
  retail_product_id: string;
  fa_price: number;
  fa_retail_price: number;
  fa_content_cost: number;
  fa_retail_content_cost: number;
  publisher: string;
  language: string;
  bisac_codes: string[];
  bisac_code: string | null;
  abridgement: string;
  narrators: string[];
  actual_size: number;
  runtime: string;
  is_for_sale: boolean;
  cover_url: string;
  available_for: string;
  copyright: string;
  isbn: string;
  sample_url: string;
  sales_locations: string[];
  retail_sales_locations: string[];
  purchased_rental_licenses: number;
  street_date: number;
}

@Injectable()
export class AudioElasticsearchSyncService {
  private readonly logger = new Logger(AudioElasticsearchSyncService.name);
  private readonly index = 'es_audios';

  // PostgreSQL-optimized batch configuration
  private readonly batchSize: number;
  private readonly concurrency: number;
  private readonly batchDelayMs: number;
  private readonly queryTimeout: number;
  private readonly responseDelayMs: number;

  constructor(
    @InjectRepository(Audio)
    private readonly audioRepo: Repository<Audio>,

    private readonly appElasticsearchService: AppElasticsearchService,
    private readonly configService: ConfigService,
  ) {
    // Load configuration from ConfigService
    this.batchSize = parseInt(
      this.configService.get<string>('ELASTICSEARCH_SYNC_BATCH_SIZE') || '100',
      10,
    );
    this.concurrency = parseInt(
      this.configService.get<string>('ELASTICSEARCH_SYNC_CONCURRENCY') || '1',
      10,
    );
    this.batchDelayMs = parseInt(
      this.configService.get<string>('ELASTICSEARCH_SYNC_BATCH_DELAY_MS') ||
        '3000',
      10,
    );
    this.queryTimeout = parseInt(
      this.configService.get<string>('ELASTICSEARCH_SYNC_QUERY_TIMEOUT_MS') ||
        '30000',
      10,
    );
    this.responseDelayMs = parseInt(
      this.configService.get<string>('ELASTICSEARCH_SYNC_RESPONSE_DELAY_MS') ||
        '2000',
      10,
    );

    this.logger.log(`Elasticsearch Sync Configuration:`);
    this.logger.log(`  - Batch Size: ${this.batchSize}`);
    this.logger.log(`  - Concurrency: ${this.concurrency}`);
    this.logger.log(`  - Batch Delay: ${this.batchDelayMs}ms`);
    this.logger.log(`  - Query Timeout: ${this.queryTimeout}ms`);
    this.logger.log(`  - Response Delay: ${this.responseDelayMs}ms`);
  }

  getResponseDelayMs(): number {
    return this.responseDelayMs;
  }

  private buildBaseAudioQuery(id?: string) {
    const query = this.audioRepo
      .createQueryBuilder('audio')
      .innerJoin('audio.metadata', 'metadata')
      .select([
        'audio.id AS id',
        'audio.sku AS sku',
        'audio.display_title AS display_title',
        'audio.display_description AS display_description',
        'audio.display_short_description AS display_short_description',
        'audio.display_authors AS display_authors',
        'audio.is_excluded AS is_excluded',
        'audio.is_featured AS is_featured',
        'audio.is_active AS is_active',
        'audio.is_only_for_purchase AS is_only_for_purchase',
        'audio.categories AS category_ids',
        'audio.bookshelf_credit_cost AS bookshelf_credit_cost',
        'audio.purchased_rental_license_limit AS purchased_rental_license_limit',
        'audio.total_rented AS total_rented',
        'audio.display_copyright AS display_copyright',
        'audio.avg_rating AS avg_rating',
        'audio.suggestions AS suggestion_ids',
        'EXTRACT(EPOCH FROM audio.activated_at)::BIGINT AS activated_at',
        'EXTRACT(EPOCH FROM audio.curated_at)::BIGINT AS curated_at',
        'metadata.metadata_signature AS metadata_signature',
        'metadata.title AS title',
        'metadata.description AS description',
        'metadata.authors AS authors',
        'metadata.product_id AS product_id',
        'metadata.retail_product_id AS retail_product_id',
        'metadata.findaway_price AS fa_price',
        'metadata.findaway_retail_price AS fa_retail_price',
        'metadata.findaway_content_cost AS fa_content_cost',
        'metadata.findaway_retail_content_cost AS fa_retail_content_cost',
        'metadata.publisher AS publisher',
        'metadata.language AS language',
        'metadata.bisac_codes AS bisac_codes',
        'metadata.abridgement AS abridgement',
        'metadata.narrators AS narrators',
        'metadata.actual_size AS actual_size',
        'metadata.runtime AS runtime',
        'metadata.is_for_sale AS is_for_sale',
        'metadata.cover_url AS cover_url',
        'metadata.available_for AS available_for',
        'metadata.copyright AS copyright',
        'metadata.isbn AS isbn',
        'metadata.sample_url AS sample_url',
        'metadata.sales_locations AS sales_locations',
        'metadata.retail_sales_locations AS retail_sales_locations',
        'metadata.purchased_rental_licenses AS purchased_rental_licenses',
        'EXTRACT(EPOCH FROM metadata.street_date)::BIGINT AS street_date',
      ]);

    if (id) {
      query.where('audio.id = :id', { id });
    }

    return query;
  }

  private async getCategoriesForAudios(
    audioIds: string[],
  ): Promise<Map<string, CategoryResult>> {
    if (audioIds.length === 0) return new Map<string, CategoryResult>();

    const audioTableName = this.audioRepo.metadata.tableName;

    // PostgreSQL-optimized query: Remove DISTINCT from json_agg to avoid equality operator error
    // Use DISTINCT in the CTE instead to eliminate duplicates before aggregation
    const query = `
      WITH audio_categories AS (
        SELECT DISTINCT
          audio.id as audio_id,
          jsonb_array_elements_text(audio.categories) as category_id
        FROM ${audioTableName} audio
        WHERE audio.id = ANY($1)
          AND audio.categories IS NOT NULL
          AND jsonb_array_length(audio.categories) > 0
      )
      SELECT
        ac.audio_id,
        json_agg(json_build_object('id', category.id, 'name', category.name)) as default_categories,
        MIN(category.name) as primary_category
      FROM audio_categories ac
      INNER JOIN categories category ON category.id = ac.category_id
      WHERE category.type = $2
        AND category.id::text <> $3
      GROUP BY ac.audio_id
    `;

    const result: CategoryQueryResult[] = await this.audioRepo.query(query, [
      audioIds,
      'default',
      'category_0',
    ]);

    const categoriesMap = new Map<string, CategoryResult>();
    result.forEach((row: CategoryQueryResult) => {
      categoriesMap.set(row.audio_id, {
        default_categories: row.default_categories || [],
        primary_category: row.primary_category || '',
      });
    });

    return categoriesMap;
  }

  private async getSuggestionsForAudios(
    audioIds: string[],
  ): Promise<Map<string, { id: string; sku: string }[]>> {
    if (audioIds.length === 0)
      return new Map<string, { id: string; sku: string }[]>();

    const audioTableName = this.audioRepo.metadata.tableName;

    // PostgreSQL-optimized query: Remove DISTINCT from json_agg to avoid equality operator error
    // Use DISTINCT in the CTE instead to eliminate duplicates before aggregation
    const query = `
      WITH audio_suggestions AS (
        SELECT DISTINCT
          audio.id as audio_id,
          jsonb_array_elements_text(audio.suggestions) as suggestion_id
        FROM ${audioTableName} audio
        WHERE audio.id = ANY($1)
          AND audio.suggestions IS NOT NULL
          AND jsonb_array_length(audio.suggestions) > 0
      )
      SELECT
        asug.audio_id,
        json_agg(json_build_object('id', suggested_audio.id, 'sku', suggested_audio.sku)) as suggestions
      FROM audio_suggestions asug
      INNER JOIN ${audioTableName} suggested_audio ON suggested_audio.id = asug.suggestion_id
      GROUP BY asug.audio_id
    `;

    const result: SuggestionQueryResult[] = await this.audioRepo.query(query, [
      audioIds,
    ]);

    const suggestionsMap = new Map<string, { id: string; sku: string }[]>();
    result.forEach((row: SuggestionQueryResult) => {
      suggestionsMap.set(row.audio_id, row.suggestions || []);
    });

    return suggestionsMap;
  }

  private async getAudiosForElasticsearch(
    offset: number,
    limit: number,
  ): Promise<RawAudioQueryResult[]> {
    const baseAudios = await this.buildBaseAudioQuery()
      .offset(offset)
      .limit(limit)
      .getRawMany();

    if (baseAudios.length === 0) {
      return [];
    }

    const audioIds = baseAudios.map((audio) => audio.id);

    const [categoriesMap, suggestionsMap] = await Promise.all([
      this.getCategoriesForAudios(audioIds),
      this.getSuggestionsForAudios(audioIds),
    ]);

    return baseAudios.map((audio): RawAudioQueryResult => {
      const categories = categoriesMap.get(audio.id) || {
        default_categories: [],
        primary_category: '',
      };
      const suggestions = suggestionsMap.get(audio.id) || [];

      return {
        ...audio,
        default_categories: categories.default_categories,
        primary_category: categories.primary_category,
        suggestions,
      } as RawAudioQueryResult;
    });
  }

  private transformAudio(audio: RawAudioQueryResult): AudioTransformed {
    return {
      id: audio.id,
      sku: audio.sku,
      display_title: audio.display_title || '',
      display_description: audio.display_description || '',
      display_short_description: audio.display_short_description || '',
      display_authors: audio.display_authors || [],
      display_copyright: audio.display_copyright || '',
      is_excluded: Boolean(audio.is_excluded),
      is_featured: Boolean(audio.is_featured),
      is_active: Boolean(audio.is_active),
      is_only_for_purchase: Boolean(audio.is_only_for_purchase),
      category_ids: audio.category_ids || [],
      bookshelf_credit_cost: parseInt(String(audio.bookshelf_credit_cost)) || 0,
      purchased_rental_license_limit:
        parseInt(String(audio.purchased_rental_license_limit)) || 0,
      total_rented: parseInt(String(audio.total_rented)) || 0,
      avg_rating: parseFloat(String(audio.avg_rating)) || 0,
      suggestion_ids: audio.suggestion_ids || [],
      suggestions: audio.suggestions || [],
      activated_at: parseInt(String(audio.activated_at)) || 0,
      curated_at: parseInt(String(audio.curated_at)) || 0,
      category: audio.primary_category || '',
      default_categories: audio.default_categories || [],
      metadata_signature: audio.metadata_signature || '',
      title: audio.title || '',
      description: audio.description || '',
      authors: audio.authors || [],
      author: audio.authors?.[0] ?? null,
      product_id: audio.product_id || '',
      retail_product_id: audio.retail_product_id || '',
      fa_price: parseFloat(String(audio.fa_price)) || 0,
      fa_retail_price: parseFloat(String(audio.fa_retail_price)) || 0,
      fa_content_cost: parseFloat(String(audio.fa_content_cost)) || 0,
      fa_retail_content_cost:
        parseFloat(String(audio.fa_retail_content_cost)) || 0,
      publisher: audio.publisher || '',
      language: audio.language || '',
      bisac_codes: audio.bisac_codes || [],
      bisac_code: audio.bisac_codes?.[0] ?? null,
      abridgement: audio.abridgement || '',
      narrators: audio.narrators || [],
      actual_size: parseInt(String(audio.actual_size)) || 0,
      runtime: audio.runtime || '',
      is_for_sale: Boolean(audio.is_for_sale),
      cover_url: audio.cover_url || '',
      available_for: audio.available_for || '',
      copyright: audio.copyright || '',
      isbn: audio.isbn || '',
      sample_url: audio.sample_url || '',
      sales_locations: audio.sales_locations || [],
      retail_sales_locations: audio.retail_sales_locations || [],
      purchased_rental_licenses:
        parseInt(String(audio.purchased_rental_licenses)) || 0,
      street_date: parseInt(String(audio.street_date)) || 0,
    };
  }

  private getDesiredMapping(): Record<string, MappingProperty> {
    return {
      id: { type: 'keyword' },
      sku: { type: 'keyword' },
      display_title: {
        type: 'text',
        fields: { keyword: { type: 'keyword' } },
      },
      display_description: { type: 'text' },
      display_short_description: { type: 'text' },
      display_authors: { type: 'text' },
      display_copyright: {
        type: 'text',
        fields: { keyword: { type: 'keyword' } },
      },
      is_excluded: { type: 'boolean' },
      is_featured: { type: 'boolean' },
      is_active: { type: 'boolean' },
      is_only_for_purchase: { type: 'boolean' },
      category_ids: { type: 'keyword' },
      bookshelf_credit_cost: { type: 'integer' },
      purchased_rental_license_limit: { type: 'integer' },
      total_rented: { type: 'integer' },
      avg_rating: { type: 'float' },
      suggestion_ids: { type: 'keyword' },
      suggestions: {
        type: 'nested',
        properties: {
          id: { type: 'keyword' },
          sku: { type: 'keyword' },
        },
      },
      activated_at: { type: 'long' },
      curated_at: { type: 'long' },
      category: {
        type: 'text',
        fields: { keyword: { type: 'keyword' } },
      },
      default_categories: {
        type: 'nested',
        properties: {
          id: { type: 'keyword' },
          name: {
            type: 'text',
            fields: { keyword: { type: 'keyword' } },
          },
        },
      },
      metadata_signature: { type: 'keyword' },
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
      product_id: { type: 'keyword' },
      retail_product_id: { type: 'keyword' },
      fa_price: { type: 'float' },
      fa_retail_price: { type: 'float' },
      fa_content_cost: { type: 'float' },
      fa_retail_content_cost: { type: 'float' },
      publisher: {
        type: 'text',
        fields: { keyword: { type: 'keyword' } },
      },
      language: {
        type: 'text',
        fields: { keyword: { type: 'keyword' } },
      },
      bisac_codes: { type: 'text' },
      bisac_code: {
        type: 'text',
        fields: { keyword: { type: 'keyword' } },
      },
      abridgement: {
        type: 'text',
        fields: { keyword: { type: 'keyword' } },
      },
      narrators: { type: 'text' },
      actual_size: { type: 'long' },
      runtime: {
        type: 'text',
        fields: { keyword: { type: 'keyword' } },
      },
      is_for_sale: { type: 'boolean' },
      cover_url: { type: 'keyword' },
      available_for: {
        type: 'text',
        fields: { keyword: { type: 'keyword' } },
      },
      copyright: {
        type: 'text',
        fields: { keyword: { type: 'keyword' } },
      },
      isbn: { type: 'keyword' },
      sample_url: { type: 'keyword' },
      sales_locations: { type: 'keyword' },
      retail_sales_locations: { type: 'keyword' },
      purchased_rental_licenses: { type: 'integer' },
      street_date: { type: 'long' },
    };
  }

  private hasNewFields(
    currentMapping: Record<string, MappingProperty>,
    desiredMapping: Record<string, MappingProperty>,
  ): boolean {
    for (const fieldName in desiredMapping) {
      if (!currentMapping[fieldName]) {
        return true;
      }
    }
    return false;
  }

  private getNewFields(
    currentMapping: Record<string, MappingProperty>,
    desiredMapping: Record<string, MappingProperty>,
  ): Record<string, MappingProperty> {
    const newFields: Record<string, MappingProperty> = {};
    for (const fieldName in desiredMapping) {
      if (!currentMapping[fieldName]) {
        newFields[fieldName] = desiredMapping[fieldName];
      }
    }
    return newFields;
  }

  async ensureIndexExists() {
    const indexExists = await this.appElasticsearchService.indexExists(
      this.index,
    );
    const desiredMapping: Record<string, MappingProperty> =
      this.getDesiredMapping();

    if (!indexExists) {
      await this.appElasticsearchService.createIndex(
        this.index,
        desiredMapping,
      );
      this.logger.log(`Index '${this.index}' created`);
    } else {
      // Index exists, check if mapping needs to be updated
      try {
        const currentMappingResponse =
          await this.appElasticsearchService.getMapping(this.index);

        // mappings come wrapped: { [indexName]: { mappings: { properties: { ... } } } }
        const currentMapping: Record<string, MappingProperty> =
          currentMappingResponse[this.index]?.mappings?.properties ?? {};

        if (this.hasNewFields(currentMapping, desiredMapping)) {
          const newFields = this.getNewFields(currentMapping, desiredMapping);
          await this.appElasticsearchService.putMapping(this.index, newFields);

          const fieldNames = Object.keys(newFields).join(', ');
          this.logger.log(
            `Index '${this.index}' mapping updated with new fields: ${fieldNames}`,
          );
        } else {
          this.logger.log(
            `Index '${this.index}' already exists with up-to-date mapping`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to check/update mapping for index '${this.index}':`,
          error,
        );
        // Continue execution - don't fail the sync if mapping update fails
      }
    }
  }

  async syncAudios() {
    // Brief wait to allow system stabilization
    this.logger.log('Waiting 5 seconds before starting sync...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Test Elasticsearch connection first
    this.logger.log('Testing Elasticsearch connection...');
    const isConnected = await this.appElasticsearchService.ping();
    if (!isConnected) {
      this.logger.error('Elasticsearch connection failed!');
      throw new Error('Unable to connect to Elasticsearch');
    }

    try {
      const health = await this.appElasticsearchService.getClusterHealth();
      this.logger.log(`Elasticsearch cluster health: ${health.status}`);
    } catch (error) {
      this.logger.warn('Unable to get cluster health:', error.message);
    }

    // Try to connect to database with retries
    let dbConnected = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!dbConnected && attempts < maxAttempts) {
      try {
        attempts++;
        this.logger.log(
          `Attempting to connect to database (attempt ${attempts}/${maxAttempts})...`,
        );

        await this.ensureIndexExists();
        dbConnected = true;
        this.logger.log('Database connection successful');
      } catch (error) {
        if (error.message?.includes('remaining connection slots')) {
          this.logger.warn(
            `Database connection slots exhausted on attempt ${attempts}. Waiting 60 seconds before retry...`,
          );
          if (attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait 1 minute
            continue;
          }
        }
        throw error;
      }
    }

    const total = await this.audioRepo.count();
    const totalPages = Math.ceil(total / this.batchSize);
    this.logger.log(
      `Total audios: ${total}, syncing in ${totalPages} batches with concurrency: ${this.concurrency}`,
    );

    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(this.concurrency);
    const tasks = [];

    for (let page = 0; page < totalPages; page++) {
      tasks.push(
        limit(async () => {
          try {
            this.logger.log(
              `Starting batch ${page + 1}/${totalPages} (offset: ${page * this.batchSize})`,
            );

            this.logger.log(
              `Executing optimized database queries for batch ${page + 1} with offset ${page * this.batchSize} and limit ${this.batchSize}`,
            );
            const startTime = Date.now();

            // Retry logic for database connection issues
            let audios: RawAudioQueryResult[] = [];
            let retryCount = 0;
            const maxRetries = 3;

            while (retryCount < maxRetries) {
              try {
                audios = await this.getAudiosForElasticsearch(
                  page * this.batchSize,
                  this.batchSize,
                );
                break; // Success, exit retry loop
              } catch (error) {
                retryCount++;
                if (error.message?.includes('remaining connection slots')) {
                  this.logger.warn(
                    `Database connection exhausted, retry ${retryCount}/${maxRetries} for batch ${page + 1}`,
                  );
                  if (retryCount < maxRetries) {
                    // Wait before retrying, with exponential backoff
                    const delay = Math.pow(2, retryCount) * 1000; // 2s, 4s, 8s
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                  }
                }
                throw error; // Re-throw if not connection issue or max retries reached
              }
            }

            const queryTime = Date.now() - startTime;
            this.logger.log(
              `Fetched ${audios.length} audios for batch ${page + 1} in ${queryTime}ms`,
            );

            const transformed = audios.map((audio) =>
              this.transformAudio(audio),
            );
            this.logger.log(
              `Transformed ${transformed.length} audios for batch ${page + 1}`,
            );

            if (transformed.length > 0) {
              const bulkBody = transformed.flatMap((doc) => [
                { update: { _index: this.index, _id: doc.id } },
                { doc: doc, doc_as_upsert: true },
              ]);

              this.logger.log(
                `Prepared bulk body with ${bulkBody.length} operations for batch ${page + 1}`,
              );

              const bulkResponse = await this.appElasticsearchService.bulk({
                operations: bulkBody,
                refresh: false, // Don't refresh after each bulk operation
                timeout: '2m', // 2 minute timeout for bulk operations
              });

              this.logger.log(`Completed bulk operation for batch ${page + 1}`);

              if (bulkResponse.errors) {
                this.logger.error(
                  `Errors occurred syncing batch ${page + 1}:`,
                  bulkResponse.errors,
                );
              } else {
                this.logger.log(
                  `✅ Successfully synced batch ${page + 1}/${totalPages} (${transformed.length} documents)`,
                );
              }
            }
          } catch (error) {
            this.logger.error(`Failed to process batch ${page + 1}:`, error);
            throw error;
          }
        }),
      );
    }

    this.logger.log(
      `Starting to process ${tasks.length} tasks with concurrency limit of ${this.concurrency}`,
    );
    await Promise.all(tasks);
    this.logger.log(`Completed processing all ${tasks.length} tasks`);

    // Refresh index once at the end
    try {
      await this.appElasticsearchService.refreshIndex(this.index);
    } catch {
      this.logger.warn(
        'Failed to refresh index, but sync completed successfully',
      );
    }
    this.logger.log('✅ Completed syncing all audios to Elasticsearch');
  }

  async syncAudioById(id: string) {
    const baseAudio = await this.buildBaseAudioQuery(id).getRawOne();

    if (!baseAudio) {
      this.logger.warn(`Audio with ID ${id} not found`);
      return;
    }

    const [categoriesMap, suggestionsMap] = await Promise.all([
      this.getCategoriesForAudios([id]),
      this.getSuggestionsForAudios([id]),
    ]);

    const categories = categoriesMap.get(id) || {
      default_categories: [],
      primary_category: '',
    };
    const suggestions = suggestionsMap.get(id) || [];

    const audio: RawAudioQueryResult = {
      ...baseAudio,
      default_categories: categories.default_categories,
      primary_category: categories.primary_category,
      suggestions,
    };

    const transformed = this.transformAudio(audio);

    try {
      await this.appElasticsearchService.update({
        index: this.index,
        id: String(transformed.id),
        doc: transformed,
        docAsUpsert: true,
        refresh: 'true',
      });

      this.logger.log(`Synced audio ID ${id} to Elasticsearch`);
    } catch (error) {
      this.logger.error(`Failed to sync audio ID ${id}`, error);
    }
  }

  async syncAudiosByCategoryId(
    categoryId: string,
    options?: { onlyActive?: boolean },
  ) {
    const onlyActive = options?.onlyActive ?? false;

    this.logger.log(
      `Starting bulk sync for category: ${categoryId} (active only: ${onlyActive})`,
    );
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Brief wait

    // Test Elasticsearch connection first
    this.logger.log('Testing Elasticsearch connection...');
    const isConnected = await this.appElasticsearchService.ping();
    if (!isConnected) {
      this.logger.error('Elasticsearch connection failed!');
      throw new Error('Unable to connect to Elasticsearch');
    }

    try {
      const health = await this.appElasticsearchService.getClusterHealth();
      this.logger.log(`Elasticsearch cluster health: ${health.status}`);
    } catch (error) {
      this.logger.warn('Unable to get cluster health:', error.message);
    }

    // Get total count of audios with this category
    let countQuery = this.audioRepo
      .createQueryBuilder('audio')
      .where('audio.categories @> :categoryId', {
        categoryId: JSON.stringify([categoryId]),
      });

    if (onlyActive) {
      countQuery = countQuery.andWhere('audio.is_active = :isActive', {
        isActive: true,
      });
    }

    const total = await countQuery.getCount();
    this.logger.log(
      `Found ${total} audios with category ${categoryId}${onlyActive ? ' (active only)' : ''}`,
    );

    if (total === 0) {
      this.logger.log('No audios found for this category. Skipping sync.');
      return;
    }

    const totalPages = Math.ceil(total / this.batchSize);
    let completedBatches = 0;
    let lastId: string | undefined;

    for (let page = 0; page < totalPages; page++) {
      // Add throttle delay between batches
      if (page > 0 && this.batchDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.batchDelayMs));
        this.logger.log(
          `Applied ${this.batchDelayMs}ms throttle delay before batch ${page + 1}`,
        );
      }

      const batchStartTime = Date.now();

      try {
        this.logger.log(
          `Starting batch ${page + 1}/${totalPages} (lastId: ${lastId || 'beginning'})`,
        );

        // Set PostgreSQL statement timeout for this query
        await this.audioRepo.query(
          `SET statement_timeout = '${this.queryTimeout}'`,
        );

        // Retry logic for database connection issues
        let audios: RawAudioQueryResult[] = [];
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
          try {
            let batchQuery = this.audioRepo
              .createQueryBuilder('audio')
              .innerJoin('audio.metadata', 'metadata')
              .select([
                'audio.id AS id',
                'audio.sku AS sku',
                'audio.display_title AS display_title',
                'audio.display_description AS display_description',
                'audio.display_short_description AS display_short_description',
                'audio.display_authors AS display_authors',
                'audio.is_excluded AS is_excluded',
                'audio.is_featured AS is_featured',
                'audio.is_active AS is_active',
                'audio.is_only_for_purchase AS is_only_for_purchase',
                'audio.categories AS category_ids',
                'audio.bookshelf_credit_cost AS bookshelf_credit_cost',
                'audio.purchased_rental_license_limit AS purchased_rental_license_limit',
                'audio.total_rented AS total_rented',
                'audio.display_copyright AS display_copyright',
                'audio.avg_rating AS avg_rating',
                'audio.suggestions AS suggestion_ids',
                'EXTRACT(EPOCH FROM audio.activated_at)::BIGINT AS activated_at',
                'EXTRACT(EPOCH FROM audio.curated_at)::BIGINT AS curated_at',
                'metadata.metadata_signature AS metadata_signature',
                'metadata.title AS title',
                'metadata.description AS description',
                'metadata.authors AS authors',
                'metadata.product_id AS product_id',
                'metadata.retail_product_id AS retail_product_id',
                'metadata.findaway_price AS fa_price',
                'metadata.findaway_retail_price AS fa_retail_price',
                'metadata.findaway_content_cost AS fa_content_cost',
                'metadata.findaway_retail_content_cost AS fa_retail_content_cost',
                'metadata.publisher AS publisher',
                'metadata.language AS language',
                'metadata.bisac_codes AS bisac_codes',
                'metadata.abridgement AS abridgement',
                'metadata.narrators AS narrators',
                'metadata.actual_size AS actual_size',
                'metadata.runtime AS runtime',
                'metadata.is_for_sale AS is_for_sale',
                'metadata.cover_url AS cover_url',
                'metadata.available_for AS available_for',
                'metadata.copyright AS copyright',
                'metadata.isbn AS isbn',
                'metadata.sample_url AS sample_url',
                'metadata.sales_locations AS sales_locations',
                'metadata.retail_sales_locations AS retail_sales_locations',
                'metadata.purchased_rental_licenses AS purchased_rental_licenses',
                'EXTRACT(EPOCH FROM metadata.street_date)::BIGINT AS street_date',
              ])
              .where('audio.categories @> :categoryId', {
                categoryId: JSON.stringify([categoryId]),
              })
              .orderBy('audio.id', 'ASC')
              .limit(this.batchSize);

            if (lastId) {
              batchQuery = batchQuery.andWhere('audio.id > :lastId', {
                lastId,
              });
            }

            if (onlyActive) {
              batchQuery = batchQuery.andWhere('audio.is_active = :isActive', {
                isActive: true,
              });
            }

            audios = await batchQuery.getRawMany();
            break; // Success
          } catch (error) {
            retryCount++;
            if (
              error.message?.includes('remaining connection slots') ||
              error.message?.includes('statement timeout')
            ) {
              this.logger.warn(
                `Database issue on batch ${page + 1} (${error.message}), retry ${retryCount}/${maxRetries}`,
              );
              if (retryCount < maxRetries) {
                const delay = Math.pow(2, retryCount) * 2000;
                await new Promise((resolve) => setTimeout(resolve, delay));
                continue;
              }
            }
            throw error;
          }
        }

        this.logger.log(
          `Fetched ${audios.length} audios for batch ${page + 1}`,
        );

        if (audios.length === 0) {
          this.logger.log(`No more audios to sync at batch ${page + 1}`);
          break;
        }

        // Update lastId for next batch
        lastId = audios[audios.length - 1].id;

        // Fetch categories and suggestions
        const audioIds = audios.map((a) => a.id);
        const [categoriesMap, suggestionsMap] = await Promise.all([
          this.getCategoriesForAudios(audioIds),
          this.getSuggestionsForAudios(audioIds),
        ]);

        const enrichedAudios = audios.map((audio) => ({
          ...audio,
          default_categories:
            categoriesMap.get(audio.id)?.default_categories || [],
          primary_category: categoriesMap.get(audio.id)?.primary_category || '',
          suggestions: suggestionsMap.get(audio.id) || [],
        }));

        const transformed = enrichedAudios.map((audio) =>
          this.transformAudio(audio as RawAudioQueryResult),
        );

        if (transformed.length > 0) {
          const bulkBody = transformed.flatMap((doc) => [
            { update: { _index: this.index, _id: doc.id } },
            { doc: doc, doc_as_upsert: true },
          ]);

          const bulkResponse = await this.appElasticsearchService.bulk({
            operations: bulkBody,
            refresh: false,
            timeout: '2m',
          });

          if (bulkResponse.errors) {
            this.logger.error(
              `Errors occurred syncing batch ${page + 1}:`,
              bulkResponse.errors,
            );
          } else {
            completedBatches++;
            const batchTotalTime = Date.now() - batchStartTime;
            const progress = ((completedBatches / totalPages) * 100).toFixed(2);
            this.logger.log(
              `✅ Successfully synced batch ${page + 1}/${totalPages} (${transformed.length} audios) in ${batchTotalTime}ms - Progress: ${progress}%`,
            );
          }
        }
      } catch (error) {
        this.logger.error(
          `Failed to process batch ${page + 1} for category ${categoryId}:`,
          error,
        );
        throw error;
      }
    }

    // Refresh index once at the end
    try {
      await this.appElasticsearchService.refreshIndex(this.index);
    } catch {
      this.logger.warn(
        'Failed to refresh index, but sync completed successfully',
      );
    }

    this.logger.log(
      `✅ Completed syncing ${total} audios for category ${categoryId} to Elasticsearch`,
    );
  }
}
