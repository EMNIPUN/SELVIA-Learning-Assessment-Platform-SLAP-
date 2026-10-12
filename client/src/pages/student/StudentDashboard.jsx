import { Link } from 'react-router'
import EmptyState from '../../components/EmptyState.jsx'
import ErrorState from '../../components/ErrorState.jsx'
import LoadingState from '../../components/LoadingState.jsx'
import { ROUTES } from '../../constants/routes.js'
import { useAuth } from '../../hooks/useAuth.js'
import { useApiRequest } from '../../hooks/useApiRequest.js'
import { listCourses } from '../../services/api/course.api.js'

function CoursesSummary() {
  const { data: courses, error, loading, reload } = useApiRequest((signal) => listCourses({ signal }), [])

  if (loading) return <LoadingState message="Loading courses…" />
  if (error) return <ErrorState error={error} title="Could not load your courses" onRetry={reload} />

  return (
    <>
      <p className="summary-value">{courses.length}</p>
      <p className="muted">{courses.length === 1 ? 'course available' : 'courses available'}</p>
      <Link to={ROUTES.STUDENT_COURSES} className="button button-primary">
        Go to My Courses
      </Link>
    </>
  )
}

export default function StudentDashboard() {
  const { user } = useAuth()

  return (
    <section className="page">
      <header className="page-header">
        <h1>Welcome, {user.firstName}</h1>
        <p className="page-subtitle">Your SELVIA learning space.</p>
      </header>

      <div className="dashboard-grid">
        <article className="card">
          <h2 className="card-title">My Courses</h2>
          <CoursesSummary />
        </article>

        <article className="card">
          <h2 className="card-title">Learning progress</h2>
          <EmptyState title="No progress to show yet.">
            <p>Your progress will appear here once learning activities are available.</p>
          </EmptyState>
        </article>

        <article className="card">
          <h2 className="card-title">Upcoming assessments</h2>
          <EmptyState title="No assessments yet.">
            <p>Quizzes and tests will be listed here when they are available for your courses.</p>
          </EmptyState>
        </article>
      </div>
    </section>
  )
}
