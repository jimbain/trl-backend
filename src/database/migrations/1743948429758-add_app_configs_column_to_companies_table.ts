import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAppConfigsColumnToCompaniesTable1743948429758
  implements MigrationInterface
{
  private tableName = 'companies';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      this.tableName,
      new TableColumn({
        name: 'app_configs',
        type: 'jsonb',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn(this.tableName, 'app_configs');
  }
}
