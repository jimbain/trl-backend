import { Injectable, StreamableFile } from '@nestjs/common';
import {
  PageType,
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
import { Readable, PassThrough } from 'stream';
import { format } from '@fast-csv/format';
import { StringHelper } from 'src/common/helpers/string.helper';
import { Category } from 'src/categories/entities/category.entity';
import { Audio } from 'src/audios/entities/audio.entity';

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
      purchased_rental_licenses_min,
      purchased_rental_licenses_max,
      is_for_sale,
      is_featured,
      is_excluded,
      order_by_column,
      order_by,
      page_type,
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
      filter.push({ terms: { bookshelf_credit_cost } });
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
    if (purchased_rental_licenses_min !== undefined) {
      filter.push({
        range: {
          purchased_rental_licenses: {
            gte: purchased_rental_licenses_min,
          },
        },
      });
    }
    if (purchased_rental_licenses_max !== undefined) {
      filter.push({
        range: {
          purchased_rental_licenses: {
            lte: purchased_rental_licenses_max,
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
      const fullTextFields = ['title', 'description', 'publisher', 'sku']; // text fields
      const arrayFields = ['authors', 'bisac_codes']; // array fields

      const searchWords = search_text.split(/\s+/).filter((w) => !!w);

      let searchQuery: QueryDslQueryContainer;

      const buildFieldShouldConditions = (
        word: string,
        wholeWord: boolean,
      ): QueryDslQueryContainer[] => {
        const textFieldQueries = fullTextFields.map(
          (field): QueryDslQueryContainer => ({
            match_phrase: {
              [field]: word,
            },
          }),
        );

        const arrayFieldQueries = arrayFields.map(
          (field): QueryDslQueryContainer =>
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

    if (page_type === PageType.CURATION) {
      must_not.push({ term: { available_for: 'rental' } });
    }

    const esQuery: QueryDslQueryContainer = {
      bool: {
        must,
        filter,
        must_not,
      },
    };

    if (is_export && page_type) {
      const stream = await this.export(esQuery, page_type);
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
    pageType: PageType,
  ): Promise<Readable> {
    const stream = new PassThrough({
      highWaterMark: 16 * 1024 * 1024, // 16MB buffer for faster throughput
    });

    const csvStream = format({ headers: true });
    csvStream.pipe(stream);

    const batchSize = 5000; // higher batch size for speed
    let lastSortValue: any[] | undefined = undefined;
    let processedCount = 0;
    const startTime = Date.now();

    try {
      const sourceFields =
        pageType === PageType.CURATION
          ? [
              'sku',
              'title',
              'authors',
              'category',
              'publisher',
              'is_excluded',
              'street_date',
              'fa_retail_price',
              'fa_retail_content_cost',
              'activated_at',
              'bookshelf_credit_cost',
              'curated_at',
              'is_featured',
              'is_active',
              'language',
              'bisac_codes',
              'runtime',
              'copyright',
            ]
          : [
              'is_active',
              'sku',
              'isbn',
              'title',
              'display_title',
              'authors',
              'display_authors',
              'publisher',
              'description',
              'display_description',
              'display_short_description',
              'bookshelf_credit_cost',
              'is_only_for_purchase',
              'runtime',
              'actual_size',
              'narrators',
              'abridgement',
              'language',
              'bisac_codes',
              'product_id',
              'retail_product_id',
              'metadata_signature',
              'is_for_sale',
              'fa_price',
              'fa_retail_price',
              'fa_content_cost',
              'fa_retail_content_cost',
              'sales_locations',
              'sample_url',
              'copyright',
              'display_copyright',
              'street_date',
              'purchased_rental_licenses',
              'purchased_rental_license_limit',
              'available_for',
              'is_featured',
              'is_excluded',
              'curated_at',
              'activated_at',
              'cover_url',
              'default_categories',
              'suggestions',
              'total_rented',
              'avg_rating',
            ];

      let hasMoreData = true;
      let batchCount = 0;

      while (hasMoreData) {
        batchCount++;

        const searchParams: SearchRequest = {
          index: this.index,
          query:
            esQuery && Object.keys(esQuery).length > 0
              ? esQuery
              : { match_all: {} },
          size: batchSize,
          sort: [{ id: 'asc' }], // must be a doc-value field
          _source: sourceFields,
          search_after: lastSortValue,
        };

        const response: any =
          await this.appElasticsearchService.search(searchParams);

        const items = response.hits.hits.map((hit) => hit._source);
        lastSortValue = response.hits.hits.at(-1)?.sort; // prepare for next page

        if (items.length === 0) {
          hasMoreData = false;
          break;
        }

        // Write rows into csvStream
        for (const item of items) {
          if (pageType === PageType.CURATION) {
            csvStream.write({
              SKU: item.sku ?? '',
              Title: item.title ?? '',
              Authors: (item.authors ?? []).join(', '),
              Category: item.category ?? '',
              Publisher: item.publisher ?? '',
              Excluded: item.is_excluded ? '1' : '0',
              'New FA': item.street_date
                ? dayjs.unix(item.street_date).format('MM/DD/YYYY')
                : '',
              'FA Retail Price': item.fa_retail_price
                ? `$${item.fa_retail_price}`
                : '',
              'FA Content Cost': item.fa_retail_content_cost
                ? `$${item.fa_retail_content_cost}`
                : '',
              'New TRL': item.activated_at
                ? dayjs.unix(item.activated_at).format('MM/DD/YYYY')
                : '',
              'TRL Cost': item.bookshelf_credit_cost ?? '',
              Curated: item.curated_at
                ? dayjs.unix(item.curated_at).format('MM/DD/YYYY')
                : '',
              Featured: item.is_featured ? '1' : '0',
              Active: item.is_active ? '1' : '0',
              Language: item.language ?? '',
              BISAC: (item.bisac_codes ?? []).join(', '),
              Length: item.runtime ?? '',
              Copyright: item.copyright ?? '',
            });
          } else {
            const qto = item.purchased_rental_licenses ?? 0;
            const qic = item.total_rented ?? 0;
            const qoh = qto - qic;

            csvStream.write({
              AudioAPI: 'AudioAPI',
              Active: item.is_active ? '1' : '0',
              SKU: item.sku ? `Audio${item.sku}` : '',
              ISBN: item.isbn ?? '',
              Title: item.title ?? '',
              'Title for Display': item.display_title ?? '',
              Author: (item.authors ?? []).join(', '),
              'Author for Display': (item.display_authors ?? []).join(', '),
              'Digital Publisher': item.publisher ?? '',
              Description: item.description ?? '',
              'Description for Display': item.display_description ?? '',
              'Short Description for Display':
                item.display_short_description ?? '',
              'Rental Fee': '0',
              'TRL Cost': item.bookshelf_credit_cost ?? '0',
              'Only for Purchase': item.is_only_for_purchase ? '1' : '0',
              'Is Premium': item.bookshelf_credit_cost > 1 ? '1' : '0',
              'Approx Length': item.runtime ?? '',
              'File Size': item.actual_size ?? '',
              Narrators: (item.narrators ?? []).join(', '),
              Abridgement: item.abridgement ?? '',
              Language: item.language ?? '',
              'BISAC Codes': (item.bisac_codes ?? []).join(', '),
              'Product ID': item.product_id ?? '',
              'Retail Product ID': item.retail_product_id ?? '',
              'Product Signature': item.metadata_signature ?? '',
              'For Sale': item.is_for_sale ? '1' : '0',
              'Findaway Price': item.fa_price ?? '',
              'Findaway Retail Price': item.fa_retail_price ?? '',
              'Findaway Content Cost': item.fa_content_cost ?? '',
              'Findaway Retail Content Cost': item.fa_retail_content_cost ?? '',
              'Sale Locations': (item.sales_locations ?? [])?.join(', ') ?? '',
              'Sample URL': item.sample_url ?? '',
              Copyright: item.copyright ?? '',
              'Copyright for Display': item.display_copyright ?? '',
              'Street Date': item.street_date
                ? dayjs.unix(item.street_date).format('MM/DD/YYYY')
                : '',
              'Purchased Licenses': item.purchased_rental_licenses ?? '0',
              'Limit of Purchased Licenses':
                item.purchased_rental_license_limit ?? '0',
              'Payment Availability': StringHelper.capitalize(
                item.available_for ?? '',
              ),
              Featured: item.is_featured ? '1' : '0',
              Excluded: item.is_excluded ? '1' : '0',
              Curated: item.curated_at
                ? dayjs.unix(item.curated_at).format('MM/DD/YYYY')
                : '',
              'New TRL': item.activated_at
                ? dayjs.unix(item.activated_at).format('MM/DD/YYYY')
                : '',
              'Cover URL': item.cover_url ?? '',
              Categories: (
                item.default_categories.map(
                  (category: Category) => category.name,
                ) ?? []
              ).join(', '),
              'Suggested Items': (item.suggestions ?? [])
                .map((suggestion: Audio) => `Audio${suggestion.sku}`)
                .join(', '),
              QTO: qto,
              QOH: qoh,
              QIC: qic,
              Rating: item.avg_rating ?? '',
            });
          }
        }

        processedCount += items.length;
        const elapsedTime = Date.now() - startTime;
        const recordsPerSec = Math.round(
          processedCount / (elapsedTime / 1000 || 1),
        );

        console.log(
          `Batch ${batchCount}: Processed ${processedCount} records, ${recordsPerSec} rec/s`,
        );

        if (items.length < batchSize) {
          hasMoreData = false;
          break;
        }
      }

      csvStream.end(); // finish CSV
      console.log(
        `Export completed: ${processedCount} records in ${Math.round((Date.now() - startTime) / 1000)}s`,
      );
    } catch (error) {
      console.error('Export error:', error);
      csvStream.end();
      stream.emit('error', error);
    }

    return stream;
  }
}
