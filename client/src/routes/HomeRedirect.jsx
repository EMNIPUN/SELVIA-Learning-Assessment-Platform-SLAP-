import { Navigate } from 'react-router'
import LoadingState from '../components/LoadingState.jsx'
import { ROLE_HOME, ROUTES } from '../constants/routes.js'
import { useAuth } from '../hooks/useAuth.js'

export default function HomeRedirect() {
  const { user, status } = useAuth()

  if (status === 'checking') {
    return <LoadingState message="Checking your session…" />
  }
  if (!user) {
    return <Navigate to={ROUTES.LOGIN} replace />
  }
  return <Navigate to={ROLE_HOME[user.role] ?? ROUTES.UNAUTHORIZED} replace />
}
