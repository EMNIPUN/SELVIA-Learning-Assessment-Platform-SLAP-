import { createCourse } from '../../services/api/course.api.js'
import CourseForm from './CourseForm.jsx'
import FormDialog from './FormDialog.jsx'

// New courses start as drafts; their status is changed on the course's management page.
export default function CreateCourseDialog({ onCreated, onClose }) {
  return (
    <FormDialog
      title="Create course"
      noun="course"
      save={createCourse}
      onSaved={onCreated}
      onClose={onClose}
      renderForm={(_, formProps) => <CourseForm submitLabel="Create Course" submittingLabel="Creating…" {...formProps} />}
    />
  )
}
