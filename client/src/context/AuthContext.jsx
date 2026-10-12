import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import * as authApi from '../services/api/auth.api.js'
import { setUnauthorizedHandler } from '../services/api/client.js'
import { getErrorMessage } from '../utils/errorMessages.js'
import { clearToken, getToken, setToken } from '../utils/tokenStorage.js'

export const AuthContext = createContext(null)

const SESSION_EXPIRED = 'Your session has expired. Please log in again.'

// status: 'checking' while a stored token is being verified, then 'authenticated' or 'anonymous'.
// 'signedOut' is 'anonymous' after an explicit logout, so the previous page is not offered after the next login.
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
        // The token may still be valid; it is kept so the next login attempt can replace it.
        setStatus('anonymous')
        setSessionMessage(getErrorMessage(err))
      })
    return () => controller.abort()
  }, [endSession])

  const login = useCallback(async (email, password) => {
    const { user: loggedInUser, token } = await authApi.login(email, password)
    setToken(token)
    setUser(loggedInUser)
    setStatus('authenticated')
    setSessionMessage(null)
    return loggedInUser
  }, [])

  const logout = useCallback(() => endSession(null, 'signedOut'), [endSession])

  const value = useMemo(
    () => ({ user, status, sessionMessage, login, logout }),
    [user, status, sessionMessage, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
