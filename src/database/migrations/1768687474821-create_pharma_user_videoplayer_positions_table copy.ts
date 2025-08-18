import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableUnique,
} from 'typeorm';

export class CreatePharmaUserVideoplayerPositionsTable1768687474821
  implements MigrationInterface
{
  private tableName = 'pharma_user_videoplayer_positions';

  private foreignKeys = [
    {
      columnName: 'pharma_id',
      referencedTable: 'pharmas',
      referencedColumnName: 'id',
      onDelete: 'CASCADE',
    },
    {
      columnName: 'user_id',
      referencedTable: 'users',
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
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'pharma_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'user_id',
            type: 'varchar',
            isNullable: false,
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
        name: 'UQ_PHARMA_USER_VIDEOPLAYER_POSITIONS_PHARMA_USER',
        columnNames: ['pharma_id', 'user_id'],
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
      'UQ_PHARMA_USER_VIDEOPLAYER_POSITIONS_PHARMA_USER',
    );

    await queryRunner.dropTable(this.tableName);
  }
}
