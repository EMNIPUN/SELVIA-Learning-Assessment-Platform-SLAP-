import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { ROUTES } from '../constants/routes.js'
import { useAuth } from '../hooks/useAuth.js'

// Header, role navigation and main content area shared by each role's portal.
// `navItems` lists only pages that exist for that role.
export default function AppShell({ homeTo, tagline, navLabel, navItems }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate(ROUTES.LOGIN, { replace: true })
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link to={homeTo} className="brand">
            <span className="brand-name">SELVIA</span>
            <span className="brand-tagline">{tagline}</span>
          </Link>

          <nav className="app-nav" aria-label={navLabel}>
            {navItems.map(({ to, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}>
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="app-user">
            <span className="app-user-name">
              {user.firstName} {user.lastName}
            </span>
            <button type="button" className="button button-secondary button-small" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
