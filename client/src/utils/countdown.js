// Countdowns to a server deadline. The server reports how many seconds remain; that is turned into a deadline on
// the monotonic performance.now() clock, so neither the device's wrong time nor a clock change moves it. These
// times are only for display: the server alone decides when an attempt ends.

export const LOW_TIME_SECONDS = 5 * 60
export const CRITICAL_TIME_SECONDS = 60

// Replies can differ from each other by a second or so (rounding, network delay); smaller differences are ignored
// so the countdown does not jump back and forth.
const RECONCILE_TOLERANCE_MS = 2000

export const anchorDeadline = (remainingSeconds, receivedAt = performance.now()) => receivedAt + remainingSeconds * 1000

export const secondsLeft = (deadline, now = performance.now()) => Math.max(0, Math.ceil((deadline - now) / 1000))

export function reconcileDeadline(current, candidate) {
  if (current == null) return candidate
  return Math.abs(candidate - current) > RECONCILE_TOLERANCE_MS ? candidate : current
}

export const COUNTDOWN_STAGE = Object.freeze({ NORMAL: 'normal', LOW: 'low', CRITICAL: 'critical', OVER: 'over' })

export function countdownStage(seconds) {
  if (seconds <= 0) return COUNTDOWN_STAGE.OVER
  if (seconds <= CRITICAL_TIME_SECONDS) return COUNTDOWN_STAGE.CRITICAL
  if (seconds <= LOW_TIME_SECONDS) return COUNTDOWN_STAGE.LOW
  return COUNTDOWN_STAGE.NORMAL
}

const pad = (value) => String(value).padStart(2, '0')

// 75 → "1:15", 3725 → "1:02:05".
export function formatCountdown(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}
