import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useLocation, useParams } from 'react-router'
import EmptyState from '../../components/EmptyState.jsx'
import ErrorState from '../../components/ErrorState.jsx'
import LearningNav from '../../components/learning/LearningNav.jsx'
import LessonBreadcrumb from '../../components/learning/LessonBreadcrumb.jsx'
import LessonOutline from '../../components/learning/LessonOutline.jsx'
import { findLessonPosition, LessonPagerBar } from '../../components/learning/LessonPager.jsx'
import LessonExamples from '../../components/LessonExamples.jsx'
import LessonMaterials from '../../components/LessonMaterials.jsx'
import LessonNextSteps from '../../components/LessonNextSteps.jsx'
import LessonPractice from '../../components/LessonPractice.jsx'
import LoadingState from '../../components/LoadingState.jsx'
import MarkdownContent from '../../components/MarkdownContent.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import { ACTIVITY_TYPES } from '../../constants/activityTypes.js'
import { LESSON_SECTION_IDS } from '../../constants/lessonSections.js'
import { ROUTES } from '../../constants/routes.js'
import { createLessonListCache, LessonListCacheContext } from '../../context/LessonListCache.js'
import { useApiRequest } from '../../hooks/useApiRequest.js'
import { useConceptLessons } from '../../hooks/useConceptLessons.js'
import { useMediaQuery } from '../../hooks/useMediaQuery.js'
import { trackActivity } from '../../services/activityTracking.js'
import { getLesson, getLessonContext, listExamples, listExercises, listMaterials } from '../../services/api/lesson.api.js'
import { focusById } from '../../utils/focus.js'

// Matches the breakpoint in index.css where the course navigation becomes a drawer.
const DRAWER_QUERY = '(max-width: 767px)'
const NAV_ID = 'learning-nav'
const HEADING_ID = 'lesson-heading'

// Records one LESSON_VIEWED per visit, once the lesson has loaded. The ref survives re-renders and React's
// development double-run of effects. A visit ends when the lesson stops being shown (navigating to another
// lesson, or to one that is not found), so coming back to it counts again. `onRecorded(lessonId)` is told
// when the server has stored the view.
function useLessonViewTracking(viewedLessonId, onRecorded) {
  const recordedLessonId = useRef(null)

  useEffect(() => {
    if (!viewedLessonId) {
      recordedLessonId.current = null
      return
    }
    if (recordedLessonId.current === viewedLessonId) return
    recordedLessonId.current = viewedLessonId
    trackActivity(ACTIVITY_TYPES.LESSON_VIEWED, viewedLessonId).then((recorded) => {
      if (recorded) onRecorded(viewedLessonId)
    })
  }, [viewedLessonId, onRecorded])
}

function BackLink({ context }) {
  if (!context) {
    return (
      <Link to={ROUTES.STUDENT_COURSES} className="back-link">
        ← Back to My Courses
      </Link>
    )
  }
  return (
    <Link to={ROUTES.studentCourse(context.courseId)} className="back-link">
      ← Back to Course
    </Link>
  )
}

