import { LESSON_SECTION_IDS } from '../constants/lessonSections.js'
import EmptyState from './EmptyState.jsx'
import ErrorState from './ErrorState.jsx'
import LoadingState from './LoadingState.jsx'
import MaterialCard from './MaterialCard.jsx'

// `request` is a useApiRequest result, so the lesson page can start loading materials alongside the lesson.
function MaterialsBody({ request: { data: materials, error, loading, reload } }) {
  if (loading) return <LoadingState message="Loading learning materials…" />
  if (error) return <ErrorState error={error} title="Could not load learning materials." onRetry={reload} />
  if (materials.length === 0) return <EmptyState title="No learning materials available yet." />

  return (
    <ol className="content-list">
      {materials.map((material, index) => (
        <li key={material.id}>
          <MaterialCard material={material} position={index + 1} />
        </li>
      ))}
    </ol>
  )
}

export default function LessonMaterials({ request }) {
  return (
    <section className="page-section lesson-section" aria-labelledby={LESSON_SECTION_IDS.materials}>
      <h2 id={LESSON_SECTION_IDS.materials} tabIndex={-1}>
        Learning Materials
      </h2>
      <MaterialsBody request={request} />
    </section>
  )
}
