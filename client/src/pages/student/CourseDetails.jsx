import { Link, useParams } from 'react-router'
import CourseHierarchy from '../../components/CourseHierarchy.jsx'
import CourseQuizzes from '../../components/CourseQuizzes.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import ErrorState from '../../components/ErrorState.jsx'
import LoadingState from '../../components/LoadingState.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import { ROUTES } from '../../constants/routes.js'
import { useApiRequest } from '../../hooks/useApiRequest.js'
import { getCourse, listModules } from '../../services/api/course.api.js'

async function loadCourse(courseId, signal) {
  const [course, modules] = await Promise.all([
    getCourse(courseId, { signal }),
    listModules(courseId, { signal }),
  ])
  return { course, modules }
}

function BackLink() {
  return (
    <Link to={ROUTES.STUDENT_COURSES} className="back-link">
      ← Back to My Courses
    </Link>
  )
}

export default function CourseDetails() {
  const { courseId } = useParams()
  const { data, error, loading, reload } = useApiRequest((signal) => loadCourse(courseId, signal), [courseId])

  if (loading) {
    return (
      <section className="page">
        <BackLink />
        <LoadingState message="Loading course…" />
      </section>
    )
  }

  // The API answers 404 for missing or unpublished courses and 400 for a malformed id.
  if (error && (error.status === 404 || error.status === 400)) {
    return (
      <section className="page">
        <BackLink />
        <EmptyState title="Course not found">
          <p>This course does not exist or is not available to you.</p>
        </EmptyState>
      </section>
    )
  }

  if (error) {
    return (
      <section className="page">
        <BackLink />
        <ErrorState error={error} title="Could not load this course" onRetry={reload} />
      </section>
    )
  }

  const { course, modules } = data
  const lecturer = course.lecturer && `${course.lecturer.firstName} ${course.lecturer.lastName}`

  return (
    <section className="page">
      <BackLink />

      <header className="page-header course-header">
        <div className="course-card-header">
          <span className="course-code">{course.code}</span>
          <StatusBadge status={course.status} />
        </div>
        <h1>{course.title}</h1>
        {course.description && <p className="page-subtitle">{course.description}</p>}
        <dl className="course-meta">
          {course.credits != null && (
            <div>
              <dt>Credits</dt>
              <dd>{course.credits}</dd>
            </div>
          )}
          {lecturer && (
            <div>
              <dt>Lecturer</dt>
              <dd>{lecturer}</dd>
            </div>
          )}
        </dl>
      </header>

      <section className="page-section">
        <h2>Quizzes</h2>
        <CourseQuizzes courseId={course.id} />
      </section>

      <section className="page-section">
        <h2>Course structure</h2>
        <p className="muted">Expand a module, topic and concept to find its lessons.</p>
        <CourseHierarchy course={course} modules={modules} />
      </section>
    </section>
  )
}
