// Lesson content is untrusted: only absolute http(s) links without embedded credentials may be opened.
// Returns the normalised URL, or null when the value must not become a link.
export function toSafeExternalUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}
