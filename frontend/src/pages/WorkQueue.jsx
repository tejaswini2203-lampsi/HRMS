import { useState, useEffect, useCallback } from 'react'
import { workQueueApi, complianceApi, documentsApi, masterApi } from '../services/api/hrms'
import { useAuth } from '../context/AuthContext'
import { useSubsidiary } from '../context/SubsidiaryContext'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/common/PageHeader'
import StatCard from '../components/common/StatCard'
import Badge from '../components/common/Badge'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import LoadingState from '../components/common/LoadingState'
import EmptyState from '../components/common/EmptyState'
import './WorkQueue.css'

export default function WorkQueuePage() {
  const { user } = useAuth()
  const { activeId } = useSubsidiary()
  const { addToast } = useToast()

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterRegion, setFilterRegion] = useState(activeId || 'all')
  const [filterStatus, setFilterStatus] = useState('OPEN')
  const [searchQuery, setSearchQuery] = useState('')

  // Execution modal state
  const [selectedTask, setSelectedTask] = useState(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [actionComments, setActionComments] = useState('')
  const [iqamaDuration, setIqamaDuration] = useState('12') // '3' | '6' | '12'
  const [rejectMode, setRejectMode] = useState(false)
  const [activeModalTab, setActiveModalTab] = useState('details') // 'details' | 'documents' | 'history'
  const [iqamaFees, setIqamaFees] = useState({ 3: 2588, 6: 5175, 12: 10350 })

  useEffect(() => {
    masterApi.getConfigs()
      .then((configs) => {
        if (Array.isArray(configs)) {
          const cfgMap = Object.fromEntries(configs.map((c) => [c.ConfigKey, c.ConfigValue]))
          setIqamaFees({
            3: cfgMap.ksaIqama3mFee ? Number(cfgMap.ksaIqama3mFee) : (cfgMap.defaultIqamaCost3Months ? Number(cfgMap.defaultIqamaCost3Months) : 2588),
            6: cfgMap.ksaIqama6mFee ? Number(cfgMap.ksaIqama6mFee) : (cfgMap.defaultIqamaCost6Months ? Number(cfgMap.defaultIqamaCost6Months) : 5175),
            12: cfgMap.ksaIqama12mFee ? Number(cfgMap.ksaIqama12mFee) : (cfgMap.defaultIqamaCost12Months ? Number(cfgMap.defaultIqamaCost12Months) : 10350),
          })
        }
      })
      .catch(() => {})
  }, [])

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true)
      const data = await workQueueApi.getTasks({
        regionCode: filterRegion !== 'all' ? filterRegion : undefined,
        status: filterStatus !== 'all' ? filterStatus : undefined,
      })
      setTasks(data || [])
    } catch (err) {
      addToast(err.message || 'Failed to load Work Queue', 'error')
    } finally {
      setLoading(false)
    }
  }, [filterRegion, filterStatus, addToast])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  // Sync region filter with active header subsidiary if changed
  useEffect(() => {
    if (activeId && activeId !== 'india') {
      setFilterRegion(activeId)
    }
  }, [activeId])

  const openActionModal = async (task) => {
    try {
      setSelectedTask(task)
      setModalLoading(true)
      setActionComments('')
      setRejectMode(false)
      setIqamaDuration('12')
      setActiveModalTab('details')

      // Fetch enriched context from backend
      const fullTask = await workQueueApi.getTaskById(task.TaskID)
      setSelectedTask(fullTask)
    } catch (err) {
      addToast('Failed to load task details: ' + (err.message || 'Error'), 'error')
    } finally {
      setModalLoading(false)
    }
  }

  const closeActionModal = () => {
    setSelectedTask(null)
    setRejectMode(false)
    setActionComments('')
    setModalLoading(false)
  }

  const handleExecute = async (actionType = 'CONFIRM') => {
    if (!selectedTask) return

    // Validation
    if (actionType === 'REJECT' && !actionComments.trim()) {
      addToast('Please provide a reason for rejecting this workflow step', 'warning')
      return
    }

    if (selectedTask.ActionKey === 'HOD_DURATION' && actionType !== 'REJECT') {
      if (!iqamaDuration || !['3', '6', '12'].includes(iqamaDuration)) {
        addToast('Please select a valid Iqama renewal duration (3, 6, or 12 months)', 'warning')
        return
      }
    }

    try {
      setExecuting(true)
      const payload = {
        action: actionType,
        comments: actionComments.trim(),
        meta: selectedTask.ActionKey === 'HOD_DURATION' ? { durationMonths: Number(iqamaDuration) } : undefined,
      }

      await workQueueApi.executeAction(selectedTask.TaskID, payload)

      const successMsg =
        actionType === 'REJECT'
          ? 'Workflow step rejected and logged in Audit Trail'
          : selectedTask.SourceModule === 'Letter'
          ? 'Letter approved, generated, and issued'
          : selectedTask.ActionKey === 'HOD_DURATION'
          ? `Iqama duration (${iqamaDuration} Months) confirmed and advanced`
          : 'Task successfully executed and workflow advanced'

      addToast(successMsg, 'success')
      closeActionModal()
      await loadTasks()
    } catch (err) {
      addToast(err.message || 'Action failed to execute', 'error')
    } finally {
      setExecuting(false)
    }
  }

  const activeCount = tasks.filter((t) => t.Status !== 'COMPLETED').length
  const highPriorityCount = tasks.filter((t) => t.Priority === 'HIGH' && t.Status !== 'COMPLETED').length
  const breachCount = tasks.filter((t) => t.SLAStatus === 'BREACHED' || t.SLAStatus === 'NEAR_BREACH').length

  const displayedTasks = tasks.filter((t) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase().trim()
    const name = `${t.TargetFirstName || ''} ${t.TargetLastName || ''}`.toLowerCase()
    const id = String(t.TargetEmpID || '')
    const title = (t.Title || '').toLowerCase()
    const instruction = (t.Instruction || '').toLowerCase()
    return name.includes(q) || id.includes(q) || title.includes(q) || instruction.includes(q)
  })

  const getSlaBadgeVariant = (slaStatus) => {
    if (slaStatus === 'BREACHED') return 'danger'
    if (slaStatus === 'NEAR_BREACH') return 'warning'
    return 'success'
  }

  const getPriorityBadgeVariant = (priority) => {
    if (priority === 'HIGH') return 'danger'
    if (priority === 'MEDIUM') return 'info'
    return 'default'
  }

  // Context extractors
  const ctx = selectedTask?.context || {}
  const compCase = ctx.complianceCase
  const checklist = ctx.checklist || []
  const history = ctx.history || []
  const documents = ctx.documents || []
  const letterReq = ctx.letterRequest
  const empReq = ctx.employeeRequest

  const missingChecklistItems = checklist.filter((item) => !item.IsCompleted)
  const completedChecklistCount = checklist.filter((item) => item.IsCompleted).length

  return (
    <div className="work-queue-page">
      <PageHeader
        title="What to Do Today"
        subtitle="Operational command center: prioritize and execute daily compliance, approvals, and employee tasks"
        actions={
          <div className="work-queue-header-actions">
            <span className="sign-off-pill">PENDING BUSINESS SIGN-OFF</span>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await complianceApi.scan()
                  addToast('Scanned active expiries & updated work queue', 'info')
                  loadTasks()
                } catch (e) {
                  addToast('Scan complete', 'info')
                  loadTasks()
                }
              }}
            >
              Check Expiries
            </Button>
            <Button variant="primary" onClick={loadTasks}>
              Refresh
            </Button>
          </div>
        }
      />

      {/* Metric Cards */}
      <div className="work-queue-stats">
        <StatCard title="Active Work Items" value={activeCount} icon="tasks" variant="primary" />
        <StatCard title="High Priority" value={highPriorityCount} icon="alert" variant="warning" />
        <StatCard title="SLA Risk / Overdue" value={breachCount} icon="clock" variant="danger" />
        <StatCard
          title="Regional Scope"
          value={filterRegion === 'all' ? 'All GCC' : filterRegion.toUpperCase()}
          icon="globe"
          variant="default"
        />
      </div>

      {/* Filter Toolbar */}
      <div className="work-queue-toolbar">
        <div className="work-queue-tabs">
          <button
            type="button"
            className={`wq-tab ${filterStatus === 'OPEN' ? 'is-active' : ''}`}
            onClick={() => setFilterStatus('OPEN')}
          >
            To Do ({activeCount})
          </button>
          <button
            type="button"
            className={`wq-tab ${filterStatus === 'COMPLETED' ? 'is-active' : ''}`}
            onClick={() => setFilterStatus('COMPLETED')}
          >
            Completed History
          </button>
          <button
            type="button"
            className={`wq-tab ${filterStatus === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilterStatus('all')}
          >
            All Items
          </button>
        </div>

        <div className="work-queue-filters-right">
          <div className="work-queue-search">
            <input
              type="text"
              placeholder="Search employee, ID, task..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="wq-search-input"
            />
          </div>

          <div className="work-queue-region-select">
            <label htmlFor="wq-region-filter">Region:</label>
            <select
              id="wq-region-filter"
              value={filterRegion}
              onChange={(e) => setFilterRegion(e.target.value)}
            >
              <option value="all">All Regions (UAE + KSA)</option>
              <option value="uae">UAE Operations</option>
              <option value="saudi">KSA Operations</option>
            </select>
          </div>
        </div>
      </div>

      {/* Task List Container */}
      <div className="work-queue-content">
        {loading ? (
          <LoadingState message="Loading daily task queue..." />
        ) : displayedTasks.length === 0 ? (
          <div className="work-queue-empty">
            <EmptyState
              title="You're all caught up!"
              description="There are no pending actions assigned to you right now."
              action={
                <Button variant="outline" onClick={loadTasks}>
                  Refresh Work Queue
                </Button>
              }
            />
          </div>
        ) : (
          <div className="task-cards-grid">
            {displayedTasks.map((task) => (
              <div
                key={task.TaskID}
                className={`task-card priority-${task.Priority.toLowerCase()} ${task.Status === 'COMPLETED' ? 'is-completed' : ''}`}
              >
                <div className="task-card-header">
                  <div className="task-employee-meta">
                    <span className="task-employee-avatar">
                      {task.TargetFirstName?.[0]}
                      {task.TargetLastName?.[0]}
                    </span>
                    <div>
                      <h4 className="task-employee-name">
                        {task.TargetFirstName} {task.TargetLastName}{' '}
                        <span className="task-emp-id">(ID: {task.TargetEmpID})</span>
                      </h4>
                      <span className="task-employee-role">
                        {task.TargetDesignation || 'Employee'} • {task.TargetDepartmentName || 'Operations'}
                      </span>
                    </div>
                  </div>

                  <div className="task-badges">
                    <span className={`region-pill region-${task.RegionCode}`}>
                      {task.RegionCode === 'saudi' ? '🇸🇦 KSA' : '🇦🇪 UAE'}
                    </span>
                    <Badge variant={getPriorityBadgeVariant(task.Priority)}>
                      {task.Priority}
                    </Badge>
                  </div>
                </div>

                <div className="task-card-body">
                  <h3 className="task-card-title">{task.Title}</h3>
                  <p className="task-card-instruction">{task.Instruction}</p>
                </div>

                <div className="task-card-footer">
                  <div className="task-time-meta">
                    <span className="task-due-date">
                      Due: <strong>{task.DueDate}</strong>
                    </span>
                    <Badge variant={getSlaBadgeVariant(task.SLAStatus)}>
                      {task.SLAStatus.replace('_', ' ')}
                    </Badge>
                    <span className="task-source-label">{task.SourceModule}</span>
                  </div>

                  <div className="task-action-wrap">
                    {task.Status === 'COMPLETED' ? (
                      <span className="task-done-badge">✓ Completed</span>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => openActionModal(task)}
                      >
                        {task.PrimaryActionLabel || 'Execute'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Task Execution Modal */}
      {selectedTask && (
        <Modal
          open={Boolean(selectedTask)}
          isOpen={Boolean(selectedTask)}
          onClose={closeActionModal}
          title={selectedTask.Title}
          size="lg"
        >
          {modalLoading ? (
            <div className="modal-loading-box">
              <LoadingState message="Loading source record, employee compliance attributes, and documents..." />
            </div>
          ) : (
            <div className="task-modal-body">
              {/* Employee & Jurisdiction Summary Banner */}
              <div className="modal-emp-banner">
                <div className="modal-emp-avatar">
                  {selectedTask.TargetFirstName?.[0]}
                  {selectedTask.TargetLastName?.[0]}
                </div>
                <div className="modal-emp-info">
                  <div className="modal-emp-headline">
                    <h3>
                      {selectedTask.TargetFirstName} {selectedTask.TargetLastName}{' '}
                      <span className="task-emp-id">(ID: {selectedTask.TargetEmpID})</span>
                    </h3>
                    <span className={`region-pill region-${selectedTask.RegionCode}`}>
                      {selectedTask.RegionCode === 'saudi' ? '🇸🇦 Kingdom of Saudi Arabia' : '🇦🇪 United Arab Emirates'}
                    </span>
                  </div>
                  <div className="modal-emp-subline">
                    <span>{selectedTask.TargetDesignation || 'Specialist'}</span>
                    <span>•</span>
                    <span>{selectedTask.TargetDepartmentName || 'Operations'}</span>
                    <span>•</span>
                    <span>Assigned Role: <strong>{selectedTask.AssignedRole}</strong></span>
                    <span>•</span>
                    <span>
                      Due: <strong>{String(selectedTask.DueDate || '').slice(0, 10)}</strong> (
                      <Badge variant={getSlaBadgeVariant(selectedTask.SLAStatus)}>
                        {selectedTask.SLAStatus?.replace('_', ' ')}
                      </Badge>
                      )
                    </span>
                  </div>
                </div>
              </div>

              {/* Navigation Tabs inside Modal for Rich Context */}
              <div className="modal-sub-tabs">
                <button
                  type="button"
                  className={`modal-tab-btn ${activeModalTab === 'details' ? 'is-active' : ''}`}
                  onClick={() => setActiveModalTab('details')}
                >
                  Record Overview
                </button>
                <button
                  type="button"
                  className={`modal-tab-btn ${activeModalTab === 'documents' ? 'is-active' : ''}`}
                  onClick={() => setActiveModalTab('documents')}
                >
                  Documents & Checklist {checklist.length > 0 && `(${completedChecklistCount}/${checklist.length})`}
                </button>
                <button
                  type="button"
                  className={`modal-tab-btn ${activeModalTab === 'history' ? 'is-active' : ''}`}
                  onClick={() => setActiveModalTab('history')}
                >
                  Workflow History {history.length > 0 && `(${history.length})`}
                </button>
              </div>

              {/* Tab 1: Record Overview */}
              {activeModalTab === 'details' && (
                <div className="modal-tab-pane">
                  {/* Action instruction box */}
                  <div className="task-modal-instruction-box">
                    <strong>Action Instruction:</strong>
                    <p>{selectedTask.Instruction}</p>
                  </div>

                  {/* A. If Compliance Task */}
                  {selectedTask.SourceModule === 'Compliance' && (
                    <div className="detail-card-section">
                      <h4 className="section-title">Compliance Case Information</h4>
                      <div className="detail-meta-grid">
                        <div className="meta-item">
                          <span className="meta-label">Case Number:</span>
                          <span className="meta-val font-mono">{compCase?.CaseNumber || `CASE-${selectedTask.SourceID}`}</span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-label">Event Pipeline:</span>
                          <span className="meta-val">{compCase?.EventCode?.replace(/_/g, ' ') || 'Residency Renewal'}</span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-label">Current Stage:</span>
                          <span className="meta-val">
                            <Badge variant="info">{compCase?.CurrentStageKey || selectedTask.ActionKey}</Badge>
                          </span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-label">Case Status:</span>
                          <span className="meta-val">{compCase?.Status || 'IN_PROGRESS'}</span>
                        </div>

                        {/* Regional Visa/Iqama Specifics */}
                        {selectedTask.RegionCode === 'saudi' ? (
                          <>
                            <div className="meta-item">
                              <span className="meta-label">Current Iqama Number:</span>
                              <span className="meta-val font-mono">
                                {selectedTask.IqamaNumber || compCase?.IqamaNumber || 'Not Recorded'}
                              </span>
                            </div>
                            <div className="meta-item">
                              <span className="meta-label">Current Iqama Expiry:</span>
                              <span className="meta-val">
                                <strong>{selectedTask.IqamaExpiry || compCase?.IqamaExpiry || 'Not Recorded'}</strong>
                              </span>
                            </div>
                            <div className="meta-item">
                              <span className="meta-label">Sponsorship Type:</span>
                              <span className="meta-val">
                                {selectedTask.KSAVendorType || selectedTask.Sponsor || 'Direct Sponsorship'}
                              </span>
                            </div>
                            <div className="meta-item">
                              <span className="meta-label">Employment Type:</span>
                              <span className="meta-val">{selectedTask.EmploymentType || 'Fixed Term'}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="meta-item">
                              <span className="meta-label">Current Visa Number:</span>
                              <span className="meta-val font-mono">
                                {selectedTask.VisaNumber || compCase?.VisaNumber || 'Not Recorded'}
                              </span>
                            </div>
                            <div className="meta-item">
                              <span className="meta-label">Current Visa Expiry:</span>
                              <span className="meta-val">
                                <strong>{selectedTask.VisaExpiry || compCase?.VisaExpiry || 'Not Recorded'}</strong>
                              </span>
                            </div>
                            <div className="meta-item">
                              <span className="meta-label">Employee Category:</span>
                              <span className="meta-val">
                                {selectedTask.UAEEmployeeCategory || 'Standard'} (
                                {selectedTask.UAEEmployeeCategory === 'Labor' ? 'Tawjeeh Mandatory' : 'Skilled Non-Labor'}
                                )
                              </span>
                            </div>
                            <div className="meta-item">
                              <span className="meta-label">Target Completion:</span>
                              <span className="meta-val">{compCase?.TargetCompletionDate || 'Prior to Expiry'}</span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Duration Selection for Iqama Tasks */}
                      {(selectedTask.ActionKey === 'HOD_DURATION' || selectedTask.PrimaryActionLabel === 'Select Duration') && !rejectMode && (
                        <div className="task-special-input duration-box">
                          <label className="duration-title">Select Iqama Renewal Duration:</label>
                          <p className="duration-sub">Choose approved duration for GOSI & Muqeem processing:</p>
                          <div className="duration-options-grid">
                            <label className={`duration-card ${iqamaDuration === '3' ? 'is-selected' : ''}`}>
                              <input
                                type="radio"
                                name="iqamaDur"
                                value="3"
                                checked={iqamaDuration === '3'}
                                onChange={(e) => setIqamaDuration(e.target.value)}
                              />
                              <div className="dur-text">
                                <span className="dur-name">3 Months</span>
                                <span className="dur-fee">SAR {iqamaFees[3]?.toLocaleString()}</span>
                              </div>
                            </label>
                            <label className={`duration-card ${iqamaDuration === '6' ? 'is-selected' : ''}`}>
                              <input
                                type="radio"
                                name="iqamaDur"
                                value="6"
                                checked={iqamaDuration === '6'}
                                onChange={(e) => setIqamaDuration(e.target.value)}
                              />
                              <div className="dur-text">
                                <span className="dur-name">6 Months</span>
                                <span className="dur-fee">SAR {iqamaFees[6]?.toLocaleString()}</span>
                              </div>
                            </label>
                            <label className={`duration-card ${iqamaDuration === '12' ? 'is-selected' : ''}`}>
                              <input
                                type="radio"
                                name="iqamaDur"
                                value="12"
                                checked={iqamaDuration === '12'}
                                onChange={(e) => setIqamaDuration(e.target.value)}
                              />
                              <div className="dur-text">
                                <span className="dur-name">12 Months</span>
                                <span className="dur-fee">SAR {iqamaFees[12]?.toLocaleString()}</span>
                              </div>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* B. If Letter Request Task */}
                  {selectedTask.SourceModule === 'Letter' && (
                    <div className="detail-card-section">
                      <h4 className="section-title">Letter Request Details</h4>
                      <div className="detail-meta-grid">
                        <div className="meta-item">
                          <span className="meta-label">Request Code:</span>
                          <span className="meta-val font-mono">{letterReq?.RequestCode || 'LTR-101'}</span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-label">Letter Type:</span>
                          <span className="meta-val"><strong>{letterReq?.LetterType || 'Experience Letter'}</strong></span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-label">Current Status:</span>
                          <span className="meta-val"><Badge variant="warning">{letterReq?.Status || 'PENDING_REVIEW'}</Badge></span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-label">Submitted On:</span>
                          <span className="meta-val">
                            {letterReq?.CreatedAt ? new Date(letterReq.CreatedAt).toLocaleDateString() : 'Recent'}
                          </span>
                        </div>
                      </div>

                      <div className="employee-reason-box">
                        <span className="reason-label">Employee Purpose / Reason:</span>
                        <div className="reason-content">
                          {letterReq?.Remarks ? (
                            `"${letterReq.Remarks}"`
                          ) : (
                            <span className="text-muted">No specific purpose remarks submitted by employee.</span>
                          )}
                        </div>
                      </div>

                      {/* Rendered Letter Preview Box */}
                      {letterReq?.renderedContent && (
                        <div className="letter-preview-container">
                          <span className="preview-label">Document Content Preview:</span>
                          <div className="letter-sheet-preview">
                            <pre className="letter-text">{letterReq.renderedContent}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* C. If Advance Request Task */}
                  {selectedTask.SourceModule === 'Request' && (
                    <div className="detail-card-section">
                      <h4 className="section-title">Advance Request Terms</h4>
                      <div className="detail-meta-grid">
                        <div className="meta-item">
                          <span className="meta-label">Request Code:</span>
                          <span className="meta-val font-mono">{empReq?.RequestCode || 'REQ-101'}</span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-label">Request Type:</span>
                          <span className="meta-val">{empReq?.RequestType?.replace(/_/g, ' ') || 'Salary Advance'}</span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-label">Requested Amount:</span>
                          <span className="meta-val text-primary font-bold">
                            {selectedTask.RegionCode === 'saudi' ? 'SAR' : 'AED'} {Number(empReq?.Amount || 3000).toLocaleString()}
                          </span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-label">Repayment Terms:</span>
                          <span className="meta-val">{empReq?.RepaymentSchedule || '3 Monthly Installments'}</span>
                        </div>
                      </div>
                      <div className="employee-reason-box">
                        <span className="reason-label">Employee Reason:</span>
                        <div className="reason-content">
                          {empReq?.Reason ? `"${empReq.Reason}"` : <span className="text-muted">No reason stated.</span>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Submitted Documents & Required Checklist */}
              {activeModalTab === 'documents' && (
                <div className="modal-tab-pane">
                  {/* Repository Documents */}
                  <div className="doc-section-card">
                    <h4 className="section-title">Submitted Documents & Repository Files</h4>
                    {documents.length === 0 ? (
                      <div className="doc-empty-box">
                        <span className="empty-icon">📂</span>
                        <p>No uploaded document files found in Document Center repository for this employee.</p>
                      </div>
                    ) : (
                      <div className="doc-items-table">
                        {documents.map((doc) => (
                          <div key={doc.DocumentID} className="doc-row-item">
                            <div className="doc-main">
                              <span className="doc-icon">📄</span>
                              <div>
                                <strong className="doc-filename">{doc.FileName}</strong>
                                <span className="doc-sub">
                                  {doc.Category} • v{doc.Version} • {new Date(doc.CreatedAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                            <a
                              href={documentsApi.getDownloadUrl(doc.DocumentID)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn--outline btn--sm"
                            >
                              Download / Preview
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Required Closure Checklist */}
                  {checklist.length > 0 && (
                    <div className="checklist-section-card">
                      <div className="checklist-header">
                        <h4 className="section-title">Required Compliance Checklist</h4>
                        <span className="checklist-counter">
                          {completedChecklistCount} of {checklist.length} Completed
                        </span>
                      </div>

                      {missingChecklistItems.length > 0 && (
                        <div className="missing-checklist-banner">
                          <strong>Pending Required Items:</strong>
                          <span> {missingChecklistItems.map((i) => i.ItemLabel).join(' • ')}</span>
                        </div>
                      )}

                      <div className="checklist-items-grid">
                        {checklist.map((item) => (
                          <div
                            key={item.ProgressID}
                            className={`checklist-item-row ${item.IsCompleted ? 'is-complete' : 'is-pending'}`}
                          >
                            <span className="check-bullet">{item.IsCompleted ? '✓' : '○'}</span>
                            <span className="check-label">{item.ItemLabel}</span>
                            <Badge variant={item.IsCompleted ? 'success' : 'warning'}>
                              {item.IsCompleted ? 'Verified / Submitted' : 'Required'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Workflow History Timeline */}
              {activeModalTab === 'history' && (
                <div className="modal-tab-pane">
                  <div className="history-section-card">
                    <h4 className="section-title">Workflow Progression Timeline</h4>
                    {history.length === 0 ? (
                      <div className="doc-empty-box">
                        <p>No prior stage transitions recorded. This is the initial stage.</p>
                      </div>
                    ) : (
                      <div className="history-timeline">
                        {history.map((h, idx) => (
                          <div key={h.HistoryID || idx} className="timeline-node">
                            <div className="timeline-marker"></div>
                            <div className="timeline-body">
                              <div className="timeline-header">
                                <strong className="timeline-stage">{h.StageName || h.StageKey}</strong>
                                <Badge variant={h.SLAStatus === 'BREACHED' ? 'danger' : 'info'}>
                                  {h.ActionTaken || 'STAGE_ENTERED'}
                                </Badge>
                              </div>
                              <div className="timeline-meta">
                                <span>Actor: <strong>{h.ActorRole}</strong></span>
                                <span>•</span>
                                <span>{new Date(h.EnteredAt).toLocaleString()}</span>
                              </div>
                              {h.Comments && (
                                <p className="timeline-comments">"{h.Comments}"</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Verification Comments / Notes Box */}
              {selectedTask.Status !== 'COMPLETED' && (
                <div className="task-modal-comments">
                  <label htmlFor="action-comments">
                    {rejectMode ? 'Rejection Reason (Required):' : 'Verification Notes / Remarks:'}
                  </label>
                  <textarea
                    id="action-comments"
                    rows={2}
                    value={actionComments}
                    onChange={(e) => setActionComments(e.target.value)}
                    placeholder={
                      rejectMode
                        ? 'State the reason for rejecting this workflow step...'
                        : 'Add verification notes, authorization remarks, or processing references...'
                    }
                  />
                </div>
              )}

              {/* Modal Actions Footer */}
              <div className="task-modal-actions">
                {selectedTask.Status === 'COMPLETED' ? (
                  <>
                    <span className="task-done-badge" style={{ marginRight: 'auto', fontSize: '13px' }}>
                      ✓ This task has been completed and recorded in Audit Trail.
                    </span>
                    <Button variant="outline" onClick={closeActionModal}>
                      Close
                    </Button>
                  </>
                ) : rejectMode ? (
                  <>
                    <Button variant="outline" onClick={() => setRejectMode(false)}>
                      Back
                    </Button>
                    <Button
                      variant="danger"
                      disabled={executing || !actionComments.trim()}
                      onClick={() => handleExecute('REJECT')}
                    >
                      {executing ? 'Rejecting...' : 'Confirm Rejection'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className="btn-danger-outline"
                      onClick={() => setRejectMode(true)}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="primary"
                      disabled={executing}
                      onClick={() => handleExecute('CONFIRM')}
                    >
                      {executing
                        ? 'Processing...'
                        : selectedTask.SourceModule === 'Letter'
                        ? 'Approve & Issue Letter'
                        : selectedTask.ActionKey === 'HOD_DURATION'
                        ? 'Confirm Duration & Proceed'
                        : selectedTask.PrimaryActionLabel || 'Confirm & Proceed'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
