-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('STUDENT', 'LECTURER', 'ADMIN');

-- CreateEnum
CREATE TYPE "content_status" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "enrollment_status" AS ENUM ('ACTIVE', 'COMPLETED', 'DROPPED');

-- CreateEnum
CREATE TYPE "content_source_type" AS ENUM ('LECTURER_AUTHORED', 'TEXTBOOK', 'ACADEMIC_PAPER', 'WEBSITE', 'OPEN_EDUCATIONAL_RESOURCE', 'PAST_PAPER', 'AI_GENERATED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "material_type" AS ENUM ('DOCUMENT', 'SLIDES', 'VIDEO', 'AUDIO', 'LINK', 'READING', 'OTHER');

-- CreateEnum
CREATE TYPE "example_type" AS ENUM ('WORKED_EXAMPLE', 'CODE_EXAMPLE', 'CASE_STUDY', 'DIAGRAM', 'COUNTER_EXAMPLE');

-- CreateEnum
CREATE TYPE "exercise_type" AS ENUM ('CODING', 'SHORT_ANSWER', 'PROBLEM_SOLVING', 'DIAGRAM', 'MULTI_STEP');

-- CreateEnum
CREATE TYPE "question_type" AS ENUM ('MULTIPLE_CHOICE_SINGLE', 'MULTIPLE_CHOICE_MULTIPLE', 'TRUE_FALSE', 'SHORT_ANSWER', 'FILL_IN_THE_BLANK', 'MATCHING', 'ORDERING', 'ESSAY', 'CODE');

-- CreateEnum
CREATE TYPE "difficulty_level" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "bloom_level" AS ENUM ('REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE');

-- CreateEnum
CREATE TYPE "assessment_type" AS ENUM ('QUIZ', 'TEST', 'EXAMINATION');

-- CreateEnum
CREATE TYPE "results_release_policy" AS ENUM ('IMMEDIATE', 'AFTER_DEADLINE', 'MANUAL');

-- CreateEnum
CREATE TYPE "attempt_status" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'GRADED');

-- CreateEnum
CREATE TYPE "grading_status" AS ENUM ('PENDING', 'AUTO_GRADED', 'MANUALLY_GRADED');

-- CreateEnum
CREATE TYPE "result_status" AS ENUM ('PROVISIONAL', 'FINAL');

-- CreateEnum
CREATE TYPE "activity_type" AS ENUM ('LESSON_VIEWED', 'LESSON_COMPLETED', 'MATERIAL_VIEWED', 'MATERIAL_DOWNLOADED', 'EXAMPLE_VIEWED', 'EXERCISE_STARTED', 'EXERCISE_HINT_REQUESTED', 'EXERCISE_SUBMITTED', 'ASSESSMENT_STARTED', 'ASSESSMENT_SUBMITTED');

-- CreateEnum
CREATE TYPE "activity_target_type" AS ENUM ('LESSON', 'LEARNING_MATERIAL', 'EXAMPLE', 'EXERCISE', 'ASSESSMENT', 'QUESTION');

-- CreateEnum
CREATE TYPE "evidence_source_type" AS ENUM ('ASSESSMENT_ANSWER', 'EXERCISE_SUBMISSION', 'LEARNING_ACTIVITY');

