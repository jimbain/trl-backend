import {
  BulkRequest,
  ClearScrollRequest,
  IndexRequest,
  ScrollRequest,
} from '@elastic/elasticsearch/lib/api/types';
import { Injectable } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';

@Injectable()
export class AppElasticsearchService {
  constructor(private readonly elasticsearchService: ElasticsearchService) {}

  async search<T>(params: Parameters<ElasticsearchService['search']>[0]) {
    return this.elasticsearchService.search<T>(params);
  }

  async scroll<T>(params: ScrollRequest) {
    return this.elasticsearchService.scroll<T>(params);
  }

  async clearScroll(params: ClearScrollRequest) {
    return this.elasticsearchService.clearScroll(params);
  }

  async index<T>(params: IndexRequest<T>) {
    return this.elasticsearchService.index<T>(params);
  }

  async bulk(params: BulkRequest) {
    return this.elasticsearchService.bulk(params);
  }

  async delete(params: Parameters<ElasticsearchService['delete']>[0]) {
    return this.elasticsearchService.delete(params);
  }

  async indexExists(index: string): Promise<boolean> {
    const exists = await this.elasticsearchService.indices.exists({ index });
    return exists as boolean;
  }

  async createIndex(
    index: string,
    properties: Record<string, any>,
  ): Promise<void> {
    await this.elasticsearchService.indices.create({
      index,
      mappings: {
        properties: properties,
      },
    });
  }
}
