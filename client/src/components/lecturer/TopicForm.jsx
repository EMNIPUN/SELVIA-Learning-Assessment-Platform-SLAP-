import EntityForm from './EntityForm.jsx'
import { sectionFormProps } from './sectionForm.js'

// Creates a topic, or edits `topic` and submits only the fields that changed.
export default function TopicForm({ topic, ...formProps }) {
  return (
    <EntityForm
      {...sectionFormProps({
        noun: 'topic',
        parent: 'module',
        original: topic,
      })}
      {...formProps}
    />
  )
}
