import './Button.css'

const variants = {
  primary: 'btn--primary',
  secondary: 'btn--secondary',
  ghost: 'btn--ghost',
  danger: 'btn--danger',
  subtle: 'btn--subtle',
}

const sizes = {
  sm: 'btn--sm',
  md: 'btn--md',
  lg: 'btn--lg',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  className = '',
  disabled,
  loading,
  ...props
}) {
  return (
    <button
      type={type}
      className={`btn ${variants[variant] || ''} ${sizes[size] || ''} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? 'Please wait…' : children}
    </button>
  )
}
