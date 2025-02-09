import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

export class CreateUserAudioStatusesTable1738687426500
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_audio_statuses',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '255',
            isPrimary: true,
          },
          {
            name: 'user_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'audio_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['queued', 'rented', 'bookshelved'],
            default: "'queued'",
          },
          {
            name: 'license_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'rental_expire_at',
            type: 'timestamp',
            isNullable: true,
            comment: 'Only for Rent',
          },
        ],
      }),
    );

    // Create foreign key relationship with the users table
    await queryRunner.createForeignKey(
      'user_audio_statuses',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Create foreign key relationship with the audios table
    await queryRunner.createForeignKey(
      'user_audio_statuses',
      new TableForeignKey({
        columnNames: ['audio_id'],
        referencedTableName: 'audios',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('user_audio_statuses');
    const foreignKeys = table.foreignKeys;

    const userForeignKey = foreignKeys.find(
      (fk) => fk.columnNames.indexOf('user_id') !== -1,
    );
    if (userForeignKey) {
      await queryRunner.dropForeignKey('user_audio_statuses', userForeignKey);
    }

    const audioForeignKey = foreignKeys.find(
      (fk) => fk.columnNames.indexOf('audio_id') !== -1,
    );
    if (audioForeignKey) {
      await queryRunner.dropForeignKey('user_audio_statuses', audioForeignKey);
    }

    await queryRunner.dropTable('user_audio_statuses');
  }
}
