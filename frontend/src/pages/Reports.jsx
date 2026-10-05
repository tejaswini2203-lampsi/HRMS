import { useState, useEffect, useCallback } from 'react'
import { reportsApi } from '../services/api/hrms'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/common/PageHeader'
import StatCard from '../components/common/StatCard'
import Badge from '../components/common/Badge'
import Button from '../components/common/Button'
import LoadingState from '../components/common/LoadingState'
import './Reports.css'

export default function ReportsPage() {
  const { addToast } = useToast()
  const [activeReport, setActiveReport] = useState('compliance-status')
  const [regionFilter, setRegionFilter] = useState('all')
  const [reportData, setReportData] = useState([])
  const [loading, setLoading] = useState(true)

  const loadReportData = useCallback(async () => {
    try {
      setLoading(true)
      let data = []
      const reg = regionFilter !== 'all' ? regionFilter : undefined

      if (activeReport === 'compliance-status') {
        data = await reportsApi.getComplianceStatus(reg)
      } else if (activeReport === 'overdue-compliance') {
        data = await reportsApi.getOverdueCompliance(reg)
      } else if (activeReport === 'sla-breaches') {
        data = await reportsApi.getSLABreaches(reg)
      } else if (activeReport === 'work-queue-summary') {
        data = await reportsApi.getWorkQueueSummary(reg)
      } else if (activeReport === 'ksa-iqama-costs') {
        data = await reportsApi.getKsaIqamaCosts()
      } else if (activeReport === 'advance-requests') {
        data = await reportsApi.getAdvanceRequests(reg)
      } else if (activeReport === 'letter-requests') {
        data = await reportsApi.getLetterRequests(reg)
      }
      setReportData(data || [])
    } catch (err) {
      addToast(err.message || 'Failed to load report data', 'error')
    } finally {
      setLoading(false)
    }
  }, [activeReport, regionFilter, addToast])

  useEffect(() => {
    loadReportData()
  }, [loadReportData])

  const exportCsv = () => {
    if (!reportData || reportData.length === 0) {
      addToast('No data to export', 'warning')
      return
    }
    const headers = Object.keys(reportData[0])
    const csvRows = [headers.join(',')]
    for (const row of reportData) {
      const values = headers.map((h) => {
        const val = row[h] === null || row[h] === undefined ? '' : String(row[h])
        return `"${val.replace(/"/g, '""')}"`
      })
      csvRows.push(values.join(','))
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hrms_${activeReport}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    addToast('CSV export downloaded', 'success')
  }

  return (
    <div className="reports-page">
      <PageHeader
        title="📊 HRMS Operational Reports"
        subtitle="Standard Phase 1 compliance status, SLA breaches, KSA government fees, and request analytics"
      >
        <div className="report-header-actions">
          <Button variant="outline" onClick={() => window.print()}>
            🖨️ Print / Save PDF
          </Button>
          <Button variant="primary" onClick={exportCsv}>
            📥 Export CSV / Excel
          </Button>
        </div>
      </PageHeader>

      <div className="reports-stats">
        <StatCard title="Active Dataset Rows" value={reportData.length} icon="table" variant="primary" />
        <StatCard
          title="Regional Scope"
          value={regionFilter === 'all' ? 'UAE + KSA' : regionFilter.toUpperCase()}
          icon="globe"
          variant="info"
        />
        <StatCard title="Report Status" value="Audited & Real-Time" icon="shield" variant="success" />
      </div>

      {/* Navigation tabs */}
      <div className="reports-nav-toolbar">
        <div className="report-tabs">
          <button
            type="button"
            className={`rep-tab ${activeReport === 'compliance-status' ? 'is-active' : ''}`}
            onClick={() => setActiveReport('compliance-status')}
          >
            Compliance Status
          </button>
          <button
            type="button"
            className={`rep-tab ${activeReport === 'overdue-compliance' ? 'is-active' : ''}`}
            onClick={() => setActiveReport('overdue-compliance')}
          >
            Overdue Cases
          </button>
          <button
            type="button"
            className={`rep-tab ${activeReport === 'sla-breaches' ? 'is-active' : ''}`}
            onClick={() => setActiveReport('sla-breaches')}
          >
            SLA Breaches
          </button>
          <button
            type="button"
            className={`rep-tab ${activeReport === 'work-queue-summary' ? 'is-active' : ''}`}
            onClick={() => setActiveReport('work-queue-summary')}
          >
            Work Queue Summary
          </button>
          <button
            type="button"
            className={`rep-tab ${activeReport === 'ksa-iqama-costs' ? 'is-active' : ''}`}
            onClick={() => setActiveReport('ksa-iqama-costs')}
          >
            KSA Iqama Costs
          </button>
          <button
            type="button"
            className={`rep-tab ${activeReport === 'advance-requests' ? 'is-active' : ''}`}
            onClick={() => setActiveReport('advance-requests')}
          >
            Advance Requests
          </button>
          <button
            type="button"
            className={`rep-tab ${activeReport === 'letter-requests' ? 'is-active' : ''}`}
            onClick={() => setActiveReport('letter-requests')}
          >
            Letter Requests
          </button>
        </div>

        <div className="reports-region-filter">
          <label>Region:</label>
          <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
            <option value="all">All Regions</option>
            <option value="uae">UAE</option>
            <option value="saudi">KSA</option>
          </select>
        </div>
      </div>

      {/* Report Table Container */}
      <div className="report-table-wrap">
        {loading ? (
          <LoadingState message="Generating report..." />
        ) : reportData.length === 0 ? (
          <div className="report-empty">No records found for the selected criteria.</div>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                {Object.keys(reportData[0]).map((col) => (
                  <th key={col}>{col.replace(/([A-Z])/g, ' $1').trim()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reportData.map((row, idx) => (
                <tr key={idx}>
                  {Object.keys(row).map((col) => (
                    <td key={col}>
                      {row[col] !== null && row[col] !== undefined
                        ? typeof row[col] === 'boolean'
                          ? row[col]
                            ? 'Yes'
                            : 'No'
                          : String(row[col])
                        : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
