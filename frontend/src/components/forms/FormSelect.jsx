import { FormField } from './FormInput'
import './FormField.css'

export default function FormSelect({
  id,
  label,
  required,
  error,
  hint,
  options = [],
  placeholder = 'Select…',
  className = '',
  ...props
}) {
  return (
    <FormField label={label} required={required} error={error} hint={hint} htmlFor={id}>
      <select id={id} className={`form-control ${className}`.trim()} {...props}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((opt) => {
          const value = typeof opt === 'string' ? opt : opt.value
          const text = typeof opt === 'string' ? opt : opt.label
          return (
            <option key={value} value={value}>
              {text}
            </option>
          )
        })}
      </select>
    </FormField>
  )
}
