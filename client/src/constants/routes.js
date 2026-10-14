import { ROLES } from './roles.js'

export const ROUTES = Object.freeze({
  LOGIN: '/login',
  UNAUTHORIZED: '/unauthorized',
  STUDENT_DASHBOARD: '/student/dashboard',
  STUDENT_COURSES: '/student/courses',
  studentCourse: (courseId) => `/student/courses/${courseId}`,
  studentLesson: (lessonId) => `/student/lessons/${lessonId}`,
  studentQuiz: (assessmentId) => `/student/quizzes/${assessmentId}`,
  studentAttempt: (attemptId) => `/student/attempts/${attemptId}`,
  LECTURER_DASHBOARD: '/lecturer/dashboard',
  LECTURER_COURSES: '/lecturer/courses',
  lecturerCourse: (courseId) => `/lecturer/courses/${courseId}`,
  lecturerNewQuiz: (courseId) => `/lecturer/courses/${courseId}/quizzes/new`,
  lecturerQuiz: (courseId, assessmentId) => `/lecturer/courses/${courseId}/quizzes/${assessmentId}`,
})

// Where each role lands after logging in. Roles without a portal yet have no entry.
export const ROLE_HOME = Object.freeze({
  [ROLES.STUDENT]: ROUTES.STUDENT_DASHBOARD,
  [ROLES.LECTURER]: ROUTES.LECTURER_DASHBOARD,
})
