import { useState, useEffect, useCallback } from 'react'
import { auditApi } from '../services/api/hrms'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/common/PageHeader'
import StatCard from '../components/common/StatCard'
import Badge from '../components/common/Badge'
import Button from '../components/common/Button'
import LoadingState from '../components/common/LoadingState'
import EmptyState from '../components/common/EmptyState'
import './AuditTrail.css'

export default function AuditTrailPage() {
  const { addToast } = useToast()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [moduleFilter, setModuleFilter] = useState('all')
  const [regionFilter, setRegionFilter] = useState('all')

  const loadAuditLogs = useCallback(async () => {
    try {
      setLoading(true)
      const data = await auditApi.getAuditLogs({
        module: moduleFilter !== 'all' ? moduleFilter : undefined,
        regionCode: regionFilter !== 'all' ? regionFilter : undefined,
        limit: 150,
      })
      setLogs(data || [])
    } catch (err) {
      addToast(err.message || 'Failed to load audit logs', 'error')
    } finally {
      setLoading(false)
    }
  }, [moduleFilter, regionFilter, addToast])

  useEffect(() => {
    loadAuditLogs()
  }, [loadAuditLogs])

  return (
    <div className="audit-trail-page">
      <PageHeader
        title="🔒 Platform Audit Trail"
        subtitle="Append-only regulatory and security audit history (2-year immutable retention policy)"
      >
        <div className="audit-header-actions">
          <Button variant="primary" onClick={loadAuditLogs}>
            Refresh Audit Logs
          </Button>
        </div>
      </PageHeader>

      <div className="audit-stats">
        <StatCard title="Total Audited Events" value={logs.length} icon="shield" variant="primary" />
        <StatCard title="Retention Period" value="2 Years → Archive" icon="clock" variant="info" />
        <StatCard title="Integrity Model" value="Append-Only / Immutable" icon="lock" variant="success" />
      </div>

      {/* Filters */}
      <div className="audit-filter-bar">
        <div className="filter-item">
          <label>Module:</label>
          <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
            <option value="all">All Modules</option>
            <option value="Compliance">Compliance</option>
            <option value="WorkQueue">Work Queue</option>
            <option value="Requests">Requests & Advances</option>
            <option value="Letters">Letters & Signatures</option>
            <option value="Documents">Document Center</option>
            <option value="Performance">Performance Notes</option>
            <option value="Administration">Administration & Config</option>
          </select>
        </div>

        <div className="filter-item">
          <label>Region:</label>
          <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
            <option value="all">All Regions</option>
            <option value="uae">UAE</option>
            <option value="saudi">KSA</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="audit-table-wrap">
        {loading ? (
          <LoadingState message="Loading platform audit events..." />
        ) : logs.length === 0 ? (
          <EmptyState
            title="No audit events found"
            description="System operations, workflow transitions, and approval actions will be recorded here automatically."
          />
        ) : (
          <table className="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Module</th>
                <th>Record ID</th>
                <th>Region</th>
                <th>Audit Transition Summary</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.AuditID}>
                  <td>
                    <span className="audit-time">
                      {new Date(log.Timestamp).toLocaleString()}
                    </span>
                  </td>
                  <td>
                    <div className="actor-cell">
                      <strong>{log.ActorName}</strong>
                      <span className="role-sub">({log.ActorRole})</span>
                    </div>
                  </td>
                  <td>
                    <span className="action-tag">{log.Action}</span>
                  </td>
                  <td>
                    <Badge variant="default">{log.Module}</Badge>
                  </td>
                  <td>
                    <code>#{log.RecordID}</code>
                  </td>
                  <td>
                    <span className="region-pill">
                      {log.RegionCode === 'saudi' ? '🇸🇦 KSA' : log.RegionCode === 'uae' ? '🇦🇪 UAE' : 'Global'}
                    </span>
                  </td>
                  <td>
                    <div className="diff-cell">
                      {log.BeforeValue && (
                        <div className="diff-before">
                          <span className="diff-label">Before:</span> {log.BeforeValue}
                        </div>
                      )}
                      {log.AfterValue && (
                        <div className="diff-after">
                          <span className="diff-label">After:</span> {log.AfterValue}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
