import { Injectable, StreamableFile } from '@nestjs/common';
import {
  ExportType,
  QueryAdminAudioDto,
  SearchFor,
} from '../dto/audio/query-admin-audio.dto';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { plainToInstance } from 'class-transformer';
import { AdminAudioListDto } from '../dto/audio/admin-audio.dto';
import { ElasticAudio } from 'src/audios/audio.interface';
import { AppElasticsearchService } from 'src/app-elasticsearch/services/app-elasticsearch.service';
import {
  SearchRequest,
  QueryDslQueryContainer,
  Sort,
  SortCombinations,
} from '@elastic/elasticsearch/lib/api/types';
import { Readable } from 'stream';

@Injectable()
export class AdminAudioElasticsearchService {
  private readonly index = 'es_audios';

  constructor(
    private readonly appElasticsearchService: AppElasticsearchService,
  ) {
    dayjs.extend(utc);
  }

  async findAll(query: QueryAdminAudioDto = {}) {
    const {
      page = 1,
      per_page = 10,
      category_id,
      is_included_in_category,
      is_active,
      search_text,
      search_for,
      is_searching_whole_word,
      street_date_from,
      street_date_to,
      bookshelf_credit_cost,
      retail_price_min,
      retail_price_max,
      retail_content_cost_min,
      retail_content_cost_max,
      purchased_rental_license_limit_min,
      purchased_rental_license_limit_max,
      is_for_sale,
      is_featured,
      is_excluded,
      order_by_column,
      order_by,
      export_type,
      is_export,
      search_after,
    } = query;
    // ------------------------------
    // 1. Build Query Body
    // ------------------------------
    const must: QueryDslQueryContainer[] = [];
    const filter: QueryDslQueryContainer[] = [];
    const must_not: QueryDslQueryContainer[] = [];

    // ------------------------------
    // 2. Filters
    // ------------------------------
    if (is_active !== undefined) {
      filter.push({ term: { is_active } });
    }
    if (is_featured !== undefined) {
      filter.push({ term: { is_featured } });
    }
    if (is_excluded !== undefined) {
      filter.push({ term: { is_excluded } });
    }
    if (is_for_sale !== undefined) {
      filter.push({ term: { is_for_sale } });
    }
    if (bookshelf_credit_cost !== undefined) {
      filter.push({ term: { bookshelf_credit_cost } });
    }
    if (retail_price_min !== undefined) {
      filter.push({
        range: { fa_retail_price: { gte: retail_price_min } },
      });
    }
    if (retail_price_max !== undefined) {
      filter.push({
        range: { fa_retail_price: { lte: retail_price_max } },
      });
    }
    if (retail_content_cost_min !== undefined) {
      filter.push({
        range: { fa_retail_content_cost: { gte: retail_content_cost_min } },
      });
    }
    if (retail_content_cost_max !== undefined) {
      filter.push({
        range: { fa_retail_content_cost: { lte: retail_content_cost_max } },
      });
    }
    if (purchased_rental_license_limit_min !== undefined) {
      filter.push({
        range: {
          purchased_rental_license_limit: {
            gte: purchased_rental_license_limit_min,
          },
        },
      });
    }
    if (purchased_rental_license_limit_max !== undefined) {
      filter.push({
        range: {
          purchased_rental_license_limit: {
            lte: purchased_rental_license_limit_max,
          },
        },
      });
    }
    if (street_date_from !== undefined && dayjs(street_date_from).isValid()) {
      const unixTimestampStreetFrom = dayjs(street_date_from).unix();
      filter.push({
        range: { street_date: { gte: unixTimestampStreetFrom } },
      });
    }
    if (street_date_to !== undefined && dayjs(street_date_to).isValid()) {
      const unixTimestampStreetTo = dayjs(street_date_to).unix();
      filter.push({
        range: { street_date: { lte: unixTimestampStreetTo } },
      });
    }
    if (category_id !== undefined) {
      if (is_included_in_category) {
        filter.push({ terms: { category_ids: [category_id] } });
      } else {
        must_not.push({ terms: { category_ids: [category_id] } });
      }
    }

    // ------------------------------
    // 3. Search Query
    // ------------------------------
    if (search_text) {
      const fullTextFields = ['title', 'description', 'publisher']; // text fields
      const arrayFields = ['authors', 'bisac_codes']; // array fields

      const searchWords = search_text.split(/\s+/).filter((w) => !!w);

      let searchQuery: QueryDslQueryContainer;

      const buildFieldShouldConditions = (
        word: string,
        wholeWord: boolean,
      ): QueryDslQueryContainer[] => {
        const textFieldQueries = fullTextFields.map((field) => ({
          match_phrase: {
            [field]: word,
          },
        }));

        const arrayFieldQueries = arrayFields.map((field) =>
          wholeWord
            ? {
                term: {
                  [`${field}`]: {
                    value: `${word.toLowerCase()}`,
                    case_insensitive: true,
                  },
                },
              }
            : {
                wildcard: {
                  [`${field}`]: {
                    value: `${word.toLowerCase()}*`,
                    case_insensitive: true,
                  },
                },
              },
        );

        return [...textFieldQueries, ...arrayFieldQueries];
      };

      switch (search_for) {
        case SearchFor.PHRASE:
          searchQuery = {
            bool: {
              should: [
                // Phrase match for full-text fields
                {
                  multi_match: {
                    query: search_text,
                    fields: fullTextFields,
                    type: 'phrase',
                  },
                },
                // Phrase match (as exact) for array fields
                ...arrayFields.map((field) => ({
                  term: {
                    [`${field}`]: {
                      value: `${search_text.toLowerCase()}`,
                      case_insensitive: true,
                    },
                  },
                })),
              ],
              minimum_should_match: 1,
            },
          };
          break;

        case SearchFor.ANY_WORD:
          searchQuery = {
            bool: {
              should: searchWords.flatMap((word) =>
                buildFieldShouldConditions(word, is_searching_whole_word),
              ),
              minimum_should_match: 1,
            },
          };
          break;

        case SearchFor.ALL_WORDS:
          searchQuery = {
            bool: {
              must: searchWords.map((word) => ({
                bool: {
                  should: buildFieldShouldConditions(
                    word,
                    is_searching_whole_word,
                  ),
                  minimum_should_match: 1,
                },
              })),
            },
          };
          break;

        default:
          searchQuery = {
            simple_query_string: {
              query: search_text,
              fields: [...fullTextFields, ...arrayFields],
            },
          };
      }

      must.push(searchQuery);
    }

    const esQuery: QueryDslQueryContainer = {
      bool: {
        must,
        filter,
        must_not,
      },
    };

    if (is_export && export_type) {
      const stream = await this.export(esQuery, export_type);
      return new StreamableFile(stream);
    }

    // ------------------------------
    // 4. Sorting
    // ------------------------------
    const sortArray: SortCombinations[] = [];

    if (order_by_column && order_by) {
      const orderByMap: Record<string, string> = {
        sku: 'sku',
        title: 'title.keyword',
        publisher: 'publisher.keyword',
        author: 'author.keyword',
        bisac_code: 'bisac_code.keyword',
        category: 'category.keyword',
        fa_retail_price: 'fa_retail_price',
        fa_retail_content_cost: 'fa_retail_content_cost',
        bookshelf_credit_cost: 'bookshelf_credit_cost',
        language: 'language.keyword',
        runtime: 'runtime.keyword',
        copyright: 'copyright.keyword',
        is_active: 'is_active',
        is_excluded: 'is_excluded',
        is_featured: 'is_featured',
        street_date: 'street_date',
        activated_at: 'activated_at',
        curated_at: 'curated_at',
      };

      const column = orderByMap[order_by_column];
      const order = order_by.toLowerCase() === 'desc' ? 'desc' : 'asc';

      if (column) sortArray.push({ [column]: { order } });
    }

    sortArray.push({ id: { order: 'asc' } });

    const isDeepPagination = (page - 1) * per_page > 10000;

    // ------------------------------
    // 5. Execute Search
    // ------------------------------
    const searchParams: SearchRequest = {
      index: this.index,
      size: per_page,
      track_total_hits: true,
      query:
        must.length || filter.length || must_not.length
          ? esQuery
          : { match_all: {} },
      sort: sortArray,
      ...(isDeepPagination
        ? { search_after }
        : { from: (page - 1) * per_page }),
    };

    const { hits } =
      await this.appElasticsearchService.search<ElasticAudio>(searchParams);

    // ------------------------------
    // 6. Return Paginated Results
    // ------------------------------
    const total =
      typeof hits.total === 'number' ? hits.total : (hits.total?.value ?? 0);
    const data = hits.hits.map((hit) => hit._source);

    return {
      data: plainToInstance(AdminAudioListDto, data, {
        excludeExtraneousValues: true,
      }),
      meta: {
        total,
        per_page,
        current_page: page,
        last_page: Math.ceil(total / per_page),
        from: total > 0 ? (page - 1) * per_page + 1 : null,
        to: Math.min(page * per_page, total),
        search_after: hits.hits[hits.hits.length - 1]?.sort || null,
      },
    };
  }

