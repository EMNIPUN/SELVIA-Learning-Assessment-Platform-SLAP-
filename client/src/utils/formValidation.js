// Client-side checks with the same rules and wording as the API's validation. Each returns an error
// message, or undefined when the value is acceptable. The API stays the final authority.

export const TITLE_MAX_LENGTH = 200
export const DESCRIPTION_MAX_LENGTH = 5000

export function checkRequiredText(value, label, maxLength) {
  const text = value.trim()
  if (!text) return `${label} is required`
  if (text.length > maxLength) return `${label} must be at most ${maxLength} characters`
}

// Markdown keeps its whitespace, so the limit applies to the text as entered.
export function checkRequiredRichText(value, label, maxLength) {
  if (!value.trim()) return `${label} is required`
  if (value.length > maxLength) return `${label} must be at most ${maxLength} characters`
}

export function checkOptionalText(value, label, maxLength) {
  if (value.trim().length > maxLength) return `${label} must be at most ${maxLength} characters`
}

// Code keeps its whitespace too, so its limit also applies to the text as entered.
export function checkOptionalRichText(value, label, maxLength) {
  if (value.length > maxLength) return `${label} must be at most ${maxLength} characters`
}

// Codes are stored in upper case, so lower-case letters are accepted.
export function checkCode(value, label, maxLength) {
  const error = checkRequiredText(value, label, maxLength)
  if (error) return error
  if (!/^[A-Za-z0-9-]+$/.test(value.trim())) return `${label} may only contain letters, numbers and hyphens`
}

export function checkWholeNumber(value, label, { min, max, required = false }) {
  const text = value.trim()
  if (!text) return required ? `${label} is required` : undefined
  if (!/^\d+$/.test(text)) return `${label} must be a whole number`
  const number = Number(text)
  if (number < min || number > max) return `${label} must be between ${min} and ${max}`
}

const URL_MAX_LENGTH = 2048

// Links are opened by students, so a URL carrying a user name or password is refused here as well.
export function checkHttpUrl(value, label) {
  const text = value.trim()
  if (!text) return `${label} is required`
  if (text.length > URL_MAX_LENGTH) return `${label} must be at most ${URL_MAX_LENGTH} characters`
  let url
  try {
    url = new URL(text)
  } catch {
    return `${label} must be a valid http or https URL`
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return `${label} must be a valid http or https URL`
  if (url.username || url.password) return `${label} must not contain a user name or password`
}

const DECIMAL_PATTERN = /^[-+]?(\d+(\.\d*)?|\.\d+)$/

// A number with at most 2 decimal places between `min` and `max`; `exclusiveMin` refuses `min` itself.
export function checkDecimal(value, label, { min, max, exclusiveMin = false, required = false }) {
  const text = value.trim()
  if (!text) return required ? `${label} is required` : undefined
  if (!DECIMAL_PATTERN.test(text)) return `${label} must be a number`
  const number = Number(text)
  if (exclusiveMin ? number <= min : number < min) return `${label} must be ${exclusiveMin ? 'greater than' : 'at least'} ${min}`
  if (number > max) return `${label} must be at most ${max}`
  if (/\.\d{3,}$/.test(text)) return `${label} can have at most 2 decimal places`
}

// The value of a datetime-local input ("2026-10-20T08:00"), which browsers without one leave as typed text.
export function checkDateTime(value, label) {
  const text = value.trim()
  if (!text) return undefined
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(text) || Number.isNaN(new Date(text).getTime())) {
    return `${label} must be a date and time`
  }
}

export function checkOneOf(value, allowed, message) {
  if (!allowed.includes(value)) return message
}

// { field: message | undefined } → only the fields that have an error.
export function collectErrors(checks) {
  return Object.fromEntries(Object.entries(checks).filter(([, message]) => message))
}

// A blank optional field is sent as null, which clears it.
export const textOrNull = (value) => value.trim() || null
export const richTextOrNull = (value) => (value.trim() ? value : null)
export const numberOrNull = (value) => (value.trim() ? Number(value.trim()) : null)
