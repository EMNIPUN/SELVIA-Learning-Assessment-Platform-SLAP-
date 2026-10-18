import { useEffect, useRef, useState } from 'react'
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
  // Prefer the API / Keycloak message when present (including 4xx exchange failures).
  if (error?.status >= 400 && error.status < 500 && error.message) return error.message
  if (error?.message && error.status == null) return error.message
  return getErrorMessage(error)
}

export default function LoginPage() {
  const {
    user,
    status,
    sessionMessage,
    login,
    loginWithKeycloak,
    allowLocalPasswordLogin,
    keycloakConfigured,
  } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [showLocal, setShowLocal] = useState(false)
  const [oidcPending, setOidcPending] = useState(false)
  const oidcHandled = useRef(false)

  // After Keycloak redirects back, finish the exchange once.
  useEffect(() => {
    if (!keycloakConfigured || oidcHandled.current || status === 'checking' || user) return undefined

    const params = new URLSearchParams(window.location.search)
    const hash = window.location.hash || ''
    const returningFromKeycloak =
      params.has('code') || params.has('state') || hash.includes('code=') || hash.includes('state=')

    if (!returningFromKeycloak) return undefined

    oidcHandled.current = true
    setOidcPending(true)
    setError(null)

    loginWithKeycloak()
      .then((loggedInUser) => {
        if (!loggedInUser) return
        navigate(destinationFor(loggedInUser, from), { replace: true })
      })
      .catch((err) => {
        setError(err)
        setOidcPending(false)
        oidcHandled.current = false
      })

    return undefined
  }, [keycloakConfigured, status, user, loginWithKeycloak, navigate, from])

  if (status === 'checking' || oidcPending) {
    return <LoadingState message={oidcPending ? 'Signing you in with SELVIA…' : 'Checking your session…'} />
  }
  if (user && !submitting) {
    return <Navigate to={destinationFor(user, from)} replace />
  }

  async function handleSelviaContinue() {
    setError(null)
    setSubmitting(true)
    try {
      const loggedInUser = await loginWithKeycloak()
      if (!loggedInUser) {
        // Browser is redirecting to Keycloak.
        return
      }
      navigate(destinationFor(loggedInUser, from), { replace: true })
    } catch (err) {
      setError(err)
      setSubmitting(false)
    }
  }

  async function handleLocalSubmit(event) {
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
    <div className="auth-landing">
      <div className="auth-landing__atmosphere" aria-hidden="true" />
      <div className="auth-landing__panel">
        <p className="auth-landing__eyebrow">Assessment platform</p>
        <h1 className="auth-landing__brand">
          <span className="auth-landing__brand-mark">SELVIA</span>
          <span className="auth-landing__brand-rest"> Learning</span>
        </h1>
        <p className="auth-landing__support">Use your SELVIA account to continue.</p>

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

        <button
          type="button"
          className="button button-primary auth-landing__cta"
          disabled={submitting || !keycloakConfigured}
          onClick={handleSelviaContinue}
        >
          {submitting ? 'Continuing…' : 'Continue with SELVIA'}
        </button>

        {!keycloakConfigured && (
          <p className="auth-landing__hint muted">Keycloak is not configured in this environment.</p>
        )}

        {allowLocalPasswordLogin && (
          <div className="auth-landing__local">
            <button
              type="button"
              className="auth-landing__local-toggle"
              onClick={() => setShowLocal((open) => !open)}
              aria-expanded={showLocal}
            >
              {showLocal ? 'Hide local login' : 'Local login (dev)'}
            </button>

            {showLocal && (
              <form className="form auth-landing__local-form" onSubmit={handleLocalSubmit} noValidate>
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

                <button type="submit" className="button button-secondary button-block" disabled={submitting}>
                  {submitting ? 'Logging in…' : 'Log in locally'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
