import { useEffect, useState } from 'react'
import { COUNTDOWN_STAGE, countdownStage, formatCountdown, secondsLeft } from '../utils/countdown.js'

// How often the display is redrawn. It is recomputed from the deadline each time, so a throttled background tab
// shows the right time again as soon as it redraws. Nothing is requested from the server.
const REDRAW_MS = 500

// Announced once each, when the stage is reached; the ticking time itself is not read out.
const STAGE_ANNOUNCEMENTS = {
  [COUNTDOWN_STAGE.NORMAL]: '',
  [COUNTDOWN_STAGE.LOW]: 'Less than 5 minutes left.',
  [COUNTDOWN_STAGE.CRITICAL]: 'Less than 1 minute left.',
  [COUNTDOWN_STAGE.OVER]: 'Time is up.',
}

// The time left until `deadline` (performance.now() milliseconds). `onTimeUp` is called once it reaches zero;
// that only means the local estimate has run out, not that the server has closed the attempt.
export default function AttemptCountdown({ deadline, onTimeUp }) {
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(performance.now()), REDRAW_MS)
    return () => clearInterval(interval)
  }, [])

  const seconds = secondsLeft(deadline, now)
  const stage = countdownStage(seconds)
  const over = stage === COUNTDOWN_STAGE.OVER

  useEffect(() => {
    if (over) onTimeUp()
  }, [over, onTimeUp])

  return (
    <div className={`attempt-countdown attempt-countdown-${stage}`}>
      <span className="attempt-countdown-label">Time left</span>
      <span className="attempt-countdown-time" role="timer">
        {formatCountdown(seconds)}
      </span>
      {stage === COUNTDOWN_STAGE.LOW && <span className="attempt-countdown-note">Less than 5 minutes left</span>}
      {stage === COUNTDOWN_STAGE.CRITICAL && <span className="attempt-countdown-note">Less than 1 minute left</span>}
      <span className="visually-hidden" aria-live="assertive">
        {STAGE_ANNOUNCEMENTS[stage]}
      </span>
    </div>
  )
}
