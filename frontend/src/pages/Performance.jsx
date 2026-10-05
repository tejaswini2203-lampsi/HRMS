import { useState, useEffect, useCallback, useMemo } from 'react'
import { performanceApi } from '../services/api/hrms'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/common/PageHeader'
import Badge from '../components/common/Badge'
import Button from '../components/common/Button'
import LoadingState from '../components/common/LoadingState'
import EmptyState from '../components/common/EmptyState'
import { formatDate, formatDateTime } from '../utils/dates'
import './Performance.css'

export default function PerformancePage() {
  const { user } = useAuth()
  const { addToast } = useToast()

  // Data states
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalEmployees: 0,
    employeesWithComments: 0,
    totalGood: 0,
    totalBad: 0,
    highWeightCount: 0,
  })
  const [employees, setEmployees] = useState([])

  // Filtering states for table
  const [searchTerm, setSearchTerm] = useState('')
  const [filterWithComments, setFilterWithComments] = useState('ALL') // ALL | WITH_COMMENTS | WITHOUT_COMMENTS
  const [sortBy, setSortBy] = useState('comments') // comments | name | date

  // Timeline Modal states
  const [timelineEmp, setTimelineEmp] = useState(null)
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineComments, setTimelineComments] = useState([])
  const [filterSentiment, setFilterSentiment] = useState('ALL') // ALL | GOOD | BAD
  const [filterWeight, setFilterWeight] = useState('ALL') // ALL | NORMAL | HIGH
  const [filterAuthor, setFilterAuthor] = useState('')

  // Add Comment Modal states
  const [commentModalOpen, setCommentModalOpen] = useState(false)
  const [targetEmpId, setTargetEmpId] = useState('')
  const [commentText, setCommentText] = useState('')
  const [sentiment, setSentiment] = useState('GOOD') // GOOD | BAD
  const [weight, setWeight] = useState('NORMAL') // NORMAL | HIGH
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // Can the logged in user add comments?
  const canAddComment = user?.role === 'ADMIN' || user?.role === 'HR' || user?.role === 'HOD'

  // Load Overview
  const loadOverview = useCallback(async () => {
    try {
      setLoading(true)
      const res = await performanceApi.getOverview()
      if (res) {
        setStats(
          res.stats || {
            totalEmployees: 0,
            employeesWithComments: 0,
            totalGood: 0,
            totalBad: 0,
            highWeightCount: 0,
          },
        )
        setEmployees(res.employees || [])
      }
    } catch (err) {
      addToast(err.message || 'Failed to load performance overview', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadOverview()
  }, [loadOverview])

  // Load Timeline comments for an employee
  const loadTimelineComments = useCallback(
    async (empId, filters = {}) => {
      try {
        setTimelineLoading(true)
        const comments = await performanceApi.getComments(empId, filters)
        setTimelineComments(comments || [])
      } catch (err) {
        addToast(err.message || 'Failed to load comments timeline', 'error')
      } finally {
        setTimelineLoading(false)
      }
    },
    [addToast],
  )

  const handleOpenTimeline = (emp) => {
    setTimelineEmp(emp)
    setFilterSentiment('ALL')
    setFilterWeight('ALL')
    setFilterAuthor('')
    loadTimelineComments(emp.EmpID)
  }

  const handleCloseTimeline = () => {
    setTimelineEmp(null)
    setTimelineComments([])
  }

  // Handle Timeline filters change
  const handleApplyTimelineFilters = () => {
    if (!timelineEmp) return
    loadTimelineComments(timelineEmp.EmpID, {
      sentiment: filterSentiment,
      weight: filterWeight,
      author: filterAuthor,
    })
  }

  // Handle open Add Comment modal
  const handleOpenAddComment = (empId = null) => {
    setFormError('')
    setCommentText('')
    setSentiment('GOOD')
    setWeight('NORMAL')
    setTargetEmpId(empId ? String(empId) : employees[0]?.EmpID ? String(employees[0].EmpID) : '')
    setCommentModalOpen(true)
  }

  const handleCloseAddComment = () => {
    setCommentModalOpen(false)
    setFormError('')
  }

  // Submit comment
  const handleSubmitComment = async (e) => {
    e.preventDefault()
    setFormError('')

    if (!targetEmpId) {
      setFormError('Please select an employee')
      return
    }

    if (!commentText.trim()) {
      setFormError('Comment text is required and cannot be empty')
      return
    }

    try {
      setSubmitting(true)
      await performanceApi.addComment(targetEmpId, {
        comment: commentText.trim(),
        sentiment,
        weight,
        priority: weight,
      })

      addToast('Performance observation recorded successfully', 'success')
      setCommentModalOpen(false)
      setCommentText('')

      // Refresh overview
      await loadOverview()

      // If timeline is open for this employee, refresh timeline
      if (timelineEmp && String(timelineEmp.EmpID) === String(targetEmpId)) {
        await loadTimelineComments(targetEmpId)
      }
    } catch (err) {
      setFormError(err.message || 'Failed to save comment')
      addToast(err.message || 'Failed to save comment', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Filter and sort employee list
  const filteredEmployees = useMemo(() => {
    let list = [...employees]

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim()
      list = list.filter(
        (e) =>
          e.FullName.toLowerCase().includes(q) ||
          String(e.EmpID).includes(q) ||
          e.DepartmentName.toLowerCase().includes(q) ||
          e.Designation.toLowerCase().includes(q),
      )
    }

    if (filterWithComments === 'WITH_COMMENTS') {
      list = list.filter((e) => e.CommentCount > 0)
    } else if (filterWithComments === 'WITHOUT_COMMENTS') {
      list = list.filter((e) => e.CommentCount === 0)
    }

    if (sortBy === 'comments') {
      list.sort((a, b) => b.CommentCount - a.CommentCount || a.FullName.localeCompare(b.FullName))
    } else if (sortBy === 'name') {
      list.sort((a, b) => a.FullName.localeCompare(b.FullName))
    } else if (sortBy === 'date') {
      list.sort((a, b) => {
        if (!a.LatestCommentDate) return 1
        if (!b.LatestCommentDate) return -1
        return new Date(b.LatestCommentDate).getTime() - new Date(a.LatestCommentDate).getTime()
      })
    }

    return list
  }, [employees, searchTerm, filterWithComments, sortBy])

  return (
    <div className="performance-page">
      <PageHeader
        title="🌟 Continuous Performance Management"
        subtitle="Qualitative observation log for contract-renewal inputs · (Phase 1 Continuous Comment Log)"
      />

      <div className="perf-scope-banner">
        <div className="perf-scope-icon">📋</div>
        <div className="perf-scope-text">
          <strong>BRD Scope Boundary:</strong> Lightweight, continuous performance observation log.
          Tags: <strong>Sentiment (GOOD / BAD)</strong> and <strong>Weight (NORMAL / HIGH)</strong>.
          Formal 1–5 ratings, goal appraisal cycles, and automated renewal scoring are strictly Phase 2.
        </div>
      </div>

      {/* A. PERFORMANCE OVERVIEW CARDS */}
      <div className="perf-stats-grid">
        <div className="perf-stat-card">
          <div className="stat-label">Accessible Employees</div>
          <div className="stat-val">{stats.totalEmployees}</div>
          <div className="stat-sub">Across authorized scope</div>
        </div>

        <div className="perf-stat-card">
          <div className="stat-label">Employees with Feedback</div>
          <div className="stat-val">{stats.employeesWithComments}</div>
          <div className="stat-sub">
            {stats.totalEmployees > 0
              ? `${Math.round((stats.employeesWithComments / stats.totalEmployees) * 100)}% coverage`
              : '0% coverage'}
          </div>
        </div>

        <div className="perf-stat-card is-good">
          <div className="stat-label">Good Observations</div>
          <div className="stat-val good-text">{stats.totalGood}</div>
          <div className="stat-sub">Positive sentiment (Green)</div>
        </div>

        <div className="perf-stat-card is-bad">
          <div className="stat-label">Bad / Concern Notes</div>
          <div className="stat-val bad-text">{stats.totalBad}</div>
          <div className="stat-sub">Negative sentiment (Red)</div>
        </div>

        <div className="perf-stat-card is-high">
          <div className="stat-label">High-Weight Observations</div>
          <div className="stat-val high-text">🔥 {stats.highWeightCount}</div>
          <div className="stat-sub">High impact for renewal</div>
        </div>
      </div>

      {/* TOOLBAR CONTROLS */}
      <div className="perf-toolbar">
        <div className="toolbar-search-box">
          <input
            type="text"
            placeholder="Search by Employee Name, ID, Department, or Designation..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="perf-search-input"
          />
        </div>

        <div className="toolbar-filter-group">
          <select
            value={filterWithComments}
            onChange={(e) => setFilterWithComments(e.target.value)}
            className="perf-filter-select"
          >
            <option value="ALL">All Employees</option>
            <option value="WITH_COMMENTS">With Feedback Only</option>
            <option value="WITHOUT_COMMENTS">No Feedback Yet</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="perf-filter-select"
          >
            <option value="comments">Sort by Most Comments</option>
            <option value="name">Sort by Employee Name</option>
            <option value="date">Sort by Recent Activity</option>
          </select>

          {canAddComment && (
            <Button
              variant="primary"
              onClick={() => handleOpenAddComment()}
              className="perf-add-btn"
            >
              + Log Performance Comment
            </Button>
          )}
        </div>
      </div>

      {/* EMPLOYEE TABLE */}
      <div className="perf-table-container">
        {loading ? (
          <LoadingState message="Loading performance overview..." />
        ) : filteredEmployees.length === 0 ? (
          <EmptyState
            title="No employees found"
            description="Try adjusting your search criteria or filter options."
          />
        ) : (
          <table className="perf-table">
            <thead>
              <tr>
                <th style={{ width: '90px' }}>Emp ID</th>
                <th>Employee Name</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Region</th>
                <th style={{ textAlign: 'center', width: '130px' }}>Observations</th>
                <th>Latest Observation</th>
                <th style={{ textAlign: 'right', width: '220px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp) => (
                <tr key={emp.EmpID} className="perf-row">
                  <td>
                    <span className="perf-empid-badge">#{emp.EmpID}</span>
                  </td>
                  <td>
                    <div className="perf-name-cell">
                      <strong>{emp.FullName}</strong>
                      <span className="perf-emp-sub">{emp.Status}</span>
                    </div>
                  </td>
                  <td>{emp.DepartmentName}</td>
                  <td>{emp.Designation}</td>
                  <td>
                    <span className="perf-region-pill">{emp.SubsidiaryID?.toUpperCase() || 'UAE'}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`perf-count-badge ${emp.CommentCount > 0 ? 'has-comments' : 'no-comments'}`}>
                      {emp.CommentCount} {emp.CommentCount === 1 ? 'note' : 'notes'}
                    </span>
                  </td>
                  <td>
                    {emp.LatestCommentDate ? (
                      <div className="latest-obs-cell">
                        <span className="latest-date">{formatDate(emp.LatestCommentDate)}</span>
                        <div className="latest-tags">
                          {emp.LatestSentiment === 'GOOD' && <span className="tag-pill tag-good-small">Good</span>}
                          {emp.LatestSentiment === 'BAD' && <span className="tag-pill tag-bad-small">Bad</span>}
                          {emp.LatestWeight === 'HIGH' && <span className="tag-pill tag-high-small">🔥 High</span>}
                        </div>
                      </div>
                    ) : (
                      <span className="muted-text">—</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="row-actions">
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => handleOpenTimeline(emp)}
                      >
                        View History ({emp.CommentCount})
                      </Button>
                      {canAddComment && (
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() => handleOpenAddComment(emp.EmpID)}
                          title="Add observation"
                        >
                          + Add Note
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* C. EMPLOYEE PERFORMANCE TIMELINE MODAL */}
      {timelineEmp && (
        <div className="modal-backdrop" onClick={handleCloseTimeline}>
          <div className="modal-window perf-timeline-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Performance Timeline: {timelineEmp.FullName}</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                  Emp ID: #{timelineEmp.EmpID} · {timelineEmp.DepartmentName} · {timelineEmp.Designation} · {timelineEmp.SubsidiaryID?.toUpperCase() || 'UAE'}
                </p>
              </div>
              <button type="button" className="close-btn" onClick={handleCloseTimeline}>
                ✕
              </button>
            </div>

            {/* Timeline Filter Bar */}
            <div className="timeline-filter-bar">
              <div className="filter-item">
                <label>Sentiment:</label>
                <select
                  value={filterSentiment}
                  onChange={(e) => setFilterSentiment(e.target.value)}
                  className="timeline-select"
                >
                  <option value="ALL">All Sentiments</option>
                  <option value="GOOD">👍 Good Only</option>
                  <option value="BAD">👎 Bad Only</option>
                </select>
              </div>

              <div className="filter-item">
                <label>Weight:</label>
                <select
                  value={filterWeight}
                  onChange={(e) => setFilterWeight(e.target.value)}
                  className="timeline-select"
                >
                  <option value="ALL">All Weights</option>
                  <option value="NORMAL">Normal Impact</option>
                  <option value="HIGH">🔥 High Impact</option>
                </select>
              </div>

              <div className="filter-item" style={{ flex: 1 }}>
                <label>Author:</label>
                <input
                  type="text"
                  placeholder="Filter by author name..."
                  value={filterAuthor}
                  onChange={(e) => setFilterAuthor(e.target.value)}
                  className="timeline-input"
                />
              </div>

              <Button
                variant="secondary"
                size="small"
                onClick={handleApplyTimelineFilters}
                style={{ alignSelf: 'flex-end', height: '34px' }}
              >
                Apply Filters
              </Button>

              {canAddComment && (
                <Button
                  variant="primary"
                  size="small"
                  onClick={() => handleOpenAddComment(timelineEmp.EmpID)}
                  style={{ alignSelf: 'flex-end', height: '34px' }}
                >
                  + Add Observation
                </Button>
              )}
            </div>

            {/* Timeline Stream */}
            <div className="timeline-modal-body">
              {timelineLoading ? (
                <LoadingState message="Loading performance history..." />
              ) : timelineComments.length === 0 ? (
                <EmptyState
                  title="No observations found"
                  description="There are no performance observations matching the current filter."
                />
              ) : (
                <div className="timeline-stream">
                  {timelineComments.map((c) => (
                    <div key={c.CommentID} className="timeline-card">
                      <div className="timeline-card-header">
                        <div className="timeline-author-info">
                          <span className="author-avatar">{c.CreatedByName?.[0] || 'U'}</span>
                          <div>
                            <strong>{c.CreatedByName}</strong>
                            <span className="author-time">{formatDateTime(c.CreatedAt)}</span>
                          </div>
                        </div>

                        <div className="timeline-tag-group">
                          {/* Sentiment Tag: Green for Good, Red for Bad */}
                          <span
                            className={`sentiment-tag ${c.Sentiment === 'GOOD' ? 'is-good' : 'is-bad'}`}
                          >
                            {c.Sentiment === 'GOOD' ? '👍 GOOD' : '👎 BAD'}
                          </span>

                          {/* Weight Tag: Neutral for Normal, Distinct Emphasis for High */}
                          <span
                            className={`weight-tag ${c.Weight === 'HIGH' ? 'is-high' : 'is-normal'}`}
                          >
                            {c.Weight === 'HIGH' ? '🔥 HIGH IMPACT' : 'NORMAL'}
                          </span>
                        </div>
                      </div>

                      <div className="timeline-card-body">
                        <p>{c.CommentText || c.Comment}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <Button variant="secondary" onClick={handleCloseTimeline}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* B. ADD COMMENT MODAL */}
      {commentModalOpen && (
        <div className="modal-backdrop" onClick={handleCloseAddComment}>
          <div className="modal-window add-comment-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Log Continuous Performance Observation</h3>
              <button type="button" className="close-btn" onClick={handleCloseAddComment}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitComment}>
              <div className="modal-body form-body">
                {formError && <div className="form-alert-error">{formError}</div>}

                {/* Employee Selector */}
                <div className="form-group">
                  <label>
                    Target Employee <span className="req">*</span>
                  </label>
                  <select
                    className="form-control"
                    value={targetEmpId}
                    onChange={(e) => setTargetEmpId(e.target.value)}
                    required
                  >
                    <option value="">Select Employee...</option>
                    {employees.map((emp) => (
                      <option key={emp.EmpID} value={emp.EmpID}>
                        #{emp.EmpID} — {emp.FullName} ({emp.DepartmentName} · {emp.Designation})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Comment Text */}
                <div className="form-group">
                  <label>
                    Observation Comment <span className="req">*</span>
                  </label>
                  <textarea
                    rows={4}
                    className="form-control"
                    placeholder="Enter factual, specific performance feedback or continuous observation..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    required
                  />
                  <small style={{ color: '#64748b', fontSize: '0.8rem' }}>
                    Provide specific context (e.g. project name, deliverables, client feedback, attendance).
                  </small>
                </div>

                {/* Sentiment Selector: GOOD / BAD */}
                <div className="form-group">
                  <label>
                    Sentiment Classification <span className="req">*</span>
                  </label>
                  <div className="pill-selector-row">
                    <button
                      type="button"
                      className={`pill-choice good-pill ${sentiment === 'GOOD' ? 'is-active' : ''}`}
                      onClick={() => setSentiment('GOOD')}
                    >
                      <span className="pill-icon">👍</span>
                      <div>
                        <strong>GOOD</strong>
                        <small>Positive observation / commendation</small>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`pill-choice bad-pill ${sentiment === 'BAD' ? 'is-active' : ''}`}
                      onClick={() => setSentiment('BAD')}
                    >
                      <span className="pill-icon">👎</span>
                      <div>
                        <strong>BAD</strong>
                        <small>Constructive / concern / non-compliance</small>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Weight Selector: NORMAL / HIGH */}
                <div className="form-group">
                  <label>
                    Weight Classification <span className="req">*</span>
                  </label>
                  <div className="pill-selector-row">
                    <button
                      type="button"
                      className={`pill-choice normal-pill ${weight === 'NORMAL' ? 'is-active' : ''}`}
                      onClick={() => setWeight('NORMAL')}
                    >
                      <span className="pill-icon">⚪</span>
                      <div>
                        <strong>NORMAL</strong>
                        <small>Routine feedback / standard weight</small>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`pill-choice high-pill ${weight === 'HIGH' ? 'is-active' : ''}`}
                      onClick={() => setWeight('HIGH')}
                    >
                      <span className="pill-icon">🔥</span>
                      <div>
                        <strong>HIGH</strong>
                        <small>High impact observation for contract renewal</small>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <Button variant="secondary" onClick={handleCloseAddComment} disabled={submitting}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={submitting}>
                  {submitting ? 'Recording…' : '✓ Record Observation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
