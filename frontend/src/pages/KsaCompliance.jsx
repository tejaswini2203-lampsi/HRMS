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
import './KsaCompliance.css'

export default function KsaCompliancePage() {
  const { user } = useAuth()
  const { addToast } = useToast()

  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterEvent, setFilterEvent] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  // Case details / action modal
  const [activeCaseData, setActiveCaseData] = useState(null)
  const [actionModalOpen, setActionModalOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [iqamaDuration, setIqamaDuration] = useState('12')
  const [actionComments, setActionComments] = useState('')

  // Exit Re-entry request dialog
  const [exitReentryModal, setExitReentryModal] = useState(false)
  const [selectedEmpId, setSelectedEmpId] = useState('')

  const loadKsaCases = useCallback(async () => {
    try {
      setLoading(true)
      const data = await complianceApi.getCases({
        regionCode: 'saudi',
        status: filterStatus !== 'all' ? filterStatus : undefined,
      })
      setCases(data || [])
    } catch (err) {
      addToast(err.message || 'Failed to load KSA compliance cases', 'error')
    } finally {
      setLoading(false)
    }
  }, [filterStatus, addToast])

  useEffect(() => {
    loadKsaCases()
  }, [loadKsaCases])

  const openCaseDetails = async (caseId) => {
    try {
      const details = await complianceApi.getCaseById(caseId)
      setActiveCaseData(details)
      setActionModalOpen(true)
      setActionComments('')
      setIqamaDuration('12')
    } catch (err) {
      addToast(err.message || 'Failed to load case details', 'error')
    }
  }

  const handleAdvance = async (actionType = 'CONFIRM') => {
    if (!activeCaseData) return
    try {
      setProcessing(true)
      const caseId = activeCaseData.case.CaseID
      const currentStage = activeCaseData.case.CurrentStageKey

      const meta = currentStage === 'HOD_DURATION' ? { durationMonths: Number(iqamaDuration) } : undefined

      await complianceApi.advanceStage(caseId, {
        action: actionType,
        comments: actionComments,
        meta,
      })

      addToast(
        actionType === 'REJECT' ? 'Stage rejected and recorded' : 'Compliance stage successfully advanced',
        'success',
      )
      setActionModalOpen(false)
      loadKsaCases()
    } catch (err) {
      addToast(err.message || 'Stage transition failed', 'error')
    } finally {
      setProcessing(false)
    }
  }

  const filteredCases = cases.filter((c) => {
    if (filterEvent !== 'all' && c.EventCode !== filterEvent) return false
    return true
  })

  const iqamaCasesCount = cases.filter((c) => c.EventCode === 'KSA_IQAMA_RENEWAL').length
  const contractCasesCount = cases.filter((c) => c.EventCode === 'KSA_CONTRACT_RENEWAL').length
  const activeCasesCount = cases.filter((c) => c.Status !== 'COMPLETED' && c.Status !== 'CANCELLED').length

  return (
    <div className="ksa-compliance-page">
      <PageHeader
        title="🇸🇦 KSA Compliance Management"
        subtitle="Manage Kingdom of Saudi Arabia residency, fixed-term contracts, Ajeer/Muqeem workflows, and exit permits"
      >
        <div className="ksa-header-actions">
          <Button variant="outline" onClick={() => setExitReentryModal(true)}>
            + Exit/Re-Entry Visa
          </Button>
          <Button variant="primary" onClick={loadKsaCases}>
            Refresh
          </Button>
        </div>
      </PageHeader>

      {/* Metric Cards */}
      <div className="ksa-stats">
        <StatCard title="Active KSA Cases" value={activeCasesCount} icon="tasks" variant="primary" />
        <StatCard title="Iqama Renewals" value={iqamaCasesCount} icon="id" variant="warning" />
        <StatCard title="Contract Renewals (75d)" value={contractCasesCount} icon="file" variant="info" />
        <StatCard title="Jurisdiction" value="Kingdom of Saudi Arabia" icon="flag" variant="default" />
      </div>

      {/* Filter Tabs */}
      <div className="ksa-toolbar">
        <div className="ksa-event-tabs">
          <button
            type="button"
            className={`ksa-tab ${filterEvent === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilterEvent('all')}
          >
            All Workflows ({cases.length})
          </button>
          <button
            type="button"
            className={`ksa-tab ${filterEvent === 'KSA_IQAMA_RENEWAL' ? 'is-active' : ''}`}
            onClick={() => setFilterEvent('KSA_IQAMA_RENEWAL')}
          >
            Iqama Renewals
          </button>
          <button
            type="button"
            className={`ksa-tab ${filterEvent === 'KSA_CONTRACT_RENEWAL' ? 'is-active' : ''}`}
            onClick={() => setFilterEvent('KSA_CONTRACT_RENEWAL')}
          >
            Contract Renewals (Fixed Term)
          </button>
          <button
            type="button"
            className={`ksa-tab ${filterEvent === 'KSA_EXIT_REENTRY' ? 'is-active' : ''}`}
            onClick={() => setFilterEvent('KSA_EXIT_REENTRY')}
          >
            Exit/Re-Entry
          </button>
        </div>

        <div className="ksa-status-filter">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
      </div>

      {/* Case Table / List */}
      <div className="ksa-cases-table-wrap">
        {loading ? (
          <LoadingState message="Loading KSA compliance cases..." />
        ) : filteredCases.length === 0 ? (
          <EmptyState
            title="No KSA compliance cases found"
            description="All Saudi employees are currently in full compliance."
          />
        ) : (
          <table className="ksa-cases-table">
            <thead>
              <tr>
                <th>Case #</th>
                <th>Employee</th>
                <th>Event / Workflow</th>
                <th>Current Stage</th>
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
                    <div className="emp-cell">
                      <span className="emp-name">
                        {c.FirstName} {c.LastName}
                      </span>
                      <span className="emp-sub">
                        Iqama: {c.IqamaNumber || 'Pending'} (Exp: {c.IqamaExpiry || 'N/A'})
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="event-tag">{c.EventCode.replace(/_/g, ' ')}</span>
                  </td>
                  <td>
                    <span className="stage-name">{c.CurrentStageKey.replace(/_/g, ' ')}</span>
                  </td>
                  <td>
                    <Badge variant="info">{c.AssignedRole}</Badge>
                  </td>
                  <td>
                    <span>{c.DueDate}</span>
                  </td>
                  <td>
                    <Badge
                      variant={
                        c.Status === 'COMPLETED'
                          ? 'success'
                          : c.Status === 'OPEN'
                          ? 'warning'
                          : c.Status === 'BLOCKED'
                          ? 'danger'
                          : 'default'
                      }
                    >
                      {c.Status}
                    </Badge>
                  </td>
                  <td>
                    <Button size="sm" variant="outline" onClick={() => openCaseDetails(c.CaseID)}>
                      Manage Case
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Case Progress & Action Modal */}
      {actionModalOpen && activeCaseData && (
        <Modal
          isOpen={actionModalOpen}
          onClose={() => setActionModalOpen(false)}
          title={`Case ${activeCaseData.case.CaseNumber}: ${activeCaseData.case.FirstName} ${activeCaseData.case.LastName}`}
        >
          <div className="case-modal-body">
            {/* Stage Progress Stepper */}
            <div className="ksa-stepper">
              {activeCaseData.stages.map((stage, idx) => {
                const isCurrent = stage.StageKey === activeCaseData.case.CurrentStageKey
                const isPassed =
                  activeCaseData.stages.findIndex(
                    (s) => s.StageKey === activeCaseData.case.CurrentStageKey,
                  ) > idx || activeCaseData.case.Status === 'COMPLETED'
                return (
                  <div
                    key={stage.StageID}
                    className={`step-item ${isCurrent ? 'is-current' : ''} ${isPassed ? 'is-passed' : ''}`}
                  >
                    <div className="step-num">{isPassed ? '✓' : idx + 1}</div>
                    <div className="step-label">{stage.StageName}</div>
                    <div className="step-actor">({stage.ActorRole})</div>
                  </div>
                )
              })}
            </div>

            {/* Case Details Summary */}
            <div className="case-meta-box">
              <div className="meta-row">
                <span>Employee Designation:</span>
                <strong>{activeCaseData.case.Designation || 'Production Specialist'}</strong>
              </div>
              <div className="meta-row">
                <span>Iqama Number:</span>
                <strong>{activeCaseData.case.IqamaNumber || 'N/A'}</strong>
              </div>
              <div className="meta-row">
                <span>Iqama Expiry:</span>
                <strong>{activeCaseData.case.IqamaExpiry || 'N/A'}</strong>
              </div>
              <div className="meta-row">
                <span>Current Stage:</span>
                <Badge variant="primary">{activeCaseData.case.CurrentStageKey.replace(/_/g, ' ')}</Badge>
              </div>
            </div>

            {/* Special HOD Duration Selection */}
            {activeCaseData.case.CurrentStageKey === 'HOD_DURATION' && (
              <div className="duration-select-box">
                <label>Select Iqama Renewal Term:</label>
                <div className="duration-options">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="iqamaTerm"
                      value="3"
                      checked={iqamaDuration === '3'}
                      onChange={(e) => setIqamaDuration(e.target.value)}
                    />
                    3 Months (SAR 650)
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="iqamaTerm"
                      value="6"
                      checked={iqamaDuration === '6'}
                      onChange={(e) => setIqamaDuration(e.target.value)}
                    />
                    6 Months (SAR 1,200)
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="iqamaTerm"
                      value="12"
                      checked={iqamaDuration === '12'}
                      onChange={(e) => setIqamaDuration(e.target.value)}
                    />
                    12 Months (SAR 2,000)
                  </label>
                </div>
              </div>
            )}

            <div className="case-comments-input">
              <label>Action Notes / Remarks:</label>
              <textarea
                rows={2}
                value={actionComments}
                onChange={(e) => setActionComments(e.target.value)}
                placeholder="Optional verification notes..."
              />
            </div>

            {/* Stage History */}
            <div className="case-history-section">
              <h4>Stage History</h4>
              <div className="history-list">
                {activeCaseData.history.map((h) => (
                  <div key={h.HistoryID} className="history-row">
                    <span className="history-date">
                      {new Date(h.EnteredAt).toLocaleDateString()}
                    </span>
                    <span className="history-stage">
                      <strong>{h.StageName}</strong> ({h.ActorRole})
                    </span>
                    <span className="history-action">{h.ActionTaken}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="case-modal-footer">
              <Button variant="outline" onClick={() => setActionModalOpen(false)}>
                Close
              </Button>
              {activeCaseData.case.Status !== 'COMPLETED' && (
                <>
                  <Button
                    variant="danger"
                    disabled={processing}
                    onClick={() => handleAdvance('REJECT')}
                  >
                    Reject Step
                  </Button>
                  <Button
                    variant="primary"
                    disabled={processing}
                    onClick={() => handleAdvance('CONFIRM')}
                  >
                    {processing ? 'Advancing...' : 'Advance Stage →'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Exit Re-Entry Dependency Verification Dialog */}
      {exitReentryModal && (
        <Modal
          isOpen={exitReentryModal}
          onClose={() => setExitReentryModal(false)}
          title="Apply for Exit / Re-Entry Visa"
        >
          <div className="exit-reentry-modal">
            <p>
              Under KSA compliance rules, an Exit/Re-Entry visa requires approved travel/leave
              and a valid Iqama with at least <strong>45 days</strong> remaining.
            </p>
            <div className="form-group">
              <label>Select Saudi Employee:</label>
              <select value={selectedEmpId} onChange={(e) => setSelectedEmpId(e.target.value)}>
                <option value="">-- Choose Employee --</option>
                <option value="18">Rahul Kumar (Iqama Exp: 25 days - Dependency will block)</option>
                <option value="3">Mudasiir (Iqama Exp: 35 days - Dependency will block)</option>
                <option value="15">Mani sree (Iqama Valid &gt; 90 days)</option>
              </select>
            </div>

            {selectedEmpId && (Number(selectedEmpId) === 18 || Number(selectedEmpId) === 3) && (
              <div className="dependency-block-alert">
                <span className="blocked-tag">⚠️ BLOCKED</span>
                <p>
                  <strong>Reason:</strong> Iqama validity is less than the mandatory 45-day restriction.
                  You must initiate an Iqama renewal before applying for Exit/Re-Entry.
                </p>
              </div>
            )}

            <div className="modal-actions-right">
              <Button variant="outline" onClick={() => setExitReentryModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!selectedEmpId || Number(selectedEmpId) === 18 || Number(selectedEmpId) === 3}
                onClick={async () => {
                  try {
                    await complianceApi.createCase({
                      empId: Number(selectedEmpId),
                      regionCode: 'saudi',
                      eventCode: 'KSA_EXIT_REENTRY',
                      pipelineCode: 'KSA_EXIT_REENTRY_PIPE',
                      priority: 'HIGH',
                    })
                    addToast('Exit/Re-Entry case initialized', 'success')
                    setExitReentryModal(false)
                    loadKsaCases()
                  } catch (e) {
                    addToast(e.message, 'error')
                  }
                }}
              >
                Submit Application
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
