import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

export class CreateAudiosTable1738653486445 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'audios',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '35',
            isPrimary: true,
          },
          {
            name: 'sku',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'is_excluded',
            type: 'boolean',
            default: false,
          },
          {
            name: 'is_featured',
            type: 'boolean',
            default: false,
          },
          {
            name: 'bookshelf_credit_cost',
            type: 'int',
            default: 0,
          },
          {
            name: 'display_title',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'display_authors',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'display_description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'display_short_description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'display_copyright',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'purchased_rental_license_limit',
            type: 'int',
            default: 0,
          },
          {
            name: 'total_rented',
            type: 'int',
            default: 0,
          },
          {
            name: 'avg_rating',
            type: 'float',
            default: 0,
          },
          {
            name: 'deep_link',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'is_only_for_purchase',
            type: 'boolean',
            default: true,
          },
          {
            name: 'is_new_trl',
            type: 'boolean',
            default: false,
          },
          {
            name: 'is_curated',
            type: 'boolean',
            default: false,
          },
          {
            name: 'categories',
            type: 'jsonb',
            default: `'[]'::jsonb`,
          },
          {
            name: 'suggestions',
            type: 'jsonb',
            default: `'[]'::jsonb`,
          },
          {
            name: 'total_played',
            type: 'bigint',
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
          {
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
    );

    await queryRunner.createForeignKey(
      'audios',
      new TableForeignKey({
        columnNames: ['sku'],
        referencedColumnNames: ['sku'],
        referencedTableName: 'audio_metadata',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key
    const table = await queryRunner.getTable('audios');
    const foreignKey = table.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('sku') !== -1,
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey('audios', foreignKey);
    }

    await queryRunner.dropTable('audios');
  }
}
