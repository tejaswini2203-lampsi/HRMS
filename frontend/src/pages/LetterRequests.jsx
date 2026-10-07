import { useState, useEffect, useCallback } from 'react'
import { lettersApi, documentsApi, masterApi } from '../services/api/hrms'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/common/PageHeader'
import StatCard from '../components/common/StatCard'
import Badge from '../components/common/Badge'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import LoadingState from '../components/common/LoadingState'
import EmptyState from '../components/common/EmptyState'
import SignaturePad from '../components/common/SignaturePad'
import './LetterRequests.css'

const DEFAULT_LETTER_TYPES = [
  'Corrective Action Plan (CAP) Letter',
  'Penalty Letter',
  'Increment Letter',
  'Promotion Letter',
  'Internship Certificate',
  'Experience Letter',
  'EOSB Acknowledgement Letter',
  'Salary Change Letter',
  'Salary Certificate',
  'Salary Transfer Letter',
  'Termination Letter',
]

export default function LetterRequestsPage() {
  const { user } = useAuth()
  const { addToast } = useToast()

  const [letters, setLetters] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [createModal, setCreateModal] = useState(false)
  const [selectedType, setSelectedType] = useState('Experience Letter')
  const [purpose, setPurpose] = useState('')
  const [addressee, setAddressee] = useState('')
  const [remarks, setRemarks] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Review & Issue Modal (HR)
  const [activeLetter, setActiveLetter] = useState(null)
  const [issueModal, setIssueModal] = useState(false)
  const [signing, setSigning] = useState(false)
  const [capturedSignature, setCapturedSignature] = useState(null)

  // HOD Endorsement Modal
  const [hodModal, setHodModal] = useState(false)
  const [hodAction, setHodAction] = useState('APPROVE')
  const [hodRemarks, setHodRemarks] = useState('')
  const [hodProcessing, setHodProcessing] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [lettersData, templatesData] = await Promise.all([
        lettersApi.getLetters(),
        masterApi.getLetterTemplates().catch(() => []),
      ])
      setLetters(lettersData || [])
      setTemplates(templatesData || [])
    } catch (err) {
      addToast(err.message || 'Failed to load letter data', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const currentTemplate = templates.find((t) => t.LetterType === selectedType)

  const handleCreateRequest = async (e) => {
    e.preventDefault()
    if (!purpose.trim()) {
      addToast('Purpose is required for all official letter requests', 'warning')
      return
    }

    try {
      setSubmitting(true)
      await lettersApi.createLetter({
        letterType: selectedType,
        purpose: purpose.trim(),
        addressee: addressee.trim() || undefined,
        remarks: remarks.trim() || undefined,
      })
      addToast('Letter request submitted successfully', 'success')
      setCreateModal(false)
      setPurpose('')
      setAddressee('')
      setRemarks('')
      loadData()
    } catch (err) {
      addToast(err.message || 'Submission failed', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const openReviewModal = async (letterId) => {
    try {
      const details = await lettersApi.getLetterById(letterId)
      setActiveLetter(details)
      setCapturedSignature(null)
      setIssueModal(true)
    } catch (err) {
      addToast(err.message || 'Failed to load letter details', 'error')
    }
  }

  const openHodModal = async (letterId) => {
    try {
      const details = await lettersApi.getLetterById(letterId)
      setActiveLetter(details)
      setHodAction('APPROVE')
      setHodRemarks('')
      setHodModal(true)
    } catch (err) {
      addToast(err.message || 'Failed to load letter details', 'error')
    }
  }

  const handleHodSubmit = async () => {
    if (!activeLetter) return
    try {
      setHodProcessing(true)
      await lettersApi.endorseLetter(activeLetter.LetterRequestID, {
        action: hodAction,
        remarks: hodRemarks,
      })
      addToast(
        hodAction === 'APPROVE'
          ? 'Letter endorsed and forwarded to HR'
          : 'Letter request rejected by HOD',
        'success',
      )
      setHodModal(false)
      loadData()
    } catch (err) {
      addToast(err.message || 'HOD endorsement failed', 'error')
    } finally {
      setHodProcessing(false)
    }
  }

  const handleIssueLetter = async () => {
    if (!activeLetter) return
    try {
      setSigning(true)
      await lettersApi.issueLetter(activeLetter.LetterRequestID, {
        action: 'APPROVE',
        signatureData: capturedSignature || undefined,
      })
      addToast('Letter successfully issued and document generated', 'success')
      setIssueModal(false)
      loadData()
    } catch (err) {
      addToast(err.message || 'Issuance failed', 'error')
    } finally {
      setSigning(false)
    }
  }

  const canHodApprove = user?.role === 'HOD' || user?.role === 'ADMIN'
  const canHrReview = user?.role === 'HR' || user?.role === 'ADMIN'

  // Letter types: dynamic from templates or default catalog
  const availableTypes =
    templates.length > 0
      ? Array.from(new Set(templates.map((t) => t.LetterType)))
      : DEFAULT_LETTER_TYPES

  return (
    <div className="letter-requests-page">
      <PageHeader
        title="📜 Letter Requests & Issuance"
        subtitle="Request, review, digitally sign, and issue official corporate letters across 11 standardized HR templates"
      >
        <div className="letters-header-actions">
          <Button variant="primary" onClick={() => setCreateModal(true)}>
            + Request Official Letter
          </Button>
        </div>
      </PageHeader>

      <div className="letter-stats">
        <StatCard title="Total Letters" value={letters.length} icon="file" variant="default" />
        <StatCard
          title="Pending HOD Review"
          value={letters.filter((l) => l.Status === 'PENDING_HOD').length}
          icon="clock"
          variant="warning"
        />
        <StatCard
          title="Pending HR Review"
          value={letters.filter((l) => l.Status === 'PENDING_REVIEW').length}
          icon="clock"
          variant="info"
        />
        <StatCard
          title="Issued & Signed"
          value={letters.filter((l) => l.Status === 'ISSUED').length}
          icon="check"
          variant="success"
        />
      </div>

      <div className="letter-table-wrap">
        {loading ? (
          <LoadingState message="Loading letter requests..." />
        ) : letters.length === 0 ? (
          <EmptyState
            title="No letter requests submitted"
            description="Employees can request certificates, salary verification, and official experience letters."
            action={
              <Button variant="primary" onClick={() => setCreateModal(true)}>
                Request a Letter
              </Button>
            }
          />
        ) : (
          <table className="letter-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Employee</th>
                <th>Letter Type</th>
                <th>Purpose & Addressee</th>
                <th>Requested Date</th>
                <th>Status</th>
                <th>Document</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {letters.map((l) => (
                <tr key={l.LetterRequestID}>
                  <td>
                    <strong>{l.RequestCode}</strong>
                  </td>
                  <td>
                    <span className="emp-title">
                      {l.FirstName} {l.LastName}
                    </span>
                    <span className="emp-desc">{l.Designation || 'Officer'}</span>
                  </td>
                  <td>
                    <span className="letter-type-pill">{l.LetterType}</span>
                  </td>
                  <td>
                    <div className="emp-meta">
                      <span className="name">{l.Purpose || 'General Request'}</span>
                      {l.Addressee && <span className="sub">To: {l.Addressee}</span>}
                    </div>
                  </td>
                  <td>{new Date(l.CreatedAt).toLocaleDateString()}</td>
                  <td>
                    <Badge
                      variant={
                        l.Status === 'ISSUED'
                          ? 'success'
                          : l.Status === 'REJECTED'
                          ? 'danger'
                          : l.Status === 'PENDING_HOD'
                          ? 'warning'
                          : 'info'
                      }
                    >
                      {l.Status === 'PENDING_HOD'
                        ? 'Pending HOD'
                        : l.Status === 'PENDING_REVIEW'
                        ? 'Pending HR'
                        : l.Status.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td>
                    {l.GeneratedDocumentID ? (
                      <a
                        href={documentsApi.getDownloadUrl(l.GeneratedDocumentID)}
                        target="_blank"
                        rel="noreferrer"
                        className="doc-download-link"
                      >
                        📥 Download PDF
                      </a>
                    ) : (
                      <span className="text-muted">Not generated</span>
                    )}
                  </td>
                  <td>
                    {canHodApprove && l.Status === 'PENDING_HOD' ? (
                      <Button size="sm" variant="warning" onClick={() => openHodModal(l.LetterRequestID)}>
                        HOD Review
                      </Button>
                    ) : canHrReview && l.Status === 'PENDING_REVIEW' ? (
                      <Button size="sm" variant="primary" onClick={() => openReviewModal(l.LetterRequestID)}>
                        Review & Sign
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => openReviewModal(l.LetterRequestID)}>
                        View Details
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Request Modal */}
      {createModal && (
        <Modal
          isOpen={createModal}
          onClose={() => setCreateModal(false)}
          title="Request Official Letter"
        >
          <form onSubmit={handleCreateRequest} className="letter-form">
            <div className="form-group">
              <label>Select Letter Type (11 Standard Types):</label>
              <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                {availableTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {currentTemplate?.RequiresHODApproval && (
                <small className="form-help text-warning" style={{ color: '#d97706', display: 'block', marginTop: 4 }}>
                  ⚠️ This letter type is configured to require HOD Endorsement before HR issuance.
                </small>
              )}
            </div>

            <div className="form-group">
              <label>Purpose of Request (Required):</label>
              <input
                type="text"
                required
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Bank loan application, embassy visa, rental contract"
              />
            </div>

            <div className="form-group">
              <label>Addressee (Optional / Where Applicable):</label>
              <input
                type="text"
                value={addressee}
                onChange={(e) => setAddressee(e.target.value)}
                placeholder="e.g. Dubai Islamic Bank, US Consulate General, To Whom It May Concern"
              />
            </div>

            <div className="form-group">
              <label>Additional Remarks:</label>
              <textarea
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Any special notes or requirements..."
              />
            </div>

            <div className="modal-actions-right">
              <Button variant="outline" type="button" onClick={() => setCreateModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Request'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* HOD Endorsement Modal */}
      {hodModal && activeLetter && (
        <Modal
          isOpen={hodModal}
          onClose={() => setHodModal(false)}
          title={`HOD Endorsement: ${activeLetter.LetterType} (${activeLetter.RequestCode})`}
        >
          <div className="letter-review-modal">
            <div className="req-summary-box">
              <div className="sum-row">
                <span>Employee:</span>
                <strong>{activeLetter.FirstName} {activeLetter.LastName} ({activeLetter.EmpID})</strong>
              </div>
              <div className="sum-row">
                <span>Letter Type:</span>
                <strong>{activeLetter.LetterType}</strong>
              </div>
              <div className="sum-row">
                <span>Purpose:</span>
                <strong>{activeLetter.Purpose || 'Not specified'}</strong>
              </div>
              {activeLetter.Addressee && (
                <div className="sum-row">
                  <span>Addressee:</span>
                  <strong>{activeLetter.Addressee}</strong>
                </div>
              )}
            </div>

            <div className="approval-decision-group">
              <label>HOD Decision:</label>
              <div className="decision-radios">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="hodDecision"
                    value="APPROVE"
                    checked={hodAction === 'APPROVE'}
                    onChange={() => setHodAction('APPROVE')}
                  />
                  Endorse & Forward to HR
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="hodDecision"
                    value="REJECT"
                    checked={hodAction === 'REJECT'}
                    onChange={() => setHodAction('REJECT')}
                  />
                  Reject Letter Request
                </label>
              </div>
            </div>

            <div className="form-group">
              <label>HOD Notes / Remarks:</label>
              <textarea
                rows={2}
                value={hodRemarks}
                onChange={(e) => setHodRemarks(e.target.value)}
                placeholder="Department verification notes..."
              />
            </div>

            <div className="modal-actions-right">
              <Button variant="outline" onClick={() => setHodModal(false)}>
                Cancel
              </Button>
              <Button
                variant={hodAction === 'APPROVE' ? 'primary' : 'danger'}
                disabled={hodProcessing}
                onClick={handleHodSubmit}
              >
                {hodProcessing ? 'Recording...' : `Confirm ${hodAction === 'APPROVE' ? 'Endorsement' : 'Rejection'}`}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Review & E-Sign Modal (HR) */}
      {issueModal && activeLetter && (
        <Modal
          isOpen={issueModal}
          onClose={() => setIssueModal(false)}
          title={`Review & Sign: ${activeLetter.LetterType} (${activeLetter.RequestCode})`}
        >
          <div className="letter-review-modal">
            <div className="letter-preview-card">
              <h4>Letter Content Preview (Auto-Merged):</h4>
              <div className="letter-preview-text">
                <p>
                  <strong>Addressee:</strong> {activeLetter.Addressee || 'To Whom It May Concern'}
                </p>
                <p>
                  This is to certify regarding employee{' '}
                  <strong>
                    {activeLetter.FirstName} {activeLetter.LastName}
                  </strong>{' '}
                  (ID: {activeLetter.EmpID}), currently designated as{' '}
                  <strong>{activeLetter.Designation || 'Specialist'}</strong> at{' '}
                  <strong>
                    {activeLetter.RegionCode === 'saudi'
                      ? 'EICS Saudi Arabia Commercial Services LLC'
                      : 'EICS UAE LLC'}
                  </strong>
                  .
                </p>
                <p>
                  <strong>Purpose:</strong> {activeLetter.Purpose || 'Official verification'}
                </p>
                <p>
                  Joining Date: {activeLetter.JoiningDate || '2023-01-10'}
                  <br />
                  Gross Salary: {activeLetter.Salary ? `${activeLetter.RegionCode === 'saudi' ? 'SAR' : 'AED'} ${Number(activeLetter.Salary).toLocaleString()}` : 'Confidential'}
                </p>
                <p>
                  This official letter is issued upon formal employee request for verification purposes.
                </p>
              </div>
            </div>

            {canHrReview && activeLetter.Status === 'PENDING_REVIEW' && (
              <div className="signature-section">
                <h4>Authorized Signatory E-Signature</h4>
                <p className="sig-sub">Apply your digital signature to authorize document generation:</p>
                <SignaturePad
                  signerName={user?.name}
                  onSave={(sigData) => {
                    setCapturedSignature(sigData)
                    addToast('Signature captured successfully', 'info')
                  }}
                />
                {capturedSignature && (
                  <div className="sig-success-badge">
                    ✓ E-Signature ready to be stamped on document
                  </div>
                )}
              </div>
            )}

            <div className="modal-actions-right">
              <Button variant="outline" onClick={() => setIssueModal(false)}>
                Close
              </Button>
              {canHrReview && activeLetter.Status === 'PENDING_REVIEW' && (
                <Button
                  variant="primary"
                  disabled={signing}
                  onClick={handleIssueLetter}
                >
                  {signing ? 'Issuing...' : 'Authorize & Issue Letter'}
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

