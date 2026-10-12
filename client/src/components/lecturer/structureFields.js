import { checkOptionalText, checkWholeNumber, DESCRIPTION_MAX_LENGTH, textOrNull } from '../../utils/formValidation.js'

// Fields shared by the course, module, topic and concept forms, with the API's limits.
// Status is not part of any form: new items start as drafts and the status dialog changes it.

const MIN_SEQUENCE_ORDER = 1
const MAX_SEQUENCE_ORDER = 1000

export const descriptionField = {
  name: 'description',
  label: 'Description',
  type: 'textarea',
  maxLength: DESCRIPTION_MAX_LENGTH,
  hint: `Optional. Up to ${DESCRIPTION_MAX_LENGTH.toLocaleString()} characters.`,
}

// The API gives a new item the next free position when no sequence order is sent. An existing item always
// has one, so it cannot be cleared.
export const sequenceOrderField = ({ editing, siblings, parent }) => ({
  name: 'sequenceOrder',
  label: 'Sequence order',
  required: editing,
  inputMode: 'numeric',
  hint: editing
    ? `A whole number from ${MIN_SEQUENCE_ORDER} to ${MAX_SEQUENCE_ORDER}. Each ${siblings} in this ${parent} needs a different number.`
    : `Optional. A whole number from ${MIN_SEQUENCE_ORDER} to ${MAX_SEQUENCE_ORDER}. Leave blank to add it at the end.`,
  row: 'settings',
})

// Values, checks and request fields for description and sequenceOrder.

export function sharedInitialValues(original) {
  return {
    description: original?.description ?? '',
    sequenceOrder: original?.sequenceOrder == null ? '' : String(original.sequenceOrder),
  }
}

export function sharedChecks(values, editing) {
  return {
    description: checkOptionalText(values.description, 'Description', DESCRIPTION_MAX_LENGTH),
    sequenceOrder: checkSequenceOrder(values.sequenceOrder, editing),
  }
}

export function sharedRequestFields(values) {
  return {
    description: textOrNull(values.description),
    sequenceOrder: sequenceOrderOrUndefined(values.sequenceOrder),
  }
}

export function checkSequenceOrder(value, editing) {
  return checkWholeNumber(value, 'Sequence order', {
    min: MIN_SEQUENCE_ORDER,
    max: MAX_SEQUENCE_ORDER,
    required: editing,
  })
}

// A blank sequence order is not sent, so the API places a new item at the end.
export function sequenceOrderOrUndefined(value) {
  const text = value.trim()
  return text ? Number(text) : undefined
}
