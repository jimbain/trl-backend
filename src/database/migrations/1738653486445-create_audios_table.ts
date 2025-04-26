import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateAudiosTable1738653486445 implements MigrationInterface {
  private tableName = 'audios';

  private foreignKeys = [
    {
      columnName: 'sku',
      referencedTable: 'audio_metadata',
      referencedColumnName: 'sku',
      onDelete: 'SET NULL',
    },
  ];

  private indices = [
    {
      columnName: 'sku',
      indexName: 'IDX_AUDIOS_SKU',
      isUnique: true,
    },
    {
      columnName: 'is_active',
      indexName: 'IDX_AUDIOS_IS_ACTIVE',
      isUnique: false,
    },
    {
      columnName: 'is_featured',
      indexName: 'IDX_AUDIOS_IS_FEATURED',
      isUnique: false,
    },
    {
      columnName: 'is_excluded',
      indexName: 'IDX_AUDIOS_IS_EXCLUDED',
      isUnique: false,
    },
    {
      columnName: 'bookshelf_credit_cost',
      indexName: 'IDX_AUDIOS_BOOKSHELF_CREDIT_COST',
      isUnique: false,
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: this.tableName,
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '35',
            isPrimary: true,
          },
          {
            name: 'sku',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'is_excluded',
            type: 'boolean',
            default: false,
          },
          {
            name: 'is_featured',
            type: 'boolean',
            default: false,
          },
          {
            name: 'bookshelf_credit_cost',
            type: 'int',
            default: 0,
          },
          {
            name: 'display_title',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'display_authors',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'display_description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'display_short_description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'display_copyright',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'purchased_rental_license_limit',
            type: 'int',
            default: 0,
          },
          {
            name: 'total_rented',
            type: 'int',
            default: 0,
          },
          {
            name: 'avg_rating',
            type: 'float',
            default: 0,
          },
          {
            name: 'deep_link',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'is_only_for_purchase',
            type: 'boolean',
            default: true,
          },
          {
            name: 'is_new_trl',
            type: 'boolean',
            default: false,
          },
          {
            name: 'is_curated',
            type: 'boolean',
            default: false,
          },
          {
            name: 'categories',
            type: 'jsonb',
            isNullable: true,
            default: `'[]'::jsonb`,
          },
          {
            name: 'suggestions',
            type: 'jsonb',
            default: `'[]'::jsonb`,
          },
          {
            name: 'total_played',
            type: 'bigint',
            default: 0,
          },
          {
            name: 'activated_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'curated_at',
            type: 'timestamp',
            isNullable: true,
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

    for (const fk of this.foreignKeys) {
      await queryRunner.createForeignKey(
        this.tableName,
        new TableForeignKey({
          columnNames: [fk.columnName],
          referencedColumnNames: [fk.referencedColumnName],
          referencedTableName: fk.referencedTable,
          onDelete: fk.onDelete,
        }),
      );
    }

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

    for (const fk of this.foreignKeys) {
      const foreignKey = table.foreignKeys.find((fkObj) =>
        fkObj.columnNames.includes(fk.columnName),
      );
      if (foreignKey) {
        await queryRunner.dropForeignKey(this.tableName, foreignKey);
      }
    }

    await queryRunner.dropTable(this.tableName);
  }
}
