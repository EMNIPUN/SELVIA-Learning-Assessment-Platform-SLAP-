import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { CONTENT_STATUS } from '../../constants/contentStatus.js'
import { capitalize, formatEnumLabel } from '../../utils/formatters.js'
import ErrorState from '../ErrorState.jsx'
import LoadingState from '../LoadingState.jsx'
import ConfirmDeleteDialog from './ConfirmDeleteDialog.jsx'
import FormDialog from './FormDialog.jsx'
import LevelHeading from './LevelHeading.jsx'
import StatusChangeDialog from './StatusChangeDialog.jsx'
import { statusSummary } from './statusChange.js'
import StructureItem from './StructureItem.jsx'
import { useStructureFeedback } from './structureFeedback.js'

const byPosition = (a, b) => a.sequenceOrder - b.sequenceOrder

// The modules of a course, the topics of a module, the concepts of a topic, the lessons of a concept or the
// learning materials, examples or practice exercises of a lesson (`kind`), with add, edit and delete. The list is updated with the records the API returns, in the API's
// order (sequence order), so changes appear without reloading. `items` is null until loaded.
// `renderChildren(item)` gives each item an expandable list of its own; a newly added item starts expanded.
// `collapsible: { expanded, onToggle }` turns the heading into a disclosure button for the whole list; while
// collapsed only the heading is shown.
// `ancestors` ([{ noun, name, status }], the course first) describe what is above the items, so the status
// dialog can say what still keeps an item from students. New items start as drafts; only the status dialog
// changes a status.
export default function StructureList({
  kind,
  parentId,
  parentLabel,
  ancestors = [],
  headingLevel,
  intro,
  items,
  loading,
  error,
  onRetry,
  updateItems,
  renderChildren,
  collapsible,
}) {
  const { feedback, notify } = useStructureFeedback()
  // { type: 'create' } | { type: 'edit', item } | { type: 'status', item } | { type: 'delete', item }
  const [dialog, setDialog] = useState(null)
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  // Items whose list has been opened at least once stay mounted, so collapsing never discards loaded data.
  const [openedIds, setOpenedIds] = useState(() => new Set())
  const addButtonRef = useRef(null)
  const errorRef = useRef(null)
  const retryingRef = useRef(false)
  const headingId = useId()
  const bodyId = useId()
  const collapsed = Boolean(collapsible) && !collapsible.expanded

  const feedbackKey = `${kind.noun}:${parentId}`
  const ownFeedback = feedback?.key === feedbackKey ? feedback : null
  const Noun = capitalize(kind.noun)
  const addLabel = kind.addLabel ?? `Add ${Noun}`

  // Try again disappears while the list reloads, so focus moves to the add button once it is usable, or back
  // to the error if the retry failed too.
  useEffect(() => {
    if (!retryingRef.current || loading) return
    retryingRef.current = false
    if (error) errorRef.current?.focus()
    else addButtonRef.current?.focus()
  }, [loading, error])

  function retry() {
    retryingRef.current = true
    onRetry()
  }

  function show(type, message) {
    notify({ key: feedbackKey, type, message })
  }

  function openDialog(next) {
    notify(null)
    setDialog(next)
  }

  function closeDialog() {
    setDialog(null)
  }

  function expand(id) {
    setExpandedIds((ids) => new Set(ids).add(id))
    setOpenedIds((ids) => new Set(ids).add(id))
  }

  function toggle(id) {
    if (!expandedIds.has(id)) {
      expand(id)
      return
    }
    setExpandedIds((ids) => {
      const next = new Set(ids)
      next.delete(id)
      return next
    })
  }

  function handleCreated(item) {
    updateItems((list) => [...list, item].sort(byPosition))
    if (renderChildren) expand(item.id)
    setDialog(null)
    const draft = item.status === CONTENT_STATUS.DRAFT ? ' as a draft' : ''
    show('success', `${Noun} "${kind.nameOf(item)}" was added${draft}.`)
  }

  function replaceItem(item) {
    updateItems((list) => list.map((existing) => (existing.id === item.id ? item : existing)).sort(byPosition))
  }

  function handleSaved(item) {
    replaceItem(item)
    setDialog(null)
    show('success', `${Noun} "${kind.nameOf(item)}" was updated.`)
  }

  function handleStatusChanged(item) {
    replaceItem(item)
    setDialog(null)
    show('success', `${Noun} "${kind.nameOf(item)}" is now ${formatEnumLabel(item.status)}.`)
  }

  // The item disappears with the control that opened the dialog, so focus moves to this list's add button.
  function removeItem(item, type, message) {
    flushSync(() => {
      updateItems((list) => list.filter((existing) => existing.id !== item.id))
      setDialog(null)
      show(type, message)
    })
    addButtonRef.current?.focus()
  }

  function handleDeleted(item, deleted) {
    const removedWith = kind.removedWith(deleted)
    const name = kind.nameOf(item)
    removeItem(
      item,
      'success',
      removedWith ? `${Noun} "${name}" was deleted, together with ${removedWith}.` : `${Noun} "${name}" was deleted.`,
    )
  }

  function handleMissing(item) {
    removeItem(item, 'error', `${Noun} "${kind.nameOf(item)}" no longer exists, so it was removed from this page.`)
  }

  const formLabels = (editing) =>
    editing
      ? { submitLabel: 'Save changes', submittingLabel: 'Saving…' }
      : { submitLabel: addLabel, submittingLabel: 'Adding…' }

  return (
    <section className={`structure-list structure-list-${kind.noun.replaceAll(' ', '-')}`} aria-labelledby={headingId}>
      <div className="structure-list-header">
        <div className="structure-list-heading">
          <LevelHeading level={headingLevel} id={collapsible ? undefined : headingId} className="structure-list-title">
            {collapsible ? (
              <button
                type="button"
                className="structure-toggle structure-list-toggle"
                aria-expanded={collapsible.expanded}
                aria-controls={bodyId}
                onClick={collapsible.onToggle}
              >
                <span className="structure-toggle-icon" aria-hidden="true">
                  ▸
                </span>
                <span id={headingId}>
                  {kind.heading}
                  {parentLabel && <span className="visually-hidden"> in {parentLabel}</span>}
                </span>
              </button>
            ) : (
              <>
                {kind.heading}
                {parentLabel && <span className="visually-hidden"> in {parentLabel}</span>}
              </>
            )}
          </LevelHeading>
          {intro && <p className="muted structure-list-intro">{intro}</p>}
        </div>
        {!collapsed && (
          <button
            ref={addButtonRef}
            type="button"
            className={`button ${headingLevel === 2 ? 'button-primary' : 'button-secondary button-small'}`}
            onClick={() => openDialog({ type: 'create' })}
            disabled={!items}
          >
            <span aria-hidden="true">+</span> {addLabel}
            {parentLabel && <span className="visually-hidden"> to {parentLabel}</span>}
          </button>
        )}
      </div>

      <div id={bodyId} hidden={collapsed}>
        <div role="status" aria-live="polite">
          {ownFeedback?.type === 'success' && <p className="alert alert-success">{ownFeedback.message}</p>}
        </div>
        <div role="alert">
          {ownFeedback?.type === 'error' && <p className="alert alert-error">{ownFeedback.message}</p>}
        </div>

        {loading && <LoadingState message={`Loading ${kind.heading.toLowerCase()}…`} />}
        {!loading && error && (
          <div ref={errorRef} tabIndex={-1}>
            <ErrorState error={error} title={`Could not load the ${kind.heading.toLowerCase()}`} onRetry={retry} />
          </div>
        )}
        {!loading && !error && items?.length === 0 && (
          <p className="structure-empty">
            {kind.empty} Use {addLabel} to create the first one.
          </p>
        )}
        {!loading && !error && items?.length > 0 && (
          <p className="structure-status-summary">
            {statusSummary(items, { noun: kind.noun, plural: kind.heading.toLowerCase() })}
          </p>
        )}
        {!loading && !error && items?.length > 0 && (
          <ul className="structure-items">
            {items.map((item) => (
              <li key={item.id}>
                <StructureItem
                  kind={kind}
                  item={item}
                  headingLevel={headingLevel + 1}
                  expanded={expandedIds.has(item.id)}
                  onToggle={renderChildren ? () => toggle(item.id) : undefined}
                  onEdit={() => openDialog({ type: 'edit', item })}
                  onChangeStatus={() => openDialog({ type: 'status', item })}
                  onDelete={() => openDialog({ type: 'delete', item })}
                >
                  {renderChildren && openedIds.has(item.id) ? renderChildren(item) : null}
                </StructureItem>
              </li>
            ))}
          </ul>
        )}
      </div>

      {dialog?.type === 'create' && (
        <FormDialog
          title={`Add ${kind.noun}`}
          noun={kind.noun}
          size={kind.dialogSize}
          save={(fields) => kind.create(parentId, fields)}
          onSaved={handleCreated}
          onClose={closeDialog}
          renderForm={(_, formProps) => kind.renderForm(undefined, { ...formLabels(false), ...formProps })}
        />
      )}
      {dialog?.type === 'edit' && (
        <FormDialog
          title={`Edit ${kind.noun}`}
          noun={kind.noun}
          size={kind.dialogSize}
          load={(signal) => kind.get(dialog.item.id, { signal })}
          save={(changes) => kind.update(dialog.item.id, changes)}
          onSaved={handleSaved}
          onMissing={() => handleMissing(dialog.item)}
          onClose={closeDialog}
          renderForm={(item, formProps) => kind.renderForm(item, { ...formLabels(true), ...formProps })}
        />
      )}
      {dialog?.type === 'status' && (
        <StatusChangeDialog
          noun={kind.noun}
          nameOf={kind.nameOf}
          statuses={kind.statuses}
          scope={{ ancestors, contains: kind.contains, hiddenNote: kind.hiddenNote }}
          load={(signal) => kind.get(dialog.item.id, { signal })}
          save={(status) => kind.update(dialog.item.id, { status })}
          onLoaded={replaceItem}
          onSaved={handleStatusChanged}
          onMissing={() => handleMissing(dialog.item)}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmDeleteDialog
          noun={kind.noun}
          confirmLabel={kind.deleteLabel}
          remove={() => kind.remove(dialog.item.id)}
          onDeleted={(deleted) => handleDeleted(dialog.item, deleted)}
          onMissing={() => handleMissing(dialog.item)}
          onClose={closeDialog}
        >
          <p>
            You are about to permanently delete the {kind.noun}{' '}
            <strong>
              {dialog.item.code && `${dialog.item.code} `}
              {kind.nameOf(dialog.item)}
            </strong>
            {kind.includes && `, together with ${kind.includes}`}. This cannot be undone.
            {kind.deleteEffect && ` ${kind.deleteEffect}`}
          </p>
          <p className="muted">
            This {kind.noun} cannot be deleted while {kind.blockers} depend on it. Use Change status to archive it
            instead.
          </p>
        </ConfirmDeleteDialog>
      )}
    </section>
  )
}
