import { useState, useEffect, useCallback } from 'react'
import { complianceApi } from '../services/api/hrms'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/common/PageHeader'
import StatCard from '../components/common/StatCard'
import Badge from '../components/common/Badge'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import LoadingState from '../components/common/LoadingState'
import EmptyState from '../components/common/EmptyState'
import './UaeCompliance.css'

export default function UaeCompliancePage() {
  const { user } = useAuth()
  const { addToast } = useToast()

  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState('all') // 'all' | 'Labor' | 'Skilled' | 'Manager'
  const [filterStatus, setFilterStatus] = useState('all')

  // Case details modal
  const [activeCaseData, setActiveCaseData] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [actionComments, setActionComments] = useState('')

  const loadUaeCases = useCallback(async () => {
    try {
      setLoading(true)
      const data = await complianceApi.getCases({
        regionCode: 'uae',
        status: filterStatus !== 'all' ? filterStatus : undefined,
      })
      setCases(data || [])
    } catch (err) {
      addToast(err.message || 'Failed to load UAE compliance cases', 'error')
    } finally {
      setLoading(false)
    }
  }, [filterStatus, addToast])

  useEffect(() => {
    loadUaeCases()
  }, [loadUaeCases])

  const openCaseDetails = async (caseId) => {
    try {
      const details = await complianceApi.getCaseById(caseId)
      setActiveCaseData(details)
      setModalOpen(true)
      setActionComments('')
    } catch (err) {
      addToast(err.message || 'Failed to load case details', 'error')
    }
  }

  const handleToggleChecklist = async (progressId, currentVal) => {
    if (!activeCaseData) return
    try {
      await complianceApi.updateChecklist(
        activeCaseData.case.CaseID,
        progressId,
        { isCompleted: !currentVal },
      )
      addToast('Checklist item updated', 'success')
      // Refresh current case modal data
      const updated = await complianceApi.getCaseById(activeCaseData.case.CaseID)
      setActiveCaseData(updated)
    } catch (err) {
      addToast(err.message || 'Failed to update checklist item', 'error')
    }
  }

  const handleAdvanceStage = async (action = 'CONFIRM') => {
    if (!activeCaseData) return
    try {
      setAdvancing(true)
      await complianceApi.advanceStage(activeCaseData.case.CaseID, {
        action,
        comments: actionComments,
      })
      addToast(
        action === 'REJECT' ? 'Stage rejected' : 'Successfully advanced to next workflow stage',
        'success',
      )
      setModalOpen(false)
      loadUaeCases()
    } catch (err) {
      addToast(err.message || 'Stage advance failed', 'error')
    } finally {
      setAdvancing(false)
    }
  }

  const filteredCases = cases.filter((c) => {
    if (filterCategory !== 'all' && c.UAEEmployeeCategory !== filterCategory) return false
    return true
  })

  const laborCount = cases.filter((c) => c.UAEEmployeeCategory === 'Labor').length
  const skilledCount = cases.filter((c) => c.UAEEmployeeCategory !== 'Labor').length
  const activeCount = cases.filter((c) => c.Status !== 'COMPLETED' && c.Status !== 'CANCELLED').length

  return (
    <div className="uae-compliance-page">
      <PageHeader
        title="🇦🇪 UAE Visa & Work Permit Renewal"
        subtitle="13-stage unified MOHRE and ICP compliance workflow with automated Tawjeeh branching and closure verification"
      >
        <div className="uae-header-actions">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await complianceApi.scan()
                addToast('Scanned UAE visa expiries (90d / 180d rules)', 'info')
                loadUaeCases()
              } catch (e) {
                loadUaeCases()
              }
            }}
          >
            Detect Expiries
          </Button>
          <Button variant="primary" onClick={loadUaeCases}>
            Refresh
          </Button>
        </div>
      </PageHeader>

      {/* Metrics */}
      <div className="uae-stats">
        <StatCard title="Active UAE Cases" value={activeCount} icon="tasks" variant="primary" />
        <StatCard title="Labor Category (Tawjeeh)" value={laborCount} icon="users" variant="warning" />
        <StatCard title="Skilled / Executive" value={skilledCount} icon="award" variant="info" />
        <StatCard title="Jurisdiction" value="United Arab Emirates (MOHRE/ICP)" icon="globe" variant="default" />
      </div>

      {/* Toolbar */}
      <div className="uae-toolbar">
        <div className="uae-category-tabs">
          <button
            type="button"
            className={`uae-tab ${filterCategory === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilterCategory('all')}
          >
            All Categories ({cases.length})
          </button>
          <button
            type="button"
            className={`uae-tab ${filterCategory === 'Labor' ? 'is-active' : ''}`}
            onClick={() => setFilterCategory('Labor')}
          >
            Labor (Tawjeeh Mandatory)
          </button>
          <button
            type="button"
            className={`uae-tab ${filterCategory === 'Skilled' ? 'is-active' : ''}`}
            onClick={() => setFilterCategory('Skilled')}
          >
            Skilled (Tawjeeh Skipped)
          </button>
          <button
            type="button"
            className={`uae-tab ${filterCategory === 'Manager' ? 'is-active' : ''}`}
            onClick={() => setFilterCategory('Manager')}
          >
            Manager / Frequent Traveler (180d)
          </button>
        </div>

        <div className="uae-status-select">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
      </div>

      {/* Cases Table */}
      <div className="uae-table-wrap">
        {loading ? (
          <LoadingState message="Loading UAE compliance records..." />
        ) : filteredCases.length === 0 ? (
          <EmptyState
            title="No UAE compliance cases found"
            description="All UAE employee visas and work permits are active and compliant."
          />
        ) : (
          <table className="uae-cases-table">
            <thead>
              <tr>
                <th>Case #</th>
                <th>Employee</th>
                <th>Category</th>
                <th>Current Stage (1-13)</th>
                <th>Assigned Role</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCases.map((c) => (
                <tr key={c.CaseID}>
                  <td>
                    <strong>{c.CaseNumber}</strong>
                  </td>
                  <td>
                    <div className="uae-emp-col">
                      <span className="name">
                        {c.FirstName} {c.LastName}
                      </span>
                      <span className="sub">
                        Visa: {c.VisaNumber || 'N/A'} (Exp: {c.VisaExpiry || 'N/A'})
                      </span>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`cat-pill cat-${c.UAEEmployeeCategory?.toLowerCase() || 'default'}`}
                    >
                      {c.UAEEmployeeCategory || 'General'}
                    </span>
                  </td>
                  <td>
                    <span className="stage-badge">{c.CurrentStageKey.replace(/_/g, ' ')}</span>
                  </td>
                  <td>
                    <Badge variant="info">{c.AssignedRole}</Badge>
                  </td>
                  <td>{c.DueDate}</td>
                  <td>
                    <Badge
                      variant={
                        c.Status === 'COMPLETED'
                          ? 'success'
                          : c.Status === 'OPEN'
                          ? 'warning'
                          : 'default'
                      }
                    >
                      {c.Status}
                    </Badge>
                  </td>
                  <td>
                    <Button size="sm" variant="outline" onClick={() => openCaseDetails(c.CaseID)}>
                      View Workflow
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 13-Stage Workflow & Closure Checklist Modal */}
      {modalOpen && activeCaseData && (
        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={`UAE Visa Renewal: ${activeCaseData.case.FirstName} ${activeCaseData.case.LastName} (${activeCaseData.case.CaseNumber})`}
        >
          <div className="uae-case-modal">
            {/* Category Branching Alert */}
            <div className="category-alert-banner">
              <strong>Employee Category: {activeCaseData.case.UAEEmployeeCategory || 'Standard'}</strong>
              <p>
                {activeCaseData.case.UAEEmployeeCategory === 'Labor'
                  ? '⚠️ Labor Category: Mandatory Tawjeeh training session must be completed before Work Permit payment.'
                  : 'ℹ️ Skilled / Manager Category: Stage 7 (Tawjeeh Training) is automatically skipped.'}
              </p>
            </div>

            {/* Stepper (13 stages) */}
            <div className="uae-stepper-container">
              <h4>13-Stage Renewal Progress</h4>
              <div className="stepper-horizontal">
                {activeCaseData.stages.map((st, i) => {
                  const isCurrent = st.StageKey === activeCaseData.case.CurrentStageKey
                  const isSkipped =
                    st.BranchCondition === 'Labor' &&
                    activeCaseData.case.UAEEmployeeCategory !== 'Labor'
                  const currentIdx = activeCaseData.stages.findIndex(
                    (s) => s.StageKey === activeCaseData.case.CurrentStageKey,
                  )
                  const isCompleted = currentIdx > i || activeCaseData.case.Status === 'COMPLETED'

                  return (
                    <div
                      key={st.StageID}
                      className={`step-pill ${isCurrent ? 'is-active' : ''} ${isCompleted ? 'is-done' : ''} ${isSkipped ? 'is-skipped' : ''}`}
                      title={st.StageName}
                    >
                      <span className="step-circle">{isCompleted ? '✓' : isSkipped ? '–' : i + 1}</span>
                      <span className="step-name">{st.StageName}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Closure Checklist Grid */}
            <div className="closure-checklist-card">
              <h4>Mandatory Closure Checklist</h4>
              <p className="checklist-sub">
                All required documents must be uploaded and checked before case can close:
              </p>
              <div className="checklist-grid">
                {activeCaseData.checklist.map((item) => (
                  <label key={item.ProgressID} className="check-item-row">
                    <input
                      type="checkbox"
                      checked={Boolean(item.IsCompleted)}
                      onChange={() => handleToggleChecklist(item.ProgressID, item.IsCompleted)}
                    />
                    <span className={item.IsCompleted ? 'is-checked-text' : ''}>
                      {item.ItemLabel}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="action-comments-field">
              <label>Verification Notes / Next Stage Instructions:</label>
              <textarea
                rows={2}
                value={actionComments}
                onChange={(e) => setActionComments(e.target.value)}
                placeholder="Notes for the next stage actor..."
              />
            </div>

            <div className="uae-modal-actions">
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                Close
              </Button>
              {activeCaseData.case.Status !== 'COMPLETED' && (
                <>
                  <Button
                    variant="danger"
                    disabled={advancing}
                    onClick={() => handleAdvanceStage('REJECT')}
                  >
                    Reject Step
                  </Button>
                  <Button
                    variant="primary"
                    disabled={advancing}
                    onClick={() => handleAdvanceStage('CONFIRM')}
                  >
                    {advancing ? 'Advancing...' : 'Advance Stage →'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
