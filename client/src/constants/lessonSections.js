// Ids of the lesson page section headings, used for in-page navigation. Each heading has tabIndex={-1}
// so focus can be moved to it.
export const LESSON_SECTION_IDS = Object.freeze({
  content: 'lesson-content-title',
  materials: 'lesson-materials-title',
  examples: 'lesson-examples-title',
  practice: 'lesson-practice-title',
  next: 'lesson-next-title',
})

export const exerciseTitleId = (exerciseId) => `exercise-title-${exerciseId}`
