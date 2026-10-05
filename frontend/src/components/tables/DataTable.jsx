import { useState } from 'react'
import EmptyState from '../common/EmptyState'
import LoadingState, { ErrorState } from '../common/LoadingState'
import './DataTable.css'

const BADGE_KEYS = new Set(['status', 'isActive', 'expiryStatus', 'bookingStatus'])

function renderCell(col, row) {
  return col.render ? col.render(row) : row[col.key]
}

function isBadgeColumn(col) {
  return BADGE_KEYS.has(col.key) || /status/i.test(col.header || '')
}

export default function DataTable({
  columns = [],
  rows = [],
  rowKey = 'id',
  loading = false,
  error = null,
  onRetry,
  emptyTitle,
  emptyDescription,
  paginated = false,
  pageSize = 8,
  onRowClick,
  compact = false,
}) {
  const [page, setPage] = useState(1)

  const actionCol = columns.find((col) => col.key === 'actions')
  const dataCols = columns.filter((col) => col.key !== 'actions')
  const primaryCol = dataCols[0]
  const badgeCol = dataCols.find(isBadgeColumn)
  const metaCols = dataCols.filter((col) => col !== primaryCol && col !== badgeCol)

  const totalPages = paginated
    ? Math.max(1, Math.ceil(rows.length / pageSize))
    : 1
  const currentPage = paginated ? Math.min(page, totalPages) : 1
  const paged = paginated
    ? rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : rows

  const handleCardClick = (event, row) => {
    if (!onRowClick) return
    if (
      event.target.closest(
        'a, button, input, select, textarea, label, .action-menu, .click-list__actions',
      )
    ) {
      return
    }
    onRowClick(row)
  }

  const handleCardKeyDown = (event, row) => {
    if (!onRowClick) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onRowClick(row)
    }
  }

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div className={`click-list ${compact ? 'click-list--compact' : ''}`}>
      <ul className="click-list__items">
        {paged.map((row) => {
          const key = typeof rowKey === 'function' ? rowKey(row) : row[rowKey]
          return (
            <li key={key}>
              <article
                className={`click-list__card ${onRowClick ? 'is-clickable' : ''}`}
                onClick={onRowClick ? (event) => handleCardClick(event, row) : undefined}
                onKeyDown={onRowClick ? (event) => handleCardKeyDown(event, row) : undefined}
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
              >
                {primaryCol ? (
                  <div className="click-list__lead">{renderCell(primaryCol, row)}</div>
                ) : null}

                {metaCols.length ? (
                  <div
                    className="click-list__meta-grid"
                    style={{ '--meta-cols': metaCols.length }}
                  >
                    {metaCols.map((col) => (
                      <div key={col.key} className="click-list__meta">
                        <span className="click-list__meta-label">{col.header}</span>
                        <span className="click-list__meta-value">
                          {renderCell(col, row)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {badgeCol ? (
                  <div className="click-list__badge">{renderCell(badgeCol, row)}</div>
                ) : null}

                {actionCol ? (
                  <div className="click-list__actions">{renderCell(actionCol, row)}</div>
                ) : null}

                {onRowClick ? (
                  <span className="click-list__chev" aria-hidden="true">
                    ›
                  </span>
                ) : null}
              </article>
            </li>
          )
        })}
      </ul>

      <div className="click-list__footer">
        <span>
          {paginated
            ? `Showing ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, rows.length)} of ${rows.length}`
            : `${rows.length} record${rows.length === 1 ? '' : 's'}`}
        </span>
        {paginated ? (
          <div className="click-list__pager">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span>
              Page {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
