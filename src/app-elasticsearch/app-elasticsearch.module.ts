import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { AppElasticsearchService } from './services/app-elasticsearch.service';

@Module({
  imports: [
    ElasticsearchModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        node: configService.getOrThrow<string>('ELASTICSEARCH_NODE'),
        auth: {
          username: configService.getOrThrow<string>('ELASTICSEARCH_USERNAME'),
          password: configService.getOrThrow<string>('ELASTICSEARCH_PASSWORD'),
        },
        tls: {
          rejectUnauthorized: false,
        },
        headers: {
          accept: 'application/vnd.elasticsearch+json; compatible-with=8',
          'content-type':
            'application/vnd.elasticsearch+json; compatible-with=8',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AppElasticsearchService],
  exports: [AppElasticsearchService],
})
export class AppElasticsearchModule {}
