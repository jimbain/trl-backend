import { Injectable } from '@nestjs/common';
import { MeiliSearch } from 'meilisearch';
import { QueryAdminAudioDto } from '../dto/audio/query-admin-audio.dto';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { MeiliAudio } from 'src/audios/audio.interface';

@Injectable()
export class AdminAudioMeiliSearchService {
  private client: MeiliSearch;

  constructor() {
    dayjs.extend(utc);
    this.client = new MeiliSearch({
      host: process.env.MEILISEARCH_HOST,
      apiKey: process.env.MEILISEARCH_API_KEY,
    });
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
    } = query;

    const index = this.client.index('audios');

    const filters: string[] = [];

    if (is_active !== undefined) filters.push(`is_active = ${is_active}`);
    if (is_featured !== undefined) filters.push(`is_featured = ${is_featured}`);
    if (is_excluded !== undefined) filters.push(`is_excluded = ${is_excluded}`);
    if (bookshelf_credit_cost !== undefined)
      filters.push(`bookshelf_credit_cost = ${bookshelf_credit_cost}`);
    if (retail_price_min !== undefined)
      filters.push(`fa_retail_price >= ${retail_price_min}`);
    if (retail_price_max !== undefined)
      filters.push(`fa_retail_price <= ${retail_price_max}`);
    if (retail_content_cost_min !== undefined)
      filters.push(`fa_retail_content_cost >= ${retail_content_cost_min}`);
    if (retail_content_cost_max !== undefined)
      filters.push(`fa_retail_content_cost <= ${retail_content_cost_max}`);
    if (street_date_from !== undefined && dayjs(street_date_from).isValid()) {
      const unixTimestampStreetFrom = dayjs(street_date_from).unix();
      filters.push(`street_date >= ${unixTimestampStreetFrom}`);
    }
    if (street_date_to !== undefined && dayjs(street_date_to).isValid()) {
      const unixTimestampStreetTo = dayjs(street_date_to).unix();
      filters.push(`street_date <= ${unixTimestampStreetTo}`);
    }

    if (category_id !== undefined) {
      const clause = is_included_in_category
        ? `categories IN [${category_id}]`
        : `categories NOT IN [${category_id}]`;
      filters.push(clause);
    }

    const filterString = filters.length > 0 ? filters.join(' AND ') : undefined;

    console.log(filterString);

    let sortField = undefined;
    if (order_by_column && order_by) {
      const orderByMap: Record<string, string> = {
        sku: 'sku',
        title: 'title',
        publisher: 'publisher',
        street_date: 'street_date',
        activated_at: 'activated_at',
        curated_at: 'curated_at',
        fa_retail_price: 'fa_retail_price',
        fa_retail_content_cost: 'fa_retail_content_cost',
        bookshelf_credit_cost: 'bookshelf_credit_cost',
        language: 'language',
        runtime: 'runtime',
        copyright: 'copyright',
        is_active: 'is_active',
        is_excluded: 'is_excluded',
        is_featured: 'is_featured',
      };

      const column = orderByMap[order_by_column];

      sortField = column
        ? `${column}:${order_by.toLowerCase() ?? 'asc'}`
        : undefined;
    }

    const q = search_text || ''; // Empty string fetches all

    const searchParams: any = {
      q,
      filter: filterString,
      sort: sortField ? [sortField] : undefined,
      limit: per_page,
      offset: (page - 1) * per_page,
    };

    const results = await index.search(q, searchParams);
    const total = results.estimatedTotalHits;

    const data = results.hits.map((item: any) => ({
      ...item,
      street_date: item.street_date
        ? dayjs.unix(item.street_date).format('YYYY-MM-DD')
        : null,
      activated_at: item.activated_at
        ? dayjs.unix(item.activated_at).format('YYYY-MM-DD')
        : null,
      curated_at: item.curated_at
        ? dayjs.unix(item.curated_at).format('YYYY-MM-DD')
        : null,
    }));

    return {
      data,
      meta: {
        total: total,
        per_page,
        current_page: page,
        last_page: Math.ceil(total / per_page),
        from: total > 0 ? (page - 1) * per_page + 1 : null,
        to: Math.min(page * per_page, total),
      },
    };
  }
}
