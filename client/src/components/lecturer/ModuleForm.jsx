import EntityForm from './EntityForm.jsx'
import { sectionFormProps } from './sectionForm.js'

// Creates a module, or edits `module` and submits only the fields that changed.
export default function ModuleForm({ module, ...formProps }) {
  return (
    <EntityForm
      {...sectionFormProps({
        noun: 'module',
        parent: 'course',
        original: module,
      })}
      {...formProps}
    />
  )
}
