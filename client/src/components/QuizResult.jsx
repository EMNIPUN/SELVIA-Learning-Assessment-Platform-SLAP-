// A released quiz result: { totalScore, maxScore, percentage, passed }. Percentage and pass are null when the
// API has none (no points to score, or no pass mark).
export default function QuizResult({ result }) {
  return (
    <span className="quiz-result">
      {result.totalScore} / {result.maxScore}
      {result.percentage != null && ` (${result.percentage}%)`}
      {result.passed != null && (
        <span className={result.passed ? 'quiz-result-passed' : 'quiz-result-failed'}>
          {' '}
          · {result.passed ? 'Passed' : 'Not passed'}
        </span>
      )}
    </span>
  )
}
