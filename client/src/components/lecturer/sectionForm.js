import { checkRequiredText, collectErrors, TITLE_MAX_LENGTH } from '../../utils/formValidation.js'
import {
  descriptionField,
  sequenceOrderField,
  sharedChecks,
  sharedInitialValues,
  sharedRequestFields,
} from './structureFields.js'

// Modules and topics have the same editable fields: title, description and sequenceOrder.
// Returns the EntityForm props for creating (no `original`) or editing one.
export function sectionFormProps({ noun, parent, original }) {
  const editing = Boolean(original)
  return {
    noun,
    fields: [
      { name: 'title', label: 'Title', required: true, maxLength: TITLE_MAX_LENGTH },
      descriptionField,
      sequenceOrderField({ editing, siblings: noun, parent }),
    ],
    initialValues: () => ({ title: original?.title ?? '', ...sharedInitialValues(original) }),
    validate: (values) =>
      collectErrors({
        title: checkRequiredText(values.title, 'Title', TITLE_MAX_LENGTH),
        ...sharedChecks(values, editing),
      }),
    toFields: (values) => ({ title: values.title.trim(), ...sharedRequestFields(values) }),
    original,
  }
}
