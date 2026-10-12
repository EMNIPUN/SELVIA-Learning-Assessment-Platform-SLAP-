import { useState } from 'react'
import { useApiRequest } from '../../hooks/useApiRequest.js'
import { listConcepts, listTopics } from '../../services/api/course.api.js'
import { listExamples, listExercises, listLessons, listMaterials } from '../../services/api/lesson.api.js'
import { StructureFeedbackContext } from './structureFeedback.js'
import {
  CONCEPT_KIND,
  EXAMPLE_KIND,
  EXERCISE_KIND,
  LESSON_KIND,
  MATERIAL_KIND,
  MODULE_KIND,
  TOPIC_KIND,
} from './structureKinds.jsx'
import StructureList from './StructureList.jsx'

// An item as one of the ancestors of the items below it, with its current status.
const ancestorOf = (kind, item) => ({ noun: kind.noun, name: kind.nameOf(item), status: item.status })

// A course's modules → topics → concepts → lessons → learning materials, examples and practice exercises for
// its owner to manage. Modules come with the course; each module's topics, each topic's concepts, each
// concept's lessons and each lesson's materials are loaded the first time it is expanded, and a lesson's
// examples and practice exercises the first time their section is opened. Loaded lists are kept after that.
// Each list knows the statuses of everything above it, as currently shown on the page.
export default function CourseStructure({ course, modules, updateModules }) {
  const [feedback, setFeedback] = useState(null)
  const ancestors = [{ noun: 'course', name: course.title, status: course.status }]

  return (
    <StructureFeedbackContext.Provider value={{ feedback, notify: setFeedback }}>
      <StructureList
        kind={MODULE_KIND}
        parentId={course.id}
        ancestors={ancestors}
        headingLevel={2}
        intro="Expand a module to manage its topics, a topic its concepts, a concept its lessons, and a lesson its learning materials, examples and practice exercises."
        items={modules}
        updateItems={updateModules}
        renderChildren={(module) => <TopicList module={module} ancestors={[...ancestors, ancestorOf(MODULE_KIND, module)]} />}
      />
    </StructureFeedbackContext.Provider>
  )
}

function TopicList({ module, ancestors }) {
  const { data, error, loading, reload, updateData } = useApiRequest(
    (signal) => listTopics(module.id, { signal }),
    [module.id],
  )
  return (
    <StructureList
      kind={TOPIC_KIND}
      parentId={module.id}
      parentLabel={module.title}
      ancestors={ancestors}
      headingLevel={4}
      items={data}
      loading={loading}
      error={error}
      onRetry={reload}
      updateItems={updateData}
      renderChildren={(topic) => <ConceptList topic={topic} ancestors={[...ancestors, ancestorOf(TOPIC_KIND, topic)]} />}
    />
  )
}

function ConceptList({ topic, ancestors }) {
  const { data, error, loading, reload, updateData } = useApiRequest(
    (signal) => listConcepts(topic.id, { signal }),
    [topic.id],
  )
  return (
    <StructureList
      kind={CONCEPT_KIND}
      parentId={topic.id}
      parentLabel={topic.title}
      ancestors={ancestors}
      headingLevel={6}
      items={data}
      loading={loading}
      error={error}
      onRetry={reload}
      updateItems={updateData}
      renderChildren={(concept) => (
        <LessonList concept={concept} ancestors={[...ancestors, ancestorOf(CONCEPT_KIND, concept)]} />
      )}
    />
  )
}

// The owner receives every lesson of the concept, whatever its status.
function LessonList({ concept, ancestors }) {
  const { data, error, loading, reload, updateData } = useApiRequest(
    (signal) => listLessons(concept.id, { signal }),
    [concept.id],
  )
  return (
    <StructureList
      kind={LESSON_KIND}
      parentId={concept.id}
      parentLabel={concept.name}
      ancestors={ancestors}
      headingLevel={8}
      items={data}
      loading={loading}
      error={error}
      onRetry={reload}
      updateItems={updateData}
      renderChildren={(lesson) => {
        const lessonAncestors = [...ancestors, ancestorOf(LESSON_KIND, lesson)]
        return (
          <>
            <MaterialList lesson={lesson} ancestors={lessonAncestors} />
            <CollapsibleLessonList lesson={lesson} ancestors={lessonAncestors} kind={EXAMPLE_KIND} list={listExamples} />
            <CollapsibleLessonList lesson={lesson} ancestors={lessonAncestors} kind={EXERCISE_KIND} list={listExercises} />
          </>
        )
      }}
    />
  )
}

// The owner receives every material of the lesson, whatever its status.
function MaterialList({ lesson, ancestors }) {
  const { data, error, loading, reload, updateData } = useApiRequest(
    (signal) => listMaterials(lesson.id, { signal }),
    [lesson.id],
  )
  return (
    <StructureList
      kind={MATERIAL_KIND}
      parentId={lesson.id}
      parentLabel={lesson.title}
      ancestors={ancestors}
      headingLevel={10}
      items={data}
      loading={loading}
      error={error}
      onRetry={reload}
      updateItems={updateData}
    />
  )
}

// The owner receives every example or practice exercise of the lesson, whatever its status; exercises include
// their answers. Nothing is requested until the section is first opened, and collapsing it keeps what was loaded.
function CollapsibleLessonList({ lesson, ancestors, kind, list }) {
  const [expanded, setExpanded] = useState(false)
  const [opened, setOpened] = useState(false)
  const { data, error, loading, reload, updateData } = useApiRequest(
    (signal) => list(lesson.id, { signal }),
    [lesson.id],
    { enabled: opened },
  )

  function toggle() {
    setExpanded((value) => !value)
    setOpened(true)
  }

  return (
    <StructureList
      kind={kind}
      parentId={lesson.id}
      parentLabel={lesson.title}
      ancestors={ancestors}
      headingLevel={10}
      items={data}
      loading={loading}
      error={error}
      onRetry={reload}
      updateItems={updateData}
      collapsible={{ expanded, onToggle: toggle }}
    />
  )
}
