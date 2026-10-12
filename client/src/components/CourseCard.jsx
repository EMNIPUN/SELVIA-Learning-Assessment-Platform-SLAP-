import { Link } from 'react-router'
import StatusBadge from './StatusBadge.jsx'

// Shows only fields the course API returns. `to` links the card to a course page; without it the card
// is display-only. `showLecturer` is off where every course belongs to the signed-in lecturer.
// `actions` (buttons and links) are placed at the bottom of the card, instead of the "View course" link.
export default function CourseCard({ course, to, showLecturer = true, actions }) {
  const lecturer = showLecturer && course.lecturer && `${course.lecturer.firstName} ${course.lecturer.lastName}`
  const hasMeta = course.credits != null || lecturer

  return (
    <article className="card course-card">
      <div className="course-card-header">
        <span className="course-code">{course.code}</span>
        <StatusBadge status={course.status} />
      </div>
      <h3 className="course-card-title">{to ? <Link to={to}>{course.title}</Link> : course.title}</h3>
      {course.description && <p className="course-card-description">{course.description}</p>}
      {hasMeta && (
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
      )}
      {to && !actions && (
        <Link to={to} className="button button-secondary button-small course-card-action">
          View course
        </Link>
      )}
      {actions && <div className="course-card-actions">{actions}</div>}
    </article>
  )
}
