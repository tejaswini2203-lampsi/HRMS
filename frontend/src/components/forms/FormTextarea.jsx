import { FormField } from './FormInput'
import './FormField.css'

export default function FormTextarea({
  id,
  label,
  required,
  error,
  hint,
  rows = 3,
  className = '',
  ...props
}) {
  return (
    <FormField label={label} required={required} error={error} hint={hint} htmlFor={id}>
      <textarea
        id={id}
        rows={rows}
        className={`form-control form-control--textarea ${className}`.trim()}
        {...props}
      />
    </FormField>
  )
}
