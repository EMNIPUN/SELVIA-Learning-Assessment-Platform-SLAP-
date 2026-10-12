// "module" → "Module"
export function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// "WORKED_EXAMPLE" → "Worked example"
export function formatEnumLabel(value) {
  if (!value) return ''
  return capitalize(value.toLowerCase().replaceAll('_', ' '))
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

// ISO timestamp → "6 Oct 2026, 10:41" in the student's locale and time zone.
export function formatDateTime(isoString) {
  return DATE_TIME_FORMAT.format(new Date(isoString))
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function formatFileSize(bytes) {
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < SIZE_UNITS.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${unit === 0 ? size : size.toFixed(1)} ${SIZE_UNITS[unit]}`
}
