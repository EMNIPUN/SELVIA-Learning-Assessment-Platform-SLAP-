import { MATERIAL_TYPE, MATERIAL_TYPES } from '../../constants/materialTypes.js'
import { formatEnumLabel } from '../../utils/formatters.js'
import {
  checkHttpUrl,
  checkOneOf,
  checkOptionalText,
  checkRequiredText,
  collectErrors,
  DESCRIPTION_MAX_LENGTH,
  numberOrNull,
  textOrNull,
  TITLE_MAX_LENGTH,
} from '../../utils/formValidation.js'
import EntityForm from './EntityForm.jsx'
import {
  checkSequenceOrder,
  descriptionField,
  sequenceOrderField,
  sequenceOrderOrUndefined,
} from './structureFields.js'

// The API's limits for learning materials.
const STORAGE_KEY_MAX_LENGTH = 1024
const MIME_TYPE_MAX_LENGTH = 100
const MIME_TYPE_PATTERN = /^[a-z0-9][\w.+-]*\/[a-z0-9][\w.+-]*$/

// A material is stored either as a link to the web or as a reference to a file kept outside SELVIA; the API
// requires exactly one of the two. Link materials are always on the web, and format and size describe files.
const LOCATION = Object.freeze({ URL: 'url', FILE: 'file' })
const locationOf = (values) => (values.materialType === MATERIAL_TYPE.LINK ? LOCATION.URL : values.location)
const describesFile = (values) => values.materialType !== MATERIAL_TYPE.LINK

function fields(values, editing) {
  const location = locationOf(values)
  const typeOptions = MATERIAL_TYPES.map((type) => ({ value: type, label: formatEnumLabel(type) }))

  return [
    { name: 'title', label: 'Title', required: true, maxLength: TITLE_MAX_LENGTH },
    {
      ...descriptionField,
      rows: 3,
      hint: `Optional. Tells students what the material covers. Up to ${DESCRIPTION_MAX_LENGTH.toLocaleString()} characters.`,
    },
    {
      name: 'materialType',
      label: 'Material type',
      type: 'select',
      required: true,
      options: values.materialType ? typeOptions : [{ value: '', label: 'Choose a type' }, ...typeOptions],
      hint: 'Shown to students with the material. A Link always points to a web address.',
    },
    describesFile(values) && {
      name: 'location',
      label: 'Where is the material?',
      type: 'radio',
      required: true,
      options: [
        { value: LOCATION.URL, label: 'On the web (external URL)' },
        { value: LOCATION.FILE, label: 'Stored file (file storage key)' },
      ],
      hint: 'Files cannot be uploaded here. Students cannot open stored files online yet.',
    },
    location === LOCATION.URL && {
      name: 'externalUrl',
      label: 'External URL',
      required: true,
      inputMode: 'url',
      spellCheck: false,
      hint: 'The http or https address students open, for example https://example.com/notes.pdf.',
    },
    location === LOCATION.FILE && {
      name: 'fileStorageKey',
      label: 'File storage key',
      required: true,
      maxLength: STORAGE_KEY_MAX_LENGTH,
      spellCheck: false,
      hint: 'The key of a file already in file storage. Students never see it.',
    },
    describesFile(values) && {
      name: 'mimeType',
      label: 'Format (MIME type)',
      maxLength: MIME_TYPE_MAX_LENGTH,
      spellCheck: false,
      hint: 'Optional, for example application/pdf or video/mp4.',
      row: 'file',
    },
    describesFile(values) && {
      name: 'fileSizeBytes',
      label: 'File size (bytes)',
      inputMode: 'numeric',
      hint: 'Optional. A whole number of bytes; students see it as, for example, 2.4 MB.',
      row: 'file',
    },
    sequenceOrderField({ editing, siblings: 'material', parent: 'lesson' }),
  ].filter(Boolean)
}

function checkMimeType(value) {
  const text = value.trim().toLowerCase()
  if (!text) return undefined
  if (text.length > MIME_TYPE_MAX_LENGTH) return `MIME type must be at most ${MIME_TYPE_MAX_LENGTH} characters`
  if (!MIME_TYPE_PATTERN.test(text)) return 'MIME type must look like type/subtype, for example application/pdf'
}

function checkFileSize(value) {
  const text = value.trim()
  if (!text) return undefined
  if (!/^\d+$/.test(text)) return 'File size must be a whole number of bytes'
  if (!Number.isSafeInteger(Number(text))) return 'File size is too large'
}

function validate(values, editing) {
  const location = locationOf(values)
  const fileDetails = describesFile(values)
  return collectErrors({
    title: checkRequiredText(values.title, 'Title', TITLE_MAX_LENGTH),
    description: checkOptionalText(values.description, 'Description', DESCRIPTION_MAX_LENGTH),
    materialType: checkOneOf(values.materialType, MATERIAL_TYPES, 'Choose a material type'),
    location: fileDetails ? checkOneOf(values.location, Object.values(LOCATION), 'Choose where the material is') : undefined,
    externalUrl: location === LOCATION.URL ? checkHttpUrl(values.externalUrl, 'External URL') : undefined,
    fileStorageKey:
      location === LOCATION.FILE
        ? checkRequiredText(values.fileStorageKey, 'File storage key', STORAGE_KEY_MAX_LENGTH)
        : undefined,
    mimeType: fileDetails ? checkMimeType(values.mimeType) : undefined,
    fileSizeBytes: fileDetails ? checkFileSize(values.fileSizeBytes) : undefined,
    sequenceOrder: checkSequenceOrder(values.sequenceOrder, editing),
  })
}

// Fields that do not apply to the chosen type or location are not sent for a new material, and are cleared
// when editing (only if they hold a value, as unchanged fields are never sent).
function toFields(values, editing) {
  const location = locationOf(values)
  const fileDetails = describesFile(values)
  const notApplicable = editing ? null : undefined
  return {
    title: values.title.trim(),
    description: textOrNull(values.description),
    materialType: values.materialType,
    externalUrl: location === LOCATION.URL ? values.externalUrl.trim() : notApplicable,
    fileStorageKey: location === LOCATION.FILE ? values.fileStorageKey.trim() : notApplicable,
    mimeType: fileDetails ? (textOrNull(values.mimeType)?.toLowerCase() ?? null) : notApplicable,
    fileSizeBytes: fileDetails ? numberOrNull(values.fileSizeBytes) : notApplicable,
    sequenceOrder: sequenceOrderOrUndefined(values.sequenceOrder),
  }
}

function initialValues(material) {
  return {
    title: material?.title ?? '',
    description: material?.description ?? '',
    materialType: material?.materialType ?? '',
    location: material?.fileStorageKey ? LOCATION.FILE : LOCATION.URL,
    externalUrl: material?.externalUrl ?? '',
    fileStorageKey: material?.fileStorageKey ?? '',
    mimeType: material?.mimeType ?? '',
    fileSizeBytes: material?.fileSizeBytes == null ? '' : String(material.fileSizeBytes),
    sequenceOrder: material?.sequenceOrder == null ? '' : String(material.sequenceOrder),
  }
}

// Creates a learning material, or edits `material` and submits only the fields that changed. The material's
// content source is managed by the API and left untouched.
export default function LearningMaterialForm({ material, ...formProps }) {
  const editing = Boolean(material)
  return (
    <EntityForm
      noun="learning material"
      fields={(values) => fields(values, editing)}
      initialValues={() => initialValues(material)}
      validate={(values) => validate(values, editing)}
      toFields={(values) => toFields(values, editing)}
      original={material}
      {...formProps}
    />
  )
}
