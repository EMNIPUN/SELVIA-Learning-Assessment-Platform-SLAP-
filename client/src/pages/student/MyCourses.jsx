import CourseCard from '../../components/CourseCard.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import ErrorState from '../../components/ErrorState.jsx'
import LoadingState from '../../components/LoadingState.jsx'
import { ROUTES } from '../../constants/routes.js'
import { useApiRequest } from '../../hooks/useApiRequest.js'
import { listCourses } from '../../services/api/course.api.js'

export default function MyCourses() {
  const { data: courses, error, loading, reload } = useApiRequest((signal) => listCourses({ signal }), [])

  return (
    <section className="page">
      <header className="page-header">
        <h1>My Courses</h1>
        <p className="page-subtitle">Courses available to you.</p>
      </header>

      {loading && <LoadingState message="Loading courses…" />}
      {!loading && error && <ErrorState error={error} title="Could not load your courses" onRetry={reload} />}
      {!loading && !error && courses.length === 0 && (
        <EmptyState title="No courses available yet.">
          <p>Courses will appear here once they are published.</p>
        </EmptyState>
      )}
      {!loading && !error && courses.length > 0 && (
        <div className="card-grid">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} to={ROUTES.studentCourse(course.id)} />
          ))}
        </div>
      )}
    </section>
  )
}
