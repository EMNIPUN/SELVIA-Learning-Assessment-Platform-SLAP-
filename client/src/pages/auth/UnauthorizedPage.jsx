import { Link, useNavigate } from 'react-router'
import { ROLE_HOME, ROUTES } from '../../constants/routes.js'
import { useAuth } from '../../hooks/useAuth.js'

export default function UnauthorizedPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const home = user && ROLE_HOME[user.role]

  function handleLogout() {
    logout()
    navigate(ROUTES.LOGIN, { replace: true })
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Access restricted</h1>
        <p>
          {user
            ? 'This area is not available for your account.'
            : 'You need to log in to view this page.'}
        </p>
        {user && !home && (
          <p className="muted">The portal for your role is not available yet.</p>
        )}
        <div className="state-actions">
          {home && (
            <Link to={home} className="button button-primary">
              Go to my dashboard
            </Link>
          )}
          {user ? (
            <button type="button" className="button button-secondary" onClick={handleLogout}>
              Log out
            </button>
          ) : (
            <Link to={ROUTES.LOGIN} className="button button-primary">
              Log in
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
