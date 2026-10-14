import { QuestionType } from '@prisma/client'

// Question types the bank accepts: those with a documented answer configuration that the platform can grade
// deterministically. The other QuestionType values (essays, code, matching, ...) need grading the platform does
// not offer yet, so they cannot be created through the API.
export const BANK_QUESTION_TYPES = [QuestionType.MULTIPLE_CHOICE_SINGLE, QuestionType.SHORT_ANSWER]
