import { useState, useEffect, useCallback } from 'react'
import { lettersApi, documentsApi } from '../services/api/hrms'
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

const LETTER_TYPES = [
  'CAP Letter',
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
  const [loading, setLoading] = useState(true)
  const [createModal, setCreateModal] = useState(false)
  const [selectedType, setSelectedType] = useState(LETTER_TYPES[5]) // Default Experience Letter
  const [remarks, setRemarks] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Review & Issue Modal
  const [activeLetter, setActiveLetter] = useState(null)
  const [issueModal, setIssueModal] = useState(false)
  const [signing, setSigning] = useState(false)
  const [capturedSignature, setCapturedSignature] = useState(null)

  const loadLetters = useCallback(async () => {
    try {
      setLoading(true)
      const data = await lettersApi.getLetters()
      setLetters(data || [])
    } catch (err) {
      addToast(err.message || 'Failed to load letters', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadLetters()
  }, [loadLetters])

  const handleCreateRequest = async (e) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      await lettersApi.createLetter({
        letterType: selectedType,
        remarks: remarks.trim() || undefined,
      })
      addToast('Letter request submitted to HR', 'success')
      setCreateModal(false)
      setRemarks('')
      loadLetters()
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
      loadLetters()
    } catch (err) {
      addToast(err.message || 'Issuance failed', 'error')
    } finally {
      setSigning(false)
    }
  }

  const canReview = user?.role === 'HR' || user?.role === 'ADMIN'

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
          title="Pending HR Review"
          value={letters.filter((l) => l.Status === 'PENDING_REVIEW').length}
          icon="clock"
          variant="warning"
        />
        <StatCard
          title="Issued & Signed"
          value={letters.filter((l) => l.Status === 'ISSUED').length}
          icon="check"
          variant="success"
        />
        <StatCard title="Active Templates" value="11 Types" icon="layers" variant="info" />
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
                  <td>{new Date(l.CreatedAt).toLocaleDateString()}</td>
                  <td>
                    <Badge
                      variant={
                        l.Status === 'ISSUED'
                          ? 'success'
                          : l.Status === 'REJECTED'
                          ? 'danger'
                          : 'warning'
                      }
                    >
                      {l.Status.replace('_', ' ')}
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
                        📥 Download Document
                      </a>
                    ) : (
                      <span className="text-muted">Not generated</span>
                    )}
                  </td>
                  <td>
                    {canReview && l.Status === 'PENDING_REVIEW' ? (
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
                {LETTER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Purpose / Additional Remarks:</label>
              <textarea
                rows={3}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="State the purpose (e.g. Bank loan, embassy visa, rental contract)..."
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

      {/* Review & E-Sign Modal */}
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
                  To Whom It May Concern,
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
                  Joining Date: {activeLetter.JoiningDate || '2023-01-10'}
                  <br />
                  Gross Salary: {activeLetter.Salary ? `${activeLetter.RegionCode === 'saudi' ? 'SAR' : 'AED'} ${Number(activeLetter.Salary).toLocaleString()}` : 'Confidential'}
                </p>
                <p>
                  This official letter is issued upon formal employee request for verification purposes.
                </p>
              </div>
            </div>

            {canReview && activeLetter.Status === 'PENDING_REVIEW' && (
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
              {canReview && activeLetter.Status === 'PENDING_REVIEW' && (
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
