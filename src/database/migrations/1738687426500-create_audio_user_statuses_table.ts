import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateUserAudioStatusesTable1738687426500
  implements MigrationInterface
{
  private tableName = 'audio_user_statuses';

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

  private indices = [
    {
      columnName: 'audio_id',
      indexName: 'IDX_AUDIO_USER_STATUSES_AUDIO_ID',
      isUnique: false,
    },
    {
      columnName: 'user_id',
      indexName: 'IDX_AUDIO_USER_STATUSES_USER_ID',
      isUnique: false,
    },
    {
      columnName: 'status',
      indexName: 'IDX_AUDIO_USER_STATUSES_STATUS',
      isUnique: false,
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
            name: 'list_order',
            type: 'int',
            isNullable: true,
            comment: 'Sequence of title in the list',
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
          {
            name: 'meta',
            type: 'jsonb',
            isNullable: true,
            comment:
              'Reference metadata (e.g. Inaudio checkout response under meta.checkout)',
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

    for (const index of this.indices) {
      await queryRunner.createIndex(
        this.tableName,
        new TableIndex({
          name: index.indexName,
          columnNames: [index.columnName],
          isUnique: index.isUnique,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable(this.tableName);

    if (!table) return;

    for (const index of this.indices) {
      const tableIndex = table.indices.find(
        (idx) => idx.name === index.indexName,
      );
      if (tableIndex) {
        await queryRunner.dropIndex(this.tableName, tableIndex);
      }
    }

    for (const fk of this.foreignKeys) {
      const foreignKey = table.foreignKeys.find((fkObj) =>
        fkObj.columnNames.includes(fk.columnName),
      );
      if (foreignKey) {
        await queryRunner.dropForeignKey(this.tableName, foreignKey);
      }
    }

    await queryRunner.dropTable(this.tableName);
  }
}
