import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration11724598079818 implements MigrationInterface {
    name = 'Migration11724598079818'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."otp_type" AS ENUM('email', 'sms')`);
        await queryRunner.query(`CREATE TABLE "password_reset_tokens" ("id" SERIAL NOT NULL, "token" character varying NOT NULL, "otp" character varying, "otp_type" "public"."otp_type" NOT NULL, "expires_at" TIMESTAMP NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" character varying(40), CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "companies" ("id" character varying(35) NOT NULL, "name" character varying(255) NOT NULL, "short_description" text, "long_description" text, "logo_url" text, "is_active" boolean NOT NULL DEFAULT true, "domain" character varying(255), "is_sso_login" boolean NOT NULL DEFAULT false, "available_credits" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_3dacbb3eb4f095e29372ff8e131" UNIQUE ("name"), CONSTRAINT "UQ_89a223b4d883067d909eedd3558" UNIQUE ("domain"), CONSTRAINT "PK_d4bc3e82a314fa9e29f652c2c22" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" character varying(40) NOT NULL, "first_name" character varying(50) NOT NULL, "last_name" character varying(50) NOT NULL, "email" character varying(100) NOT NULL, "password" character varying(255) NOT NULL, "password_salt" character varying(40) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "company_id" character varying(35), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "UQ_450a05c0c4de5b75ac8d34835b9" UNIQUE ("password"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."audios_available_for_enum" AS ENUM('rent', 'bookshelf', 'both')`);
        await queryRunner.query(`CREATE TABLE "audios" ("id" character varying(35) NOT NULL, "title" character varying(255) NOT NULL, "description" text, "audio_category_ids" jsonb, "language" character varying, "publisher" character varying, "copyright" date, "authors" jsonb, "rental_cost" double precision NOT NULL DEFAULT '0', "bookshelf_cost" double precision NOT NULL DEFAULT '0', "rental_credit" integer NOT NULL DEFAULT '0', "bookshelf_credit" integer NOT NULL DEFAULT '0', "duration" integer NOT NULL DEFAULT '0', "is_featured" boolean NOT NULL DEFAULT false, "available_for" "public"."audios_available_for_enum" NOT NULL DEFAULT 'both', "image_url" text, "audio_urls" jsonb, "is_active" boolean NOT NULL DEFAULT true, "average_review_rating" double precision NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_97a1fa83e0d0dac358d498d0a64" PRIMARY KEY ("id")); COMMENT ON COLUMN "audios"."duration" IS 'Duration in seconds'`);
        await queryRunner.query(`CREATE TYPE "public"."user_audios_status_enum" AS ENUM('queued', 'rented', 'bookshelved')`);
        await queryRunner.query(`CREATE TABLE "user_audios" ("id" character varying(45) NOT NULL, "user_id" character varying NOT NULL, "audio_id" character varying NOT NULL, "status" "public"."user_audios_status_enum" NOT NULL DEFAULT 'queued', "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "expired_at" TIMESTAMP, CONSTRAINT "PK_f7f872267eefa632700cbe2a9ed" PRIMARY KEY ("id", "user_id", "audio_id")); COMMENT ON COLUMN "user_audios"."expired_at" IS 'Only for Rent'`);
        await queryRunner.query(`CREATE TABLE "audio_categories" ("id" character varying(45) NOT NULL, "title" character varying(255) NOT NULL, "name" character varying(255) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_b7fc4f4b6036819e7b27fe89042" UNIQUE ("name"), CONSTRAINT "PK_d55408ed5e88492ea4c03141d9c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "company_audio_categories" ("company_id" character varying NOT NULL, "audio_category_id" character varying NOT NULL, "title" character varying(255), CONSTRAINT "PK_331ee165ede8543337a8cea82ee" PRIMARY KEY ("company_id", "audio_category_id"))`);
        await queryRunner.query(`CREATE TABLE "audio_reviews" ("id" character varying(45) NOT NULL, "audio_id" character varying NOT NULL, "user_id" character varying NOT NULL, "rate" integer, "review" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_12a8cb1a7bf4e03738413090422" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_7ae6334059289559722437bcc1c" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_audios" ADD CONSTRAINT "FK_a02ec21406de3f4e229374434d1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_audios" ADD CONSTRAINT "FK_55a681c489540ee02b427d11c37" FOREIGN KEY ("audio_id") REFERENCES "audios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "company_audio_categories" ADD CONSTRAINT "FK_c9066ff849f014939e62d61a0bb" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "company_audio_categories" ADD CONSTRAINT "FK_e84979dab8183bae75bcb6fe320" FOREIGN KEY ("audio_category_id") REFERENCES "audio_categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "audio_reviews" ADD CONSTRAINT "FK_16209fb77b6fd62b7a63bbf8f6d" FOREIGN KEY ("audio_id") REFERENCES "audios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "audio_reviews" ADD CONSTRAINT "FK_125895aeb08e8917dcdd3ffc0a0" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audio_reviews" DROP CONSTRAINT "FK_125895aeb08e8917dcdd3ffc0a0"`);
        await queryRunner.query(`ALTER TABLE "audio_reviews" DROP CONSTRAINT "FK_16209fb77b6fd62b7a63bbf8f6d"`);
        await queryRunner.query(`ALTER TABLE "company_audio_categories" DROP CONSTRAINT "FK_e84979dab8183bae75bcb6fe320"`);
        await queryRunner.query(`ALTER TABLE "company_audio_categories" DROP CONSTRAINT "FK_c9066ff849f014939e62d61a0bb"`);
        await queryRunner.query(`ALTER TABLE "user_audios" DROP CONSTRAINT "FK_55a681c489540ee02b427d11c37"`);
        await queryRunner.query(`ALTER TABLE "user_audios" DROP CONSTRAINT "FK_a02ec21406de3f4e229374434d1"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_7ae6334059289559722437bcc1c"`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c"`);
        await queryRunner.query(`DROP TABLE "audio_reviews"`);
        await queryRunner.query(`DROP TABLE "company_audio_categories"`);
        await queryRunner.query(`DROP TABLE "audio_categories"`);
        await queryRunner.query(`DROP TABLE "user_audios"`);
        await queryRunner.query(`DROP TYPE "public"."user_audios_status_enum"`);
        await queryRunner.query(`DROP TABLE "audios"`);
        await queryRunner.query(`DROP TYPE "public"."audios_available_for_enum"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "companies"`);
        await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
        await queryRunner.query(`DROP TYPE "public"."otp_type"`);
    }

}