// The lesson with its course navigation beside it. The navigation, its loaded levels and the concepts'
// lesson lists persist while the student moves between lessons; only the lesson itself is reloaded.
export default function LessonPage() {
  const { lessonId } = useParams()
  const [lessonsCache] = useState(createLessonListCache)
  const [context, setContext] = useState(null)
  const [recordedViewIds, setRecordedViewIds] = useState(() => new Set())
  const [navOpen, setNavOpen] = useState(false)
  const [shownLessonId, setShownLessonId] = useState(lessonId)
  const [navigated, setNavigated] = useState(false)
  const isDrawer = useMediaQuery(DRAWER_QUERY)
  const menuButtonRef = useRef(null)

  // Moving to another lesson closes the drawer; the new lesson then takes focus (see LessonView).
  if (shownLessonId !== lessonId) {
    setShownLessonId(lessonId)
    setNavigated(true)
    setNavOpen(false)
  }
  if (navOpen && !isDrawer) setNavOpen(false)

  const markViewRecorded = useCallback((id) => {
    setRecordedViewIds((previous) => (previous.has(id) ? previous : new Set(previous).add(id)))
  }, [])

  const closeNav = useCallback(() => {
    flushSync(() => setNavOpen(false))
    menuButtonRef.current?.focus()
  }, [])

  // Choosing the lesson already shown only closes the drawer; any other lesson navigates as usual.
  const handleSelect = useCallback(
    (event, selectedId) => {
      if (selectedId !== lessonId) return
      event.preventDefault()
      if (isDrawer) closeNav()
    },
    [lessonId, isDrawer, closeNav],
  )

  function skipToLesson(event) {
    event.preventDefault()
    focusById(HEADING_ID)
  }

  const drawerOpen = isDrawer && navOpen

  return (
    <LessonListCacheContext.Provider value={lessonsCache}>
      <div className={`learning-shell${context ? ' has-nav' : ''}`}>
        {context && (
          <>
            {!isDrawer && (
              <a href={`#${HEADING_ID}`} className="skip-link" onClick={skipToLesson}>
                Skip to lesson
              </a>
            )}
            <LearningNav
              id={NAV_ID}
              context={context}
              currentLessonId={lessonId}
              recordedViewIds={recordedViewIds}
              isDrawer={isDrawer}
              open={drawerOpen}
              onClose={closeNav}
              onSelect={handleSelect}
            />
          </>
        )}

        <div className="learning-main" inert={drawerOpen}>
          {context && isDrawer && (
            <div className="learning-bar">
              <button
                ref={menuButtonRef}
                type="button"
                className="button button-secondary learning-bar-toggle"
                aria-expanded={navOpen}
                aria-controls={NAV_ID}
                onClick={() => setNavOpen(true)}
              >
                <span aria-hidden="true">☰</span> Course menu
              </button>
              <span className="learning-bar-title">{context.courseTitle}</span>
            </div>
          )}
          <div className="learning-content">
            <LessonView
              key={lessonId}
              lessonId={lessonId}
              focusOnLoad={navigated}
              onContext={setContext}
              onViewRecorded={markViewRecorded}
            />
          </div>
        </div>
      </div>
    </LessonListCacheContext.Provider>
  )
}

