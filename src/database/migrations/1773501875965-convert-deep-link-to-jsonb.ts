import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertDeepLinkToJsonb1773501875965 implements MigrationInterface {
  private tableName = 'audios';
  private columnName = 'deep_link';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Convert deep_link column from text to jsonb
    // Set existing data to empty object if NULL, otherwise preserve as empty object
    await queryRunner.query(`
      ALTER TABLE "${this.tableName}"
      ALTER COLUMN "${this.columnName}" TYPE jsonb
      USING CASE
        WHEN "${this.columnName}" IS NULL THEN NULL
        ELSE '{}'::jsonb
      END;
    `);

    // Set column to allow NULL values
    await queryRunner.query(`
      ALTER TABLE "${this.tableName}"
      ALTER COLUMN "${this.columnName}" DROP NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Convert deep_link column back from jsonb to text
    await queryRunner.query(`
      ALTER TABLE "${this.tableName}"
      ALTER COLUMN "${this.columnName}" TYPE text
      USING CASE
        WHEN "${this.columnName}" IS NULL THEN NULL
        ELSE ''::text
      END;
    `);

    // Set column to allow NULL values
    await queryRunner.query(`
      ALTER TABLE "${this.tableName}"
      ALTER COLUMN "${this.columnName}" DROP NOT NULL;
    `);
  }
}
