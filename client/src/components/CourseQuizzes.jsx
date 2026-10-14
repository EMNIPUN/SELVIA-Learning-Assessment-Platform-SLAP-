import { useApiRequest } from '../hooks/useApiRequest.js'
import { listStudentCourseQuizzes } from '../services/api/studentQuiz.api.js'
import EmptyState from './EmptyState.jsx'
import ErrorState from './ErrorState.jsx'
import LoadingState from './LoadingState.jsx'
import QuizListItem from './QuizListItem.jsx'

// The course's published quizzes with the student's own progress in each. Loaded separately from the course,
// so a failure here never hides the course structure.
export default function CourseQuizzes({ courseId }) {
  const { data: quizzes, error, loading, reload } = useApiRequest(
    (signal) => listStudentCourseQuizzes(courseId, { signal }),
    [courseId],
  )

  if (loading) return <LoadingState message="Loading quizzes…" />
  if (error) return <ErrorState error={error} title="Could not load quizzes" onRetry={reload} />
  if (quizzes.length === 0) return <EmptyState title="No quizzes in this course yet." />

  return (
    <ul className="course-quiz-list">
      {quizzes.map((quiz) => (
        <li key={quiz.id}>
          <QuizListItem quiz={quiz} />
        </li>
      ))}
    </ul>
  )
}
