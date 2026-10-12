import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { CONTENT_STATUS } from '../../constants/contentStatus.js'
import { capitalize } from '../../utils/formatters.js'
import { getActionErrorMessage } from '../../utils/errorMessages.js'
import Dialog from '../Dialog.jsx'
import StatusBadge from '../StatusBadge.jsx'
import { LoadedRecord } from './FormDialog.jsx'
import {
  confirmLabel,
  confirmQuestion,
  needsConfirmation,
  publishVisibilityNote,
  STATUS_ACTIONS,
  statusEffect,
} from './statusChange.js'

// Changes only the status of an item. The current version is loaded first (`load(signal)`), so the choice
// starts from the stored status, and `onLoaded(record)` lets the page show it. `statuses` are the ones the
// API accepts for this kind of item; `scope` ({ ancestors, contains, hiddenNote }) words their effects.
// Publishing, archiving and unpublishing are confirmed before `save(status)` sends the request, which carries
// the status alone. `onSaved(record)` receives the record the API returns; `onMissing` reports a 404.
// Nothing is sent on Cancel, Back or Escape, and the dialog cannot be dismissed while the request is running.
export default function StatusChangeDialog({
  noun,
  nameOf,
  statuses,
  scope,
  load,
  save,
  onLoaded,
  onSaved,
  onMissing,
  onClose,
}) {
  const [busy, setBusy] = useState(false)

  return (
    <Dialog title={`Change ${noun} status`} onClose={onClose} busy={busy} size="narrow">
      <LoadedRecord
        noun={noun}
        load={load}
        onMissing={onMissing}
        onClose={onClose}
        render={(record) => (
          <StatusChoice
            record={record}
            noun={noun}
            name={nameOf(record)}
            statuses={statuses}
            scope={{ ...scope, noun }}
            save={save}
            onLoaded={onLoaded}
            onSaved={onSaved}
            onMissing={onMissing}
            onCancel={onClose}
            onBusyChange={setBusy}
          />
        )}
      />
    </Dialog>
  )
}

function StatusChoice({ record, noun, name, statuses, scope, save, onLoaded, onSaved, onMissing, onCancel, onBusyChange }) {
  const current = record.status
  const choices = statuses.filter((status) => status !== current)
  const [selected, setSelected] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [choiceError, setChoiceError] = useState(null)
  const [requestError, setRequestError] = useState(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const radioRefs = useRef({})
  const alertRef = useRef(null)
  const questionRef = useRef(null)
  const id = useId()

  useEffect(() => {
    onLoaded?.(record)
    radioRefs.current[choices[0]]?.focus()
  }, [])

  function focusChoice() {
    radioRefs.current[selected ?? choices[0]]?.focus()
  }

  function choose(status) {
    setSelected(status)
    setChoiceError(null)
    setRequestError(null)
  }

  function back() {
    flushSync(() => {
      setConfirming(false)
      setRequestError(null)
    })
    focusChoice()
  }

  async function send() {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    onBusyChange(true)
    setRequestError(null)
    let saved
    try {
      saved = await save(selected)
    } catch (err) {
      onBusyChange(false)
      if (err.status === 404) {
        onMissing()
        return
      }
      flushSync(() => {
        setRequestError(err)
        setSaving(false)
      })
      alertRef.current?.focus()
      return
    } finally {
      savingRef.current = false
    }
    onBusyChange(false)
    onSaved(saved)
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (savingRef.current) return
    if (!selected) {
      flushSync(() => setChoiceError('Choose the new status.'))
      focusChoice()
      return
    }
    if (!confirming && needsConfirmation(current, selected)) {
      flushSync(() => {
        setConfirming(true)
        setRequestError(null)
      })
      questionRef.current?.focus()
      return
    }
    send()
  }

  // The API words validation (400), permission (403) and conflict (409) refusals for end users.
  function requestErrorMessage(error) {
    const details = (error.details ?? []).map((detail) => detail.message).filter(Boolean)
    return details.length > 0 ? details.join(' ') : getActionErrorMessage(error)
  }

  const visibilityNote = selected === CONTENT_STATUS.PUBLISHED ? publishVisibilityNote(scope.ancestors) : null
  const submitLabel = confirming
    ? confirmLabel(selected, noun)
    : selected && !needsConfirmation(current, selected)
      ? STATUS_ACTIONS[selected]
      : 'Continue'

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="dialog-body">
        <p className="status-dialog-item">
          <span className="muted">{capitalize(noun)}</span> <strong>{name}</strong>
        </p>
        <p className="status-dialog-current">
          Current status <StatusBadge status={current} />
        </p>

        {requestError && (
          <p ref={alertRef} className="alert alert-error" role="alert" tabIndex={-1}>
            The status was not changed. {requestErrorMessage(requestError)}
          </p>
        )}

        {confirming ? (
          <div className="status-confirm">
            <p ref={questionRef} className="status-confirm-question" tabIndex={-1}>
              {confirmQuestion(selected, noun)}
            </p>
            <p className="status-confirm-change">
              Its status will change from <StatusBadge status={current} /> to{' '}
              <span>
                <StatusBadge status={selected} />.
              </span>
            </p>
            <p>{statusEffect(selected, scope)}</p>
            {visibilityNote && <p className="alert alert-info">{visibilityNote}</p>}
          </div>
        ) : (
          <fieldset
            className="form-field form-choice status-choices"
            disabled={saving}
            aria-describedby={choiceError ? `${id}-error` : undefined}
          >
            <legend className="form-label">New status</legend>
            <div className="status-options">
              {choices.map((status) => (
                <label key={status} className="status-option">
                  <input
                    type="radio"
                    name={`${id}-status`}
                    value={status}
                    checked={selected === status}
                    onChange={() => choose(status)}
                    ref={(element) => {
                      radioRefs.current[status] = element
                    }}
                    aria-labelledby={`${id}-${status}-label`}
                    aria-describedby={`${id}-${status}-effect`}
                    aria-invalid={Boolean(choiceError)}
                  />
                  <span className="status-option-text">
                    <span id={`${id}-${status}-label`} className="status-option-label">
                      {STATUS_ACTIONS[status]} <StatusBadge status={status} />
                    </span>
                    <span id={`${id}-${status}-effect`} className="form-hint">
                      {statusEffect(status, scope)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {choiceError && (
              <span id={`${id}-error`} className="form-error">
                {choiceError}
              </span>
            )}
          </fieldset>
        )}
      </div>

      <div className="dialog-actions">
        <button type="button" className="button button-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        {confirming && (
          <button type="button" className="button button-secondary" onClick={back} disabled={saving}>
            Back
          </button>
        )}
        <button type="submit" className="button button-primary" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
