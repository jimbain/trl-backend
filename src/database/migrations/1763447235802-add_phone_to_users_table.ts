import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPhoneToUsersTable1763447235802 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');

    // Check if phone column already exists
    const phoneColumn = table?.findColumnByName('phone');

    if (!phoneColumn) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'phone',
          type: 'varchar',
          length: '50',
          isNullable: true,
          isUnique: false,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');

    // Check if phone column exists before dropping
    const phoneColumn = table?.findColumnByName('phone');

    if (phoneColumn) {
      await queryRunner.dropColumn('users', 'phone');
    }
  }
}
