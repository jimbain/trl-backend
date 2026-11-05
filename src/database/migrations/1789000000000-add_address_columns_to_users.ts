import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAddressColumnsToUsers1789000000000
  implements MigrationInterface
{
  private tableName = 'users';

  private columns = ['address1', 'address2', 'city', 'country', 'state', 'zip'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const name of this.columns) {
      await queryRunner.addColumn(
        this.tableName,
        new TableColumn({
          name,
          type: 'varchar',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of [...this.columns].reverse()) {
      await queryRunner.dropColumn(this.tableName, name);
    }
  }
}
