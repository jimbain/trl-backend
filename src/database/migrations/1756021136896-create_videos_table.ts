import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateVideosTable1756021136896 implements MigrationInterface {
  private tableName = 'videos';

  private indices = [
    {
      columnName: 'group',
      indexName: 'IDX_VIDEOS_GROUP',
      isUnique: false,
    },
    {
      columnName: 'sku',
      indexName: 'IDX_VIDEOS_SKU',
      isUnique: true,
    },
    {
      columnName: 'is_active',
      indexName: 'IDX_VIDEOS_IS_ACTIVE',
      isUnique: false,
    },
    {
      columnName: 'avilar_course_id',
      indexName: 'IDX_VIDEOS_AVILAR_COURSE_ID',
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
            length: '34',
            isPrimary: true,
          },
          {
            name: 'group',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'sku',
            type: 'varchar',
            isUnique: true,
            isNullable: true,
          },
          {
            name: 'title',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'is_featured',
            type: 'boolean',
            default: false,
          },
          {
            name: 'image_url',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'runtime',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'avg_rating',
            type: 'float',
            default: 0,
          },
          {
            name: 'categories',
            type: 'jsonb',
            isNullable: true,
            default: `'[]'::jsonb`,
          },
          {
            name: 'total_played',
            type: 'bigint',
            default: 0,
          },
          {
            name: 'avilar_course_id',
            type: 'varchar',
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
