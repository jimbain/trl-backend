import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreatePharmaReviewsTable1750753289364
  implements MigrationInterface
{
  private tableName = 'pharma_reviews';

  private foreignKeys = [
    {
      columnName: 'pharma_id',
      referencedTable: 'pharmas',
      referencedColumnName: 'id',
      onDelete: 'CASCADE',
    },
    {
      columnName: 'user_id',
      referencedTable: 'users',
      referencedColumnName: 'id',
      onDelete: 'CASCADE',
    },
  ];

  private indices = [
    {
      columnName: 'pharma_id',
      indexName: 'IDX_PHARMA_REVIEWS_PHARMA_ID',
      isUnique: false,
    },
    {
      columnName: 'user_id',
      indexName: 'IDX_PHARMA_REVIEWS_USER_ID',
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
            length: '45',
            isPrimary: true,
          },
          {
            name: 'pharma_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'user_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'rate',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'review',
            type: 'text',
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

    // Add unique constraint
    await queryRunner.createUniqueConstraint(
      this.tableName,
      new TableUnique({
        name: 'UQ_PHARMA_REVIEWS_PHARMA_USER',
        columnNames: ['pharma_id', 'user_id'],
      }),
    );
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

    // Drop the unique index
    await queryRunner.dropUniqueConstraint(
      this.tableName,
      'UQ_PHARMA_REVIEWS_PHARMA_USER',
    );

    await queryRunner.dropTable(this.tableName);
  }
}
