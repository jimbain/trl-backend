import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateAudioMetadataTable1738653486430
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'audio_metadata',
        columns: [
          {
            name: 'sku',
            type: 'varchar',
            isPrimary: true,
            isNullable: false,
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'authors',
            type: 'jsonb',
            default: `'[]'::jsonb`,
          },
          {
            name: 'isbn',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'publisher',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'language',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'actual_size',
            type: 'int',
            default: 0,
          },
          {
            name: 'narrators',
            type: 'jsonb',
            default: `'[]'::jsonb`,
          },
          {
            name: 'abridgement',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'bisac_codes',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'runtime',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'product_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'retail_product_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'metadata_signature',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'findaway_price',
            type: 'float',
            isNullable: true,
          },
          {
            name: 'findaway_content_cost',
            type: 'float',
            isNullable: true,
          },
          {
            name: 'findaway_retail_price',
            type: 'float',
            isNullable: true,
          },
          {
            name: 'findaway_retail_content_cost',
            type: 'float',
            isNullable: true,
          },
          {
            name: 'available_for',
            type: 'enum',
            enum: ['rental', 'purchasable', 'both'],
            default: "'both'",
          },
          {
            name: 'is_for_sale',
            type: 'boolean',
            isNullable: true,
            default: false,
          },
          {
            name: 'sales_locations',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'retail_sales_locations',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'copyright',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'sample_url',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'cover_url',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'sub_title',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'chapters',
            type: 'jsonb',
            default: `'[]'::jsonb`,
          },
          {
            name: 'purchased_rental_licenses',
            type: 'int',
            default: 0,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('audio_metadata');
  }
}
