import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateCompaniesTable1738604540696 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'companies',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '35', // e.g., company_id_ulid
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('companies');
  }
}
