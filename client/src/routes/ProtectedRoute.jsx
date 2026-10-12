import { Navigate, Outlet, useLocation } from 'react-router'
import LoadingState from '../components/LoadingState.jsx'
import { ROUTES } from '../constants/routes.js'
import { useAuth } from '../hooks/useAuth.js'

// Renders child routes only for an authenticated user whose role is in `roles`.
// The API enforces the same rules; this only keeps users out of screens they cannot use.
export default function ProtectedRoute({ roles }) {
  const { user, status } = useAuth()
  const location = useLocation()

  if (status === 'checking') {
    return <LoadingState message="Checking your session…" />
  }
  if (!user) {
    const state = status === 'signedOut' ? undefined : { from: location.pathname }
    return <Navigate to={ROUTES.LOGIN} replace state={state} />
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={ROUTES.UNAUTHORIZED} replace />
  }
  return <Outlet />
}
