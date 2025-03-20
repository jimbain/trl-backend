import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateAppConfigsTable1738603731534 implements MigrationInterface {
  private tableName = 'app_configs';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: this.tableName,
        columns: [
          {
            name: 'key',
            type: 'varchar',
            length: '255',
            isNullable: false,
            isPrimary: true,
          },
          {
            name: 'value',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable(this.tableName);
  }
}
