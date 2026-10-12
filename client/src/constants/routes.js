import { ROLES } from './roles.js'

export const ROUTES = Object.freeze({
  LOGIN: '/login',
  UNAUTHORIZED: '/unauthorized',
  STUDENT_DASHBOARD: '/student/dashboard',
  STUDENT_COURSES: '/student/courses',
  studentCourse: (courseId) => `/student/courses/${courseId}`,
  studentLesson: (lessonId) => `/student/lessons/${lessonId}`,
  LECTURER_DASHBOARD: '/lecturer/dashboard',
  LECTURER_COURSES: '/lecturer/courses',
  lecturerCourse: (courseId) => `/lecturer/courses/${courseId}`,
})

// Where each role lands after logging in. Roles without a portal yet have no entry.
export const ROLE_HOME = Object.freeze({
  [ROLES.STUDENT]: ROUTES.STUDENT_DASHBOARD,
  [ROLES.LECTURER]: ROUTES.LECTURER_DASHBOARD,
})
