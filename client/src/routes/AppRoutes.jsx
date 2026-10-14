import { Navigate, Route, Routes } from 'react-router'
import { ROLES } from '../constants/roles.js'
import { ROUTES } from '../constants/routes.js'
import LecturerLayout from '../layouts/LecturerLayout.jsx'
import StudentLayout from '../layouts/StudentLayout.jsx'
import NotFoundPage from '../pages/NotFoundPage.jsx'
import LoginPage from '../pages/auth/LoginPage.jsx'
import UnauthorizedPage from '../pages/auth/UnauthorizedPage.jsx'
import CourseManagement from '../pages/lecturer/CourseManagement.jsx'
import LecturerCourses from '../pages/lecturer/LecturerCourses.jsx'
import LecturerDashboard from '../pages/lecturer/LecturerDashboard.jsx'
import QuizEditor from '../pages/lecturer/QuizEditor.jsx'
import CourseDetails from '../pages/student/CourseDetails.jsx'
import LessonPage from '../pages/student/LessonPage.jsx'
import MyCourses from '../pages/student/MyCourses.jsx'
import QuizAttemptPage from '../pages/student/QuizAttemptPage.jsx'
import QuizDetails from '../pages/student/QuizDetails.jsx'
import StudentDashboard from '../pages/student/StudentDashboard.jsx'
import HomeRedirect from './HomeRedirect.jsx'
import ProtectedRoute from './ProtectedRoute.jsx'

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path={ROUTES.LOGIN} element={<LoginPage />} />
      <Route path={ROUTES.UNAUTHORIZED} element={<UnauthorizedPage />} />

      <Route element={<ProtectedRoute roles={[ROLES.STUDENT]} />}>
        <Route path="/student" element={<StudentLayout />}>
          <Route index element={<Navigate to={ROUTES.STUDENT_DASHBOARD} replace />} />
          <Route path="dashboard" element={<StudentDashboard />} />
          <Route path="courses" element={<MyCourses />} />
          <Route path="courses/:courseId" element={<CourseDetails />} />
          <Route path="lessons/:lessonId" element={<LessonPage />} />
          <Route path="quizzes/:assessmentId" element={<QuizDetails />} />
          <Route path="attempts/:attemptId" element={<QuizAttemptPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={[ROLES.LECTURER]} />}>
        <Route path="/lecturer" element={<LecturerLayout />}>
          <Route index element={<Navigate to={ROUTES.LECTURER_DASHBOARD} replace />} />
          <Route path="dashboard" element={<LecturerDashboard />} />
          <Route path="courses" element={<LecturerCourses />} />
          <Route path="courses/:courseId" element={<CourseManagement />} />
          <Route path="courses/:courseId/quizzes/new" element={<QuizEditor key="new" />} />
          <Route path="courses/:courseId/quizzes/:assessmentId" element={<QuizEditor key="edit" />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
