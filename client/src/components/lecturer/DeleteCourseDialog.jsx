import { deleteCourse } from '../../services/api/course.api.js'
import ConfirmDeleteDialog from './ConfirmDeleteDialog.jsx'

export default function DeleteCourseDialog({ course, onDeleted, onMissing, onClose }) {
  return (
    <ConfirmDeleteDialog
      noun="course"
      remove={() => deleteCourse(course.id)}
      onDeleted={onDeleted}
      onMissing={onMissing}
      onClose={onClose}
    >
      <p>
        You are about to permanently delete{' '}
        <strong>
          {course.code} {course.title}
        </strong>
        , together with its modules, topics and concepts. This cannot be undone.
      </p>
      <p className="muted">
        A course that other records depend on, such as lessons, assessments, enrolments or student activity, cannot be
        deleted. Archive it instead with Change status on its Manage page.
      </p>
    </ConfirmDeleteDialog>
  )
}
