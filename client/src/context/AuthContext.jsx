import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import {
  beginKeycloakLogin,
  isKeycloakConfigured,
  keycloakLogoutUrl,
  takeKeycloakAuthCode,
} from '../auth/keycloak.js'
import * as authApi from '../services/api/auth.api.js'
import { setUnauthorizedHandler } from '../services/api/client.js'
import { getErrorMessage } from '../utils/errorMessages.js'
import { clearToken, getToken, setToken } from '../utils/tokenStorage.js'

export const AuthContext = createContext(null)

const SESSION_EXPIRED = 'Your session has expired. Please log in again.'
const ALLOW_LOCAL_PASSWORD_LOGIN = import.meta.env.VITE_ALLOW_LOCAL_PASSWORD_LOGIN === 'true'

function asClientError(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(() => (getToken() ? 'checking' : 'anonymous'))
  const [sessionMessage, setSessionMessage] = useState(null)

  const endSession = useCallback((message = null, nextStatus = 'anonymous') => {
    clearToken()
    setUser(null)
    setStatus(nextStatus)
    setSessionMessage(message)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => endSession(SESSION_EXPIRED))
    return () => setUnauthorizedHandler(null)
  }, [endSession])

  useEffect(() => {
    if (!getToken()) return undefined

    const controller = new AbortController()
    authApi
      .getCurrentUser({ signal: controller.signal })
      .then((currentUser) => {
        setUser(currentUser)
        setStatus('authenticated')
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        if (err.status === 401) {
          endSession(SESSION_EXPIRED)
          return
        }
        setStatus('anonymous')
        setSessionMessage(getErrorMessage(err))
      })
    return () => controller.abort()
  }, [endSession])

  const applySession = useCallback((loggedInUser, token) => {
    setToken(token)
    setUser(loggedInUser)
    setStatus('authenticated')
    setSessionMessage(null)
    return loggedInUser
  }, [])

  const login = useCallback(
    async (email, password) => {
      const { user: loggedInUser, token } = await authApi.login(email, password)
      return applySession(loggedInUser, token)
    },
    [applySession],
  )

  /**
   * Starts Keycloak OIDC (PKCE redirect) or completes the callback by exchanging
   * the authorization code on the SLAP API (no browser→Keycloak token CORS).
   * Returns null when a browser redirect to Keycloak is in progress.
   */
  const loginWithKeycloak = useCallback(async () => {
    if (!isKeycloakConfigured()) {
      throw asClientError('Keycloak is not configured for this app')
    }

    let callback
    try {
      callback = takeKeycloakAuthCode()
    } catch (err) {
      throw asClientError(err.message || 'SELVIA sign-in failed')
    }

    if (!callback) {
      await beginKeycloakLogin()
      return null
    }

    const { user: loggedInUser, token } = await authApi.loginWithKeycloakCode(callback)
    return applySession(loggedInUser, token)
  }, [applySession])

  const logout = useCallback(() => {
    endSession(null, 'signedOut')
    window.location.assign(keycloakLogoutUrl())
  }, [endSession])

  const value = useMemo(
    () => ({
      user,
      status,
      sessionMessage,
      login,
      loginWithKeycloak,
      logout,
      allowLocalPasswordLogin: ALLOW_LOCAL_PASSWORD_LOGIN,
      keycloakConfigured: isKeycloakConfigured(),
    }),
    [user, status, sessionMessage, login, loginWithKeycloak, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
