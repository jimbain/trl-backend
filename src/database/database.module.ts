import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from "typeorm-naming-strategies";

@Module({
  imports:[
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.getOrThrow<string>('DB_HOST'),
        port: config.getOrThrow<number>('DB_PORT'),
        username: config.getOrThrow<string>('DB_USERNAME'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: config.getOrThrow<string>('DB_DATABASE'),
        ssl: config.getOrThrow<string>('POSTGRES_SSL') === 'true',
        autoLoadEntities: true,
        synchronize: config.getOrThrow<string>('POSTGRES_SYNCHRONIZE') === 'true',
        dropSchema: false,
        // Run migrations automatically,
        // you can disable this if you prefer running migration manually.
        migrationsRun: false,
        logging: true,
        namingStrategy: new SnakeNamingStrategy,
        migrations: ['dist/migrations/**/*.js'],
        subscribers: ['dist/subscriber/**/*.js'],
        cli: {
          migrationsDir: config.get<string>('TYPEORM_MIGRATIONS_DIR'),
          subscribersDir: config.get<string>('TYPEORM_SUBSCRIBERS_DIR'),
        },
      }),
    }),
  ]
})
export class DatabaseModule {}
