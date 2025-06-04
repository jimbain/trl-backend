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
        page,
        per_page,
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

    return this.client.index("audios");
  }
}
