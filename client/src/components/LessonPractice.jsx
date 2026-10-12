import { exerciseTitleId, LESSON_SECTION_IDS } from '../constants/lessonSections.js'
import EmptyState from './EmptyState.jsx'
import ErrorState from './ErrorState.jsx'
import ExerciseCard from './ExerciseCard.jsx'
import LoadingState from './LoadingState.jsx'

const END_OF_PRACTICE = { targetId: LESSON_SECTION_IDS.next, label: 'Continue to next steps' }

// `request` is a useApiRequest result, so the lesson page can start loading exercises alongside the lesson.
function PracticeBody({ request: { data: exercises, error, loading, reload }, onAnswered }) {
  if (loading) return <LoadingState message="Loading practice…" />
  if (error) return <ErrorState error={error} title="Could not load practice exercises." onRetry={reload} />
  if (exercises.length === 0) return <EmptyState title="No practice exercises for this lesson yet." />

  return (
    <ol className="content-list">
      {exercises.map((exercise, index) => {
        const nextExercise = exercises[index + 1]
        const next = nextExercise ? { targetId: exerciseTitleId(nextExercise.id), label: 'Continue' } : END_OF_PRACTICE
        return (
          <li key={exercise.id}>
            <ExerciseCard exercise={exercise} position={index + 1} next={next} onAnswered={onAnswered} />
          </li>
        )
      })}
    </ol>
  )
}

// The answered count covers only exercises the student has submitted an answer to; it says nothing about
// how well they did.
function PracticeIntro({ exercises, answeredIds }) {
  if (!exercises?.length) return null
  const answered = exercises.filter((exercise) => answeredIds.has(exercise.id)).length
  return (
    <div className="practice-intro">
      <p>Test your understanding of this lesson. Submit an answer to see whether it is correct.</p>
      <p className="practice-count">
        {answered} of {exercises.length} answered
      </p>
    </div>
  )
}

export default function LessonPractice({ request, answeredIds, onAnswered }) {
  return (
    <section className="page-section lesson-section lesson-practice" aria-labelledby={LESSON_SECTION_IDS.practice}>
      <h2 id={LESSON_SECTION_IDS.practice} tabIndex={-1}>
        Practice
      </h2>
      <PracticeIntro exercises={request.data} answeredIds={answeredIds} />
      <PracticeBody request={request} onAnswered={onAnswered} />
    </section>
  )
}
