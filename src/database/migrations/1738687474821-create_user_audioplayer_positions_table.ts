import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableUnique,
} from 'typeorm';

export class CreateUserAudioplayerPositionsTable1738687474821
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_audioplayer_positions',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '55',
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
            name: 'part_number',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'chapter_number',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'play_position',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
    );

    await queryRunner.createForeignKey(
      'user_audioplayer_positions',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'user_audioplayer_positions',
      new TableForeignKey({
        columnNames: ['audio_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'audios',
        onDelete: 'CASCADE',
      }),
    );

    // Add unique constraint
    await queryRunner.createUniqueConstraint(
      'user_audioplayer_positions',
      new TableUnique({
        name: 'UQ_USER_AUDIOPLAYER_POSITIONS_USER_AUDIO',
        columnNames: ['user_id', 'audio_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('user_audioplayer_positions');
    const foreignKeys = table.foreignKeys;

    const userForeignKey = foreignKeys.find(
      (fk) => fk.columnNames.indexOf('user_id') !== -1,
    );
    if (userForeignKey) {
      await queryRunner.dropForeignKey(
        'user_audioplayer_positions',
        userForeignKey,
      );
    }

    const audioForeignKey = foreignKeys.find(
      (fk) => fk.columnNames.indexOf('audio_id') !== -1,
    );
    if (audioForeignKey) {
      await queryRunner.dropForeignKey(
        'user_audioplayer_positions',
        audioForeignKey,
      );
    }

    // Drop the unique index
    await queryRunner.dropUniqueConstraint(
      'user_audioplayer_positions',
      'UQ_USER_AUDIOPLAYER_POSITIONS_USER_AUDIO',
    );

    await queryRunner.dropTable('user_audioplayer_positions');
  }
}