  async export(
    esQuery: QueryDslQueryContainer,
    exportType: ExportType,
  ): Promise<Readable> {
    const stream = new Readable({
      read() {}, // Manual push streaming
      highWaterMark: 1024 * 1024, // 1MB buffer to control backpressure
    });

    // Write CSV Header based on export type
    if (exportType === ExportType.CURATION) {
      stream.push(
        'Title,Authors,Category,Publisher,Excluded,New FA,FA Retail Price,FA Content Cost,New TRL,TRL Cost,Curated At,Featured,Active,Language,BISAC,Length,Copyright\n',
      );
    } else {
      stream.push('SKU,Title,QTO,QOH,QIC,Active\n');
    }

    const batchSize = 1000;
    let scrollId: string | undefined;
    let hasMoreData = true;

    try {
      // Initial search with scroll API for large datasets
      const searchParams: SearchRequest = {
        index: this.index,
        query:
          esQuery.bool?.must || esQuery.bool?.filter || esQuery.bool?.must_not
            ? esQuery
            : { match_all: {} },
        scroll: '1m', // Keep scroll context alive for 1 minute
        size: batchSize,
        sort: { id: { order: 'asc' } }, // Sort by _id for consistent pagination
      };

      let response =
        await this.appElasticsearchService.search<ElasticAudio>(searchParams);

      while (hasMoreData) {
        const items = response.hits.hits.map((hit) => hit._source);

        if (items.length === 0) {
          hasMoreData = false;
          break;
        }

        // Stream CSV rows based on export type
        for (const item of items) {
          let row: string;

          if (exportType === ExportType.CURATION) {
            // Curation export format
            row =
              [
                `"${item.title?.replace(/"/g, '""') ?? ''}"`,
                `"${item.authors?.join(', ').replace(/"/g, '""') ?? ''}"`,
                `"${item.category ?? ''}"`,
                `"${item.publisher?.replace(/"/g, '""') ?? ''}"`,
                item.is_excluded ? '1' : '0',
                `"${item.street_date ? dayjs.unix(item.street_date).format('MM/DD/YYYY') : ''}"`,
                `"${item.fa_retail_price ? `$${item.fa_retail_price}` : ''}"`,
                `"${item.fa_retail_content_cost ? `$${item.fa_retail_content_cost}` : ''}"`,
                `"${item.activated_at ? dayjs.unix(item.activated_at).format('MM/DD/YYYY') : ''}"`,
                `"${item.bookshelf_credit_cost ?? ''}"`,
                `"${item.curated_at ? dayjs.unix(item.curated_at).format('MM/DD/YYYY') : ''}"`,
                item.is_featured ? '1' : '0',
                item.is_active ? '1' : '0',
                `"${item.language?.replace(/"/g, '""') ?? ''}"`,
                `"${item.bisac_codes?.join(', ').replace(/"/g, '""') ?? ''}"`,
                `"${item.runtime ?? ''}"`,
                `"${item.copyright?.replace(/"/g, '""') ?? ''}"`,
              ].join(',') + '\n';
          } else {
            // Inventory export format
            const qto = item.purchased_rental_license_limit ?? 0;
            const qoh = item.total_rented ?? 0;
            const qic = qto - qoh;

            row =
              [
                `"${item.sku ?? ''}"`,
                `"${item.title?.replace(/"/g, '""') ?? ''}"`,
                qto.toString(),
                qoh.toString(),
                qic.toString(),
                item.is_active ? '1' : '0',
              ].join(',') + '\n';
          }

          // Check for backpressure
          if (!stream.push(row)) {
            // Pause if stream is full
            await new Promise((resolve) => stream.once('drain', resolve));
          }
        }

        scrollId = response._scroll_id;
        if (!scrollId || items.length < batchSize) {
          hasMoreData = false;
          break;
        }

        // Fetch next batch using scroll API
        response = await this.appElasticsearchService.scroll({
          scroll_id: scrollId,
          scroll: '1m',
        });
      }

      // End the stream
      stream.push(null);

      // Clean up scroll context
      if (scrollId) {
        await this.appElasticsearchService.clearScroll({ scroll_id: scrollId });
      }
    } catch (error) {
      stream.emit('error', error);
      stream.push(null);

      // Clean up scroll context on error
      if (scrollId) {
        await this.appElasticsearchService
          .clearScroll({ scroll_id: scrollId })
          .catch(() => {});
      }
    }

    return stream;
  }
}
