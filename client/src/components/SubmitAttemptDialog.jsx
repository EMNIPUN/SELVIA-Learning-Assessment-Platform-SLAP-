import { useId, useRef, useState } from 'react'
import { getActionErrorMessage } from '../utils/errorMessages.js'
import Dialog from './Dialog.jsx'

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

// The submit request may have reached the server even though no reply came back.
function SubmitError({ error, alertRef, onRefresh }) {
  const unconfirmed = error.status === 0
  const retryable = unconfirmed || error.status >= 500
  return (
    <div ref={alertRef} className="alert alert-error attempt-alert" role="alert" tabIndex={-1}>
      <p>
        {unconfirmed ? 'Your submission could not be confirmed.' : 'Your attempt was not submitted.'}{' '}
        {getActionErrorMessage(error)}
      </p>
      {retryable && <p>Submitting again is safe: an attempt that has already been submitted is not changed.</p>}
      <div>
        <button type="button" className="button button-secondary button-small" onClick={onRefresh}>
          Check the attempt’s status
        </button>
      </div>
    </div>
  )
}

// Confirms submitting an open attempt. The counts are the server's: `answeredCount` is how many questions it holds
// an answer for. `save` is the answer queue's snapshot; while it is saving, submitting waits, and answers it could
// not save are only left out after the student has explicitly agreed, for exactly that many questions.
// `onConfirm(acknowledgedUnsaved)` submits. The dialog cannot be dismissed while the submission is running.
export default function SubmitAttemptDialog({
  questionCount,
  answeredCount,
  save,
  submitting,
  error,
  alertRef,
  onRetrySaves,
  onConfirm,
  onRefresh,
  onClose,
}) {
  const [acknowledgedCount, setAcknowledgedCount] = useState(0)
  const acknowledgeId = useId()
  const saveStatusRef = useRef(null)

  const saving = !save.idle
  const unsavedCount = saving ? 0 : save.unsavedCount
  const acknowledged = unsavedCount > 0 && acknowledgedCount === unsavedCount
  const unansweredCount = Math.max(0, questionCount - answeredCount)
  const canSubmit = !submitting && !saving && (unsavedCount === 0 || acknowledged)

  let submitLabel = 'Submit attempt'
  if (submitting) submitLabel = 'Submitting…'
  else if (saving) submitLabel = 'Saving answers…'
  else if (unsavedCount > 0) submitLabel = 'Submit anyway'

  // The warning, with this button, is hidden while saving, so focus moves to the save status to stay in the dialog.
  function retrySaves() {
    saveStatusRef.current?.focus()
    onRetrySaves()
  }

  return (
    <Dialog title="Submit this attempt?" onClose={onClose} busy={submitting} size="narrow">
      <div className="dialog-body">
        <p>
          The server has your answers to {answeredCount} of {plural(questionCount, 'question')}.
          {unansweredCount > 0 &&
            ` ${plural(unansweredCount, 'question')} ${unansweredCount === 1 ? 'has' : 'have'} no answer and will be submitted unanswered.`}
        </p>
        <p>Once you submit, the attempt is closed and your answers cannot be changed.</p>

        <p ref={saveStatusRef} className="attempt-save-summary" role="status" aria-live="polite" tabIndex={-1}>
          {saving ? 'Saving your latest answers…' : unsavedCount === 0 ? 'All your answers are saved.' : ''}
        </p>

        {unsavedCount > 0 && (
          <div className="alert alert-warning attempt-alert">
            <p>
              Your latest {unsavedCount === 1 ? 'change' : 'changes'} to {plural(unsavedCount, 'question')}{' '}
              {unsavedCount === 1 ? 'has' : 'have'} not reached the server. If you submit now, the server uses the
              answers it last saved for {unsavedCount === 1 ? 'that question' : 'those questions'}, and{' '}
              {unsavedCount === 1 ? 'that change is' : 'those changes are'} lost.
            </p>
            <div>
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={retrySaves}
                disabled={submitting}
              >
                Try saving again
              </button>
            </div>
            <label className="attempt-acknowledge" htmlFor={acknowledgeId}>
              <input
                id={acknowledgeId}
                type="checkbox"
                checked={acknowledged}
                disabled={submitting}
                onChange={(event) => setAcknowledgedCount(event.target.checked ? unsavedCount : 0)}
              />
              <span>I understand: submit without {unsavedCount === 1 ? 'this change' : 'these changes'}</span>
            </label>
          </div>
        )}

        {error && <SubmitError error={error} alertRef={alertRef} onRefresh={onRefresh} />}
      </div>

      <div className="dialog-actions">
        <button type="button" className="button button-secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button type="button" className="button button-primary" onClick={() => onConfirm(acknowledged)} disabled={!canSubmit}>
          {submitLabel}
        </button>
      </div>
    </Dialog>
  )
}
