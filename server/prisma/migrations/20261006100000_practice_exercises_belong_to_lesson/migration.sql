-- Practice exercises belong to a lesson, like learning materials and examples; their concept is
-- reached through the lesson. Multiple-choice and short-answer exercises are evaluated by the
-- platform, so their options and accepted answers are stored in answer_config, in the same shape
-- as questions.answer_config. The exercises table was empty when this migration was written, so
-- lesson_id is added as NOT NULL without a backfill; the migration fails safely if rows exist.

ALTER TYPE "exercise_type" ADD VALUE 'MULTIPLE_CHOICE';

ALTER TABLE "exercises" DROP CONSTRAINT "exercises_concept_id_fkey";
DROP INDEX "exercises_concept_id_sequence_order_key";
ALTER TABLE "exercises" DROP COLUMN "concept_id";
ALTER TABLE "exercises" ADD COLUMN "lesson_id" UUID NOT NULL;
ALTER TABLE "exercises" ADD COLUMN "answer_config" JSONB;

CREATE UNIQUE INDEX "exercises_lesson_id_sequence_order_key" ON "exercises"("lesson_id", "sequence_order");

ALTER TABLE "exercises" ADD CONSTRAINT "exercises_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exercises" ADD CONSTRAINT "exercises_answer_config_object_check" CHECK ("answer_config" IS NULL OR jsonb_typeof("answer_config") = 'object');
