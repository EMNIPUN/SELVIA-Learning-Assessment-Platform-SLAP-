import { useId } from 'react'
import StatusBadge from '../StatusBadge.jsx'
import LevelHeading from './LevelHeading.jsx'

// One module, topic, concept, lesson, learning material, example or practice exercise with its edit, status
// and delete actions. When `children` is given (the item's
// own list, mounted on first expand), the title becomes a disclosure button for it; collapsing only hides the
// list, so its loaded data is kept.
export default function StructureItem({
  kind,
  item,
  headingLevel,
  expanded,
  onToggle,
  onEdit,
  onChangeStatus,
  onDelete,
  children,
}) {
  const panelId = useId()
  const name = kind.nameOf(item)
  const expandable = Boolean(onToggle)
  const description = kind.summaryOf ? kind.summaryOf(item) : item.description
  const details = kind.detailsOf?.(item) ?? []

  const title = (
    <span className="structure-item-name">
      {item.code && <span className="course-code">{item.code}</span>}
      {name}
    </span>
  )

  return (
    <article className={`structure-item structure-item-${kind.noun.replaceAll(' ', '-')}`}>
      <div className="structure-item-header">
        <LevelHeading level={headingLevel} className="structure-item-title">
          {expandable ? (
            <button
              type="button"
              className="structure-toggle"
              aria-expanded={expanded}
              aria-controls={children ? panelId : undefined}
              onClick={onToggle}
            >
              <span className="structure-toggle-icon" aria-hidden="true">
                ▸
              </span>
              {title}
            </button>
          ) : (
            title
          )}
        </LevelHeading>
        <div className="structure-item-actions">
          <button type="button" className="button button-secondary button-small" onClick={onEdit}>
            Edit
            <span className="visually-hidden">
              {' '}
              {kind.noun} {name}
            </span>
          </button>
          <button type="button" className="button button-secondary button-small" onClick={onChangeStatus}>
            Change status
            <span className="visually-hidden">
              {' '}
              of {kind.noun} {name}
            </span>
          </button>
          <button type="button" className="button button-danger-outline button-small" onClick={onDelete}>
            Delete
            <span className="visually-hidden">
              {' '}
              {kind.noun} {name}
            </span>
          </button>
        </div>
      </div>

      <div className="structure-item-meta">
        <span>Order {item.sequenceOrder}</span>
        {details.map(({ label, value }) => (
          <span key={label}>
            {label} {value}
          </span>
        ))}
        <StatusBadge status={item.status} />
      </div>
      {description && <p className="structure-item-description">{description}</p>}

      {children && (
        <div id={panelId} className="structure-children" hidden={!expanded}>
          {children}
        </div>
      )}
    </article>
  )
}
