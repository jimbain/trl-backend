import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateAudioMetadataTable1738653486430
  implements MigrationInterface
{
  private tableName = 'audio_metadata';

  private indices = [
    {
      columnName: 'street_date',
      indexName: 'IDX_AUDIO_METADATA_STREET_DATE',
      isUnique: false,
    },
    {
      columnName: 'findaway_retail_price',
      indexName: 'IDX_AUDIO_METADATA_FINDWAY_RETAIL_PRICE',
      isUnique: false,
    },
    {
      columnName: 'findaway_retail_content_cost',
      indexName: 'IDX_AUDIO_METADATA_FINDWAY_RETAIL_CONTENT_COST',
      isUnique: false,
    },
    {
      columnName: 'publisher',
      indexName: 'IDX_AUDIO_METADATA_PUBLISHER',
      isUnique: false,
    },
  ];

  public async up(queryRunner: QueryRunner) {
    await queryRunner.createTable(
      new Table({
        name: this.tableName,
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
            name: 'street_date',
            type: 'date',
            isNullable: true,
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

    for (const index of this.indices) {
      await queryRunner.createIndex(
        this.tableName,
        new TableIndex({
          name: index.indexName,
          columnNames: [index.columnName],
          isUnique: index.isUnique,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable(this.tableName);

    if (!table) return;

    for (const index of this.indices) {
      const tableIndex = table.indices.find(
        (idx) => idx.name === index.indexName,
      );
      if (tableIndex) {
        await queryRunner.dropIndex(this.tableName, tableIndex);
      }
    }

    await queryRunner.dropTable(this.tableName);
  }
}
