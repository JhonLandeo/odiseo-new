import { MigrationInterface, QueryRunner } from "typeorm";

export class AddExpectedLevelToReviewQuestion1715000000000 implements MigrationInterface {
    name = 'AddExpectedLevelToReviewQuestion1715000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "material_review_questions" ADD "expected_level" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "material_review_questions" DROP COLUMN "expected_level"`);
    }
}
