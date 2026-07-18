import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1784166534047 implements MigrationInterface {
  name = 'InitialSchema1784166534047';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "subscription_plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "price" numeric(10,2) NOT NULL DEFAULT '0', "max_users" integer NOT NULL DEFAULT '5', "max_pdf_pages_per_month" integer NOT NULL DEFAULT '100', "max_questions_per_month" integer NOT NULL DEFAULT '500', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9ab8fe6918451ab3d0a4fb6bb0c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."companies_status_enum" AS ENUM('ACTIVE', 'SUSPENDED', 'GRACE_PERIOD')`,
    );
    await queryRunner.query(
      `CREATE TABLE "companies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "subdomain" character varying(255) NOT NULL, "commercial_name" character varying(255) NOT NULL, "logo_url" character varying(255), "contact_email" character varying(255), "phone" character varying(50), "address" text, "tax_id" character varying(100), "primary_color" character varying(50) NOT NULL DEFAULT '#6366f1', "is_active" boolean NOT NULL DEFAULT true, "subscription_plan_id" uuid, "status" "public"."companies_status_enum" NOT NULL DEFAULT 'ACTIVE', "grace_period_until" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_665e863569cb7332e624dc88c8c" UNIQUE ("subdomain"), CONSTRAINT "PK_d4bc3e82a314fa9e29f652c2c22" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "subtopics" ("id" bigint NOT NULL, "topic_id" bigint NOT NULL, "name" character varying(255) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3fb7d7239d68be9bced2db5567a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "topics" ("id" bigint NOT NULL, "course_id" bigint NOT NULL, "name" character varying(255) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e4aa99a3fa60ec3a37d1fc4e853" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "courses" ("id" bigint NOT NULL, "name" character varying(255) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3f70a487cc718ad8eda4e6d58c9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD CONSTRAINT "FK_8de8737996671006f6644c2646e" FOREIGN KEY ("subscription_plan_id") REFERENCES "subscription_plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "subtopics" ADD CONSTRAINT "FK_14e43cb8c5dbee90087dd8f91ca" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "topics" ADD CONSTRAINT "FK_ef19a29ccdfb8903f09e924b66c" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "topics" DROP CONSTRAINT "FK_ef19a29ccdfb8903f09e924b66c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subtopics" DROP CONSTRAINT "FK_14e43cb8c5dbee90087dd8f91ca"`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" DROP CONSTRAINT "FK_8de8737996671006f6644c2646e"`,
    );
    await queryRunner.query(`DROP TABLE "courses"`);
    await queryRunner.query(`DROP TABLE "topics"`);
    await queryRunner.query(`DROP TABLE "subtopics"`);
    await queryRunner.query(`DROP TABLE "companies"`);
    await queryRunner.query(`DROP TYPE "public"."companies_status_enum"`);
    await queryRunner.query(`DROP TABLE "subscription_plans"`);
  }
}
