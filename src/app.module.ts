import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.dev', '.env.stage', '.env.prod'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_DATABASE'),
        ssl: config.get<string>('POSTGRES_SSL') === 'true',
        entities: [__dirname + '/**/*.{model,entity}.{ts,js}'],
        // We are using migrations, synchronize should be set to false.
        synchronize: true,
        dropSchema: false,
        // Run migrations automatically,
        // you can disable this if you prefer running migration manually.
        migrationsRun: false,
        logging: true,
        migrations: ['dist/migrations/**/*.js'],
        subscribers: ['dist/subscriber/**/*.js'],
        cli: {
          migrationsDir: config.get<string>('TYPEORM_MIGRATIONS_DIR'),
          subscribersDir: config.get<string>('TYPEORM_SUBSCRIBERS_DIR'),
        },

        // type: 'mysql',
        // host: config.get<string>('TYPEORM_HOST'),
        // port: config.get<number>('TYPEORM_PORT'),
        // username: config.get<string>('TYPEORM_USERNAME'),
        // password: config.get<string>('TYPEORM_PASSWORD'),
        // database: config.get<string>('TYPEORM_DATABASE'),
        // synchronize: true,
        // entities: [__dirname + '/**/*.{model,entity}.{ts,js}'],
        // migrations: ['dist/migrations/**/*.js'],
        // subscribers: ['dist/subscriber/**/*.js'],
        // cli: {
        //   migrationsDir: config.get<string>('TYPEORM_MIGRATIONS_DIR'),
        //   subscribersDir: config.get<string>('TYPEORM_SUBSCRIBERS_DIR'),
        // },
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
