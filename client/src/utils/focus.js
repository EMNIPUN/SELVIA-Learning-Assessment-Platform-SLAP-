// Scrolls an element into view and moves keyboard focus to it, so keyboard and screen reader users follow
// the move. Non-interactive targets need tabIndex={-1}.
export function focusById(id) {
  const element = document.getElementById(id)
  if (!element) return
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  element.focus({ preventScroll: true })
}
