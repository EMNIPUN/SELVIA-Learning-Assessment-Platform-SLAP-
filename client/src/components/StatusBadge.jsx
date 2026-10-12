import { formatEnumLabel } from '../utils/formatters.js'

// Displays a content status as the API returns it (DRAFT, UNDER_REVIEW, APPROVED, PUBLISHED, ARCHIVED).
export default function StatusBadge({ status }) {
  if (!status) return null
  return <span className={`badge badge-${status.toLowerCase()}`}>{formatEnumLabel(status)}</span>
}
