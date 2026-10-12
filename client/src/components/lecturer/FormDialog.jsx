import { useState } from 'react'
import { useApiRequest } from '../../hooks/useApiRequest.js'
import Dialog from '../Dialog.jsx'
import ErrorState from '../ErrorState.jsx'
import LoadingState from '../LoadingState.jsx'

// A create or edit form in a dialog. `save(fields)` sends the request and `onSaved(record)` receives the record
// the API returns. Other failures are shown by the form, which keeps the entered values.
// With `load(signal)` the current version of the record is loaded first, so an edit never starts from a stale
// list entry, and `renderForm(record, formProps)` receives it. `onMissing` reports that the record no longer
// exists (404), when loading or when saving.
export default function FormDialog({ title, noun, size, load, save, onSaved, onMissing, onClose, renderForm }) {
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(fields) {
    let saved
    try {
      saved = await save(fields)
    } catch (err) {
      if (err.status !== 404 || !onMissing) throw err
      onMissing()
      return
    }
    onSaved(saved)
  }

  const formProps = { onSubmit: handleSubmit, onCancel: onClose, onSubmittingChange: setSubmitting }

  return (
    <Dialog title={title} onClose={onClose} busy={submitting} size={size}>
      {load ? (
        <LoadedRecord
          noun={noun}
          load={load}
          onMissing={onMissing}
          onClose={onClose}
          render={(record) => renderForm(record, formProps)}
        />
      ) : (
        renderForm(undefined, formProps)
      )}
    </Dialog>
  )
}

// Loads the current version of a record with `load(signal)` and passes it to `render(record)`; a 404 is reported
// through `onMissing`.
export function LoadedRecord({ noun, load, onMissing, onClose, render }) {
  const { data, error, loading, reload } = useApiRequest(
    (signal) =>
      load(signal).catch((err) => {
        if (err.status === 404) onMissing?.()
        throw err
      }),
    [],
  )

  if (loading) return <LoadingState message={`Loading ${noun}…`} />
  if (error) {
    return (
      <ErrorState error={error} title={`Could not load this ${noun}`} onRetry={reload}>
        <button type="button" className="button button-secondary" onClick={onClose}>
          Close
        </button>
      </ErrorState>
    )
  }
  return render(data)
}
