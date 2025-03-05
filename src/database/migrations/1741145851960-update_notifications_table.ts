import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class UpdateNotificationsTable1741145851960
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('notifications', 'recipient_type');
    await queryRunner.dropColumn('notifications', 'recipient_id');

    await queryRunner.addColumn(
      'notifications',
      new TableColumn({
        name: 'user_ids',
        type: 'jsonb',
        isNullable: false,
        default: "'[]'::jsonb",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'notifications',
      new TableColumn({
        name: 'recipient_type',
        type: 'varchar',
        length: '100',
        isNullable: false,
        comment: 'e.g. user,company',
      }),
    );

    await queryRunner.addColumn(
      'notifications',
      new TableColumn({
        name: 'recipient_id',
        type: 'varchar',
        isNullable: false,
      }),
    );

    await queryRunner.dropColumn('notifications', 'user_ids');
  }
}
