import { Injectable } from '@nestjs/common';
import { MeiliSearch } from 'meilisearch';
import { QueryAdminAudioDto } from '../dto/audio/query-admin-audio.dto';

@Injectable()
export class AdminAudioMeiliSearchService {
  private client: MeiliSearch;

  constructor() {
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
      is_export,
    } = query;

    const index = this.client.index('audios');

    const limit = per_page;
    const offset = (page - 1) * per_page;

    const sort: string[] = [];
    if (order_by_column && order_by) {
      // MeiliSearch requires sorting attributes to be whitelisted in settings
      // and format: ["column:asc", "column:desc"]
      sort.push(`${order_by_column}:${order_by.toLowerCase()}`);
    }

    const results = await index.search(search_text, {
      limit,
      offset,
      sort: sort.length ? sort : undefined,
    });

    return {
      data: results.hits,
      meta: {
        total: results.estimatedTotalHits,
        page,
        per_page,
        total_pages: Math.ceil(results.estimatedTotalHits / per_page),
      },
    };
  }
}
