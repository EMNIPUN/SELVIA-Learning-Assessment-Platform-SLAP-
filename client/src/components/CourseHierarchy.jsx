import { useState } from 'react'
import { Link } from 'react-router'
import { ROUTES } from '../constants/routes.js'
import { useApiRequest } from '../hooks/useApiRequest.js'
import { listConcepts, listTopics } from '../services/api/course.api.js'
import { listLessons } from '../services/api/lesson.api.js'
import EmptyState from './EmptyState.jsx'
import ErrorState from './ErrorState.jsx'
import LoadingState from './LoadingState.jsx'

// Course → Modules → Topics → Concepts → Lessons. Each level is loaded from the API the first time its
// parent is expanded, and kept while the page stays open.

function Expandable({ className, summary, children }) {
  const [opened, setOpened] = useState(false)

  return (
    <details className={className} onToggle={(event) => event.currentTarget.open && setOpened(true)}>
      <summary>{summary}</summary>
      {opened && <div className="hierarchy-children">{children}</div>}
    </details>
  )
}

function ItemSummary({ title, description, code }) {
  return (
    <span className="hierarchy-summary">
      <span className="hierarchy-title">
        {code && <span className="course-code">{code}</span>}
        {title}
      </span>
      {description && <span className="hierarchy-description">{description}</span>}
    </span>
  )
}

// `context` names the lesson's place in the course (titles and ids); it is passed to the lesson page so it
// can link back and open its course navigation at the lesson without requesting the hierarchy again.
function LessonList({ conceptId, context }) {
  const { data: lessons, error, loading, reload } = useApiRequest(
    (signal) => listLessons(conceptId, { signal }),
    [conceptId],
  )

  if (loading) return <LoadingState message="Loading lessons…" />
  if (error) return <ErrorState error={error} title="Could not load lessons" onRetry={reload} />
  if (lessons.length === 0) return <EmptyState title="No lessons available yet." />

  return (
    <ol className="lesson-list">
      {lessons.map((lesson, index) => (
        <li key={lesson.id}>
          <Link to={ROUTES.studentLesson(lesson.id)} state={{ lessonContext: context }} className="lesson-item">
            <span className="lesson-label">Lesson {index + 1}</span>
            <span className="lesson-title">{lesson.title}</span>
            {lesson.summary && <span className="hierarchy-description">{lesson.summary}</span>}
            {lesson.estimatedDurationMinutes != null && (
              <span className="lesson-meta">{lesson.estimatedDurationMinutes} min</span>
            )}
          </Link>
        </li>
      ))}
    </ol>
  )
}

function ConceptList({ topicId, context }) {
  const { data: concepts, error, loading, reload } = useApiRequest(
    (signal) => listConcepts(topicId, { signal }),
    [topicId],
  )

  if (loading) return <LoadingState message="Loading concepts…" />
  if (error) return <ErrorState error={error} title="Could not load concepts" onRetry={reload} />
  if (concepts.length === 0) return <EmptyState title="No concepts in this topic yet." />

  return (
    <div className="hierarchy-list">
      {concepts.map((concept) => (
        <Expandable
          key={concept.id}
          className="hierarchy-item hierarchy-concept"
          summary={<ItemSummary title={concept.name} description={concept.description} code={concept.code} />}
        >
          <LessonList
            conceptId={concept.id}
            context={{ ...context, conceptId: concept.id, conceptName: concept.name }}
          />
        </Expandable>
      ))}
    </div>
  )
}

function TopicList({ moduleId, context }) {
  const { data: topics, error, loading, reload } = useApiRequest(
    (signal) => listTopics(moduleId, { signal }),
    [moduleId],
  )

  if (loading) return <LoadingState message="Loading topics…" />
  if (error) return <ErrorState error={error} title="Could not load topics" onRetry={reload} />
  if (topics.length === 0) return <EmptyState title="No topics in this module yet." />

  return (
    <div className="hierarchy-list">
      {topics.map((topic) => (
        <Expandable
          key={topic.id}
          className="hierarchy-item hierarchy-topic"
          summary={<ItemSummary title={topic.title} description={topic.description} />}
        >
          <ConceptList topicId={topic.id} context={{ ...context, topicId: topic.id, topicTitle: topic.title }} />
        </Expandable>
      ))}
    </div>
  )
}

export default function CourseHierarchy({ course, modules }) {
  if (modules.length === 0) {
    return <EmptyState title="No modules in this course yet." />
  }

  const courseContext = { courseId: course.id, courseTitle: course.title }

  return (
    <div className="hierarchy-list">
      {modules.map((module, index) => (
        <Expandable
          key={module.id}
          className="hierarchy-item hierarchy-module"
          summary={<ItemSummary title={`Module ${index + 1}: ${module.title}`} description={module.description} />}
        >
          <TopicList
            moduleId={module.id}
            context={{ ...courseContext, moduleId: module.id, moduleTitle: module.title }}
          />
        </Expandable>
      ))}
    </div>
  )
}
