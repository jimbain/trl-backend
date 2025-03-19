import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

export class CreateUserActivityLogsTable1738687442693
  implements MigrationInterface
{
  private tableName = 'user_activity_logs';
  private itemTypeEnum = "'audio', 'video', 'pharma'";
  private actionTypeEnum = "'queue', 'rent', 'keep', 'play', 'pause'";

  private foreignKeys = [
    {
      columnName: 'user_id',
      referencedTable: 'users',
      referencedColumnName: 'id',
      onDelete: 'CASCADE',
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE item_type_enum AS ENUM (${this.itemTypeEnum})`,
    );
    await queryRunner.query(
      `CREATE TYPE action_type_enum AS ENUM (${this.actionTypeEnum})`,
    );

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
            name: 'user_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'item_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'item_type',
            type: 'enum',
            enumName: 'item_type_enum',
            default: "'audio'",
          },
          {
            name: 'action_type',
            type: 'enum',
            enumName: 'action_type_enum',
            isNullable: false,
          },
          {
            name: 'credit_used',
            type: 'int',
            default: 0,
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

    await queryRunner.dropTable(this.tableName);
    await queryRunner.query('DROP TYPE IF EXISTS item_type_enum');
    await queryRunner.query('DROP TYPE IF EXISTS action_type_enum');
  }
}
