import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import { ROUTES } from '../../constants/routes.js'
import { useApiRequest } from '../../hooks/useApiRequest.js'
import { useConceptLessons } from '../../hooks/useConceptLessons.js'
import { listConcepts, listModules, listTopics } from '../../services/api/course.api.js'
import { getErrorMessage } from '../../utils/errorMessages.js'

// The course's modules → topics → concepts → lessons. Each level is loaded the first time it is opened and
// kept while the student moves between lessons; the levels leading to the current lesson open by themselves.
// A lesson is marked "viewed" only when the student's own LESSON_VIEWED activity shows they opened it.

function NavStatus({ request: { error, loading, reload }, label }) {
  if (loading) return <p className="nav-status">Loading {label}…</p>
  if (!error) return null
  return (
    <div className="nav-status nav-status-error" role="alert">
      <p>
        Could not load {label}. {getErrorMessage(error)}
      </p>
      <button type="button" className="button button-secondary button-small" onClick={reload}>
        Try again
      </button>
    </div>
  )
}

// A collapsible level. Its children mount when first opened and stay mounted, so collapsing only hides them.
function NavGroup({ level, label, onPath, children }) {
  const [expanded, setExpanded] = useState(onPath)
  const [opened, setOpened] = useState(onPath)
  const panelId = useId()

  useEffect(() => {
    if (onPath) {
      setExpanded(true)
      setOpened(true)
    }
  }, [onPath])

  function toggle() {
    setExpanded((value) => !value)
    setOpened(true)
  }

  return (
    <li className={`nav-group nav-${level}`}>
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={expanded}
        aria-controls={opened ? panelId : undefined}
        onClick={toggle}
      >
        <span className="nav-toggle-icon" aria-hidden="true">
          ▸
        </span>
        <span className="nav-toggle-label">{label}</span>
      </button>
      {opened && (
        <div id={panelId} className="nav-children" hidden={!expanded}>
          {children}
        </div>
      )}
    </li>
  )
}

function LessonLinks({ conceptContext, currentLessonId, viewedIds, onSelect }) {
  const request = useConceptLessons(conceptContext.conceptId)
  const lessons = request.data

  if (!lessons) return <NavStatus request={request} label="lessons" />
  if (lessons.length === 0) return <p className="nav-status">No lessons yet.</p>

  return (
    <ol className="nav-lessons">
      {lessons.map((lesson) => {
        const current = lesson.id === currentLessonId
        const viewed = !current && viewedIds.has(lesson.id)
        return (
          <li key={lesson.id}>
            <Link
              to={ROUTES.studentLesson(lesson.id)}
              state={{ lessonContext: conceptContext }}
              className={`nav-lesson${viewed ? ' nav-lesson-viewed' : ''}`}
              aria-current={current ? 'page' : undefined}
              onClick={(event) => onSelect(event, lesson.id)}
            >
              <span className="nav-lesson-marker" aria-hidden="true" />
              <span className="nav-lesson-title">
                {lesson.title}
                {current && <span className="visually-hidden"> (current lesson)</span>}
                {viewed && <span className="visually-hidden"> (viewed)</span>}
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

function ConceptGroups({ topicContext, path, ...lessonProps }) {
  const request = useApiRequest((signal) => listConcepts(topicContext.topicId, { signal }), [topicContext.topicId])
  const concepts = request.data

  if (!concepts) return <NavStatus request={request} label="concepts" />
  if (concepts.length === 0) return <p className="nav-status">No concepts yet.</p>

  return (
    <ul className="nav-list">
      {concepts.map((concept) => (
        <NavGroup key={concept.id} level="concept" label={concept.name} onPath={concept.id === path.conceptId}>
          <LessonLinks
            conceptContext={{ ...topicContext, conceptId: concept.id, conceptName: concept.name }}
            {...lessonProps}
          />
        </NavGroup>
      ))}
    </ul>
  )
}

function TopicGroups({ moduleContext, path, ...lessonProps }) {
  const request = useApiRequest((signal) => listTopics(moduleContext.moduleId, { signal }), [moduleContext.moduleId])
  const topics = request.data

  if (!topics) return <NavStatus request={request} label="topics" />
  if (topics.length === 0) return <p className="nav-status">No topics yet.</p>

  return (
    <ul className="nav-list">
      {topics.map((topic) => (
        <NavGroup key={topic.id} level="topic" label={topic.title} onPath={topic.id === path.topicId}>
          <ConceptGroups
            topicContext={{ ...moduleContext, topicId: topic.id, topicTitle: topic.title }}
            path={path}
            {...lessonProps}
          />
        </NavGroup>
      ))}
    </ul>
  )
}

// `path` is the current lesson's context: courseId and, when known, moduleId, topicId and conceptId.
// `onSelect(event, lessonId)` is called when a lesson link is chosen.
export default function CourseNavigation({ path, courseTitle, currentLessonId, viewedIds, onSelect }) {
  const request = useApiRequest((signal) => listModules(path.courseId, { signal }), [path.courseId])
  const modules = request.data
  const courseContext = { courseId: path.courseId, courseTitle }
  const lessonProps = { currentLessonId, viewedIds, onSelect }

  if (!modules) return <NavStatus request={request} label="the course outline" />
  if (modules.length === 0) return <p className="nav-status">This course has no modules yet.</p>

  return (
    <ul className="nav-tree">
      {modules.map((module, index) => (
        <NavGroup
          key={module.id}
          level="module"
          label={`Module ${index + 1}: ${module.title}`}
          onPath={module.id === path.moduleId}
        >
          <TopicGroups
            moduleContext={{ ...courseContext, moduleId: module.id, moduleTitle: module.title }}
            path={path}
            {...lessonProps}
          />
        </NavGroup>
      ))}
    </ul>
  )
}