// Keyed by lesson so moving to another lesson starts with fresh local state.
function LessonView({ lessonId, focusOnLoad, onContext, onViewRecorded }) {
  const passedContext = useLocation().state?.lessonContext ?? null
  const headingRef = useRef(null)
  // Exercises with at least one submitted answer, from attempts made now or loaded from history.
  const [answeredIds, setAnsweredIds] = useState(() => new Set())
  const markAnswered = useCallback((exerciseId) => {
    setAnsweredIds((previous) => (previous.has(exerciseId) ? previous : new Set(previous).add(exerciseId)))
  }, [])

  const lessonRequest = useApiRequest((signal) => getLesson(lessonId, { signal }), [lessonId])
  const lesson = lessonRequest.data
  const loadedLesson = !lessonRequest.loading && !lessonRequest.error ? lesson : null
  useLessonViewTracking(loadedLesson?.id, onViewRecorded)
  // Requested together with the lesson so a slow or failing section never holds up the others.
  const materialsRequest = useApiRequest((signal) => listMaterials(lessonId, { signal }), [lessonId])
  const examplesRequest = useApiRequest((signal) => listExamples(lessonId, { signal }), [lessonId])
  const exercisesRequest = useApiRequest((signal) => listExercises(lessonId, { signal }), [lessonId])

  // Opened from the course page or navigation the context is already known; otherwise (direct link or
  // refresh) it is resolved from the lesson's concept. It only affects navigation, so a failure falls back
  // to My Courses.
  const conceptId = passedContext ? null : lesson?.conceptId
  const contextRequest = useApiRequest(
    (signal) => (conceptId ? getLessonContext(conceptId, { signal }) : Promise.resolve(null)),
    [conceptId],
  )
  const context = passedContext ?? contextRequest.data

  const conceptLessons = useConceptLessons(lesson?.conceptId)
  // Until the list is requested for the lesson's concept it counts as loading, never as "no next lesson".
  const lessonsRequest = {
    ...conceptLessons,
    loading: conceptLessons.loading || (!conceptLessons.data && !conceptLessons.error),
  }
  const position = loadedLesson ? findLessonPosition(lessonsRequest.data, loadedLesson.id) : null

  useEffect(() => {
    if (context) onContext(context)
  }, [context, onContext])

  // After moving from another lesson, start reading from the top with focus on the new title.
  const isLoaded = Boolean(loadedLesson)
  useEffect(() => {
    if (!isLoaded || !focusOnLoad) return
    window.scrollTo(0, 0)
    headingRef.current?.focus({ preventScroll: true })
  }, [isLoaded, focusOnLoad])

  if (lessonRequest.loading) {
    return (
      <section className="page">
        <BackLink context={passedContext} />
        <LoadingState message="Loading lesson…" />
      </section>
    )
  }

  // The API answers 404 for missing or unpublished lessons and 400 for a malformed id.
  const { error } = lessonRequest
  if (error && (error.status === 404 || error.status === 400)) {
    return (
      <section className="page">
        <BackLink context={passedContext} />
        <EmptyState title="Lesson not found">
          <p>This lesson does not exist or is not available to you.</p>
        </EmptyState>
      </section>
    )
  }

  if (error) {
    return (
      <section className="page">
        <BackLink context={passedContext} />
        <ErrorState error={error} title="Could not load this lesson" onRetry={lessonRequest.reload} />
      </section>
    )
  }

  const hasContent = Boolean(lesson.body?.trim())

  return (
    <section className="page lesson-page">
      <header className="lesson-header">
        {context ? <LessonBreadcrumb context={context} lessonTitle={lesson.title} /> : <BackLink context={null} />}
        <div className="lesson-header-labels">
          <span className="lesson-label">Lesson</span>
          {position && (
            <span className="lesson-position">
              {position.number} of {position.total}
              {context?.conceptName && <span className="visually-hidden"> in {context.conceptName}</span>}
            </span>
          )}
          <StatusBadge status={lesson.status} />
        </div>
        <h1 id={HEADING_ID} ref={headingRef} tabIndex={-1}>
          {lesson.title}
        </h1>
        {lesson.summary && <p className="page-subtitle">{lesson.summary}</p>}
        {(context?.conceptName || lesson.estimatedDurationMinutes != null) && (
          <dl className="course-meta">
            {context?.conceptName && (
              <div>
                <dt>Concept</dt>
                <dd>{context.conceptName}</dd>
              </div>
            )}
            {lesson.estimatedDurationMinutes != null && (
              <div>
                <dt>Estimated duration</dt>
                <dd>{lesson.estimatedDurationMinutes} min</dd>
              </div>
            )}
          </dl>
        )}
        <LessonPagerBar position={position} context={context} />
      </header>

      <LessonOutline hasContent={hasContent} />

      <div className="lesson-sections">
        {hasContent && (
          <section className="page-section lesson-section" aria-labelledby={LESSON_SECTION_IDS.content}>
            <h2 id={LESSON_SECTION_IDS.content} tabIndex={-1}>
              Lesson Content
            </h2>
            <MarkdownContent source={lesson.body} className="lesson-body" />
          </section>
        )}

        <LessonMaterials request={materialsRequest} />
        <LessonExamples request={examplesRequest} />
        <LessonPractice request={exercisesRequest} answeredIds={answeredIds} onAnswered={markAnswered} />
        <LessonNextSteps
          context={context}
          lessonsRequest={lessonsRequest}
          position={position}
          exercisesRequest={exercisesRequest}
          answeredIds={answeredIds}
        />
      </div>
    </section>
  )
}
