import { Link } from 'react-router-dom'
import Button from '../common/Button'
import Badge, { statusBadgeVariant } from '../common/Badge'
import { formatDateTime } from '../../utils/dates'
import { getNotificationLink } from '../../utils/notifications'
import './NotificationCard.css'

export default function NotificationCard({ notification, onMarkRead }) {
  const link = getNotificationLink(notification)
  const isUnread = !notification.read

  return (
    <article className={`notification-card ${isUnread ? 'notification-card--unread' : ''}`}>
      <div className="notification-card__dot" aria-hidden="true" />
      <div className="notification-card__body">
        <div className="notification-card__head">
          <strong>{notification.title}</strong>
          <Badge variant={statusBadgeVariant(notification.status)}>
            {notification.status}
          </Badge>
        </div>
        <p className="notification-card__message">{notification.message}</p>
        <div className="notification-card__meta">
          <span>{formatDateTime(notification.createdAt)}</span>
          {notification.relatedEntity ? (
            <span className="mono">{notification.relatedEntity}</span>
          ) : null}
        </div>
      </div>
      <div className="notification-card__actions">
        <Link to={link}>
          <Button variant="secondary" size="sm">
            Review
          </Button>
        </Link>
        {isUnread ? (
          <Button
            variant="subtle"
            size="sm"
            onClick={() => onMarkRead?.(notification.id)}
          >
            Mark read
          </Button>
        ) : null}
      </div>
    </article>
  )
}
