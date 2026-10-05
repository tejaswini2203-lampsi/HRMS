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
import './Documents.css'

const CATEGORIES = [
  'All',
  'Passport',
  'Visa',
  'EmiratesID',
  'Iqama',
  'Contract',
  'Medical',
  'Insurance',
  'Letter',
  'General',
]

export default function DocumentsPage() {
  const { user } = useAuth()
  const { addToast } = useToast()

  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCat, setSelectedCat] = useState('All')
  const [uploadModal, setUploadModal] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Upload Form
  const [docCategory, setDocCategory] = useState('Passport')
  const [fileName, setFileName] = useState('')
  const [fileContentBase64, setFileContentBase64] = useState('')
  const [fileMimeType, setFileMimeType] = useState('application/pdf')
  const [empId, setEmpId] = useState(user?.empId || '')

  const loadDocs = useCallback(async () => {
    try {
      setLoading(true)
      const data = await documentsApi.getDocuments({
        category: selectedCat !== 'All' ? selectedCat : undefined,
      })
      setDocs(data || [])
    } catch (err) {
      addToast(err.message || 'Failed to load documents', 'error')
    } finally {
      setLoading(false)
    }
  }, [selectedCat, addToast])

  useEffect(() => {
    loadDocs()
  }, [loadDocs])

  const handleFileUpload = async (e) => {
    e.preventDefault()
    if (!fileName.trim()) {
      addToast('Please provide a document title / file name', 'warning')
      return
    }

    try {
      setUploading(true)
      await documentsApi.uploadDocument({
        category: docCategory,
        sourceModule: 'DocumentCenter',
        empId: empId ? Number(empId) : user?.empId,
        fileName: fileName.trim(),
        fileContentBase64: fileContentBase64 || undefined,
        mimeType: fileMimeType || 'application/pdf',
      })
      addToast('Document registered in Document Center', 'success')
      setUploadModal(false)
      setFileName('')
      setFileContentBase64('')
      setFileMimeType('application/pdf')
      loadDocs()
    } catch (err) {
      addToast(err.message || 'Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

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

  return (
    <div className="documents-page">
      <PageHeader
        title="📁 Document Center"
        subtitle="Unified repository for passports, visas, contracts, medical fitness records, and issued HR letters"
      >
        <div className="docs-header-actions">
          <Button variant="primary" onClick={() => setUploadModal(true)}>
            + Upload Document
          </Button>
        </div>
      </PageHeader>

      <div className="docs-stats">
        <StatCard title="Total Documents" value={docs.length} icon="file" variant="primary" />
        <StatCard title="Retention Policy" value="5 Years → Archive" icon="clock" variant="info" />
        <StatCard title="Access Policy" value="Role-Based Visibility" icon="lock" variant="default" />
      </div>

      {/* Category Pills */}
      <div className="docs-cat-bar">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`cat-tab ${selectedCat === cat ? 'is-active' : ''}`}
            onClick={() => setSelectedCat(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Documents Table */}
      <div className="docs-table-wrap">
        {loading ? (
          <LoadingState message="Loading documents..." />
        ) : docs.length === 0 ? (
          <EmptyState
            title="No documents found"
            description="Upload compliance records, contracts, or letters to store them in the Document Center."
            action={
              <Button variant="primary" onClick={() => setUploadModal(true)}>
                Upload File
              </Button>
            }
          />
        ) : (
          <table className="docs-table">
            <thead>
              <tr>
                <th>Document Name</th>
                <th>Category</th>
                <th>Employee</th>
                <th>Source Module</th>
                <th>Version</th>
                <th>Upload Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.DocumentID}>
                  <td>
                    <div className="doc-name-cell">
                      <span className="doc-icon">📄</span>
                      <strong className="doc-filename">{d.FileName}</strong>
                    </div>
                  </td>
                  <td>
                    <Badge variant="default">{d.Category}</Badge>
                  </td>
                  <td>
                    {d.FirstName ? `${d.FirstName} ${d.LastName}` : <span className="text-muted">Corporate</span>}
                  </td>
                  <td>
                    <span className="source-tag">{d.SourceModule}</span>
                  </td>
                  <td>v{d.Version}</td>
                  <td>{new Date(d.CreatedAt).toLocaleDateString()}</td>
                  <td>
                    <a
                      href={documentsApi.getDownloadUrl(d.DocumentID)}
                      target="_blank"
                      rel="noreferrer"
                      className="download-btn-link"
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Upload Modal */}
      {uploadModal && (
        <Modal
          isOpen={uploadModal}
          onClose={() => setUploadModal(false)}
          title="Upload to Document Center"
        >
          <form onSubmit={handleFileUpload} className="doc-upload-form">
            <div className="form-group">
              <label>Document Category:</label>
              <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)}>
                {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Select File (or choose file from disk):</label>
              <input type="file" onChange={handleFileChange} />
            </div>

            <div className="form-group">
              <label>Document Title / File Name:</label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="e.g. Iqama_Copy_Rahul.pdf"
                required
              />
            </div>

            {user?.role !== 'EMPLOYEE' && (
              <div className="form-group">
                <label>Associated Employee ID (Optional):</label>
                <input
                  type="number"
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                  placeholder="e.g. 2, 3, 18"
                />
              </div>
            )}

            <div className="modal-actions-right">
              <Button variant="outline" type="button" onClick={() => setUploadModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={uploading}>
                {uploading ? 'Uploading...' : 'Save Document'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
