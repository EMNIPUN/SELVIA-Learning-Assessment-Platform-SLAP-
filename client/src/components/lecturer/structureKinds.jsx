import {
  createConcept,
  createModule,
  createTopic,
  deleteConcept,
  deleteModule,
  deleteTopic,
  getConcept,
  getModule,
  getTopic,
  updateConcept,
  updateModule,
  updateTopic,
} from '../../services/api/course.api.js'
import {
  createExample,
  createExercise,
  createLesson,
  createMaterial,
  deleteExample,
  deleteExercise,
  deleteLesson,
  deleteMaterial,
  getExample,
  getExercise,
  getLesson,
  getMaterial,
  updateExample,
  updateExercise,
  updateLesson,
  updateMaterial,
} from '../../services/api/lesson.api.js'
import { CONTENT_STATUSES } from '../../constants/contentStatus.js'
import { STRUCTURE_STATUSES } from '../../constants/structureStatus.js'
import { formatEnumLabel, formatFileSize } from '../../utils/formatters.js'
import { toSafeExternalUrl } from '../../utils/safeUrl.js'
import ExternalLink from '../ExternalLink.jsx'
import ConceptForm from './ConceptForm.jsx'
import ExampleForm from './ExampleForm.jsx'
import LearningMaterialForm from './LearningMaterialForm.jsx'
import LessonForm from './LessonForm.jsx'
import ModuleForm from './ModuleForm.jsx'
import PracticeExerciseForm from './PracticeExerciseForm.jsx'
import TopicForm from './TopicForm.jsx'

// What differs between the module, topic, concept, lesson, learning material, example and practice exercise
// levels of a course's structure.
// `includes` names the children the API deletes together with an item; `blockers` names the records that make
// the API refuse a deletion (409). Optional: `summaryOf(item)` replaces the description shown under an item,
// `detailsOf(item)` adds labelled values to its meta line, `dialogSize` widens its form, `addLabel` and
// `deleteLabel` replace the button texts, and `deleteEffect` adds a sentence to the delete confirmation.
// `statuses` are the statuses the API accepts for the level; `contains` names what is inside an item and
// `hiddenNote` what else students lose while it is not published, for the status dialog.

const listFormat = new Intl.ListFormat('en', { type: 'conjunction' })

// [[2, 'topic'], [0, 'concept']] → "2 topics", or null when every count is zero.
const describeCounts = (counts) => {
  const parts = counts
    .filter(([number]) => number > 0)
    .map(([number, word]) => `${number} ${word}${number === 1 ? '' : 's'}`)
  return parts.length > 0 ? listFormat.format(parts) : null
}

export const MODULE_KIND = {
  noun: 'module',
  heading: 'Modules',
  nameOf: (module) => module.title,
  get: getModule,
  create: createModule,
  update: updateModule,
  remove: deleteModule,
  renderForm: (module, formProps) => <ModuleForm module={module} {...formProps} />,
  includes: 'its topics and concepts',
  blockers: 'lessons, questions, assessments, student activity or evidence',
  removedWith: (deleted) =>
    describeCounts([
      [deleted?.topics, 'topic'],
      [deleted?.concepts, 'concept'],
    ]),
  empty: 'This course has no modules yet.',
  statuses: STRUCTURE_STATUSES,
  contains: 'its topics, concepts and lessons',
}

export const TOPIC_KIND = {
  noun: 'topic',
  heading: 'Topics',
  nameOf: (topic) => topic.title,
  get: getTopic,
  create: createTopic,
  update: updateTopic,
  remove: deleteTopic,
  renderForm: (topic, formProps) => <TopicForm topic={topic} {...formProps} />,
  includes: 'its concepts',
  blockers: 'lessons, questions, assessments, student activity or evidence',
  removedWith: (deleted) => describeCounts([[deleted?.concepts, 'concept']]),
  empty: 'This module has no topics yet.',
  statuses: STRUCTURE_STATUSES,
  contains: 'its concepts and lessons',
}

export const CONCEPT_KIND = {
  noun: 'concept',
  heading: 'Concepts',
  nameOf: (concept) => concept.name,
  get: getConcept,
  create: createConcept,
  update: updateConcept,
  remove: deleteConcept,
  renderForm: (concept, formProps) => <ConceptForm concept={concept} {...formProps} />,
  includes: null,
  blockers: 'lessons, questions, student activity or evidence',
  removedWith: () => null,
  empty: 'This topic has no concepts yet.',
  statuses: STRUCTURE_STATUSES,
  contains: 'its lessons',
}

export const LESSON_KIND = {
  noun: 'lesson',
  heading: 'Lessons',
  nameOf: (lesson) => lesson.title,
  get: getLesson,
  create: createLesson,
  update: updateLesson,
  remove: deleteLesson,
  renderForm: (lesson, formProps) => <LessonForm lesson={lesson} {...formProps} />,
  includes: 'its learning materials, examples and practice exercises',
  blockers: 'student activity records for it or its materials, examples or exercises',
  removedWith: (deleted) =>
    describeCounts([
      [deleted?.materials, 'learning material'],
      [deleted?.examples, 'example'],
      [deleted?.exercises, 'practice exercise'],
    ]),
  empty: 'This concept has no lessons yet.',
  statuses: CONTENT_STATUSES,
  contains: 'its learning materials, examples and practice exercises',
  summaryOf: (lesson) => lesson.summary,
  detailsOf: (lesson) =>
    lesson.estimatedDurationMinutes == null
      ? []
      : [{ label: 'Estimated duration', value: `${lesson.estimatedDurationMinutes} min` }],
  dialogSize: 'wide',
}

