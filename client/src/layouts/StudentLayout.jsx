import { ROUTES } from '../constants/routes.js'
import AppShell from './AppShell.jsx'

const NAV_ITEMS = [
  { to: ROUTES.STUDENT_DASHBOARD, label: 'Dashboard' },
  { to: ROUTES.STUDENT_COURSES, label: 'My Courses' },
]

export default function StudentLayout() {
  return <AppShell homeTo={ROUTES.STUDENT_DASHBOARD} tagline="Student" navLabel="Student navigation" navItems={NAV_ITEMS} />
}
