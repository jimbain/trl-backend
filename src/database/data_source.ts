import "reflect-metadata";
import { config } from 'dotenv';
import { DataSource, DataSourceOptions } from "typeorm";
import * as fs from 'fs';
import { join } from 'path';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

config();

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
                ca: fs
                .readFileSync('cert/dev-db-ca-certificate.crt')
                .toString(),
            }
            : false,
    entities: ["dist/**/entities/*.entity.js"],
    synchronize: process.env.POSTGRES_SYNCHRONIZE === 'true',
    dropSchema: false,
    migrationsRun: false,
    logging: true,
    namingStrategy: new SnakeNamingStrategy(),
    migrations: ['dist/database/migrations/*.js'],
});

export const AppDataSource = new DataSource(getDataSourceOptions());
