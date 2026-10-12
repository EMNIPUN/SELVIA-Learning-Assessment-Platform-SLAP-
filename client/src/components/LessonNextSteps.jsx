import { Link } from 'react-router'
import { exerciseTitleId, LESSON_SECTION_IDS } from '../constants/lessonSections.js'
import { ROUTES } from '../constants/routes.js'
import { focusById } from '../utils/focus.js'
import LessonPager from './learning/LessonPager.jsx'

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

// Only reports what the student has done: which exercises have at least one submitted answer.
function PracticeStatus({ request: { data: exercises, error, loading }, answeredIds }) {
  if (loading) return null
  if (error) {
    return <p className="lesson-next-text">Practice exercises could not be loaded. You can try again in the Practice section.</p>
  }
  if (exercises.length === 0) return <p className="lesson-next-text">This lesson has no practice exercises.</p>

  const answeredCount = exercises.filter((exercise) => answeredIds.has(exercise.id)).length
  if (answeredCount === exercises.length) {
    return (
      <div className="lesson-next-status lesson-next-status-complete">
        <p className="lesson-next-status-title">
          <span aria-hidden="true">✓</span> Practice completed
        </p>
        <p className="lesson-next-text">
          You have answered all {plural(exercises.length, 'practice exercise')}. Review your attempts above or continue
          to the next lesson.
        </p>
      </div>
    )
  }

  const firstUnanswered = exercises.find((exercise) => !answeredIds.has(exercise.id))
  return (
    <div className="lesson-next-status">
      <p className="lesson-next-status-title">
        Practice: {answeredCount} of {plural(exercises.length, 'exercise')} answered
      </p>
      <button
        type="button"
        className="button button-secondary button-small"
        onClick={() => focusById(exerciseTitleId(firstUnanswered.id))}
      >
        {answeredCount === 0 ? 'Go to practice' : 'Go to the next unanswered exercise'}
      </button>
    </div>
  )
}

function BackToCourse({ context, primary }) {
  const className = `button ${primary ? 'button-primary' : 'button-secondary'}`
  if (!context) {
    return (
      <Link to={ROUTES.STUDENT_COURSES} className={className}>
        Back to My Courses
      </Link>
    )
  }
  return (
    <Link to={ROUTES.studentCourse(context.courseId)} className={className}>
      Back to course
    </Link>
  )
}

// `lessonsRequest` is the concept's lesson list and `position` this lesson's place in it.
export default function LessonNextSteps({ context, lessonsRequest, position, exercisesRequest, answeredIds }) {
  const hasNext = !lessonsRequest.loading && !lessonsRequest.error && Boolean(position?.next)
  return (
    <section className="page-section lesson-section" aria-labelledby={LESSON_SECTION_IDS.next}>
      <h2 id={LESSON_SECTION_IDS.next} tabIndex={-1}>
        What&apos;s next
      </h2>
      <div className="card lesson-next">
        <p className="lesson-next-text">You have reached the end of this lesson.</p>
        <PracticeStatus request={exercisesRequest} answeredIds={answeredIds} />
        <LessonPager request={lessonsRequest} position={position} context={context} conceptName={context?.conceptName} />
        <div className="lesson-next-actions">
          <BackToCourse context={context} primary={!lessonsRequest.loading && !lessonsRequest.error && !hasNext} />
        </div>
      </div>
    </section>
  )
}
