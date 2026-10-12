import { getToken } from '../../utils/tokenStorage.js'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

// Every failed request is reported as an ApiRequestError. `status` is 0 when the server could not be reached.
export class ApiRequestError extends Error {
  constructor(status, message, details) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.details = details
  }
}

let unauthorizedHandler = null

// Called when an authenticated request is rejected with 401 (expired or invalid token).
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
}

async function readJson(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

// `authenticated: false` sends no token, for endpoints such as login.
export async function apiRequest(path, { method = 'GET', body, signal, authenticated = true } = {}) {
  const token = authenticated ? getToken() : null
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiRequestError(0, 'Unable to reach the server')
  }

  const payload = await readJson(response)

  if (!response.ok) {
    if (response.status === 401 && token) {
      unauthorizedHandler?.()
    }
    // A response without the API's JSON error body comes from a proxy or gateway, not the API.
    const status = payload ? response.status : 0
    throw new ApiRequestError(status, payload?.message ?? 'Unable to reach the server', payload?.details)
  }

  return payload?.data
}
