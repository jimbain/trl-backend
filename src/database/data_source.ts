import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as fs from 'fs';
import { join } from 'path';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

config();

console.log({
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_USERNAME: process.env.DB_USERNAME,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_DATABASE: process.env.DB_DATABASE,
  POSTGRES_SSL: process.env.POSTGRES_SSL,
});

export const getDataSourceOptions = (): DataSourceOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl:
    process.env.POSTGRES_SSL === 'true'
      ? {
          rejectUnauthorized: true,
          ca: fs.readFileSync('cert/dev-db-ca-certificate.crt').toString(),
        }
      : false,
  entities: ['dist/**/entities/*.entity.js'],
  synchronize: process.env.POSTGRES_SYNCHRONIZE === 'true',
  dropSchema: false,
  migrationsRun: false,
  logging: true,
  namingStrategy: new SnakeNamingStrategy(),
  migrations: ['dist/database/migrations/*.js'],
});

export const AppDataSource = new DataSource(getDataSourceOptions());
