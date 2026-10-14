// A labelled list filter whose first option, `allLabel`, means "no filter" (an empty value).
export default function FilterSelect({ id, label, allLabel, values, labelOf, value, onChange }) {
  return (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {values.map((option) => (
          <option key={option} value={option}>
            {labelOf(option)}
          </option>
        ))}
      </select>
    </div>
  )
}
