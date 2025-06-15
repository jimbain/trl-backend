import { Injectable } from '@nestjs/common';
import {
  QueryAdminAudioDto,
  SearchFor,
} from '../dto/audio/query-admin-audio.dto';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { plainToInstance } from 'class-transformer';
import { AdminAudioListDto } from '../dto/audio/admin-audio.dto';
import { MeiliAudio } from 'src/audios/audio.interface';
import { AppElasticsearchService } from 'src/app-elasticsearch/services/app-elasticsearch.service';
import {
  SearchRequest,
  QueryDslQueryContainer,
  Sort,
} from '@elastic/elasticsearch/lib/api/types';

@Injectable()
export class AdminAudioElasticsearchService {
  private readonly index = 'audios';

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
      is_featured,
      is_excluded,
      order_by_column,
      order_by,
      is_export,
    } = query;

    const searchWords = search_text?.trim().split(/\s+/).filter(Boolean) ?? [];

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
      let searchQuery: any;
      switch (search_for) {
        case SearchFor.PHRASE:
          searchQuery = {
            query_string: {
              query: `"${search_text.trim()}"`,
              fields: [
                'title',
                'authors',
                'publisher',
                'bisac_codes',
                'description',
              ],
            },
          };
          break;
        case SearchFor.ANY_WORD:
          searchQuery = {
            query_string: {
              query: searchWords.join(' OR '),
              fields: [
                'title',
                'authors',
                'publisher',
                'bisac_codes',
                'description',
              ],
            },
          };
          break;
        case SearchFor.ALL_WORDS:
          searchQuery = {
            query_string: {
              query: searchWords.map((word) => `"${word}"`).join(' AND '),
              fields: [
                'title',
                'authors',
                'publisher',
                'bisac_codes',
                'description',
              ],
            },
          };
          break;
        default:
          searchQuery = {
            query_string: {
              query: search_text.trim(),
              fields: [
                'title',
                'authors',
                'publisher',
                'bisac_codes',
                'description',
              ],
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

    // ------------------------------
    // 4. Sorting
    // ------------------------------
    let sort: Sort[] = [{ _id: { order: 'asc' } }]; // Default sort
    if (order_by_column && order_by) {
      const orderByMap: Record<string, string> = {
        sku: 'sku',
        title: 'title',
        publisher: 'publisher',
        author: 'author',
        bisac_code: 'bisac_code',
        fa_retail_price: 'fa_retail_price',
        fa_retail_content_cost: 'fa_retail_content_cost',
        bookshelf_credit_cost: 'bookshelf_credit_cost',
        language: 'language',
        runtime: 'runtime',
        copyright: 'copyright',
        is_active: 'is_active',
        is_excluded: 'is_excluded',
        is_featured: 'is_featured',
        street_date: 'street_date',
        activated_at: 'activated_at',
        curated_at: 'curated_at',
      };

      const column = orderByMap[order_by_column];
      const order = order_by.toLowerCase() === 'desc' ? 'desc' : 'asc';

      if (column) {
        sort = [{ [column]: { order } }];
      }
    }

    // ------------------------------
    // 5. Execute Search
    // ------------------------------
    const searchParams: SearchRequest = {
      index: this.index,
      body: {
        query:
          must.length > 0 || filter.length > 0 || must_not.length > 0
            ? esQuery
            : { match_all: {} },
        sort,
        from: (page - 1) * per_page,
        size: per_page,
        track_total_hits: true,
      },
    };

    const { hits } =
      await this.appElasticsearchService.search<MeiliAudio>(searchParams);

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
      },
    };
  }
}
