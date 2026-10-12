// User-facing text for a failed API request. Server-side error text is shown only for client errors (4xx),
// which the API words for end users; server errors never expose internal details.
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback
  if (error.status === 0) return 'Unable to reach the server. Check your connection and try again.'
  if (error.status === 401) return 'Your session has expired. Please log in again.'
  if (error.status === 403) return 'You do not have permission to view this.'
  if (error.status === 503) return 'The service is temporarily unavailable. Please try again later.'
  if (error.status >= 500) return 'The server encountered a problem. Please try again later.'
  if (error.status >= 400 && error.message) return error.message
  return fallback
}

// For a rejected change (create, update, delete). The API words its permission refusals for end users,
// for example that only a course's owner may change it, so they are shown as they are.
export function getActionErrorMessage(error) {
  if (error?.status === 403 && error.message) return error.message
  return getErrorMessage(error)
}
