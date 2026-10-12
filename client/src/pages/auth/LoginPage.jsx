import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import LoadingState from '../../components/LoadingState.jsx'
import { ROLE_HOME, ROUTES } from '../../constants/routes.js'
import { useAuth } from '../../hooks/useAuth.js'
import { getErrorMessage } from '../../utils/errorMessages.js'

// Returns to the page that sent the user here when it belongs to their own area.
function destinationFor(user, from) {
  const home = ROLE_HOME[user.role]
  if (!home) return ROUTES.UNAUTHORIZED
  const area = home.split('/').slice(0, 2).join('/')
  return from?.startsWith(`${area}/`) ? from : home
}

function loginErrorMessage(error) {
  // Login failures (wrong credentials, deactivated account, invalid input) are worded for users by the API.
  if (error.status >= 400 && error.status < 500 && error.message) return error.message
  return getErrorMessage(error)
}

export default function LoginPage() {
  const { user, status, sessionMessage, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'checking') {
    return <LoadingState message="Checking your session…" />
  }
  if (user && !submitting) {
    return <Navigate to={destinationFor(user, from)} replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const loggedInUser = await login(email.trim(), password)
      navigate(destinationFor(loggedInUser, from), { replace: true })
    } catch (err) {
      setError(err)
      setSubmitting(false)
    }
  }

  const fieldErrors = Object.fromEntries((error?.details ?? []).map((detail) => [detail.field, detail.message]))

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-name">SELVIA</span>
          <p className="auth-subtitle">External Education &amp; Assessment Platform</p>
        </div>

        <h1 className="auth-title">Log in</h1>

        {sessionMessage && !error && (
          <p className="alert alert-info" role="status">
            {sessionMessage}
          </p>
        )}
        {error && (
          <p className="alert alert-error" role="alert">
            {loginErrorMessage(error)}
          </p>
        )}

        <form className="form" onSubmit={handleSubmit} noValidate>
          <label className="form-field">
            <span className="form-label">Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(fieldErrors.email)}
              required
            />
            {fieldErrors.email && <span className="form-error">{fieldErrors.email}</span>}
          </label>

          <label className="form-field">
            <span className="form-label">Password</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
              required
            />
            {fieldErrors.password && <span className="form-error">{fieldErrors.password}</span>}
          </label>

          <button type="submit" className="button button-primary button-block" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  )
}
