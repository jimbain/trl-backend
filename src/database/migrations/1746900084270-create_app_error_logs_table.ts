import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateAppErrorLogsTable1746900084270
  implements MigrationInterface
{
  private tableName = 'app_error_logs';

  private foreignKeys = [
    {
      columnName: 'user_id',
      referencedTable: 'users',
      referencedColumnName: 'id',
      onDelete: 'SET NULL',
    },
  ];

  private indices = [
    {
      columnName: 'app_version',
      indexName: 'IDX_APP_ERROR_LOGS_APP_VERSION',
      isUnique: false,
    },
    {
      columnName: 'app_platform',
      indexName: 'IDX_APP_ERROR_LOGS_APP_PLATFORM',
      isUnique: false,
    },
    {
      columnName: 'created_at',
      indexName: 'IDX_APP_ERROR_LOGS_CREATED_AT',
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
            type: 'serial',
            isPrimary: true,
          },
          {
            name: 'user_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'app_version',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'app_platform',
            type: 'varchar',
            enum: ['ios', 'android'],
            isNullable: false,
          },
          {
            name: 'summary',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'stack_trace',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'meta',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
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
