import { ACTIVITY_TYPES } from '../constants/activityTypes.js'
import { trackActivity } from '../services/activityTracking.js'
import { formatEnumLabel, formatFileSize } from '../utils/formatters.js'
import { toSafeExternalUrl } from '../utils/safeUrl.js'
import ExternalLink from './ExternalLink.jsx'

// A material is either an external link or a stored file (fileStorageKey). There is no download endpoint
// for stored files yet, so only external links can be opened. Each time the student opens one, a
// MATERIAL_VIEWED activity is recorded in the background while the link opens as usual.
function MaterialAccess({ material }) {
  if (material.externalUrl) {
    const safeUrl = toSafeExternalUrl(material.externalUrl)
    if (!safeUrl) return <p className="material-note">This link cannot be opened safely.</p>

    return (
      <div className="material-access">
        <ExternalLink
          href={safeUrl}
          className="button button-primary button-small"
          onOpen={() => trackActivity(ACTIVITY_TYPES.MATERIAL_VIEWED, material.id)}
        >
          Open material ↗
        </ExternalLink>
        <span className="material-host">{new URL(safeUrl).host}</span>
      </div>
    )
  }
  return <p className="material-note">This file is not available to open online yet.</p>
}

export default function MaterialCard({ material, position }) {
  const hasMeta = material.mimeType || material.fileSizeBytes != null

  return (
    <article className="card content-card">
      <div className="course-card-header">
        <span className="lesson-label">Material {position}</span>
        <span className="content-type">{formatEnumLabel(material.materialType)}</span>
      </div>
      <h3 className="content-card-title">{material.title}</h3>
      {material.description && <p className="content-card-description">{material.description}</p>}
      {hasMeta && (
        <dl className="course-meta">
          {material.mimeType && (
            <div>
              <dt>Format</dt>
              <dd>{material.mimeType}</dd>
            </div>
          )}
          {material.fileSizeBytes != null && (
            <div>
              <dt>Size</dt>
              <dd>{formatFileSize(material.fileSizeBytes)}</dd>
            </div>
          )}
        </dl>
      )}
      <MaterialAccess material={material} />
    </article>
  )
}
