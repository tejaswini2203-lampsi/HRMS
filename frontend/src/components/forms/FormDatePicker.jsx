import { FormField } from './FormInput'
import './FormField.css'

export default function FormDatePicker({
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
      <input
        id={id}
        type="date"
        className={`form-control ${className}`.trim()}
        {...props}
      />
    </FormField>
  )
}
