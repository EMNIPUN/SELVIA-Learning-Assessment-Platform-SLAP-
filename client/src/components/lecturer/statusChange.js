import { CONTENT_STATUS } from '../../constants/contentStatus.js'
import { formatEnumLabel } from '../../utils/formatters.js'

const { DRAFT, UNDER_REVIEW, APPROVED, PUBLISHED, ARCHIVED } = CONTENT_STATUS

const listFormat = new Intl.ListFormat('en', { type: 'conjunction' })

// The API lets a course's owner set any status it accepts for an item, in any order (AI-generated content must
// be Under review before it can be approved or published). These name the choices; they are not the steps of
// an enforced workflow.
export const STATUS_ACTIONS = {
  [DRAFT]: 'Return to draft',
  [UNDER_REVIEW]: 'Submit for review',
  [APPROVED]: 'Approve',
  [PUBLISHED]: 'Publish',
  [ARCHIVED]: 'Archive',
}

const QUESTIONS = {
  [DRAFT]: (noun) => `Return this ${noun} to draft?`,
  [UNDER_REVIEW]: (noun) => `Submit this ${noun} for review?`,
  [APPROVED]: (noun) => `Approve this ${noun}?`,
  [PUBLISHED]: (noun) => `Publish this ${noun}?`,
  [ARCHIVED]: (noun) => `Archive this ${noun}?`,
}

export const confirmQuestion = (status, noun) => QUESTIONS[status](noun)

export const confirmLabel = (status, noun) =>
  status === PUBLISHED || status === ARCHIVED ? `${STATUS_ACTIONS[status]} ${noun}` : STATUS_ACTIONS[status]

// Changes that alter what students can see are confirmed before they are sent.
export function needsConfirmation(current, next) {
  return next === PUBLISHED || next === ARCHIVED || current === PUBLISHED
}

// What setting an item to `next` does, as the API implements it.
// `ancestors`: the items above it, nearest last, as [{ noun, name, status }]. `contains`: what is inside it, for
// example "its topics, concepts and lessons". `hiddenNote`: what else students lose while it is not published.
// Students see an item only while it and everything above it are published; statuses never cascade.
export function statusEffect(next, { noun, ancestors = [], contains, hiddenNote }) {
  if (next === PUBLISHED) {
    const above = ancestors.map((ancestor) => ancestor.noun)
    const visibility =
      above.length > 0
        ? `Students can see this ${noun} while its ${listFormat.format(above)} ${above.length === 1 ? 'is' : 'are'} published too.`
        : `Students can see this ${noun} while it is published.`
    const children = contains
      ? ` Publishing does not change the status of ${contains}: each one is shown to students only once it is published itself.`
      : ''
    return visibility + children
  }

  const hidden = `Students will not see this ${noun}${contains ? ` or ${contains}` : ''}.`
  const note = hiddenNote ? ` ${hiddenNote}` : ''
  if (next === ARCHIVED) return `${hidden} Nothing is deleted, and its status can be changed again later.${note}`
  if (next === APPROVED) return `${hidden} It is marked as checked and ready to publish.${note}`
  if (next === UNDER_REVIEW) return `${hidden} It is marked as ready to be checked. Any earlier approval is cleared.${note}`
  return `${hidden} Use this while it is being written or revised.${note}`
}

// Based on the statuses shown on the page: which items above this one still keep it from students.
export function publishVisibilityNote(ancestors = []) {
  const blockers = ancestors.filter((ancestor) => ancestor.status !== PUBLISHED)
  if (blockers.length > 0) {
    const reasons = blockers.map((ancestor) => `the ${ancestor.noun} "${ancestor.name}" is ${formatEnumLabel(ancestor.status)}`)
    return `Students will not see it yet, because ${listFormat.format(reasons)}.`
  }
  return ancestors.length > 0 ? 'Everything above it is published, so students will see it once it is published.' : null
}

// "3 practice exercises: 2 Draft, 1 Published", in lifecycle order.
export function statusSummary(items, { noun, plural }) {
  const counts = Object.values(CONTENT_STATUS)
    .map((status) => [status, items.filter((item) => item.status === status).length])
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${formatEnumLabel(status)}`)
  return `${items.length} ${items.length === 1 ? noun : plural}: ${counts.join(', ')}`
}
