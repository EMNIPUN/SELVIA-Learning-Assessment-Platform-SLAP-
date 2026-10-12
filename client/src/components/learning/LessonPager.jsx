import { Link } from 'react-router'
import { ROUTES } from '../../constants/routes.js'

// Previous and next are the neighbouring published lessons in the same concept, in the lecturer's sequence
// order. Moving on to another concept is left to the student, from the course navigation or course page.
export function findLessonPosition(lessons, lessonId) {
  const index = lessons ? lessons.findIndex((item) => item.id === lessonId) : -1
  if (index === -1) return null
  return {
    number: index + 1,
    total: lessons.length,
    previous: lessons[index - 1] ?? null,
    next: lessons[index + 1] ?? null,
  }
}

function PagerLink({ lesson, context, direction, children, className }) {
  return (
    <Link
      to={ROUTES.studentLesson(lesson.id)}
      state={{ lessonContext: context }}
      className={className}
      aria-label={`${direction === 'previous' ? 'Previous' : 'Next'} lesson: ${lesson.title}`}
    >
      {children}
    </Link>
  )
}

// The compact pair of buttons under the lesson title. Shows nothing until the lesson list has loaded; the
// full pager at the end of the lesson reports loading problems.
export function LessonPagerBar({ position, context }) {
  if (!position || (!position.previous && !position.next)) return null
  return (
    <div className="lesson-pager-bar">
      {position.previous ? (
        <PagerLink lesson={position.previous} context={context} direction="previous" className="button button-secondary">
          <span aria-hidden="true">←</span> Previous
        </PagerLink>
      ) : (
        <span />
      )}
      {position.next && (
        <PagerLink lesson={position.next} context={context} direction="next" className="button button-primary">
          Next <span aria-hidden="true">→</span>
        </PagerLink>
      )}
    </div>
  )
}

// `request` is the concept's lesson list (a useApiRequest result).
export default function LessonPager({ request: { error, loading, reload }, position, context, conceptName }) {
  if (loading) return <p className="lesson-next-text">Looking for the next lesson…</p>
  if (error) {
    return (
      <p className="lesson-next-text lesson-next-inline">
        <span>Could not check for a next lesson.</span>
        <button type="button" className="button button-secondary button-small" onClick={reload}>
          Try again
        </button>
      </p>
    )
  }

  const previous = position?.previous
  const next = position?.next
  return (
    <>
      {!next && (
        <p className="lesson-next-text">
          This is the last lesson in this concept. Choose what to study next from the course navigation or the course
          page.
        </p>
      )}
      {(previous || next) && (
        <div className="lesson-pager">
          {previous && (
            <PagerLink lesson={previous} context={context} direction="previous" className="lesson-pager-link">
              <span className="lesson-pager-direction">
                <span aria-hidden="true">←</span> Previous Lesson
              </span>
              <span className="lesson-pager-title">{previous.title}</span>
            </PagerLink>
          )}
          {next && (
            <PagerLink
              lesson={next}
              context={context}
              direction="next"
              className="lesson-pager-link lesson-pager-link-next"
            >
              <span className="lesson-pager-direction">
                Next Lesson <span aria-hidden="true">→</span>
              </span>
              <span className="lesson-pager-title">{next.title}</span>
              {conceptName && <span className="lesson-pager-meta">in {conceptName}</span>}
            </PagerLink>
          )}
        </div>
      )}
    </>
  )
}
