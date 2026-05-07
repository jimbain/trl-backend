import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateNotificationsTable1738653272685
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'notifications',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'event_type',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'data',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'user_ids',
            type: 'jsonb',
            isNullable: false,
            default: "'[]'::jsonb",
          },
          {
            name: 'users_read_status',
            type: 'jsonb',
            isNullable: false,
            default: "'{}'::jsonb",
          },
          {
            name: 'expire_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'sent_at',
            type: 'timestamp',
            isNullable: true,
            comment:
              'Timestamp when notification was sent via Firebase. NULL = not sent yet',
          },
          {
            name: 'meta',
            type: 'jsonb',
            isNullable: true,
            default: "'{}'::jsonb",
            comment:
              'Metadata: error details, retry count, firebase response, etc.',
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

    // Index for scheduler queries (find unsent notifications by event_type)
    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'idx_notifications_event_type_sent_expire',
        columnNames: ['event_type', 'sent_at', 'expire_at'],
        where: 'sent_at IS NULL',
      }),
    );

    // Index for duplicate prevention (check if notification exists for user/event/date)
    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'idx_notifications_user_event_date',
        columnNames: ['user_ids', 'event_type', 'created_at'],
      }),
    );

    // Index for cleanup/monitoring queries
    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'idx_notifications_created_at',
        columnNames: ['created_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'notifications',
      'idx_notifications_created_at',
    );
    await queryRunner.dropIndex(
      'notifications',
      'idx_notifications_user_event_date',
    );
    await queryRunner.dropIndex(
      'notifications',
      'idx_notifications_event_type_sent_expire',
    );
    await queryRunner.dropTable('notifications');
  }
}
