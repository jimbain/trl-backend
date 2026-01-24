import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreatePharmaUserStatusesTable1750753311486
  implements MigrationInterface
{
  private tableName = 'pharma_user_statuses';

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
      indexName: 'IDX_PHARMA_USER_STATUSES_PHARMA_ID',
      isUnique: false,
    },
    {
      columnName: 'user_id',
      indexName: 'IDX_PHARMA_USER_STATUSES_USER_ID',
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
            name: 'status',
            type: 'enum',
            enum: ['queued', 'rented'],
            default: "'queued'",
          },
          {
            name: 'list_order',
            type: 'int',
            isNullable: true,
            comment: 'Sequence of title in the list',
          },
          {
            name: 'rental_start_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'current_rental_expire_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'next_rental_expire_at',
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
        name: 'UQ_PHARMA_USER_STATUSES_PHARMA_USER',
        columnNames: ['user_id', 'pharma_id'],
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
      'UQ_PHARMA_USER_STATUSES_PHARMA_USER',
    );

    await queryRunner.dropTable(this.tableName);
  }
}
