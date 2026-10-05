import { useState, useEffect, useCallback } from 'react'
import { requestsApi } from '../services/api/hrms'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/common/PageHeader'
import StatCard from '../components/common/StatCard'
import Badge from '../components/common/Badge'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import LoadingState from '../components/common/LoadingState'
import EmptyState from '../components/common/EmptyState'
import './AdvanceRequests.css'

export default function AdvanceRequestsPage() {
  const { user } = useAuth()
  const { addToast } = useToast()

  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [requestType, setRequestType] = useState('SALARY_ADVANCE')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [repaymentMonths, setRepaymentMonths] = useState(3)

  // Approval modal
  const [selectedReq, setSelectedReq] = useState(null)
  const [approvalAction, setApprovalAction] = useState('APPROVE')
  const [approvalRemarks, setApprovalRemarks] = useState('')
  const [processing, setProcessing] = useState(false)

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true)
      const data = await requestsApi.getRequests()
      setRequests(data || [])
    } catch (err) {
      addToast(err.message || 'Failed to load requests', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) {
      addToast('Please specify a valid amount', 'warning')
      return
    }
    if (!reason.trim()) {
      addToast('Reason is required', 'warning')
      return
    }

    try {
      setSubmitting(true)
      await requestsApi.createRequest({
        requestType,
        amount: Number(amount),
        reason: reason.trim(),
        repaymentScheduleMonths: Number(repaymentMonths),
      })
      addToast('Advance request submitted for approval', 'success')
      setCreateModalOpen(false)
      setAmount('')
      setReason('')
      loadRequests()
    } catch (err) {
      addToast(err.message || 'Submission failed', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleApprovalSubmit = async () => {
    if (!selectedReq) return
    try {
      setProcessing(true)
      await requestsApi.processApproval(selectedReq.RequestID, {
        action: approvalAction,
        remarks: approvalRemarks,
      })
      addToast(
        approvalAction === 'APPROVE' ? 'Approval step recorded' : 'Request rejected',
        'success',
      )
      setSelectedReq(null)
      loadRequests()
    } catch (err) {
      addToast(err.message || 'Action failed', 'error')
    } finally {
      setProcessing(false)
    }
  }

  const canApprove = user?.role === 'HOD' || user?.role === 'HR' || user?.role === 'ADMIN'

  return (
    <div className="advance-requests-page">
      <PageHeader
        title="💰 Advance Requests"
        subtitle="Submit and track Salary & Gratuity Advances with structured multi-tier approval chains"
      >
        <div className="adv-header-actions">
          <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
            + New Advance Request
          </Button>
        </div>
      </PageHeader>

      {/* Info notice about Phase 1 repayment storage */}
      <div className="adv-policy-banner">
        <span className="banner-icon">ℹ️</span>
        <div>
          <strong>Phase 1 Advance Rule:</strong> Repayment schedules are stored for future Payroll execution.
          Approval chain: Manager/HOD → HR → Finance. (Minimum tenure and max eligibility percentages: <em>Pending Confirmation</em>).
        </div>
      </div>

      {/* Stats */}
      <div className="adv-stats">
        <StatCard title="Total Advance Requests" value={requests.length} icon="file" variant="default" />
        <StatCard
          title="Pending Approvals"
          value={requests.filter((r) => r.Status.startsWith('PENDING')).length}
          icon="clock"
          variant="warning"
        />
        <StatCard
          title="Approved Advances"
          value={requests.filter((r) => r.Status === 'APPROVED').length}
          icon="check"
          variant="success"
        />
      </div>

      {/* Requests Table */}
      <div className="adv-table-wrap">
        {loading ? (
          <LoadingState message="Loading advance requests..." />
        ) : requests.length === 0 ? (
          <EmptyState
            title="No advance requests submitted"
            description="Employees can submit salary or gratuity advances for multi-tier manager and HR review."
            action={
              <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
                Submit Request
              </Button>
            }
          />
        ) : (
          <table className="adv-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Employee</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Repayment Plan</th>
                <th>Approval Step</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                let plan = null
                try {
                  plan = r.RepaymentSchedule ? JSON.parse(r.RepaymentSchedule) : null
                } catch {
                  plan = null
                }

                return (
                  <tr key={r.RequestID}>
                    <td>
                      <strong>{r.RequestCode}</strong>
                    </td>
                    <td>
                      <div className="emp-meta">
                        <span className="name">
                          {r.FirstName} {r.LastName}
                        </span>
                        <span className="sub">{r.Designation || 'Employee'}</span>
                      </div>
                    </td>
                    <td>
                      <span className="type-tag">
                        {r.RequestType === 'SALARY_ADVANCE' ? 'Salary Advance' : 'Gratuity Advance'}
                      </span>
                    </td>
                    <td>
                      <strong className="amount-text">
                        {r.RegionCode === 'saudi' ? 'SAR' : 'AED'} {Number(r.Amount).toLocaleString()}
                      </strong>
                    </td>
                    <td>
                      <span className="repayment-pill">
                        {plan ? `${plan.months} installments of ${plan.installmentAmount}` : 'Standard schedule'}
                      </span>
                    </td>
                    <td>
                      <span className="approver-badge">{r.CurrentApproverRole}</span>
                    </td>
                    <td>
                      <Badge
                        variant={
                          r.Status === 'APPROVED'
                            ? 'success'
                            : r.Status === 'REJECTED'
                            ? 'danger'
                            : 'warning'
                        }
                      >
                        {r.Status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td>
                      {canApprove && r.Status.startsWith('PENDING') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedReq(r)
                            setApprovalAction('APPROVE')
                            setApprovalRemarks('')
                          }}
                        >
                          Review & Decide
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Request Modal */}
      {createModalOpen && (
        <Modal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title="Submit Advance Request"
        >
          <form onSubmit={handleCreate} className="adv-form">
            <div className="form-group">
              <label>Advance Type:</label>
              <select value={requestType} onChange={(e) => setRequestType(e.target.value)}>
                <option value="SALARY_ADVANCE">Salary Advance</option>
                <option value="GRATUITY_ADVANCE">Gratuity Advance (End of Service Benefit)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Requested Amount ({user?.subsidiaryId === 'saudi' ? 'SAR' : 'AED'}):</label>
              <input
                type="number"
                min="100"
                step="50"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 3000"
                required
              />
            </div>

            <div className="form-group">
              <label>Preferred Repayment Period:</label>
              <select
                value={repaymentMonths}
                onChange={(e) => setRepaymentMonths(Number(e.target.value))}
              >
                <option value={1}>1 Month (Lump sum next cycle)</option>
                <option value={2}>2 Monthly Installments</option>
                <option value={3}>3 Monthly Installments</option>
                <option value={4}>4 Monthly Installments</option>
                <option value={6}>6 Monthly Installments</option>
              </select>
              {amount > 0 && (
                <small className="form-help">
                  Estimated deduction: ~{Math.round((amount / repaymentMonths) * 100) / 100} / month
                </small>
              )}
            </div>

            <div className="form-group">
              <label>Reason / Justification:</label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="State the purpose of this advance request..."
                required
              />
            </div>

            <div className="form-actions">
              <Button variant="outline" type="button" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit for Approval'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Approval Modal */}
      {selectedReq && (
        <Modal
          isOpen={Boolean(selectedReq)}
          onClose={() => setSelectedReq(null)}
          title={`Review Request ${selectedReq.RequestCode}`}
        >
          <div className="adv-approval-modal">
            <div className="req-summary-box">
              <div className="sum-row">
                <span>Employee:</span>
                <strong>
                  {selectedReq.FirstName} {selectedReq.LastName}
                </strong>
              </div>
              <div className="sum-row">
                <span>Type:</span>
                <strong>{selectedReq.RequestType.replace('_', ' ')}</strong>
              </div>
              <div className="sum-row">
                <span>Amount:</span>
                <strong>
                  {selectedReq.RegionCode === 'saudi' ? 'SAR' : 'AED'}{' '}
                  {Number(selectedReq.Amount).toLocaleString()}
                </strong>
              </div>
              <div className="sum-row">
                <span>Reason:</span>
                <p>{selectedReq.Reason}</p>
              </div>
            </div>

            <div className="approval-decision-group">
              <label>Your Decision:</label>
              <div className="decision-radios">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="decision"
                    value="APPROVE"
                    checked={approvalAction === 'APPROVE'}
                    onChange={() => setApprovalAction('APPROVE')}
                  />
                  Approve Step (Forward to next level)
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="decision"
                    value="REJECT"
                    checked={approvalAction === 'REJECT'}
                    onChange={() => setApprovalAction('REJECT')}
                  />
                  Reject Request
                </label>
              </div>
            </div>

            <div className="form-group">
              <label>Decision Notes / Remarks:</label>
              <textarea
                rows={2}
                value={approvalRemarks}
                onChange={(e) => setApprovalRemarks(e.target.value)}
                placeholder="Verification remarks..."
              />
            </div>

            <div className="modal-actions-right">
              <Button variant="outline" onClick={() => setSelectedReq(null)}>
                Cancel
              </Button>
              <Button
                variant={approvalAction === 'APPROVE' ? 'primary' : 'danger'}
                disabled={processing}
                onClick={handleApprovalSubmit}
              >
                {processing ? 'Recording...' : `Confirm ${approvalAction}`}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
