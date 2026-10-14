import { Link } from 'react-router'
import { ROUTES } from '../constants/routes.js'
import { formatDateTime } from '../utils/formatters.js'
import QuizAvailabilityBadge from './QuizAvailabilityBadge.jsx'
import QuizResult from './QuizResult.jsx'
import { QUIZ_AVAILABILITY, canStartQuiz, unavailableText } from './studentQuizStatus.js'

const { UPCOMING, OPEN, CLOSED } = QUIZ_AVAILABILITY

function windowText({ availability, availableFrom, availableUntil }) {
  if (availability === UPCOMING && availableFrom) return `Opens ${formatDateTime(availableFrom)}`
  if (availability === OPEN && availableUntil) return `Closes ${formatDateTime(availableUntil)}`
  if (availability === CLOSED && availableUntil) return `Closed ${formatDateTime(availableUntil)}`
  return null
}

function attemptsText({ maxAttempts, myAttempts }) {
  if (maxAttempts == null) return `${myAttempts.used} used, unlimited`
  return `${myAttempts.used} of ${maxAttempts} used, ${myAttempts.remaining} remaining`
}

// Resume opens the attempt already in progress. Start only leads to the quiz page, which starts the attempt.
function QuizAction({ quiz }) {
  const { inProgressAttemptId } = quiz.myAttempts

  if (inProgressAttemptId) {
    return (
      <Link to={ROUTES.studentAttempt(inProgressAttemptId)} className="button button-primary button-small">
        Resume quiz<span className="visually-hidden">: {quiz.title}</span>
      </Link>
    )
  }
  if (canStartQuiz(quiz)) {
    return (
      <Link to={ROUTES.studentQuiz(quiz.id)} className="button button-primary button-small">
        Start quiz<span className="visually-hidden">: {quiz.title}</span>
      </Link>
    )
  }
  return <p className="quiz-item-status">{unavailableText(quiz)}</p>
}

export default function QuizListItem({ quiz }) {
  const availabilityWindow = windowText(quiz)
  const { latestResult, inProgressAttemptId } = quiz.myAttempts

  return (
    <article className="quiz-item">
      <div className="quiz-item-header">
        <h3 className="quiz-item-title">
          <Link to={ROUTES.studentQuiz(quiz.id)}>{quiz.title}</Link>
        </h3>
        <span className="quiz-item-badges">
          {inProgressAttemptId && <span className="badge badge-quiz-in-progress">In progress</span>}
          <QuizAvailabilityBadge availability={quiz.availability} />
        </span>
      </div>

      {quiz.description && <p className="quiz-item-description">{quiz.description}</p>}

      <dl className="course-meta quiz-item-meta">
        <div>
          <dt>Questions</dt>
          <dd>{quiz.questionCount}</dd>
        </div>
        <div>
          <dt>Total points</dt>
          <dd>{quiz.totalPoints}</dd>
        </div>
        <div>
          <dt>Time limit</dt>
          <dd>{quiz.timeLimitMinutes == null ? 'None' : `${quiz.timeLimitMinutes} min`}</dd>
        </div>
        <div>
          <dt>Attempts</dt>
          <dd>{attemptsText(quiz)}</dd>
        </div>
      </dl>

      {availabilityWindow && <p className="quiz-item-window">{availabilityWindow}</p>}
      {/* The API sends a latest result only once an attempt is closed and its result released. */}
      {latestResult && (
        <p className="quiz-item-result">
          <span className="quiz-item-result-label">Latest result (attempt {latestResult.attemptNumber}):</span>{' '}
          <QuizResult result={latestResult} />
        </p>
      )}

      <div className="quiz-item-footer">
        <QuizAction quiz={quiz} />
      </div>
    </article>
  )
}
