// The exercise types the API lets lecturers create and evaluates itself (PRACTICE_EXERCISE_TYPES). Other
// ExerciseType values may exist on older records but cannot be created or answered online.
export const EXERCISE_TYPE = Object.freeze({
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  SHORT_ANSWER: 'SHORT_ANSWER',
})

export const PRACTICE_EXERCISE_TYPES = Object.values(EXERCISE_TYPE)

// DifficultyLevel, in increasing difficulty.
export const DIFFICULTY_LEVELS = Object.freeze(['EASY', 'MEDIUM', 'HARD'])

// BloomLevel, from the lowest to the highest cognitive level.
export const BLOOM_LEVELS = Object.freeze(['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE'])
