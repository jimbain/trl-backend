import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreateUserDevicesTable1738604905765 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_devices',
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
            name: 'device_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'device_model',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'device_os',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'fcm_key',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
            isNullable: false,
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

    await queryRunner.createForeignKey(
      'user_devices',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    // Adding unique constraint for (user_id, device_id)
    await queryRunner.createUniqueConstraint(
      'user_devices',
      new TableUnique({
        name: 'UQ_USER_DEVICES_USER_DEVICE',
        columnNames: ['user_id', 'device_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key
    const table = await queryRunner.getTable('user_devices');
    const foreignKey = table.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('user_id') !== -1,
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey('user_devices', foreignKey);
    }

    // Drop the unique index
    await queryRunner.dropUniqueConstraint(
      'user_devices',
      'UQ_USER_DEVICES_USER_DEVICE',
    );

    // Drop the table
    await queryRunner.dropTable('user_devices');
  }
}
