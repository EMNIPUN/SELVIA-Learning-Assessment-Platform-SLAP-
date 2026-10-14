import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { CONTENT_STATUS } from '../../constants/contentStatus.js'
import { updateQuiz } from '../../services/api/assessment.api.js'
import { getActionErrorMessage } from '../../utils/errorMessages.js'
import Dialog from '../Dialog.jsx'
import StatusBadge from '../StatusBadge.jsx'
import { confirmLabel, confirmQuestion, publishVisibilityNote } from './statusChange.js'

const { DRAFT, PUBLISHED, ARCHIVED } = CONTENT_STATUS

// What each status means for a quiz, as the API implements it. Attempts are never changed by a status change.
const EFFECTS = {
  [PUBLISHED]:
    'Students can see the quiz while its course is published, and take it within its availability window. Its settings and section labels stay editable.',
  [DRAFT]: 'Students will not see the quiz while you change it. Attempts already made are kept.',
  [ARCHIVED]:
    'Retires the quiz: students will not see it. Nothing is deleted, attempts are kept, and it can be published again later.',
}

const PUBLISH_REQUIREMENTS =
  'The quiz must have at least one question, and every question must still be approved or published, of a type quizzes can grade, and part of this course. The API checks this when you publish.'

// Confirms changing `quiz` to `status`, then sends the status alone. A refused publication (400) lists every
// problem the API found. `onSaved(quiz)` receives the quiz the API returns; `onMissing` reports a 404.
// The dialog cannot be dismissed while the request is running.
export default function QuizStatusDialog({ quiz, status, course, onSaved, onMissing, onClose }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const savingRef = useRef(false)
  const alertRef = useRef(null)

  async function confirm() {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError(null)
    let saved
    try {
      saved = await updateQuiz(quiz.id, { status })
    } catch (err) {
      if (err.status === 404) {
        onMissing()
        return
      }
      flushSync(() => {
        setError(err)
        setSaving(false)
      })
      alertRef.current?.focus()
      return
    } finally {
      savingRef.current = false
    }
    onSaved(saved)
  }

  const details = (error?.details ?? []).map((detail) => detail.message).filter(Boolean)
  const visibilityNote =
    status === PUBLISHED ? publishVisibilityNote([{ noun: 'course', name: course.title, status: course.status }]) : null

  return (
    <Dialog title="Change quiz status" onClose={onClose} busy={saving} size="narrow">
      <div className="dialog-body">
        <p className="status-confirm-question">{confirmQuestion(status, 'quiz')}</p>
        <p className="status-dialog-item">
          <span className="muted">Quiz</span> <strong>{quiz.title}</strong>
        </p>
        <p className="status-confirm-change">
          Its status will change from <StatusBadge status={quiz.status} /> to{' '}
          <span>
            <StatusBadge status={status} />.
          </span>
        </p>
        <p>{EFFECTS[status]}</p>
        {status === PUBLISHED && <p className="form-hint">{PUBLISH_REQUIREMENTS}</p>}
        {visibilityNote && <p className="alert alert-info">{visibilityNote}</p>}

        {error && (
          <div ref={alertRef} className="alert alert-error" role="alert" tabIndex={-1}>
            <p className="quiz-error-summary">
              The status was not changed. {details.length > 0 ? error.message : getActionErrorMessage(error)}
              {details.length > 0 && ':'}
            </p>
            {details.length > 0 && (
              <ul className="quiz-error-list">
                {details.map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="dialog-actions">
        <button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="button button-primary" onClick={confirm} disabled={saving}>
          {saving ? 'Saving…' : confirmLabel(status, 'quiz')}
        </button>
      </div>
    </Dialog>
  )
}
