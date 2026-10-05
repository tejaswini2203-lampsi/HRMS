import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import Button from '../components/common/Button'
import LoadingState from '../components/common/LoadingState'
import EmptyState from '../components/common/EmptyState'
import NotificationCard from '../components/notifications/NotificationCard'
import FormSelect from '../components/forms/FormSelect'
import { useToast } from '../context/ToastContext'
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/api'

export default function NotificationsPage() {
  const toast = useToast()
  const { setUnreadCount } = useOutletContext() || {}
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([])
  const [typeFilter, setTypeFilter] = useState('')
  const [readFilter, setReadFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const nRes = await getNotifications()
      setRows(nRes.data)
    } catch (e) {
      setError(e.message || 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    let list = [...rows]
    if (typeFilter) list = list.filter((n) => n.typeKey === typeFilter)
    if (readFilter === 'unread') list = list.filter((n) => !n.read)
    if (readFilter === 'read') list = list.filter((n) => n.read)
    list.sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime()
      const tb = new Date(b.createdAt || 0).getTime()
      if (tb !== ta) return tb - ta
      return Number(b.id) - Number(a.id)
    })
    return list
  }, [rows, typeFilter, readFilter])

  const typeOptions = useMemo(() => {
    const map = new Map()
    rows.forEach((n) => {
      if (!n.typeKey || map.has(n.typeKey)) return
      map.set(n.typeKey, n.title || n.alertType || n.typeKey)
    })
    return [...map.entries()].map(([value, label]) => ({ value, label }))
  }, [rows])

  const unreadCount = rows.filter((n) => !n.read).length

  const markRead = async (id) => {
    const current = rows.find((n) => n.id === id)
    if (!current || current.read) return
    try {
      const res = await markNotificationRead(id)
      setRows((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, ...res.data, read: true, status: 'Read' } : n,
        ),
      )
      setUnreadCount?.((count) => Math.max(0, count - 1))
      toast.info('Marked as read')
    } catch (e) {
      toast.error(e.message || 'Failed to mark as read')
    }
  }

  const markAll = async () => {
    try {
      await markAllNotificationsRead()
      setRows((prev) =>
        prev.map((n) => (n.read ? n : { ...n, read: true, status: 'Read' })),
      )
      setUnreadCount?.(0)
      toast.success('All notifications marked as read')
    } catch (e) {
      toast.error(e.message || 'Failed to mark all as read')
    }
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={`${unreadCount} unread · Actionable alerts for leave, passport, vehicle, and compliance`}
        actions={
          <Button variant="secondary" onClick={markAll}>
            Mark all read
          </Button>
        }
      />

      <div className="filters-bar">
        <FormSelect
          id="n-type"
          label="Type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={typeOptions}
          placeholder="All types"
        />
        <FormSelect
          id="n-read"
          label="Read state"
          value={readFilter}
          onChange={(e) => setReadFilter(e.target.value)}
          options={[
            { value: 'unread', label: 'Unread' },
            { value: 'read', label: 'Read' },
          ]}
          placeholder="All"
        />
      </div>

      {loading ? <LoadingState label="Loading notifications…" /> : null}
      {error ? (
        <EmptyState
          title="Could not load notifications"
          description={error}
          actionLabel="Retry"
          onAction={load}
        />
      ) : null}

      {!loading && !error ? (
        <div className="notification-list">
          {filtered.length === 0 ? (
            <EmptyState
              title={
                rows.length === 0
                  ? 'No notifications'
                  : 'No notifications match the current filters'
              }
              description=""
            />
          ) : (
            filtered.map((n) => (
              <NotificationCard
                key={n.id}
                notification={n}
                onMarkRead={markRead}
              />
            ))
          )}
        </div>
      ) : null}

      <style>{`
        .notification-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
      `}</style>
    </div>
  )
}
