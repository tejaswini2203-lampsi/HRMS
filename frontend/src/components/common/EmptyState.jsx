import Button from './Button'
import './EmptyState.css'

export default function EmptyState({
  title = 'No records found',
  description = 'Try adjusting your filters or create a new record.',
  actionLabel,
  onAction,
  icon = '◇',
}) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-state__icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {actionLabel && onAction ? (
        <Button onClick={onAction}>{actionLabel}</Button>
      ) : null}
    </div>
  )
}
