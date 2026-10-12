import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router'
import CourseCard from '../../components/CourseCard.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import ErrorState from '../../components/ErrorState.jsx'
import CreateCourseDialog from '../../components/lecturer/CreateCourseDialog.jsx'
import DeleteCourseDialog from '../../components/lecturer/DeleteCourseDialog.jsx'
import EditCourseDialog from '../../components/lecturer/EditCourseDialog.jsx'
import LoadingState from '../../components/LoadingState.jsx'
import { ROUTES } from '../../constants/routes.js'
import { useApiRequest } from '../../hooks/useApiRequest.js'
import { listCourses } from '../../services/api/course.api.js'

// Courses owned by the signed-in lecturer, in every status, newest first (the API's order).
// The list is updated with the course each request returns, so changes appear without reloading the page.
export default function LecturerCourses() {
  const {
    data: courses,
    error,
    loading,
    reload,
    updateData: updateCourses,
  } = useApiRequest((signal) => listCourses({ signal, mine: true }), [])
  // { type: 'create' } | { type: 'edit', course } | { type: 'delete', course }
  const [dialog, setDialog] = useState(null)
  // { type: 'success' | 'error', message }
  const [feedback, setFeedback] = useState(null)
  const headingRef = useRef(null)

  function openDialog(next) {
    setFeedback(null)
    setDialog(next)
  }

  function closeDialog() {
    setDialog(null)
  }

  function handleCreated(course) {
    if (courses) updateCourses((list) => [course, ...list])
    else reload()
    setDialog(null)
    setFeedback({ type: 'success', message: `Course "${course.title}" was created.` })
  }

  function handleSaved(course) {
    updateCourses((list) => list?.map((item) => (item.id === course.id ? course : item)))
    setDialog(null)
    setFeedback({ type: 'success', message: `Course "${course.title}" was updated.` })
  }

  // The course's card disappears with the control that opened the dialog, so focus moves to the page heading.
  function removeCourse(course, nextFeedback) {
    flushSync(() => {
      updateCourses((list) => list?.filter((item) => item.id !== course.id))
      setDialog(null)
      setFeedback(nextFeedback)
    })
    headingRef.current?.focus()
  }

  function handleDeleted(course) {
    removeCourse(course, { type: 'success', message: `Course "${course.title}" was deleted.` })
  }

  function handleMissing(course) {
    removeCourse(course, {
      type: 'error',
      message: `Course "${course.title}" no longer exists, so it was removed from your list.`,
    })
  }

  return (
    <section className="page">
      <header className="page-header page-header-actions">
        <div>
          <h1 ref={headingRef} tabIndex={-1}>
            Courses
          </h1>
          <p className="page-subtitle">Create and manage the courses you own, including drafts.</p>
        </div>
        <button type="button" className="button button-primary" onClick={() => openDialog({ type: 'create' })}>
          <span aria-hidden="true">+</span> Create Course
        </button>
      </header>

      <div role="status" aria-live="polite">
        {feedback?.type === 'success' && <p className="alert alert-success">{feedback.message}</p>}
      </div>
      <div role="alert">{feedback?.type === 'error' && <p className="alert alert-error">{feedback.message}</p>}</div>

      {loading && <LoadingState message="Loading courses…" />}
      {!loading && error && <ErrorState error={error} title="Could not load your courses" onRetry={reload} />}
      {!loading && !error && courses.length === 0 && (
        <EmptyState title="No courses yet.">
          <p>Use Create Course to add your first course.</p>
        </EmptyState>
      )}
      {!loading && !error && courses.length > 0 && (
        <div className="card-grid">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              to={ROUTES.lecturerCourse(course.id)}
              showLecturer={false}
              actions={
                <>
                  <Link to={ROUTES.lecturerCourse(course.id)} className="button button-primary button-small">
                    Manage<span className="visually-hidden"> {course.title}</span>
                  </Link>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => openDialog({ type: 'edit', course })}
                  >
                    Edit<span className="visually-hidden"> {course.title}</span>
                  </button>
                  <button
                    type="button"
                    className="button button-danger-outline button-small"
                    onClick={() => openDialog({ type: 'delete', course })}
                  >
                    Delete<span className="visually-hidden"> {course.title}</span>
                  </button>
                </>
              }
            />
          ))}
        </div>
      )}

      {dialog?.type === 'create' && <CreateCourseDialog onCreated={handleCreated} onClose={closeDialog} />}
      {dialog?.type === 'edit' && (
        <EditCourseDialog
          courseId={dialog.course.id}
          onSaved={handleSaved}
          onMissing={() => handleMissing(dialog.course)}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === 'delete' && (
        <DeleteCourseDialog
          course={dialog.course}
          onDeleted={() => handleDeleted(dialog.course)}
          onMissing={() => handleMissing(dialog.course)}
          onClose={closeDialog}
        />
      )}
    </section>
  )
}
