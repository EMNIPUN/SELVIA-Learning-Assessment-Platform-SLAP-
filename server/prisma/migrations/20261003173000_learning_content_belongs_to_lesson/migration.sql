-- Learning materials and examples belong to a lesson instead of directly to a concept.
-- Their concept is reached through the lesson. Both tables were empty when this migration
-- was written, so lesson_id is added as NOT NULL without a backfill; the migration fails
-- safely if rows exist.

-- learning_materials ------------------------------------------------------------

ALTER TABLE "learning_materials" DROP CONSTRAINT "learning_materials_concept_id_fkey";
DROP INDEX "learning_materials_concept_id_sequence_order_key";
ALTER TABLE "learning_materials" DROP COLUMN "concept_id";
ALTER TABLE "learning_materials" ADD COLUMN "lesson_id" UUID NOT NULL;

CREATE UNIQUE INDEX "learning_materials_lesson_id_sequence_order_key" ON "learning_materials"("lesson_id", "sequence_order");

ALTER TABLE "learning_materials" ADD CONSTRAINT "learning_materials_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- examples ------------------------------------------------------------------------

ALTER TABLE "examples" DROP CONSTRAINT "examples_concept_id_fkey";
DROP INDEX "examples_concept_id_sequence_order_key";
ALTER TABLE "examples" DROP COLUMN "concept_id";
ALTER TABLE "examples" ADD COLUMN "lesson_id" UUID NOT NULL;

CREATE UNIQUE INDEX "examples_lesson_id_sequence_order_key" ON "examples"("lesson_id", "sequence_order");

ALTER TABLE "examples" ADD CONSTRAINT "examples_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
