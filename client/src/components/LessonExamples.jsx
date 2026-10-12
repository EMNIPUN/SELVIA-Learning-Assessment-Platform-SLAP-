import { LESSON_SECTION_IDS } from '../constants/lessonSections.js'
import EmptyState from './EmptyState.jsx'
import ErrorState from './ErrorState.jsx'
import ExampleCard from './ExampleCard.jsx'
import LoadingState from './LoadingState.jsx'

// `request` is a useApiRequest result, so the lesson page can start loading examples alongside the lesson.
function ExamplesBody({ request: { data: examples, error, loading, reload } }) {
  if (loading) return <LoadingState message="Loading examples…" />
  if (error) return <ErrorState error={error} title="Could not load examples." onRetry={reload} />
  if (examples.length === 0) return <EmptyState title="No examples available yet." />

  return (
    <ol className="content-list">
      {examples.map((example, index) => (
        <li key={example.id}>
          <ExampleCard example={example} position={index + 1} />
        </li>
      ))}
    </ol>
  )
}

export default function LessonExamples({ request }) {
  return (
    <section className="page-section lesson-section" aria-labelledby={LESSON_SECTION_IDS.examples}>
      <h2 id={LESSON_SECTION_IDS.examples} tabIndex={-1}>
        Examples
      </h2>
      <ExamplesBody request={request} />
    </section>
  )
}
