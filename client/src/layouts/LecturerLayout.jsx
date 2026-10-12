import { ROUTES } from '../constants/routes.js'
import AppShell from './AppShell.jsx'

const NAV_ITEMS = [
  { to: ROUTES.LECTURER_DASHBOARD, label: 'Dashboard' },
  { to: ROUTES.LECTURER_COURSES, label: 'Courses' },
]

export default function LecturerLayout() {
  return (
    <AppShell homeTo={ROUTES.LECTURER_DASHBOARD} tagline="Lecturer" navLabel="Lecturer navigation" navItems={NAV_ITEMS} />
  )
}
