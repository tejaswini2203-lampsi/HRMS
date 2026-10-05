import './PageHeader.css'
import Button from './Button'

export default function PageHeader({
  title,
  subtitle,
  actions,
  primaryAction,
  children,
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
      </div>
      <div className="page-header__actions">
        {actions}
        {children}
        {primaryAction ? (
          <Button onClick={primaryAction.onClick}>{primaryAction.label}</Button>
        ) : null}
      </div>
    </div>
  )
}
