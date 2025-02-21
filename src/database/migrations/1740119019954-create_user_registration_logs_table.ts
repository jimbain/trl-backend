import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

export class CreateUserRegistrationLogsTable1740119019954
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_registration_logs',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'company_id',
            type: 'varchar',
            length: '35',
            isNullable: false,
          },
          {
            name: 'csv_content',
            type: 'jsonb',
            default: `'{}'::jsonb`,
          },
          {
            name: 'meta',
            type: 'jsonb',
            default: `'{}'::jsonb`,
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

    await queryRunner.createForeignKey(
      'user_registration_logs',
      new TableForeignKey({
        columnNames: ['company_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'companies',
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('user_registration_logs');
    const foreignKey = table.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('company_id') !== -1,
    );

    if (foreignKey) {
      await queryRunner.dropForeignKey('users', foreignKey);
    }

    await queryRunner.dropTable('user_registration_logs');
  }
}
