import { getErrorMessage } from '../utils/errorMessages.js'

export default function ErrorState({ error, title = 'Could not load this content', onRetry, children }) {
  return (
    <div className="state state-error" role="alert">
      <p className="state-title">{title}</p>
      <p>{getErrorMessage(error)}</p>
      <div className="state-actions">
        {onRetry && (
          <button type="button" className="button button-secondary" onClick={onRetry}>
            Try again
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