-- CreateEnum
CREATE TYPE "evidence_status" AS ENUM ('COMPLETED', 'SKIPPED', 'ABANDONED', 'TIMED_OUT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "role" "user_role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "student_number" VARCHAR(50) NOT NULL,
    "degree_program" VARCHAR(150),
    "year_of_study" SMALLINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lecturers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "staff_number" VARCHAR(50) NOT NULL,
    "title" VARCHAR(50),
    "department" VARCHAR(150),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lecturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(20) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "credits" SMALLINT,
    "lecturer_id" UUID NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "enrollment_status" NOT NULL DEFAULT 'ACTIVE',
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "dropped_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "sequence_order" INTEGER NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "module_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "sequence_order" INTEGER NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concepts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "topic_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "sequence_order" INTEGER NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concepts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_type" "content_source_type" NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "authors" TEXT,
    "publisher" VARCHAR(200),
    "publication_year" SMALLINT,
    "edition" VARCHAR(50),
    "url" TEXT,
    "isbn_or_doi" VARCHAR(100),
    "license" VARCHAR(100),
    "citation" TEXT,
    "generation_metadata" JSONB,
    "accessed_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "concept_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "estimated_duration_minutes" INTEGER,
    "sequence_order" INTEGER NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "source_id" UUID,
    "source_reference" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_materials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "concept_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "material_type" "material_type" NOT NULL,
    "file_storage_key" TEXT,
    "external_url" TEXT,
    "mime_type" VARCHAR(100),
    "file_size_bytes" BIGINT,
    "sequence_order" INTEGER NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "source_id" UUID,
    "source_reference" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examples" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "concept_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "example_type" "example_type" NOT NULL,
    "problem_statement" TEXT,
    "content" TEXT NOT NULL,
    "explanation" TEXT,
    "code_snippet" TEXT,
    "programming_language" VARCHAR(50),
    "sequence_order" INTEGER NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "source_id" UUID,
    "source_reference" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "examples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "concept_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "instructions" TEXT NOT NULL,
    "exercise_type" "exercise_type" NOT NULL,
    "difficulty" "difficulty_level" NOT NULL,
    "bloom_level" "bloom_level" NOT NULL,
    "starter_content" TEXT,
    "expected_solution" TEXT,
    "solution_explanation" TEXT,
    "hints" JSONB NOT NULL DEFAULT '[]',
    "max_score" DECIMAL(8,2),
    "estimated_duration_minutes" INTEGER,
    "sequence_order" INTEGER NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "source_id" UUID,
    "source_reference" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "concept_id" UUID NOT NULL,
    "question_text" TEXT NOT NULL,
    "question_type" "question_type" NOT NULL,
    "difficulty" "difficulty_level" NOT NULL,
    "bloom_level" "bloom_level" NOT NULL,
    "answer_config" JSONB NOT NULL,
    "explanation" TEXT,
    "default_points" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previous_version_id" UUID,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "source_id" UUID,
    "source_reference" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "module_id" UUID,
    "topic_id" UUID,
    "assessment_type" "assessment_type" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "time_limit_minutes" INTEGER,
    "max_attempts" INTEGER,
    "pass_percentage" DECIMAL(5,2),
    "shuffle_questions" BOOLEAN NOT NULL DEFAULT false,
    "results_release_policy" "results_release_policy" NOT NULL,
    "available_from" TIMESTAMPTZ(6),
    "available_until" TIMESTAMPTZ(6),
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "created_by_user_id" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assessment_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "sequence_order" INTEGER NOT NULL,
    "points" DECIMAL(6,2) NOT NULL,
    "section_label" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assessment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "attempt_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "submitted_at" TIMESTAMPTZ(6),
    "time_spent_seconds" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "assessment_question_id" UUID NOT NULL,
    "response" JSONB,
    "is_correct" BOOLEAN,
    "score_awarded" DECIMAL(6,2),
    "max_score" DECIMAL(6,2) NOT NULL,
    "grading_status" "grading_status" NOT NULL DEFAULT 'PENDING',
    "graded_by_user_id" UUID,
    "graded_at" TIMESTAMPTZ(6),
    "feedback" TEXT,
    "time_spent_seconds" INTEGER,
    "answered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "total_score" DECIMAL(8,2) NOT NULL,
    "max_score" DECIMAL(8,2) NOT NULL,
    "percentage" DECIMAL(5,2) GENERATED ALWAYS AS (ROUND("total_score" / NULLIF("max_score", 0) * 100, 2)) STORED,
    "passed" BOOLEAN,
    "status" "result_status" NOT NULL DEFAULT 'PROVISIONAL',
    "feedback" TEXT,
    "graded_at" TIMESTAMPTZ(6),
    "released_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "course_id" UUID,
    "concept_id" UUID,
    "activity_type" "activity_type" NOT NULL,
    "target_type" "activity_target_type",
    "target_id" UUID,
    "started_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "duration_seconds" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_evidence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "concept_id" UUID,
    "course_id" UUID,
    "source_type" "evidence_source_type" NOT NULL,
    "source_id" UUID NOT NULL,
    "score" DECIMAL(8,2),
    "max_score" DECIMAL(8,2),
    "percentage" DECIMAL(5,2) GENERATED ALWAYS AS (CASE WHEN "score" IS NOT NULL AND "max_score" > 0 THEN ROUND("score" / "max_score" * 100, 2) END) STORED,
    "attempt_number" INTEGER,
    "time_spent_seconds" INTEGER,
    "hints_used" INTEGER,
    "errors_count" INTEGER,
    "status" "evidence_status" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "superseded_by_evidence_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_student_number_key" ON "students"("student_number");

-- CreateIndex
CREATE UNIQUE INDEX "lecturers_user_id_key" ON "lecturers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "lecturers_staff_number_key" ON "lecturers"("staff_number");

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");

-- CreateIndex
CREATE INDEX "courses_lecturer_id_idx" ON "courses"("lecturer_id");

-- CreateIndex
CREATE INDEX "course_enrollments_student_id_idx" ON "course_enrollments"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_enrollments_course_id_student_id_key" ON "course_enrollments"("course_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "modules_course_id_sequence_order_key" ON "modules"("course_id", "sequence_order");

-- CreateIndex
CREATE UNIQUE INDEX "topics_module_id_sequence_order_key" ON "topics"("module_id", "sequence_order");

-- CreateIndex
CREATE UNIQUE INDEX "concepts_code_key" ON "concepts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "concepts_topic_id_name_key" ON "concepts"("topic_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "concepts_topic_id_sequence_order_key" ON "concepts"("topic_id", "sequence_order");

-- CreateIndex
CREATE INDEX "content_sources_source_type_idx" ON "content_sources"("source_type");

-- CreateIndex
CREATE INDEX "lessons_source_id_idx" ON "lessons"("source_id");

-- CreateIndex
CREATE INDEX "lessons_status_idx" ON "lessons"("status");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_concept_id_sequence_order_key" ON "lessons"("concept_id", "sequence_order");

-- CreateIndex
CREATE INDEX "learning_materials_source_id_idx" ON "learning_materials"("source_id");

-- CreateIndex
CREATE INDEX "learning_materials_status_idx" ON "learning_materials"("status");

-- CreateIndex
CREATE UNIQUE INDEX "learning_materials_concept_id_sequence_order_key" ON "learning_materials"("concept_id", "sequence_order");

-- CreateIndex
CREATE INDEX "examples_source_id_idx" ON "examples"("source_id");

-- CreateIndex
CREATE INDEX "examples_status_idx" ON "examples"("status");

-- CreateIndex
CREATE UNIQUE INDEX "examples_concept_id_sequence_order_key" ON "examples"("concept_id", "sequence_order");

-- CreateIndex
CREATE INDEX "exercises_source_id_idx" ON "exercises"("source_id");

-- CreateIndex
CREATE INDEX "exercises_status_idx" ON "exercises"("status");

-- CreateIndex
CREATE UNIQUE INDEX "exercises_concept_id_sequence_order_key" ON "exercises"("concept_id", "sequence_order");

-- CreateIndex
CREATE UNIQUE INDEX "questions_previous_version_id_key" ON "questions"("previous_version_id");

-- CreateIndex
CREATE INDEX "questions_concept_id_idx" ON "questions"("concept_id");

-- CreateIndex
CREATE INDEX "questions_source_id_idx" ON "questions"("source_id");

-- CreateIndex
CREATE INDEX "questions_status_idx" ON "questions"("status");

-- CreateIndex
CREATE INDEX "assessments_course_id_idx" ON "assessments"("course_id");

-- CreateIndex
CREATE INDEX "assessments_module_id_idx" ON "assessments"("module_id");

-- CreateIndex
CREATE INDEX "assessments_topic_id_idx" ON "assessments"("topic_id");

-- CreateIndex
CREATE INDEX "assessment_questions_question_id_idx" ON "assessment_questions"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_questions_assessment_id_question_id_key" ON "assessment_questions"("assessment_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_questions_assessment_id_sequence_order_key" ON "assessment_questions"("assessment_id", "sequence_order");

-- CreateIndex
CREATE INDEX "assessment_attempts_student_id_idx" ON "assessment_attempts"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_attempts_assessment_id_student_id_attempt_number_key" ON "assessment_attempts"("assessment_id", "student_id", "attempt_number");

-- CreateIndex
CREATE INDEX "student_answers_assessment_question_id_idx" ON "student_answers"("assessment_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_answers_attempt_id_assessment_question_id_key" ON "student_answers"("attempt_id", "assessment_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_results_attempt_id_key" ON "assessment_results"("attempt_id");

-- CreateIndex
CREATE INDEX "learning_activities_student_id_occurred_at_idx" ON "learning_activities"("student_id", "occurred_at");

-- CreateIndex
CREATE INDEX "learning_activities_concept_id_occurred_at_idx" ON "learning_activities"("concept_id", "occurred_at");

-- CreateIndex
CREATE INDEX "learning_activities_course_id_idx" ON "learning_activities"("course_id");

-- CreateIndex
CREATE INDEX "learning_activities_target_type_target_id_idx" ON "learning_activities"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_evidence_superseded_by_evidence_id_key" ON "student_evidence"("superseded_by_evidence_id");

-- CreateIndex
CREATE INDEX "student_evidence_student_id_concept_id_observed_at_idx" ON "student_evidence"("student_id", "concept_id", "observed_at");

-- CreateIndex
CREATE INDEX "student_evidence_student_id_observed_at_idx" ON "student_evidence"("student_id", "observed_at");

-- CreateIndex
CREATE INDEX "student_evidence_concept_id_idx" ON "student_evidence"("concept_id");

-- CreateIndex
CREATE INDEX "student_evidence_source_type_source_id_idx" ON "student_evidence"("source_type", "source_id");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecturers" ADD CONSTRAINT "lecturers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "lecturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_sources" ADD CONSTRAINT "content_sources_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "content_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_materials" ADD CONSTRAINT "learning_materials_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_materials" ADD CONSTRAINT "learning_materials_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "content_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_materials" ADD CONSTRAINT "learning_materials_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_materials" ADD CONSTRAINT "learning_materials_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examples" ADD CONSTRAINT "examples_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examples" ADD CONSTRAINT "examples_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "content_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examples" ADD CONSTRAINT "examples_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examples" ADD CONSTRAINT "examples_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "content_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "content_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "assessment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_assessment_question_id_fkey" FOREIGN KEY ("assessment_question_id") REFERENCES "assessment_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_graded_by_user_id_fkey" FOREIGN KEY ("graded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "assessment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_activities" ADD CONSTRAINT "learning_activities_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_activities" ADD CONSTRAINT "learning_activities_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_activities" ADD CONSTRAINT "learning_activities_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_evidence" ADD CONSTRAINT "student_evidence_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_evidence" ADD CONSTRAINT "student_evidence_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_evidence" ADD CONSTRAINT "student_evidence_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_evidence" ADD CONSTRAINT "student_evidence_superseded_by_evidence_id_fkey" FOREIGN KEY ("superseded_by_evidence_id") REFERENCES "student_evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Hand-written additions from docs/database-design.md.
-- schema.prisma cannot express CHECK constraints, partial indexes, triggers, or RLS.
-- =============================================================================

-- Users and profiles ----------------------------------------------------------

-- Emails are stored lowercase, which makes "users_email_key" case-insensitive.
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase_check" CHECK ("email" = lower("email"));

ALTER TABLE "students" ADD CONSTRAINT "students_year_of_study_check" CHECK ("year_of_study" BETWEEN 1 AND 6);

-- Course structure ------------------------------------------------------------

ALTER TABLE "courses" ADD CONSTRAINT "courses_credits_check" CHECK ("credits" > 0);

ALTER TABLE "course_enrollments"
    ADD CONSTRAINT "course_enrollments_completed_at_check" CHECK ("status" <> 'COMPLETED' OR "completed_at" IS NOT NULL),
    ADD CONSTRAINT "course_enrollments_dropped_at_check" CHECK ("status" <> 'DROPPED' OR "dropped_at" IS NOT NULL);

ALTER TABLE "modules" ADD CONSTRAINT "modules_sequence_order_check" CHECK ("sequence_order" >= 1);
ALTER TABLE "topics" ADD CONSTRAINT "topics_sequence_order_check" CHECK ("sequence_order" >= 1);
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_sequence_order_check" CHECK ("sequence_order" >= 1);

-- Provenance ------------------------------------------------------------------

ALTER TABLE "content_sources"
    ADD CONSTRAINT "content_sources_url_check" CHECK ("source_type" NOT IN ('WEBSITE', 'OPEN_EDUCATIONAL_RESOURCE') OR "url" IS NOT NULL),
    ADD CONSTRAINT "content_sources_generation_metadata_check" CHECK ("source_type" <> 'AI_GENERATED' OR "generation_metadata" IS NOT NULL);

-- Learning content (shared lifecycle rules + per-table rules) -----------------

ALTER TABLE "lessons"
    ADD CONSTRAINT "lessons_review_check" CHECK ("status" NOT IN ('APPROVED', 'PUBLISHED') OR ("reviewed_by_user_id" IS NOT NULL AND "reviewed_at" IS NOT NULL)),
    ADD CONSTRAINT "lessons_published_at_check" CHECK ("status" <> 'PUBLISHED' OR "published_at" IS NOT NULL),
    ADD CONSTRAINT "lessons_sequence_order_check" CHECK ("sequence_order" >= 1),
    ADD CONSTRAINT "lessons_estimated_duration_check" CHECK ("estimated_duration_minutes" > 0);

ALTER TABLE "learning_materials"
    ADD CONSTRAINT "learning_materials_review_check" CHECK ("status" NOT IN ('APPROVED', 'PUBLISHED') OR ("reviewed_by_user_id" IS NOT NULL AND "reviewed_at" IS NOT NULL)),
    ADD CONSTRAINT "learning_materials_published_at_check" CHECK ("status" <> 'PUBLISHED' OR "published_at" IS NOT NULL),
    ADD CONSTRAINT "learning_materials_sequence_order_check" CHECK ("sequence_order" >= 1),
    ADD CONSTRAINT "learning_materials_location_check" CHECK (("file_storage_key" IS NULL) <> ("external_url" IS NULL)),
    ADD CONSTRAINT "learning_materials_link_url_check" CHECK ("material_type" <> 'LINK' OR "external_url" IS NOT NULL),
    ADD CONSTRAINT "learning_materials_file_size_check" CHECK ("file_size_bytes" >= 0);

ALTER TABLE "examples"
    ADD CONSTRAINT "examples_review_check" CHECK ("status" NOT IN ('APPROVED', 'PUBLISHED') OR ("reviewed_by_user_id" IS NOT NULL AND "reviewed_at" IS NOT NULL)),
    ADD CONSTRAINT "examples_published_at_check" CHECK ("status" <> 'PUBLISHED' OR "published_at" IS NOT NULL),
    ADD CONSTRAINT "examples_sequence_order_check" CHECK ("sequence_order" >= 1),
    ADD CONSTRAINT "examples_code_language_check" CHECK ("code_snippet" IS NULL OR "programming_language" IS NOT NULL);

ALTER TABLE "exercises"
    ADD CONSTRAINT "exercises_review_check" CHECK ("status" NOT IN ('APPROVED', 'PUBLISHED') OR ("reviewed_by_user_id" IS NOT NULL AND "reviewed_at" IS NOT NULL)),
    ADD CONSTRAINT "exercises_published_at_check" CHECK ("status" <> 'PUBLISHED' OR "published_at" IS NOT NULL),
    ADD CONSTRAINT "exercises_sequence_order_check" CHECK ("sequence_order" >= 1),
    ADD CONSTRAINT "exercises_max_score_check" CHECK ("max_score" > 0),
    ADD CONSTRAINT "exercises_hints_array_check" CHECK (jsonb_typeof("hints") = 'array'),
    ADD CONSTRAINT "exercises_estimated_duration_check" CHECK ("estimated_duration_minutes" > 0);

ALTER TABLE "questions"
    ADD CONSTRAINT "questions_review_check" CHECK ("status" NOT IN ('APPROVED', 'PUBLISHED') OR ("reviewed_by_user_id" IS NOT NULL AND "reviewed_at" IS NOT NULL)),
    ADD CONSTRAINT "questions_published_at_check" CHECK ("status" <> 'PUBLISHED' OR "published_at" IS NOT NULL),
    ADD CONSTRAINT "questions_default_points_check" CHECK ("default_points" > 0),
    ADD CONSTRAINT "questions_version_check" CHECK ("version" >= 1),
    ADD CONSTRAINT "questions_answer_config_object_check" CHECK (jsonb_typeof("answer_config") = 'object'),
    ADD CONSTRAINT "questions_not_own_previous_version_check" CHECK ("previous_version_id" <> "id");

-- Assessments -----------------------------------------------------------------

ALTER TABLE "assessments"
    ADD CONSTRAINT "assessments_time_limit_check" CHECK ("time_limit_minutes" > 0),
    ADD CONSTRAINT "assessments_max_attempts_check" CHECK ("max_attempts" >= 1),
    ADD CONSTRAINT "assessments_pass_percentage_check" CHECK ("pass_percentage" BETWEEN 0 AND 100),
    ADD CONSTRAINT "assessments_availability_window_check" CHECK ("available_from" IS NULL OR "available_until" IS NULL OR "available_until" > "available_from");

ALTER TABLE "assessment_questions"
    ADD CONSTRAINT "assessment_questions_points_check" CHECK ("points" > 0),
    ADD CONSTRAINT "assessment_questions_sequence_order_check" CHECK ("sequence_order" >= 1);

ALTER TABLE "assessment_attempts"
    ADD CONSTRAINT "assessment_attempts_attempt_number_check" CHECK ("attempt_number" >= 1),
    ADD CONSTRAINT "assessment_attempts_submitted_at_check" CHECK ("status" = 'IN_PROGRESS' OR "submitted_at" IS NOT NULL),
    ADD CONSTRAINT "assessment_attempts_submission_order_check" CHECK ("submitted_at" >= "started_at"),
    ADD CONSTRAINT "assessment_attempts_time_spent_check" CHECK ("time_spent_seconds" >= 0);

-- At most one in-progress attempt per student per assessment.
CREATE UNIQUE INDEX "assessment_attempts_one_in_progress_key"
    ON "assessment_attempts" ("assessment_id", "student_id")
    WHERE "status" = 'IN_PROGRESS';

ALTER TABLE "student_answers"
    ADD CONSTRAINT "student_answers_max_score_check" CHECK ("max_score" > 0),
    ADD CONSTRAINT "student_answers_score_range_check" CHECK ("score_awarded" BETWEEN 0 AND "max_score"),
    ADD CONSTRAINT "student_answers_manual_grader_check" CHECK ("grading_status" <> 'MANUALLY_GRADED' OR "graded_by_user_id" IS NOT NULL),
    ADD CONSTRAINT "student_answers_graded_fields_check" CHECK ("grading_status" = 'PENDING' OR ("score_awarded" IS NOT NULL AND "graded_at" IS NOT NULL)),
    ADD CONSTRAINT "student_answers_time_spent_check" CHECK ("time_spent_seconds" >= 0);

ALTER TABLE "assessment_results"
    ADD CONSTRAINT "assessment_results_max_score_check" CHECK ("max_score" > 0),
    ADD CONSTRAINT "assessment_results_total_score_range_check" CHECK ("total_score" BETWEEN 0 AND "max_score"),
    ADD CONSTRAINT "assessment_results_release_check" CHECK ("released_at" IS NULL OR "status" = 'FINAL');

-- Learning activity (append-only) ---------------------------------------------

ALTER TABLE "learning_activities"
    ADD CONSTRAINT "learning_activities_target_pair_check" CHECK (("target_type" IS NULL) = ("target_id" IS NULL)),
    ADD CONSTRAINT "learning_activities_time_order_check" CHECK ("ended_at" >= "started_at"),
    ADD CONSTRAINT "learning_activities_duration_check" CHECK ("duration_seconds" >= 0);

CREATE FUNCTION "reject_append_only_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% on "%" is not allowed: the table is append-only', TG_OP, TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER "learning_activities_append_only"
    BEFORE UPDATE OR DELETE ON "learning_activities"
    FOR EACH ROW EXECUTE FUNCTION "reject_append_only_change"();

-- Student evidence (observed evidence only; append-only) ----------------------

-- NULL measurements mean "not measured"; these checks never turn NULL into 0.
ALTER TABLE "student_evidence"
    ADD CONSTRAINT "student_evidence_score_check" CHECK ("score" >= 0),
    ADD CONSTRAINT "student_evidence_max_score_check" CHECK ("max_score" > 0),
    ADD CONSTRAINT "student_evidence_score_range_check" CHECK ("score" <= "max_score"),
    ADD CONSTRAINT "student_evidence_score_needs_max_check" CHECK ("score" IS NULL OR "max_score" IS NOT NULL),
    ADD CONSTRAINT "student_evidence_skipped_unscored_check" CHECK ("status" <> 'SKIPPED' OR "score" IS NULL),
    ADD CONSTRAINT "student_evidence_attempt_number_check" CHECK ("attempt_number" >= 1),
    ADD CONSTRAINT "student_evidence_time_spent_check" CHECK ("time_spent_seconds" >= 0),
    ADD CONSTRAINT "student_evidence_hints_used_check" CHECK ("hints_used" >= 0),
    ADD CONSTRAINT "student_evidence_errors_count_check" CHECK ("errors_count" >= 0),
    ADD CONSTRAINT "student_evidence_not_self_superseded_check" CHECK ("superseded_by_evidence_id" <> "id");

-- At most one current (non-superseded) evidence row per source per concept.
CREATE UNIQUE INDEX "student_evidence_current_source_concept_key"
    ON "student_evidence" ("source_type", "source_id", "concept_id") NULLS NOT DISTINCT
    WHERE "superseded_by_evidence_id" IS NULL;

-- Rows are never deleted; the only permitted update sets superseded_by_evidence_id once.
CREATE FUNCTION "guard_student_evidence_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE'
        AND OLD."superseded_by_evidence_id" IS NULL
        AND NEW."superseded_by_evidence_id" IS NOT NULL
        AND (to_jsonb(NEW) - 'superseded_by_evidence_id' - 'percentage')
            = (to_jsonb(OLD) - 'superseded_by_evidence_id' - 'percentage')
    THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION '% on "student_evidence" is not allowed: evidence is append-only (only superseded_by_evidence_id may be set, once)', TG_OP;
END;
$$;

CREATE TRIGGER "student_evidence_append_only"
    BEFORE UPDATE OR DELETE ON "student_evidence"
    FOR EACH ROW EXECUTE FUNCTION "guard_student_evidence_change"();

-- Row-level security ----------------------------------------------------------
-- Supabase exposes the public schema through its Data API. RLS without policies blocks
-- that API entirely; the application connects as the table owner, which bypasses RLS.

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lecturers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "courses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "course_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "modules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "topics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "concepts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lessons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_materials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "examples" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exercises" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_answers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_evidence" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
        ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
    END IF;
END;
$$;
