import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateCompaniesTable1738604540696 implements MigrationInterface {
  private tableName = 'companies';

  private indices = [
    {
      columnName: 'name',
      indexName: 'IDX_COMPANIES_NAME',
      isUnique: false,
    },
    {
      columnName: 'is_active',
      indexName: 'IDX_COMPANIES_IS_ACTIVE',
      isUnique: false,
    },
    {
      columnName: 'created_at',
      indexName: 'IDX_COMPANIES_CREATED_AT',
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
            length: '35', // e.g., company_ulid
            isPrimary: true,
          },
          {
            name: 'name',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'logo_url',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            isNullable: false,
            default: true,
          },
          {
            name: 'domain',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'login_type',
            type: 'enum',
            enum: ['credentials', 'sso'],
            default: "'credentials'",
          },
          {
            name: 'sso_config',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'available_medias',
            type: 'jsonb',
            isNullable: false,
            default: `'["audio"]'::jsonb`,
          },
          {
            name: 'catalogs',
            type: 'jsonb',
            isNullable: false,
            default: `'[]'::jsonb`,
          },
          {
            name: 'available_credits',
            type: 'int',
            isNullable: false,
            default: 0,
          },
          {
            name: 'contacts',
            type: 'jsonb',
            isNullable: false,
            default: `'[]'::jsonb`,
          },
          {
            name: 'app_configs',
            type: 'jsonb',
            isNullable: true,
            default: `'{}'::jsonb`,
          },
          {
            name: 'phone',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'address1',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'address2',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'city',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'country',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'state',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'zip',
            type: 'varchar',
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
        ],
      }),
    );

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

    await queryRunner.dropTable(this.tableName);
  }
}
