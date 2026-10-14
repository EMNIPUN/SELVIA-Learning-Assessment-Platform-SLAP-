import { useState } from 'react'
import { Link, useParams } from 'react-router'
import EmptyState from '../../components/EmptyState.jsx'
import ErrorState from '../../components/ErrorState.jsx'
import LoadingState from '../../components/LoadingState.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import CourseStructure from '../../components/lecturer/CourseStructure.jsx'
import QuizList from '../../components/lecturer/QuizList.jsx'
import StatusChangeDialog from '../../components/lecturer/StatusChangeDialog.jsx'
import { ROUTES } from '../../constants/routes.js'
import { STRUCTURE_STATUSES } from '../../constants/structureStatus.js'
import { useApiRequest } from '../../hooks/useApiRequest.js'
import { getCourse, listCourses, listModules, updateCourse } from '../../services/api/course.api.js'
import { formatEnumLabel } from '../../utils/formatters.js'

// Lecturers can view other lecturers' published courses, but only the owner may change one. The API refuses
// every change by anyone else (403); checking the lecturer's own course list here only avoids offering
// controls that would be refused.
async function loadCourse(courseId, signal) {
  const [course, ownCourses, modules] = await Promise.all([
    getCourse(courseId, { signal }),
    listCourses({ signal, mine: true }),
    listModules(courseId, { signal }),
  ])
  return { course, modules, owned: ownCourses.some((own) => own.id === course.id) }
}

function BackLink() {
  return (
    <Link to={ROUTES.LECTURER_COURSES} className="back-link">
      ← Back to Courses
    </Link>
  )
}

function PageMessage({ children }) {
  return (
    <section className="page">
      <BackLink />
      {children}
    </section>
  )
}

// A course's details and its modules, topics and concepts, which its owner can add, edit and delete.
// The course's status is changed here, on its own; publishing it does not change the status of its content.
export default function CourseManagement() {
  const { courseId } = useParams()
  const { data, error, loading, reload, updateData } = useApiRequest(
    (signal) => loadCourse(courseId, signal),
    [courseId],
  )
  const [changingStatus, setChangingStatus] = useState(false)
  // { type: 'success' | 'error', message }
  const [feedback, setFeedback] = useState(null)

  if (loading) {
    return (
      <PageMessage>
        <LoadingState message="Loading course…" />
      </PageMessage>
    )
  }

  // The API answers 404 for a missing course or another lecturer's unpublished one, and 400 for a malformed id.
  if (error && (error.status === 404 || error.status === 400)) {
    return (
      <PageMessage>
        <EmptyState title="Course not found">
          <p>This course does not exist or is not one of your courses.</p>
        </EmptyState>
      </PageMessage>
    )
  }

  if ((error && error.status === 403) || (data && !data.owned)) {
    return (
      <PageMessage>
        <EmptyState title="Access denied">
          <p>You can only manage courses that you own.</p>
        </EmptyState>
      </PageMessage>
    )
  }

  if (error) {
    return (
      <PageMessage>
        <ErrorState error={error} title="Could not load this course" onRetry={reload} />
      </PageMessage>
    )
  }

  const { course, modules } = data

  function updateModules(update) {
    updateData((previous) => ({ ...previous, modules: update(previous.modules) }))
  }

  function replaceCourse(next) {
    updateData((previous) => ({ ...previous, course: next }))
  }

  function openStatusDialog() {
    setFeedback(null)
    setChangingStatus(true)
  }

  function handleStatusChanged(next) {
    replaceCourse(next)
    setChangingStatus(false)
    setFeedback({ type: 'success', message: `Course "${next.title}" is now ${formatEnumLabel(next.status)}.` })
  }

  // The course was deleted elsewhere; reloading shows that it no longer exists.
  function handleMissing() {
    setChangingStatus(false)
    reload()
  }

  return (
    <section className="page">
      <BackLink />

      <header className="page-header course-header">
        <div className="course-card-header">
          <span className="course-code">{course.code}</span>
          <span className="course-status">
            <StatusBadge status={course.status} />
            <button type="button" className="button button-secondary button-small" onClick={openStatusDialog}>
              Change status<span className="visually-hidden"> of course {course.title}</span>
            </button>
          </span>
        </div>
        <h1 className="course-title">{course.title}</h1>
        {course.description && <p className="page-subtitle course-description">{course.description}</p>}
        {course.credits != null && (
          <dl className="course-meta">
            <div>
              <dt>Credits</dt>
              <dd>{course.credits}</dd>
            </div>
          </dl>
        )}
      </header>

      <div role="status" aria-live="polite">
        {feedback?.type === 'success' && <p className="alert alert-success">{feedback.message}</p>}
      </div>

      <CourseStructure course={course} modules={modules} updateModules={updateModules} />

      <QuizList course={course} />

      {changingStatus && (
        <StatusChangeDialog
          noun="course"
          nameOf={(record) => `${record.code} ${record.title}`}
          statuses={STRUCTURE_STATUSES}
          scope={{ ancestors: [], contains: 'its modules, topics, concepts and lessons' }}
          load={(signal) => getCourse(course.id, { signal })}
          save={(status) => updateCourse(course.id, { status })}
          onLoaded={replaceCourse}
          onSaved={handleStatusChanged}
          onMissing={handleMissing}
          onClose={() => setChangingStatus(false)}
        />
      )}
    </section>
  )
}
