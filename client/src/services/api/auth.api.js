import { apiRequest } from './client.js'

// Returns { user, token, tokenType, expiresIn }.
export function login(email, password) {
  return apiRequest('/auth/login', { method: 'POST', body: { email, password }, authenticated: false })
}

export async function getCurrentUser({ signal } = {}) {
  const { user } = await apiRequest('/auth/me', { signal })
  return user
}
