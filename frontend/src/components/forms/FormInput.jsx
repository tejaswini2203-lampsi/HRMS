import './FormField.css'

export function FormField({ label, required, error, hint, htmlFor, children }) {
  return (
    <div className={`form-field ${error ? 'has-error' : ''}`}>
      {label ? (
        <label className="form-field__label" htmlFor={htmlFor}>
          {label}
          {required ? <span className="form-field__req" aria-hidden="true">*</span> : null}
        </label>
      ) : null}
      {children}
      {hint && !error ? <p className="form-field__hint">{hint}</p> : null}
      {error ? (
        <p className="form-field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export default function FormInput({
  id,
  label,
  required,
  error,
  hint,
  className = '',
  ...props
}) {
  return (
    <FormField label={label} required={required} error={error} hint={hint} htmlFor={id}>
      <input id={id} className={`form-control ${className}`.trim()} {...props} />
    </FormField>
  )
}
