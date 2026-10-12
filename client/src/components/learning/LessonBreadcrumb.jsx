import { Link } from 'react-router'
import { ROUTES } from '../../constants/routes.js'

// Course › Module › Topic › Concept › Lesson. Only the course has a page of its own, so it is the only link.
export default function LessonBreadcrumb({ context, lessonTitle }) {
  const trail = [context.moduleTitle, context.topicTitle, context.conceptName].filter(Boolean)
  return (
    <nav className="lesson-breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li>
          <Link to={ROUTES.studentCourse(context.courseId)}>{context.courseTitle}</Link>
        </li>
        {trail.map((title, index) => (
          <li key={index}>{title}</li>
        ))}
        <li aria-current="page">{lessonTitle}</li>
      </ol>
    </nav>
  )
}
