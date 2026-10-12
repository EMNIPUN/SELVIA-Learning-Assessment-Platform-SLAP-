import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { capitalize } from '../../utils/formatters.js'
import { getActionErrorMessage } from '../../utils/errorMessages.js'
import Dialog from '../Dialog.jsx'

// Asks for confirmation (`children` explains what will be deleted), then calls `remove()` and passes its result
// to `onDeleted`. If the API refuses,
// for example 409 because other records depend on the item, the dialog stays open with the reason and nothing
// is removed from the page. `onMissing` reports that the item no longer exists (404).
// Cancel comes first and the dialog cannot be dismissed while the request is in progress.
// `confirmLabel` replaces the default "Delete <Noun>" button text.
export default function ConfirmDeleteDialog({ noun, confirmLabel, remove, onDeleted, onMissing, onClose, children }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)
  const deletingRef = useRef(false)
  const alertRef = useRef(null)

  async function handleDelete() {
    if (deletingRef.current) return
    deletingRef.current = true
    setDeleting(true)
    setError(null)
    try {
      onDeleted(await remove())
    } catch (err) {
      if (err.status === 404) {
        onMissing()
        return
      }
      flushSync(() => {
        setError(err)
        setDeleting(false)
      })
      alertRef.current?.focus()
    } finally {
      deletingRef.current = false
    }
  }

  return (
    <Dialog title={`Delete ${noun}?`} onClose={onClose} busy={deleting} size="narrow">
      <div className="dialog-body">
        {children}
        {error && (
          <p ref={alertRef} className="alert alert-error" role="alert" tabIndex={-1}>
            The {noun} was not deleted. {getActionErrorMessage(error)}
          </p>
        )}
      </div>
      <div className="dialog-actions">
        <button type="button" className="button button-secondary" onClick={onClose} disabled={deleting}>
          Cancel
        </button>
        <button type="button" className="button button-danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Deleting…' : (confirmLabel ?? `Delete ${capitalize(noun)}`)}
        </button>
      </div>
    </Dialog>
  )
}
