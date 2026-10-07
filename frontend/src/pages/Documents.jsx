import { useState, useEffect, useCallback } from 'react'
import { documentsApi } from '../services/api/hrms'
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
import './Documents.css'

export default function DocumentsPage() {
  const { user } = useAuth()
  const { addToast } = useToast()

  // Active Tab
  const [activeTab, setActiveTab] = useState('repository') // 'repository' | 'bulk'

  // Documents & Loading
  const [docs, setDocs] = useState([])
  const [docTypes, setDocTypes] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [selectedCat, setSelectedCat] = useState('All')
  const [selectedSource, setSelectedSource] = useState('All')
  const [selectedRegion, setSelectedRegion] = useState('All')
  const [selectedSigStatus, setSelectedSigStatus] = useState('All')
  const [includeVersions, setIncludeVersions] = useState(false)

  // Modals
  const [uploadModal, setUploadModal] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [versionModal, setVersionModal] = useState(false)
  const [targetDocForVersion, setTargetDocForVersion] = useState(null)
  const [newVersionFile, setNewVersionFile] = useState(null)
  const [newVersionFileName, setNewVersionFileName] = useState('')
  const [newVersionBase64, setNewVersionBase64] = useState('')
  const [newVersionMime, setNewVersionMime] = useState('application/pdf')
  const [newVersionDesc, setNewVersionDesc] = useState('')
  const [uploadingVersion, setUploadingVersion] = useState(false)

  const [historyModal, setHistoryModal] = useState(false)
  const [targetDocForHistory, setTargetDocForHistory] = useState(null)
  const [historyRecords, setHistoryRecords] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const [signModal, setSignModal] = useState(false)
  const [targetDocForSign, setTargetDocForSign] = useState(null)
  const [signingDoc, setSigningDoc] = useState(false)

  // Single Upload Form State
  const [docCategory, setDocCategory] = useState('General')
  const [docSourceModule, setDocSourceModule] = useState('GENERAL')
  const [fileName, setFileName] = useState('')
  const [fileContentBase64, setFileContentBase64] = useState('')
  const [fileMimeType, setFileMimeType] = useState('application/pdf')
  const [empId, setEmpId] = useState(user?.role === 'EMPLOYEE' ? user?.empId : '')
  const [docDescription, setDocDescription] = useState('')
  const [requiresSignature, setRequiresSignature] = useState(false)

  // Bulk Upload State
  const [bulkFiles, setBulkFiles] = useState([])
  const [bulkCategory, setBulkCategory] = useState('ID Copy')
  const [bulkSourceModule, setBulkSourceModule] = useState('GENERAL')
  const [bulkTargetEmpId, setBulkTargetEmpId] = useState('')
  const [bulkEmpIdMode, setBulkEmpIdMode] = useState('single') // 'single' | 'per_file'
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)

  // Load Document Types Catalog
  useEffect(() => {
    async function fetchTypes() {
      try {
        const types = await documentsApi.getDocumentTypes()
        if (Array.isArray(types) && types.length > 0) {
          setDocTypes(types)
        }
      } catch (err) {
        console.error('Failed to load document types catalog', err)
      }
    }
    fetchTypes()
  }, [])

  // Load Documents
  const loadDocs = useCallback(async () => {
    try {
      setLoading(true)
      const data = await documentsApi.getDocuments({
        category: selectedCat !== 'All' ? selectedCat : undefined,
        sourceModule: selectedSource !== 'All' ? selectedSource : undefined,
        regionCode: selectedRegion !== 'All' ? selectedRegion : undefined,
        signatureStatus: selectedSigStatus !== 'All' ? selectedSigStatus : undefined,
        search: search.trim() || undefined,
        includeAllVersions: includeVersions ? 'true' : undefined,
      })
      setDocs(data || [])
    } catch (err) {
      addToast(err.message || 'Failed to load documents', 'error')
    } finally {
      setLoading(false)
    }
  }, [
    selectedCat,
    selectedSource,
    selectedRegion,
    selectedSigStatus,
    search,
    includeVersions,
    addToast,
  ])

  useEffect(() => {
    loadDocs()
  }, [loadDocs])

  // Single File Change Handler
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setFileMimeType(file.type || 'application/pdf')
    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result
      if (typeof dataUrl === 'string') {
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
        setFileContentBase64(base64)
      }
    }
    reader.readAsDataURL(file)
  }

  // Single Upload Submit
  const handleSingleUpload = async (e) => {
    e.preventDefault()
    if (!fileName.trim()) {
      addToast('Please provide a document title / file name', 'warning')
      return
    }

    try {
      setUploading(true)
      await documentsApi.uploadDocument({
        category: docCategory,
        sourceModule: docSourceModule,
        empId: empId ? Number(empId) : user?.empId,
        fileName: fileName.trim(),
        fileContentBase64: fileContentBase64 || undefined,
        mimeType: fileMimeType || 'application/pdf',
        description: docDescription.trim() || undefined,
        requiresSignature,
      })
      addToast('Document registered in Document Repository', 'success')
      setUploadModal(false)
      setFileName('')
      setFileContentBase64('')
      setDocDescription('')
      setRequiresSignature(false)
      loadDocs()
    } catch (err) {
      addToast(err.message || 'Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  // New Version File Change Handler
  const handleNewVersionFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setNewVersionFile(file)
    setNewVersionFileName(file.name)
    setNewVersionMime(file.type || 'application/pdf')
    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result
      if (typeof dataUrl === 'string') {
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
        setNewVersionBase64(base64)
      }
    }
    reader.readAsDataURL(file)
  }

  // New Version Upload Submit
  const handleNewVersionSubmit = async (e) => {
    e.preventDefault()
    if (!targetDocForVersion) return
    if (!newVersionFileName.trim()) {
      addToast('Please provide a file for the new version', 'warning')
      return
    }

    try {
      setUploadingVersion(true)
      await documentsApi.uploadNewVersion(targetDocForVersion.DocumentID, {
        fileName: newVersionFileName.trim(),
        fileContentBase64: newVersionBase64 || undefined,
        mimeType: newVersionMime || 'application/pdf',
        description: newVersionDesc.trim() || undefined,
      })
      addToast(
        `Version v${(targetDocForVersion.Version || 1) + 1} uploaded successfully`,
        'success',
      )
      setVersionModal(false)
      setTargetDocForVersion(null)
      setNewVersionFile(null)
      setNewVersionFileName('')
      setNewVersionBase64('')
      setNewVersionDesc('')
      loadDocs()
    } catch (err) {
      addToast(err.message || 'Failed to upload new version', 'error')
    } finally {
      setUploadingVersion(false)
    }
  }

  // View Version History
  const handleViewHistory = async (doc) => {
    setTargetDocForHistory(doc)
    setHistoryModal(true)
    try {
      setLoadingHistory(true)
      const list = await documentsApi.getVersionHistory(doc.DocumentID)
      setHistoryRecords(list || [])
    } catch (err) {
      addToast(err.message || 'Failed to load version history', 'error')
    } finally {
      setLoadingHistory(false)
    }
  }

  // Open Native E-Signature Modal
  const handleOpenSignModal = (doc) => {
    setTargetDocForSign(doc)
    setSignModal(true)
  }

  // Handle Signature Capture & Apply
  const handleApplySignature = async (sigData) => {
    if (!targetDocForSign) return
    try {
      setSigningDoc(true)
      await documentsApi.signDocument(targetDocForSign.DocumentID, {
        signatureData: sigData,
      })
      addToast('Digital signature applied successfully', 'success')
      setSignModal(false)
      setTargetDocForSign(null)
      loadDocs()
    } catch (err) {
      addToast(err.message || 'Failed to apply signature', 'error')
    } finally {
      setSigningDoc(false)
    }
  }

  // Bulk File Selection Handler
  const handleBulkFilesSelect = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const prepared = files.map((f, idx) => ({
      id: `file_${idx}_${Date.now()}`,
      file: f,
      fileName: f.name,
      mimeType: f.type || 'application/pdf',
      fileSize: f.size,
      empId: bulkTargetEmpId || '',
      category: bulkCategory,
      base64: null,
    }))

    // Read base64 for each
    prepared.forEach((item) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const dataUrl = event.target?.result
        if (typeof dataUrl === 'string') {
          item.base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
        }
      }
      reader.readAsDataURL(item.file)
    })

    setBulkFiles(prepared)
    setBulkResult(null)
  }

  // Update empId for a specific bulk row
  const handleBulkRowEmpIdChange = (id, newEmpId) => {
    setBulkFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, empId: newEmpId } : item)),
    )
  }

  // Execute Bulk Upload
  const handleExecuteBulkUpload = async () => {
    if (bulkFiles.length === 0) {
      addToast('Please select at least one file to upload', 'warning')
      return
    }

    // Validate that every file has an employee ID
    for (const item of bulkFiles) {
      const effectiveEmpId =
        bulkEmpIdMode === 'single' ? bulkTargetEmpId : item.empId
      if (!effectiveEmpId) {
        addToast(
          `Please provide an Employee ID for file: "${item.fileName}"`,
          'warning',
        )
        return
      }
    }

    try {
      setBulkUploading(true)
      const payload = bulkFiles.map((item) => ({
        empId: Number(
          bulkEmpIdMode === 'single' ? bulkTargetEmpId : item.empId,
        ),
        category: item.category || bulkCategory,
        sourceModule: bulkSourceModule,
        fileName: item.fileName,
        fileContentBase64: item.base64 || undefined,
        mimeType: item.mimeType,
        description: 'Bulk historical import',
      }))

      const res = await documentsApi.bulkUpload(payload)
      setBulkResult(res)
      if (res.successful > 0) {
        addToast(
          `Bulk upload complete: ${res.successful} files imported successfully`,
          'success',
        )
      }
      if (res.failed > 0) {
        addToast(
          `${res.failed} file(s) failed validation. See summary below.`,
          'error',
        )
      }
    } catch (err) {
      addToast(err.message || 'Bulk upload failed', 'error')
    } finally {
      setBulkUploading(false)
    }
  }

  // Calculate Stat Metrics
  const totalCount = docs.length
  const signedCount = docs.filter((d) => d.SignatureStatus === 'SIGNED').length
  const pendingSigCount = docs.filter(
    (d) => d.SignatureStatus === 'PENDING_SIGNATURE',
  ).length

  return (
    <div className="documents-page">
      <PageHeader
        title="📁 Central Document Repository & E-Sign"
        subtitle="Platform-wide document management for Compliance, Letters, Performance, and Employee Files with native E-Signature"
      >
        <div className="docs-header-actions">
          {user?.role !== 'EMPLOYEE' && (
            <div className="tab-pill-group">
              <button
                type="button"
                className={`tab-pill ${activeTab === 'repository' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('repository')}
              >
                All Documents
              </button>
              <button
                type="button"
                className={`tab-pill ${activeTab === 'bulk' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('bulk')}
              >
                Bulk Upload
              </button>
            </div>
          )}
          <Button variant="primary" onClick={() => setUploadModal(true)}>
            + Upload Document
          </Button>
        </div>
      </PageHeader>

      {/* Stats Summary */}
      <div className="docs-stats">
        <StatCard
          title="Total Documents"
          value={totalCount}
          icon="file"
          variant="primary"
        />
        <StatCard
          title="Digitally Signed"
          value={signedCount}
          icon="check"
          variant="success"
        />
        <StatCard
          title="Pending Signature"
          value={pendingSigCount}
          icon="edit"
          variant={pendingSigCount > 0 ? 'warning' : 'default'}
        />
        <StatCard
          title="Retention Policy"
          value="5 Years (Pending Confirmation)"
          icon="clock"
          variant="info"
        />
      </div>

      {activeTab === 'repository' && (
        <>
          {/* Search & Comprehensive Filters */}
          <div className="docs-filter-card">
            <div className="filter-row">
              <div className="filter-col search-col">
                <label>Quick Search</label>
                <input
                  type="text"
                  placeholder="Search file name, employee name, or note..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="filter-input"
                />
              </div>

              <div className="filter-col">
                <label>Document Type</label>
                <select
                  value={selectedCat}
                  onChange={(e) => setSelectedCat(e.target.value)}
                  className="filter-select"
                >
                  <option value="All">All Types</option>
                  {docTypes.map((t) => (
                    <option key={t.TypeCode} value={t.Category}>
                      {t.TypeName}
                    </option>
                  ))}
                  {/* Fallbacks if catalog is empty */}
                  {docTypes.length === 0 && (
                    <>
                      <option value="Offer Letter">Offer Letter</option>
                      <option value="Policy Acknowledgment">
                        Policy Acknowledgment
                      </option>
                      <option value="ID Copy">ID Copy</option>
                      <option value="Certificate">Certificate</option>
                      <option value="Compliance Document">
                        Compliance Document
                      </option>
                      <option value="Contract">Contract</option>
                      <option value="Letter">Letter</option>
                      <option value="Performance Record">
                        Performance Record
                      </option>
                      <option value="NationalID">National ID / Iqama</option>
                      <option value="Passport">Passport</option>
                      <option value="Visa">Visa</option>
                      <option value="General">General</option>
                    </>
                  )}
                </select>
              </div>

              <div className="filter-col">
                <label>Source Module</label>
                <select
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="filter-select"
                >
                  <option value="All">All Modules</option>
                  <option value="COMPLIANCE">Compliance</option>
                  <option value="LETTER_REQUEST">Letter Request</option>
                  <option value="Letters">Letters (Legacy)</option>
                  <option value="PERFORMANCE">Performance</option>
                  <option value="GENERAL">General</option>
                  <option value="DocumentCenter">Document Center</option>
                </select>
              </div>

              <div className="filter-col">
                <label>Region / Subsidiary</label>
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="filter-select"
                >
                  <option value="All">All Regions</option>
                  <option value="uae">UAE</option>
                  <option value="saudi">Saudi Arabia</option>
                </select>
              </div>

              <div className="filter-col">
                <label>Signature Status</label>
                <select
                  value={selectedSigStatus}
                  onChange={(e) => setSelectedSigStatus(e.target.value)}
                  className="filter-select"
                >
                  <option value="All">All Statuses</option>
                  <option value="SIGNED">Signed ✓</option>
                  <option value="PENDING_SIGNATURE">Pending Signature ✍</option>
                  <option value="NOT_REQUIRED">Not Required</option>
                </select>
              </div>

              <div className="filter-col checkbox-col">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={includeVersions}
                    onChange={(e) => setIncludeVersions(e.target.checked)}
                  />
                  <span>Show Historical Versions</span>
                </label>
              </div>
            </div>
          </div>

          {/* Central Documents Table */}
          <div className="docs-table-wrap">
            {loading ? (
              <LoadingState message="Loading central repository..." />
            ) : docs.length === 0 ? (
              <EmptyState
                title="No documents matched criteria"
                description="Upload compliance records, contracts, issued letters, or employee documents."
                action={
                  <Button variant="primary" onClick={() => setUploadModal(true)}>
                    + Upload New Document
                  </Button>
                }
              />
            ) : (
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Document Name</th>
                    <th>Document Type</th>
                    <th>Employee</th>
                    <th>Source Module</th>
                    <th>Version</th>
                    <th>E-Signature</th>
                    <th>Uploaded Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.DocumentID} className={d.IsActiveVersion ? '' : 'is-archived-row'}>
                      <td>
                        <div className="doc-name-cell">
                          <span className="doc-icon">📄</span>
                          <div>
                            <strong className="doc-filename">{d.FileName}</strong>
                            {d.Description && (
                              <div className="doc-desc-text">{d.Description}</div>
                            )}
                            {!d.IsActiveVersion && (
                              <span className="archived-tag">Archived Version</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge variant="default">{d.Category}</Badge>
                      </td>
                      <td>
                        {d.FirstName ? (
                          <div className="doc-emp-cell">
                            <strong>
                              {d.FirstName} {d.LastName}
                            </strong>
                            <span className="emp-sub-badge">
                              {d.EmployeeSubsidiary
                                ? d.EmployeeSubsidiary.toUpperCase()
                                : (d.RegionCode || '').toUpperCase()}
                              {d.EmpCode ? ` • ${d.EmpCode}` : ''}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted">Corporate Platform</span>
                        )}
                      </td>
                      <td>
                        <span className={`source-tag module-${(d.SourceModule || '').toLowerCase()}`}>
                          {d.SourceModule}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="version-badge-btn"
                          title="Click to view version history"
                          onClick={() => handleViewHistory(d)}
                        >
                          v{d.Version}
                        </button>
                      </td>
                      <td>
                        {d.SignatureStatus === 'SIGNED' ? (
                          <div className="sig-status-signed" title={`Signed by: ${d.SignerName || 'Signatory'}`}>
                            <span className="sig-icon">✓</span>
                            <span>Signed</span>
                          </div>
                        ) : d.SignatureStatus === 'PENDING_SIGNATURE' ? (
                          <div className="sig-status-pending">
                            <span className="sig-icon">✍</span>
                            <span>Pending</span>
                            <button
                              type="button"
                              className="sig-action-inline-btn"
                              onClick={() => handleOpenSignModal(d)}
                            >
                              Sign
                            </button>
                          </div>
                        ) : (
                          <span className="sig-not-required">Not Required</span>
                        )}
                      </td>
                      <td>
                        <div className="upload-meta-cell">
                          <span>{new Date(d.CreatedAt).toLocaleDateString()}</span>
                          {d.UploaderFirstName && (
                            <small className="uploader-name">
                              by {d.UploaderFirstName}
                            </small>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="doc-row-actions">
                          <a
                            href={documentsApi.getDownloadUrl(d.DocumentID)}
                            target="_blank"
                            rel="noreferrer"
                            className="action-link download-link"
                            title="Download document file"
                          >
                            Download
                          </a>
                          <button
                            type="button"
                            className="action-link history-link"
                            onClick={() => handleViewHistory(d)}
                            title="View document versions"
                          >
                            History
                          </button>
                          {user?.role !== 'EMPLOYEE' && (
                            <button
                              type="button"
                              className="action-link new-version-link"
                              onClick={() => {
                                setTargetDocForVersion(d)
                                setVersionModal(true)
                              }}
                              title="Upload updated version"
                            >
                              + New Ver
                            </button>
                          )}
                          {d.SignatureStatus === 'PENDING_SIGNATURE' && (
                            <button
                              type="button"
                              className="action-link sign-link"
                              onClick={() => handleOpenSignModal(d)}
                            >
                              Sign
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Bulk Upload Tab */}
      {activeTab === 'bulk' && user?.role !== 'EMPLOYEE' && (
        <div className="bulk-upload-container">
          <div className="bulk-card">
            <h3>Batch Historical Document Upload</h3>
            <p className="bulk-intro">
              Upload multiple employee documents simultaneously during rollout.
              Strict validation ensures all documents are attached to valid employee records within your regional scope.
            </p>

            <div className="bulk-form-grid">
              <div className="form-group">
                <label>Document Category / Type:</label>
                <select
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                  className="filter-select"
                >
                  {docTypes.map((t) => (
                    <option key={t.TypeCode} value={t.Category}>
                      {t.TypeName}
                    </option>
                  ))}
                  {docTypes.length === 0 && (
                    <>
                      <option value="ID Copy">ID Copy</option>
                      <option value="Certificate">Certificate</option>
                      <option value="Passport">Passport</option>
                      <option value="Visa">Visa</option>
                      <option value="NationalID">National ID / Iqama</option>
                      <option value="Contract">Contract</option>
                      <option value="General">General</option>
                    </>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label>Source Module:</label>
                <select
                  value={bulkSourceModule}
                  onChange={(e) => setBulkSourceModule(e.target.value)}
                  className="filter-select"
                >
                  <option value="GENERAL">General</option>
                  <option value="COMPLIANCE">Compliance</option>
                  <option value="LETTER_REQUEST">Letter Request</option>
                  <option value="PERFORMANCE">Performance</option>
                </select>
              </div>

              <div className="form-group">
                <label>Employee Assignment Mode:</label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="bulkEmpMode"
                      value="single"
                      checked={bulkEmpIdMode === 'single'}
                      onChange={() => setBulkEmpIdMode('single')}
                    />
                    <span>Single Employee for Batch</span>
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="bulkEmpMode"
                      value="per_file"
                      checked={bulkEmpIdMode === 'per_file'}
                      onChange={() => setBulkEmpIdMode('per_file')}
                    />
                    <span>Specify Employee per File</span>
                  </label>
                </div>
              </div>

              {bulkEmpIdMode === 'single' && (
                <div className="form-group">
                  <label>Target Employee ID:</label>
                  <input
                    type="number"
                    value={bulkTargetEmpId}
                    onChange={(e) => setBulkTargetEmpId(e.target.value)}
                    placeholder="e.g. 2, 3, 18"
                    className="filter-input"
                    required
                  />
                </div>
              )}
            </div>

            {/* Dropzone */}
            <div className="bulk-dropzone">
              <span className="dropzone-icon">📥</span>
              <p>Drag & drop multiple files here, or choose from disk:</p>
              <input
                type="file"
                multiple
                onChange={handleBulkFilesSelect}
                className="bulk-file-input"
              />
              <small className="text-muted">
                Accepts PDF, DOCX, PNG, JPG (Max 50MB per file)
              </small>
            </div>

            {/* Staged Files Preview */}
            {bulkFiles.length > 0 && (
              <div className="bulk-preview-wrap">
                <h4>Staged Files ({bulkFiles.length})</h4>
                <table className="bulk-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>File Name</th>
                      <th>Size</th>
                      <th>Category</th>
                      <th>Target Employee ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkFiles.map((f, i) => (
                      <tr key={f.id}>
                        <td>{i + 1}</td>
                        <td>
                          <strong>{f.fileName}</strong>
                        </td>
                        <td>{(f.fileSize / 1024).toFixed(1)} KB</td>
                        <td>{bulkCategory}</td>
                        <td>
                          {bulkEmpIdMode === 'single' ? (
                            <span>Emp #{bulkTargetEmpId || 'Not set'}</span>
                          ) : (
                            <input
                              type="number"
                              value={f.empId}
                              onChange={(e) =>
                                handleBulkRowEmpIdChange(f.id, e.target.value)
                              }
                              placeholder="Emp ID"
                              className="inline-emp-input"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="bulk-actions-bar">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setBulkFiles([])
                      setBulkResult(null)
                    }}
                  >
                    Clear All
                  </Button>
                  <Button
                    variant="primary"
                    disabled={bulkUploading}
                    onClick={handleExecuteBulkUpload}
                  >
                    {bulkUploading
                      ? 'Executing Bulk Upload...'
                      : `Import ${bulkFiles.length} Document(s)`}
                  </Button>
                </div>
              </div>
            )}

            {/* Bulk Upload Results Summary */}
            {bulkResult && (
              <div className="bulk-results-card">
                <h4>Bulk Upload Summary</h4>
                <div className="bulk-summary-badges">
                  <span className="summary-badge total">
                    Total: {bulkResult.total}
                  </span>
                  <span className="summary-badge success">
                    Successful: {bulkResult.successful}
                  </span>
                  <span className="summary-badge failed">
                    Failed: {bulkResult.failed}
                  </span>
                </div>

                <table className="bulk-result-table">
                  <thead>
                    <tr>
                      <th>File Name</th>
                      <th>Emp ID</th>
                      <th>Status</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkResult.results.map((r, idx) => (
                      <tr key={idx} className={r.status === 'SUCCESS' ? 'res-success' : 'res-failed'}>
                        <td>{r.fileName}</td>
                        <td>{r.empId}</td>
                        <td>
                          <Badge variant={r.status === 'SUCCESS' ? 'success' : 'error'}>
                            {r.status}
                          </Badge>
                        </td>
                        <td>
                          {r.status === 'SUCCESS' ? (
                            <span className="text-success">
                              Registered as Document #{r.documentId}
                            </span>
                          ) : (
                            <span className="text-danger">{r.error}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Single Document Modal */}
      {uploadModal && (
        <Modal
          isOpen={uploadModal}
          onClose={() => setUploadModal(false)}
          title="Upload to Central Repository"
        >
          <form onSubmit={handleSingleUpload} className="doc-upload-form">
            <div className="form-group">
              <label>Document Category / Type:</label>
              <select
                value={docCategory}
                onChange={(e) => {
                  setDocCategory(e.target.value)
                  const match = docTypes.find((t) => t.Category === e.target.value)
                  if (match) {
                    setDocSourceModule(match.DefaultSourceModule)
                    if (match.RequiresSignature) setRequiresSignature(true)
                  }
                }}
              >
                {docTypes.map((t) => (
                  <option key={t.TypeCode} value={t.Category}>
                    {t.TypeName}
                  </option>
                ))}
                {docTypes.length === 0 && (
                  <>
                    <option value="General">General</option>
                    <option value="Offer Letter">Offer Letter</option>
                    <option value="Policy Acknowledgment">
                      Policy Acknowledgment
                    </option>
                    <option value="ID Copy">ID Copy</option>
                    <option value="Certificate">Certificate</option>
                    <option value="Compliance Document">Compliance Document</option>
                    <option value="Contract">Contract</option>
                    <option value="Passport">Passport</option>
                    <option value="Visa">Visa</option>
                    <option value="NationalID">National ID / Iqama</option>
                  </>
                )}
              </select>
            </div>

            <div className="form-group">
              <label>Source Module:</label>
              <select
                value={docSourceModule}
                onChange={(e) => setDocSourceModule(e.target.value)}
              >
                <option value="GENERAL">General</option>
                <option value="COMPLIANCE">Compliance</option>
                <option value="LETTER_REQUEST">Letter Request</option>
                <option value="PERFORMANCE">Performance</option>
                <option value="DocumentCenter">Document Center</option>
              </select>
            </div>

            <div className="form-group">
              <label>Select Document File:</label>
              <input type="file" onChange={handleFileChange} required />
            </div>

            <div className="form-group">
              <label>Document Title / File Name:</label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="e.g. Employee_Handbook_Acknowledgment.pdf"
                required
              />
            </div>

            {user?.role !== 'EMPLOYEE' && (
              <div className="form-group">
                <label>Target Employee ID (Optional):</label>
                <input
                  type="number"
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                  placeholder="e.g. 2, 3, 18"
                />
              </div>
            )}

            <div className="form-group">
              <label>Description / Metadata Note:</label>
              <textarea
                value={docDescription}
                onChange={(e) => setDocDescription(e.target.value)}
                placeholder="Optional notes or document description..."
                rows={2}
              />
            </div>

            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={requiresSignature}
                  onChange={(e) => setRequiresSignature(e.target.checked)}
                />
                <span>Requires Digital E-Signature (Routes to Signatory)</span>
              </label>
            </div>

            <div className="modal-actions-right">
              <Button
                variant="outline"
                type="button"
                onClick={() => setUploadModal(false)}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={uploading}>
                {uploading ? 'Registering...' : 'Save Document'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Upload New Version Modal */}
      {versionModal && targetDocForVersion && (
        <Modal
          isOpen={versionModal}
          onClose={() => {
            setVersionModal(false)
            setTargetDocForVersion(null)
          }}
          title={`Upload New Version for "${targetDocForVersion.FileName}"`}
        >
          <form onSubmit={handleNewVersionSubmit} className="doc-upload-form">
            <div className="version-info-box">
              <div>
                <strong>Current Version:</strong> v{targetDocForVersion.Version}
              </div>
              <div>
                <strong>Next Version:</strong> v
                {(targetDocForVersion.Version || 1) + 1}
              </div>
              <div>
                <strong>Category:</strong> {targetDocForVersion.Category}
              </div>
              <p className="version-advisory">
                Uploading a new version deactivates prior versions but retains
                complete audit and file history.
              </p>
            </div>

            <div className="form-group">
              <label>Select New Version File:</label>
              <input
                type="file"
                onChange={handleNewVersionFileChange}
                required
              />
            </div>

            <div className="form-group">
              <label>File Name:</label>
              <input
                type="text"
                value={newVersionFileName}
                onChange={(e) => setNewVersionFileName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Version Revision Notes:</label>
              <textarea
                value={newVersionDesc}
                onChange={(e) => setNewVersionDesc(e.target.value)}
                placeholder="Reason for revision or updated clauses..."
                rows={2}
              />
            </div>

            <div className="modal-actions-right">
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setVersionModal(false)
                  setTargetDocForVersion(null)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={uploadingVersion}
              >
                {uploadingVersion
                  ? 'Uploading Version...'
                  : `Publish v${(targetDocForVersion.Version || 1) + 1}`}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Version History Modal */}
      {historyModal && targetDocForHistory && (
        <Modal
          isOpen={historyModal}
          onClose={() => {
            setHistoryModal(false)
            setTargetDocForHistory(null)
            setHistoryRecords([])
          }}
          title={`Version History — ${targetDocForHistory.FileName}`}
        >
          <div className="history-modal-body">
            {loadingHistory ? (
              <LoadingState message="Loading version history..." />
            ) : historyRecords.length === 0 ? (
              <p>No historical versions found.</p>
            ) : (
              <div className="history-timeline">
                {historyRecords.map((v) => (
                  <div
                    key={v.DocumentID}
                    className={`history-card ${v.IsActiveVersion ? 'is-active-version' : 'is-archived-version'}`}
                  >
                    <div className="history-card-header">
                      <div className="version-title-row">
                        <strong className="version-number-tag">
                          Version {v.Version}
                        </strong>
                        {v.IsActiveVersion ? (
                          <Badge variant="success">Current Active Version</Badge>
                        ) : (
                          <Badge variant="default">Archived Historical</Badge>
                        )}
                      </div>
                      <a
                        href={documentsApi.getDownloadUrl(v.DocumentID)}
                        target="_blank"
                        rel="noreferrer"
                        className="download-btn-link"
                      >
                        Download File
                      </a>
                    </div>

                    <div className="history-meta-grid">
                      <div>
                        <strong>File Name:</strong> {v.FileName}
                      </div>
                      <div>
                        <strong>File Size:</strong> {(v.FileSize / 1024).toFixed(1)} KB
                      </div>
                      <div>
                        <strong>Uploaded At:</strong>{' '}
                        {new Date(v.CreatedAt).toLocaleString()}
                      </div>
                      <div>
                        <strong>Uploaded By:</strong>{' '}
                        {v.UploaderFirstName
                          ? `${v.UploaderFirstName} ${v.UploaderLastName || ''}`
                          : 'System'}
                      </div>
                      <div>
                        <strong>Signature:</strong>{' '}
                        {v.SignatureStatus === 'SIGNED' ? (
                          <span className="text-success">
                            Signed by {v.SignerName || 'Signatory'}
                          </span>
                        ) : (
                          <span>{v.SignatureStatus}</span>
                        )}
                      </div>
                      {v.VerificationHash && (
                        <div className="hash-row">
                          <strong>SHA-256:</strong>{' '}
                          <code>{v.VerificationHash.slice(0, 24)}...</code>
                        </div>
                      )}
                    </div>

                    {v.Description && (
                      <div className="history-notes">
                        <strong>Notes:</strong> {v.Description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Digital E-Signature Modal */}
      {signModal && targetDocForSign && (
        <Modal
          isOpen={signModal}
          onClose={() => {
            setSignModal(false)
            setTargetDocForSign(null)
          }}
          title={`Digital E-Signature — ${targetDocForSign.FileName}`}
        >
          <div className="sig-modal-content">
            <div className="sig-doc-summary">
              <div>
                <strong>Document:</strong> {targetDocForSign.FileName}
              </div>
              <div>
                <strong>Category:</strong> {targetDocForSign.Category}
              </div>
              <div>
                <strong>Signatory:</strong> {user?.name} ({user?.role})
              </div>
            </div>

            <SignaturePad
              signerName={user?.name || ''}
              onSave={handleApplySignature}
              onCancel={() => {
                setSignModal(false)
                setTargetDocForSign(null)
              }}
            />
            {signingDoc && <p className="signing-in-prog">Applying e-signature to document...</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}