// Where students open the material. The link opens without recording student activity; a storage key is
// internal and not shown.
function materialLocation(material) {
  if (!material.externalUrl) return { label: 'Stored file', value: 'not available online yet' }
  const safeUrl = toSafeExternalUrl(material.externalUrl)
  if (!safeUrl) return { label: 'Link', value: 'cannot be opened safely' }
  return {
    label: 'Link',
    value: (
      <ExternalLink href={safeUrl} className="structure-item-link">
        {new URL(safeUrl).host}
      </ExternalLink>
    ),
  }
}

// The content source is set through the API only, so it is shown but not edited here.
function contentSource({ source, sourceReference }) {
  if (!source && !sourceReference) return []
  const value = [source?.title, sourceReference].filter(Boolean).join(', ')
  return [{ label: 'Source', value }]
}

export const MATERIAL_KIND = {
  noun: 'learning material',
  heading: 'Learning materials',
  nameOf: (material) => material.title,
  get: getMaterial,
  create: createMaterial,
  update: updateMaterial,
  remove: deleteMaterial,
  renderForm: (material, formProps) => <LearningMaterialForm material={material} {...formProps} />,
  includes: null,
  blockers: 'student activity records',
  removedWith: () => null,
  empty: 'This lesson has no learning materials yet.',
  statuses: CONTENT_STATUSES,
  detailsOf: (material) => [
    { label: 'Type', value: <span className="content-type">{formatEnumLabel(material.materialType)}</span> },
    materialLocation(material),
    ...(material.mimeType ? [{ label: 'Format', value: material.mimeType }] : []),
    ...(material.fileSizeBytes != null ? [{ label: 'Size', value: formatFileSize(material.fileSizeBytes) }] : []),
    ...contentSource(material),
  ],
  dialogSize: 'wide',
  addLabel: 'Add Learning Material',
  deleteLabel: 'Delete Material',
  deleteEffect: 'It will be removed from this lesson, and students will no longer see it.',
}

// Which optional parts an example has, for example "problem, code (python) and explanation". The Markdown
// and code themselves are not shown in the list.
function exampleParts(example) {
  const parts = [
    example.problemStatement && 'problem',
    example.codeSnippet && `code (${example.programmingLanguage})`,
    example.explanation && 'explanation',
  ].filter(Boolean)
  return parts.length > 0 ? [{ label: 'Includes', value: listFormat.format(parts) }] : []
}

export const EXAMPLE_KIND = {
  noun: 'example',
  heading: 'Examples',
  nameOf: (example) => example.title,
  get: getExample,
  create: createExample,
  update: updateExample,
  remove: deleteExample,
  renderForm: (example, formProps) => <ExampleForm example={example} {...formProps} />,
  includes: null,
  blockers: 'student activity records',
  removedWith: () => null,
  empty: 'This lesson has no examples yet.',
  statuses: CONTENT_STATUSES,
  detailsOf: (example) => [
    { label: 'Type', value: <span className="content-type">{formatEnumLabel(example.exampleType)}</span> },
    ...exampleParts(example),
    ...contentSource(example),
  ],
  dialogSize: 'wide',
  deleteEffect: 'It will be removed from this lesson, and students will no longer see it.',
}

// How many answers an exercise has, never the answers themselves.
function exerciseAnswers({ answerConfig }) {
  const count = (number, word) => `${number} ${word}${number === 1 ? '' : 's'}`
  if (Array.isArray(answerConfig?.options)) {
    return [{ label: 'Answers', value: count(answerConfig.options.length, 'option') }]
  }
  if (Array.isArray(answerConfig?.accepted_answers)) {
    const caseNote = answerConfig.case_sensitive ? ', case-sensitive' : ''
    return [{ label: 'Answers', value: `${count(answerConfig.accepted_answers.length, 'accepted answer')}${caseNote}` }]
  }
  return []
}

export const EXERCISE_KIND = {
  noun: 'practice exercise',
  heading: 'Practice exercises',
  nameOf: (exercise) => exercise.title,
  get: getExercise,
  create: createExercise,
  update: updateExercise,
  remove: deleteExercise,
  renderForm: (exercise, formProps) => <PracticeExerciseForm exercise={exercise} {...formProps} />,
  includes: null,
  blockers: 'student attempts',
  removedWith: () => null,
  empty: 'This lesson has no practice exercises yet.',
  statuses: CONTENT_STATUSES,
  hiddenNote: 'Students cannot open their earlier attempts at it while it is not published; the attempts are kept.',
  detailsOf: (exercise) => [
    { label: 'Type', value: <span className="content-type">{formatEnumLabel(exercise.exerciseType)}</span> },
    ...exerciseAnswers(exercise),
    { label: 'Difficulty', value: formatEnumLabel(exercise.difficulty) },
    { label: 'Bloom level', value: formatEnumLabel(exercise.bloomLevel) },
    ...(exercise.maxScore != null ? [{ label: 'Max score', value: exercise.maxScore }] : []),
    { label: 'Explanation', value: exercise.solutionExplanation ? 'included' : 'none' },
    ...(exercise.estimatedDurationMinutes != null
      ? [{ label: 'Estimated duration', value: `${exercise.estimatedDurationMinutes} min` }]
      : []),
    ...contentSource(exercise),
  ],
  dialogSize: 'wide',
  addLabel: 'Add Practice Exercise',
  deleteLabel: 'Delete Exercise',
  deleteEffect: 'It will be removed from this lesson, and students will no longer see it.',
}
