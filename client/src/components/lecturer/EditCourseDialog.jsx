import { getCourse, updateCourse } from '../../services/api/course.api.js'
import CourseForm from './CourseForm.jsx'
import FormDialog from './FormDialog.jsx'

// `onMissing` reports that the course no longer exists (404), when loading or when saving.
export default function EditCourseDialog({ courseId, onSaved, onMissing, onClose }) {
  return (
    <FormDialog
      title="Edit course"
      noun="course"
      load={(signal) => getCourse(courseId, { signal })}
      save={(changes) => updateCourse(courseId, changes)}
      onSaved={onSaved}
      onMissing={onMissing}
      onClose={onClose}
      renderForm={(course, formProps) => (
        <CourseForm course={course} submitLabel="Save changes" submittingLabel="Saving…" {...formProps} />
      )}
    />
  )
}
