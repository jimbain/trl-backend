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
  private tableName = 'audio_user_player_positions';

  private foreignKeys = [
    {
      columnName: 'user_id',
      referencedTable: 'users',
      referencedColumnName: 'id',
      onDelete: 'CASCADE',
    },
    {
      columnName: 'audio_id',
      referencedTable: 'audios',
      referencedColumnName: 'id',
      onDelete: 'CASCADE',
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: this.tableName,
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

    for (const fk of this.foreignKeys) {
      await queryRunner.createForeignKey(
        this.tableName,
        new TableForeignKey({
          columnNames: [fk.columnName],
          referencedColumnNames: [fk.referencedColumnName],
          referencedTableName: fk.referencedTable,
          onDelete: fk.onDelete,
        }),
      );
    }

    await queryRunner.createUniqueConstraint(
      this.tableName,
      new TableUnique({
        name: 'UQ_USER_AUDIOPLAYER_POSITIONS_USER_AUDIO',
        columnNames: ['user_id', 'audio_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable(this.tableName);
    if (!table) return;

    for (const fk of this.foreignKeys) {
      const foreignKey = table.foreignKeys.find((fkObj) =>
        fkObj.columnNames.includes(fk.columnName),
      );
      if (foreignKey) {
        await queryRunner.dropForeignKey(this.tableName, foreignKey);
      }
    }

    await queryRunner.dropUniqueConstraint(
      this.tableName,
      'UQ_USER_AUDIOPLAYER_POSITIONS_USER_AUDIO',
    );

    await queryRunner.dropTable(this.tableName);
  }
}
