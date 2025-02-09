import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableUnique,
} from 'typeorm';

export class CreateAudioReviewsTable1738687390438
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'audio_reviews',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '45',
            isPrimary: true,
          },
          {
            name: 'audio_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'user_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'rate',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'review',
            type: 'text',
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
          {
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
    );

    await queryRunner.createForeignKey(
      'audio_reviews',
      new TableForeignKey({
        columnNames: ['audio_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'audios',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'audio_reviews',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    // Add unique constraint
    await queryRunner.createUniqueConstraint(
      'audio_reviews',
      new TableUnique({
        name: 'UQ_AUDIO_REVIEWS_AUDIO_USER',
        columnNames: ['audio_id', 'user_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    const table = await queryRunner.getTable('audios');
    const foreignKeys = table.foreignKeys;

    const audioForeignKey = foreignKeys.find(
      (fk) => fk.columnNames.indexOf('audio_id') !== -1,
    );
    if (audioForeignKey) {
      await queryRunner.dropForeignKey('user_audio_statuses', audioForeignKey);
    }

    const userForeignKey = foreignKeys.find(
      (fk) => fk.columnNames.indexOf('user_id') !== -1,
    );
    if (userForeignKey) {
      await queryRunner.dropForeignKey('user_audio_statuses', userForeignKey);
    }

    // Drop the unique index
    await queryRunner.dropUniqueConstraint(
      'audio_reviews',
      'UQ_AUDIO_REVIEWS_AUDIO_USER',
    );

    await queryRunner.dropTable('audio_reviews');
  }
}
