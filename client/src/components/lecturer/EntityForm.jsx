import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { getActionErrorMessage } from '../../utils/errorMessages.js'

// The API may return an object's keys in a different order than they were sent.
function sameValue(a, b) {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]))
}

// A create or edit form described by `fields`, in form order:
//   { name, label, type: 'text' | 'textarea' | 'select' | 'radio' | 'custom', required, maxLength, hint,
//     options: [{ value, label }], inputMode, spellCheck, rows, row, code, render, nestedError }
// `code: true` shows a textarea in a fixed-width font without spelling or capitalisation corrections.
// A 'custom' field is a group labelled by its legend whose controls come from
// `render({ id, value, onChange(value | current => value), invalid, ref })`; `ref` receives an object with a
// focus() method.
// `fields` may also be a function of the entered values, for fields that only apply to some choices.
// Consecutive fields with the same `row` share a line on wider screens.
// `validate(values)` returns { field: message } for the entered text. The API stays the final authority: its
// field errors (400 validation, 409 duplicates) are shown next to the fields they belong to. An error for a
// part of a field ("answerConfig.options.1.text") is shown on the field, worded by
// `nestedError(path, message)` when given ("options.1.text").
// `toFields(values)` converts the entered text to request fields; a field that is `undefined` is not sent.
// When editing `original`, only the fields that differ from it are submitted; objects and lists are compared
// by content.
// `onSubmit(fields)` performs the request; if it throws, the error is shown and the entered values are kept.
// `onSubmittingChange(submitting)` lets the surrounding dialog stay open while a request is in progress.
export default function EntityForm({
  noun,
  fields: fieldsOf,
  initialValues,
  validate,
  toFields,
  original,
  submitLabel,
  submittingLabel,
  onSubmit,
  onCancel,
  onSubmittingChange,
}) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [requestError, setRequestError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const fieldRefs = useRef({})
  const alertRef = useRef(null)
  const idPrefix = useId()
  const fields = typeof fieldsOf === 'function' ? fieldsOf(values) : fieldsOf
  const fieldNames = fields.map((field) => field.name)

  useEffect(() => {
    fieldRefs.current[fields[0].name]?.focus()
  }, [])

  // The API reports validation failures and duplicates as { field, message } details.
  function splitErrorDetails(error) {
    const fieldErrors = {}
    const otherMessages = []
    for (const { field: path, message } of error?.details ?? []) {
      const field = fields.find(({ name }) => path === name || path?.startsWith(`${name}.`))
      if (!field) {
        if (message) otherMessages.push(message)
      } else if (path === field.name) {
        fieldErrors[field.name] ??= message
      } else {
        const part = path.slice(field.name.length + 1)
        fieldErrors[field.name] ??= field.nestedError ? field.nestedError(part, message) : message
      }
    }
    return { fieldErrors, otherMessages }
  }

  function requestErrorMessage(error) {
    const { fieldErrors, otherMessages } = splitErrorDetails(error)
    if (otherMessages.length > 0) return otherMessages.join(' ')
    if (Object.keys(fieldErrors).length > 0) return 'Check the highlighted fields and try again.'
    return getActionErrorMessage(error)
  }

  function focusFirstError(fieldErrors) {
    const name = fieldNames.find((fieldName) => fieldErrors[fieldName])
    if (name) fieldRefs.current[name]?.focus()
    else alertRef.current?.focus()
  }

  // `value` may be a function of the field's current value.
  function setValue(name, value) {
    setValues((previous) => ({ ...previous, [name]: typeof value === 'function' ? value(previous[name]) : value }))
    setErrors((previous) => (previous[name] ? { ...previous, [name]: undefined } : previous))
    setNotice(null)
  }

  function handleChange(event) {
    setValue(event.target.name, event.target.value)
  }

  function setBusy(busy) {
    submittingRef.current = busy
    setSubmitting(busy)
    onSubmittingChange?.(busy)
  }

  function requestFields() {
    return Object.fromEntries(
      Object.entries(toFields(values)).filter(
        ([name, value]) => value !== undefined && (!original || !sameValue(value, original[name] ?? null)),
      ),
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submittingRef.current) return
    setRequestError(null)
    setNotice(null)

    const clientErrors = validate(values)
    if (Object.keys(clientErrors).length > 0) {
      flushSync(() => setErrors(clientErrors))
      focusFirstError(clientErrors)
      return
    }
    setErrors({})

    const submitted = requestFields()
    if (Object.keys(submitted).length === 0) {
      setNotice('No changes to save.')
      return
    }

    setBusy(true)
    try {
      await onSubmit(submitted)
    } catch (err) {
      const { fieldErrors } = splitErrorDetails(err)
      flushSync(() => {
        setBusy(false)
        setErrors(fieldErrors)
        setRequestError(err)
      })
      focusFirstError(fieldErrors)
      return
    }
    setBusy(false)
  }

  const fieldId = (name) => `${idPrefix}-${name}`

  function renderControl(field) {
    const { name } = field
    const describedBy = [field.hint && `${fieldId(name)}-hint`, errors[name] && `${fieldId(name)}-error`]
      .filter(Boolean)
      .join(' ')
    const props = {
      id: fieldId(name),
      name,
      value: values[name],
      onChange: handleChange,
      ref: (element) => {
        fieldRefs.current[name] = element
      },
      required: field.required,
      'aria-invalid': Boolean(errors[name]),
      'aria-describedby': describedBy || undefined,
    }

    if (field.type === 'select') {
      return (
        <select {...props}>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    }
    if (field.type === 'textarea') {
      return (
        <textarea
          {...props}
          rows={field.rows ?? 4}
          maxLength={field.maxLength}
          className={field.code ? 'form-code' : undefined}
          spellCheck={field.code ? false : field.spellCheck}
          autoCapitalize={field.code ? 'off' : undefined}
          autoCorrect={field.code ? 'off' : undefined}
        />
      )
    }
    return (
      <input
        {...props}
        type="text"
        autoComplete="off"
        inputMode={field.inputMode}
        spellCheck={field.spellCheck}
        maxLength={field.maxLength}
      />
    )
  }

  // A radio group is labelled by its legend; focus goes to the chosen option, or the first one.
  function renderChoice(field) {
    const { name } = field
    const describedBy = [field.hint && `${fieldId(name)}-hint`, errors[name] && `${fieldId(name)}-error`]
      .filter(Boolean)
      .join(' ')
    const focusValue = field.options.some((option) => option.value === values[name])
      ? values[name]
      : field.options[0].value

    return (
      <fieldset key={name} className="form-field form-choice" aria-describedby={describedBy || undefined}>
        <legend className="form-label">
          {field.label}
          {field.required && (
            <>
              {' '}
              <span className="form-required" aria-hidden="true">
                *
              </span>
            </>
          )}
        </legend>
        <div className="form-choice-options">
          {field.options.map((option) => (
            <label key={option.value} className="form-choice-option">
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={values[name] === option.value}
                onChange={handleChange}
                ref={(element) => {
                  if (option.value === focusValue) fieldRefs.current[name] = element
                }}
                aria-invalid={Boolean(errors[name])}
              />
              {option.label}
            </label>
          ))}
        </div>
        {field.hint && (
          <span id={`${fieldId(name)}-hint`} className="form-hint">
            {field.hint}
          </span>
        )}
        {errors[name] && (
          <span id={`${fieldId(name)}-error`} className="form-error">
            {errors[name]}
          </span>
        )}
      </fieldset>
    )
  }

  function renderCustom(field) {
    const { name } = field
    const describedBy = [field.hint && `${fieldId(name)}-hint`, errors[name] && `${fieldId(name)}-error`]
      .filter(Boolean)
      .join(' ')

    return (
      <fieldset key={name} className="form-field form-choice" aria-describedby={describedBy || undefined}>
        <legend className="form-label">
          {field.label}
          {field.required && (
            <>
              {' '}
              <span className="form-required" aria-hidden="true">
                *
              </span>
            </>
          )}
        </legend>
        {field.hint && (
          <span id={`${fieldId(name)}-hint`} className="form-hint">
            {field.hint}
          </span>
        )}
        {field.render({
          id: fieldId(name),
          value: values[name],
          onChange: (value) => setValue(name, value),
          invalid: Boolean(errors[name]),
          ref: (handle) => {
            fieldRefs.current[name] = handle
          },
        })}
        {errors[name] && (
          <span id={`${fieldId(name)}-error`} className="form-error">
            {errors[name]}
          </span>
        )}
      </fieldset>
    )
  }

  function renderField(field) {
    const { name } = field
    if (field.type === 'radio') return renderChoice(field)
    if (field.type === 'custom') return renderCustom(field)
    return (
      <div key={name} className="form-field">
        <label className="form-label" htmlFor={fieldId(name)}>
          {field.label}
          {field.required && (
            <>
              {' '}
              <span className="form-required" aria-hidden="true">
                *
              </span>
            </>
          )}
        </label>
        {renderControl(field)}
        {field.hint && (
          <span id={`${fieldId(name)}-hint`} className="form-hint">
            {field.hint}
          </span>
        )}
        {errors[name] && (
          <span id={`${fieldId(name)}-error`} className="form-error">
            {errors[name]}
          </span>
        )}
      </div>
    )
  }

  // Consecutive fields that share a `row` are grouped onto one line.
  const groups = []
  for (const field of fields) {
    const last = groups.at(-1)
    if (field.row && last?.row === field.row) last.fields.push(field)
    else groups.push({ row: field.row, fields: [field] })
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <p className="form-hint">
        Fields marked <span className="form-required">*</span> are required.
      </p>

      {requestError && (
        <p ref={alertRef} className="alert alert-error" role="alert" tabIndex={-1}>
          The {noun} was not saved. {requestErrorMessage(requestError)}
        </p>
      )}

      <fieldset className="form-fieldset" disabled={submitting}>
        {groups.map((group) =>
          group.fields.length > 1 ? (
            <div key={group.fields[0].name} className="form-row">
              {group.fields.map(renderField)}
            </div>
          ) : (
            <Fragment key={group.fields[0].name}>{renderField(group.fields[0])}</Fragment>
          ),
        )}
      </fieldset>

      {notice && (
        <p className="alert alert-info" role="status">
          {notice}
        </p>
      )}

      <div className="dialog-actions">
        <button type="button" className="button button-secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  )
}
