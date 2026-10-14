import { availabilityBadge } from './studentQuizStatus.js'

export default function QuizAvailabilityBadge({ availability }) {
  const badge = availabilityBadge(availability)
  if (!badge) return null
  return <span className={`badge ${badge.className}`}>{badge.label}</span>
}
