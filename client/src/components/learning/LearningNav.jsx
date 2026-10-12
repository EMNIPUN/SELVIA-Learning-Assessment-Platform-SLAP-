import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router'
import { ACTIVITY_TYPES } from '../../constants/activityTypes.js'
import { ROUTES } from '../../constants/routes.js'
import { useApiRequest } from '../../hooks/useApiRequest.js'
import { listMyActivities } from '../../services/api/learningActivity.api.js'
import CourseNavigation from './CourseNavigation.jsx'

// The most recent activity the API returns; older lesson views are not marked.
const ACTIVITY_LIMIT = 200

const FOCUSABLE = 'a[href], button:not([disabled])'

// Lessons the student has opened, from their own LESSON_VIEWED activity, plus views recorded on this visit.
// Reading activity never records any. If it cannot be loaded, lessons are simply shown without the marker.
function useViewedLessonIds(recordedIds) {
  const { data: activities } = useApiRequest((signal) => listMyActivities({ limit: ACTIVITY_LIMIT, signal }), [])
  return useMemo(() => {
    const ids = new Set(recordedIds)
    for (const activity of activities ?? []) {
      if (activity.activityType === ACTIVITY_TYPES.LESSON_VIEWED) ids.add(activity.targetId)
    }
    return ids
  }, [activities, recordedIds])
}

// The course navigation beside the lesson. On small screens (`isDrawer`) it is a modal drawer: it takes focus
// when opened, keeps Tab inside, and Escape, the close button or the backdrop closes it.
export default function LearningNav({ id, context, currentLessonId, recordedViewIds, isDrawer, open, onClose, onSelect }) {
  const panelRef = useRef(null)
  const viewedIds = useViewedLessonIds(recordedViewIds)
  const modal = isDrawer && open

  useEffect(() => {
    if (!modal) return
    const panel = panelRef.current
    const target = panel.querySelector('[aria-current="page"]') ?? panel.querySelector('.learning-nav-close')
    target?.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [modal])

  // Keeps the current lesson in view inside the panel's own scroll area, without scrolling the page.
  useEffect(() => {
    const panel = panelRef.current
    const frame = requestAnimationFrame(() => {
      const current = panel?.querySelector('[aria-current="page"]')
      if (!current) return
      const panelBox = panel.getBoundingClientRect()
      const box = current.getBoundingClientRect()
      if (box.top < panelBox.top || box.bottom > panelBox.bottom) {
        panel.scrollTop += box.top - panelBox.top - panelBox.height / 3
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [currentLessonId, open, viewedIds])

  function handleKeyDown(event) {
    if (!modal) return
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((element) => !element.closest('[hidden]'))
    const first = focusable[0]
    const last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      {modal && <div className="learning-nav-backdrop" aria-hidden="true" onClick={onClose} />}
      <div
        id={id}
        ref={panelRef}
        className={`learning-nav${open ? ' is-open' : ''}`}
        role={modal ? 'dialog' : undefined}
        aria-modal={modal ? true : undefined}
        aria-label={modal ? 'Course navigation' : undefined}
        onKeyDown={handleKeyDown}
      >
        <div className="learning-nav-header">
          <div className="learning-nav-course">
            <span className="learning-nav-label">Course</span>
            <Link to={ROUTES.studentCourse(context.courseId)} className="learning-nav-course-link">
              {context.courseTitle}
            </Link>
          </div>
          {isDrawer && (
            <button type="button" className="button button-secondary learning-nav-close" onClick={onClose}>
              <span aria-hidden="true">✕</span>
              <span className="visually-hidden">Close course navigation</span>
            </button>
          )}
        </div>

        <nav className="learning-nav-tree" aria-label="Course lessons">
          <CourseNavigation
            path={context}
            courseTitle={context.courseTitle}
            currentLessonId={currentLessonId}
            viewedIds={viewedIds}
            onSelect={onSelect}
          />
        </nav>

        <ul className="nav-legend" aria-label="Lesson markers">
          <li>
            <span className="nav-lesson-marker nav-marker-current" aria-hidden="true" /> Current lesson
          </li>
          <li>
            <span className="nav-lesson-marker nav-marker-viewed" aria-hidden="true" /> Viewed
          </li>
          <li>
            <span className="nav-lesson-marker" aria-hidden="true" /> Not viewed yet
          </li>
        </ul>
      </div>
    </>
  )
}
