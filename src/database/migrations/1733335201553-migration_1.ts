import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration11733335201553 implements MigrationInterface {
    name = 'Migration11733335201553'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."otp_channel" AS ENUM('email', 'sms')`);
        await queryRunner.query(`CREATE TABLE "password_reset_tokens" ("id" SERIAL NOT NULL, "user_id" character varying NOT NULL, "token" character varying NOT NULL, "otp" character varying(4), "otp_channel" "public"."otp_channel" NOT NULL DEFAULT 'email', "expires_at" TIMESTAMP NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "companies" ("id" character varying(35) NOT NULL, "name" character varying(255) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "domain" character varying(255), "description" text, "is_sso_login" boolean NOT NULL DEFAULT false, "available_medias" jsonb DEFAULT '["audio"]', "available_credits" integer NOT NULL DEFAULT '0', "company_contacts" jsonb NOT NULL DEFAULT '[]', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_3dacbb3eb4f095e29372ff8e131" UNIQUE ("name"), CONSTRAINT "UQ_89a223b4d883067d909eedd3558" UNIQUE ("domain"), CONSTRAINT "PK_d4bc3e82a314fa9e29f652c2c22" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" character varying(40) NOT NULL, "first_name" character varying(50) NOT NULL, "last_name" character varying(50) NOT NULL, "title" character varying, "email" character varying(100) NOT NULL, "password" character varying(255) NOT NULL, "company_id" character varying NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "phone" character varying, "address1" character varying, "address2" character varying, "city" character varying, "country" character varying, "state" character varying, "zip" character varying, "optout_push_notification" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "UQ_450a05c0c4de5b75ac8d34835b9" UNIQUE ("password"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "user_devices" ("id" SERIAL NOT NULL, "user_id" character varying NOT NULL, "device_id" character varying NOT NULL, "device_model" character varying, "device_os" character varying, "fcm_key" text, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_69b11f34c0f681c815fb6971018" UNIQUE ("user_id", "device_id"), CONSTRAINT "PK_c9e7e648903a9e537347aba4371" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "audio_metadata" ("sku" character varying NOT NULL, "title" character varying(255) NOT NULL, "description" text NOT NULL, "abridgement" character varying(255) NOT NULL, "cover_url" text, "sample_url" character varying(255), "actual_size" integer NOT NULL DEFAULT '0', "publisher" character varying(255) NOT NULL, "runtime" character varying, "copyright" character varying(255), "chapters" jsonb NOT NULL DEFAULT '[]', "sub_title" character varying(255), "street_date" date NOT NULL, "modified_date" date NOT NULL, "language" character varying(255) NOT NULL, "authors" jsonb NOT NULL DEFAULT '[]', "narrators" jsonb NOT NULL DEFAULT '[]', "bisac_codes" jsonb, "product_signature" character varying, "isbn" character varying, "product_id" character varying, "retail_product_id" character varying, "findaway_price" double precision, "findaway_content_cost" double precision, "findaway_retail_price" double precision, "findaway_retail_content_cost" double precision, "is_for_sale" boolean, "sales_locations" jsonb, "sales_location_exclusions" jsonb, CONSTRAINT "PK_e1efd182994db8c194ebb7c1a68" PRIMARY KEY ("sku"))`);
        await queryRunner.query(`CREATE TYPE "public"."audios_available_for_enum" AS ENUM('rental', 'purchasable', 'both')`);
        await queryRunner.query(`CREATE TABLE "audios" ("id" character varying(35) NOT NULL, "sku" character varying NOT NULL, "available_for" "public"."audios_available_for_enum" NOT NULL DEFAULT 'both', "is_active" boolean NOT NULL DEFAULT true, "is_excluded" boolean NOT NULL DEFAULT false, "is_featured" boolean NOT NULL DEFAULT false, "is_only_for_purchase" boolean NOT NULL DEFAULT false, "trl_cost" integer NOT NULL DEFAULT '0', "display_title" character varying, "display_authors" jsonb, "display_description" text, "display_short_description" text, "display_copyright" character varying, "categories" jsonb NOT NULL DEFAULT '[]', "suggestions" jsonb NOT NULL DEFAULT '[]', "purchased_licenses" integer NOT NULL DEFAULT '0', "purchased_license_limit" integer NOT NULL DEFAULT '0', "total_rented" integer NOT NULL DEFAULT '0', "avg_rating" double precision NOT NULL DEFAULT '0', "deep_link" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "REL_2c04d0f531397b7d1679e3f653" UNIQUE ("sku"), CONSTRAINT "PK_97a1fa83e0d0dac358d498d0a64" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "user_audioplayer_positions" ("id" character varying(55) NOT NULL, "user_id" character varying NOT NULL, "audio_id" character varying NOT NULL, "part_number" integer, "chapter_number" integer, "play_position" integer, "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_4a65fa3cdd51bfabe18bf52cc60" UNIQUE ("user_id", "audio_id"), CONSTRAINT "PK_ef8c8f6d9453b6d49253bfb2384" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."user_audio_statuses_status_enum" AS ENUM('queued', 'rented', 'bookshelved')`);
        await queryRunner.query(`CREATE TABLE "user_audio_statuses" ("id" character varying(255) NOT NULL, "user_id" character varying NOT NULL, "audio_id" character varying NOT NULL, "status" "public"."user_audio_statuses_status_enum" NOT NULL DEFAULT 'queued', "license_id" character varying, "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "rental_expire_at" TIMESTAMP, CONSTRAINT "UQ_9ca5486f09bcb205dd56791296d" UNIQUE ("audio_id", "user_id"), CONSTRAINT "PK_41e08ab14e04c2cc3f2afbce8cd" PRIMARY KEY ("id")); COMMENT ON COLUMN "user_audio_statuses"."rental_expire_at" IS 'Only for Rent'`);
        await queryRunner.query(`CREATE TYPE "public"."user_activity_logs_item_type_enum" AS ENUM('audio', 'video', 'pharma')`);
        await queryRunner.query(`CREATE TYPE "public"."user_activity_logs_action_type_enum" AS ENUM('queue', 'rent', 'keep', 'play')`);
        await queryRunner.query(`CREATE TABLE "user_activity_logs" ("id" SERIAL NOT NULL, "user_id" character varying NOT NULL, "item_id" character varying NOT NULL, "item_type" "public"."user_activity_logs_item_type_enum" NOT NULL DEFAULT 'audio', "action_type" "public"."user_activity_logs_action_type_enum" NOT NULL, "credit_used" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_8cba6ba151a9dda40181f99386a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "company_credit_logs" ("id" SERIAL NOT NULL, "company_id" character varying NOT NULL, "purchased_credit" integer, "purchased_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_866f3977f68bd8b637302400ac3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "categories" ("id" character varying(45) NOT NULL, "title" character varying(255) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "media_types" jsonb DEFAULT '["audio"]', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "company_categories" ("id" character varying(255) NOT NULL, "company_id" character varying NOT NULL, "category_id" character varying NOT NULL, "display_title" character varying(255), "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_646863e09dfd590ceac68300b2c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "audio_reviews" ("id" character varying(45) NOT NULL, "audio_id" character varying NOT NULL, "user_id" character varying NOT NULL, "rate" integer NOT NULL, "review" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_05ee1f5333b937dfe72f14689d9" UNIQUE ("audio_id", "user_id"), CONSTRAINT "PK_12a8cb1a7bf4e03738413090422" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "app_config" ("key" character varying NOT NULL, "value" character varying NOT NULL, CONSTRAINT "PK_e53f3c7882ebd6e79931e0fa959" PRIMARY KEY ("key"))`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_7ae6334059289559722437bcc1c" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_devices" ADD CONSTRAINT "FK_28bd79e1b3f7c1168f0904ce241" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "audios" ADD CONSTRAINT "FK_2c04d0f531397b7d1679e3f6537" FOREIGN KEY ("sku") REFERENCES "audio_metadata"("sku") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_audioplayer_positions" ADD CONSTRAINT "FK_08ddd046d2fe180db50ec9ef77d" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_audioplayer_positions" ADD CONSTRAINT "FK_28efc0eeffcd1db42cb83ef6413" FOREIGN KEY ("audio_id") REFERENCES "audios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_audio_statuses" ADD CONSTRAINT "FK_949e2727e4f42b43e35bc0900a5" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_audio_statuses" ADD CONSTRAINT "FK_8f5aef6c88b7d5ab0f4ba9957df" FOREIGN KEY ("audio_id") REFERENCES "audios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_activity_logs" ADD CONSTRAINT "FK_6bee9b70f24c404c7fafcedad72" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "company_credit_logs" ADD CONSTRAINT "FK_65809627d9d31bbc16f8dd59d26" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "company_categories" ADD CONSTRAINT "FK_6566c273a06368ae170905076bf" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "company_categories" ADD CONSTRAINT "FK_573ba4cbe7979a28df1af6ccf5f" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "audio_reviews" ADD CONSTRAINT "FK_16209fb77b6fd62b7a63bbf8f6d" FOREIGN KEY ("audio_id") REFERENCES "audios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "audio_reviews" ADD CONSTRAINT "FK_125895aeb08e8917dcdd3ffc0a0" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audio_reviews" DROP CONSTRAINT "FK_125895aeb08e8917dcdd3ffc0a0"`);
        await queryRunner.query(`ALTER TABLE "audio_reviews" DROP CONSTRAINT "FK_16209fb77b6fd62b7a63bbf8f6d"`);
        await queryRunner.query(`ALTER TABLE "company_categories" DROP CONSTRAINT "FK_573ba4cbe7979a28df1af6ccf5f"`);
        await queryRunner.query(`ALTER TABLE "company_categories" DROP CONSTRAINT "FK_6566c273a06368ae170905076bf"`);
        await queryRunner.query(`ALTER TABLE "company_credit_logs" DROP CONSTRAINT "FK_65809627d9d31bbc16f8dd59d26"`);
        await queryRunner.query(`ALTER TABLE "user_activity_logs" DROP CONSTRAINT "FK_6bee9b70f24c404c7fafcedad72"`);
        await queryRunner.query(`ALTER TABLE "user_audio_statuses" DROP CONSTRAINT "FK_8f5aef6c88b7d5ab0f4ba9957df"`);
        await queryRunner.query(`ALTER TABLE "user_audio_statuses" DROP CONSTRAINT "FK_949e2727e4f42b43e35bc0900a5"`);
        await queryRunner.query(`ALTER TABLE "user_audioplayer_positions" DROP CONSTRAINT "FK_28efc0eeffcd1db42cb83ef6413"`);
        await queryRunner.query(`ALTER TABLE "user_audioplayer_positions" DROP CONSTRAINT "FK_08ddd046d2fe180db50ec9ef77d"`);
        await queryRunner.query(`ALTER TABLE "audios" DROP CONSTRAINT "FK_2c04d0f531397b7d1679e3f6537"`);
        await queryRunner.query(`ALTER TABLE "user_devices" DROP CONSTRAINT "FK_28bd79e1b3f7c1168f0904ce241"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_7ae6334059289559722437bcc1c"`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c"`);
        await queryRunner.query(`DROP TABLE "app_config"`);
        await queryRunner.query(`DROP TABLE "audio_reviews"`);
        await queryRunner.query(`DROP TABLE "company_categories"`);
        await queryRunner.query(`DROP TABLE "categories"`);
        await queryRunner.query(`DROP TABLE "company_credit_logs"`);
        await queryRunner.query(`DROP TABLE "user_activity_logs"`);
        await queryRunner.query(`DROP TYPE "public"."user_activity_logs_action_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."user_activity_logs_item_type_enum"`);
        await queryRunner.query(`DROP TABLE "user_audio_statuses"`);
        await queryRunner.query(`DROP TYPE "public"."user_audio_statuses_status_enum"`);
        await queryRunner.query(`DROP TABLE "user_audioplayer_positions"`);
        await queryRunner.query(`DROP TABLE "audios"`);
        await queryRunner.query(`DROP TYPE "public"."audios_available_for_enum"`);
        await queryRunner.query(`DROP TABLE "audio_metadata"`);
        await queryRunner.query(`DROP TABLE "user_devices"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "companies"`);
        await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
        await queryRunner.query(`DROP TYPE "public"."otp_channel"`);
    }

}
