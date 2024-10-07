import { DataSource } from 'typeorm';
import { getDataSourceOptions } from './data_source';

async function refreshDatabase() {
  const dataSource = new DataSource(getDataSourceOptions());

  try {
    console.log('Initializing data source...');
    await dataSource.initialize();

    console.log('Dropping all enum types...');
    await dataSource.query(`
            DO $$ 
            DECLARE 
                r RECORD;
            BEGIN
                FOR r IN (SELECT n.nspname AS schema_name, t.typname AS type_name
                        FROM pg_type t
                        JOIN pg_namespace n ON n.oid = t.typnamespace
                        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
                        AND t.typtype = 'e' -- to drop only enumerated types, remove this condition if you want to drop all types
                        ) LOOP
                    EXECUTE 'DROP TYPE IF EXISTS ' || r.schema_name || '.' || r.type_name || ' CASCADE';
                END LOOP;
            END $$;
        `);

    console.log('Dropping all tables...');
    await dataSource.dropDatabase();

    console.log('All tables and enum types have been dropped successfully.');
  } catch (error) {
    console.error('Error refreshing database:', error);
  } finally {
    await dataSource.destroy();
  }
}

refreshDatabase().catch((error) =>
  console.error('Error refreshing database:', error),
);
