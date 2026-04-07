import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class AddItemColumnsToAppErrorLogs1774900000000
  implements MigrationInterface
{
  private tableName = 'app_error_logs';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      this.tableName,
      new TableColumn({
        name: 'item_type',
        type: 'varchar',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      this.tableName,
      new TableColumn({
        name: 'item_id',
        type: 'varchar',
        isNullable: true,
      }),
    );

    // Add index on item_type for better query performance
    await queryRunner.createIndex(
      this.tableName,
      new TableIndex({
        name: 'IDX_APP_ERROR_LOGS_ITEM_TYPE',
        columnNames: ['item_type'],
      }),
    );

    // Add index on item_id for better query performance
    await queryRunner.createIndex(
      this.tableName,
      new TableIndex({
        name: 'IDX_APP_ERROR_LOGS_ITEM_ID',
        columnNames: ['item_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(this.tableName, 'IDX_APP_ERROR_LOGS_ITEM_ID');
    await queryRunner.dropIndex(this.tableName, 'IDX_APP_ERROR_LOGS_ITEM_TYPE');
    await queryRunner.dropColumn(this.tableName, 'item_id');
    await queryRunner.dropColumn(this.tableName, 'item_type');
  }
}
