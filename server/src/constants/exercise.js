import { ExerciseType } from '@prisma/client'

// Exercise types the platform evaluates itself. The other ExerciseType values (coding, diagrams, ...) need
// evaluation the platform does not offer yet, so they cannot be created or answered through the API.
export const PRACTICE_EXERCISE_TYPES = [ExerciseType.MULTIPLE_CHOICE, ExerciseType.SHORT_ANSWER]
