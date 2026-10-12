import { checkCode, checkRequiredText, collectErrors, TITLE_MAX_LENGTH } from '../../utils/formValidation.js'
import EntityForm from './EntityForm.jsx'
import {
  descriptionField,
  sequenceOrderField,
  sharedChecks,
  sharedInitialValues,
  sharedRequestFields,
} from './structureFields.js'

const CODE_MAX_LENGTH = 100

function fields(editing) {
  return [
    {
      name: 'code',
      label: 'Concept code',
      required: true,
      maxLength: CODE_MAX_LENGTH,
      spellCheck: false,
      hint: 'Letters, numbers and hyphens, for example SE3010-RECURSION. Saved in capitals. No two concepts can share a code, in any course.',
    },
    {
      name: 'name',
      label: 'Name',
      required: true,
      maxLength: TITLE_MAX_LENGTH,
      hint: 'Each concept in a topic needs a different name.',
    },
    descriptionField,
    sequenceOrderField({ editing, siblings: 'concept', parent: 'topic' }),
  ]
}

function validate(values, editing) {
  return collectErrors({
    code: checkCode(values.code, 'Concept code', CODE_MAX_LENGTH),
    name: checkRequiredText(values.name, 'Name', TITLE_MAX_LENGTH),
    ...sharedChecks(values, editing),
  })
}

function toFields(values) {
  return { code: values.code.trim().toUpperCase(), name: values.name.trim(), ...sharedRequestFields(values) }
}

// Creates a concept, or edits `concept` and submits only the fields that changed.
export default function ConceptForm({ concept, ...formProps }) {
  const editing = Boolean(concept)
  return (
    <EntityForm
      noun="concept"
      fields={fields(editing)}
      initialValues={() => ({ code: concept?.code ?? '', name: concept?.name ?? '', ...sharedInitialValues(concept) })}
      validate={(values) => validate(values, editing)}
      toFields={toFields}
      original={concept}
      {...formProps}
    />
  )
}
