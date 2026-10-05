import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import StatCard from '../components/common/StatCard'
import Badge, { statusBadgeVariant } from '../components/common/Badge'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import LoadingState from '../components/common/LoadingState'
import EmptyState from '../components/common/EmptyState'
import ComplianceMatrixGrid from '../components/compliance/ComplianceMatrixGrid'
import EmpCell from '../components/tables/EmpCell'
import {
  getEmployees,
  getDepartments,
  getLeaves,
  getPassports,
  getVehicleAllocations,
  getFlightTickets,
  getNotifications,
} from '../services/api'
import { complianceApi, documentsApi, performanceApi } from '../services/api/hrms'
import { evaluateSla } from '../utils/sla'
import { scopeEmployees, scopeByEmpId } from '../utils/scope'
import { useFeatureFlags } from '../context/FeatureFlagsContext'
import { useAuth } from '../context/AuthContext'
import { useSubsidiary } from '../context/SubsidiaryContext'
import { useToast } from '../context/ToastContext'
import { formatDate } from '../utils/dates'
import './Compliance.css'

export default function CompliancePage() {
  const { user } = useAuth()
  const { activeId, active, isDefaultTheme } = useSubsidiary()
  const { flags } = useFeatureFlags()
  const { addToast } = useToast()

  // Top mode: 'tracker' (Section 3 Shared Dashboard) vs 'matrix' (Legacy 30-day timeline)
  const [viewMode, setViewMode] = useState('tracker')

  // =========================================================================
  // SECTION 3: SHARED COMPLIANCE TRACKER STATE
  // =========================================================================
  const [trackerLoading, setTrackerLoading] = useState(true)
  const [trackerStats, setTrackerStats] = useState({
    total: 0,
    active: 0,
    pendingAction: 0,
    nearDue: 0,
    overdue: 0,
    closed: 0,
  })
  const [cases, setCases] = useState([])
  const [casesTotal, setCasesTotal] = useState(0)
  const [casesPage, setCasesPage] = useState(1)
  const [casesLimit, setCasesLimit] = useState(10)
  const [sysConfig, setSysConfig] = useState(null)

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [filterRegion, setFilterRegion] = useState('all')
  const [filterEvent, setFilterEvent] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterRole, setFilterRole] = useState('all')
  const [filterPeriod, setFilterPeriod] = useState('all')
  const [sortBy, setSortBy] = useState('dueDate')
  const [sortOrder, setSortOrder] = useState('ASC')

  // Scanning State
  const [scanning, setScanning] = useState(false)

  // Detail Modal State
  const [selectedCaseId, setSelectedCaseId] = useState(null)
  const [caseDetails, setCaseDetails] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTab, setModalTab] = useState('timeline') // timeline | documents | checklist | history
  const [advancing, setAdvancing] = useState(false)
  const [advanceComments, setAdvanceComments] = useState('')
  const [iqamaDurationSelect, setIqamaDurationSelect] = useState('12')
  const [selectedVendorId, setSelectedVendorId] = useState('')
  const [terminationScenario, setTerminationScenario] = useState('A')

  // Document Upload State in Modal
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [docCategory, setDocCategory] = useState('Compliance')
  const [docFile, setDocFile] = useState(null)

  // Section 4: Performance Comments in Compliance Context
  const [casePerfComments, setCasePerfComments] = useState([])
  const [casePerfLoading, setCasePerfLoading] = useState(false)

  // New Exit/Re-Entry Dialog
  const [exitReentryModal, setExitReentryModal] = useState(false)
  const [exitEmpId, setExitEmpId] = useState('')
  const [creatingExit, setCreatingExit] = useState(false)

  // New Outbound Visa Dialog
  const [outboundModal, setOutboundModal] = useState(false)
  const [outboundEmpId, setOutboundEmpId] = useState('')
  const [outboundCountry, setOutboundCountry] = useState('US')
  const [outboundCategory, setOutboundCategory] = useState('Standard')
  const [creatingOutbound, setCreatingOutbound] = useState(false)

  // =========================================================================
  // LEGACY 30-DAY MATRIX STATE
  // =========================================================================
  const [matrixLoading, setMatrixLoading] = useState(false)
  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  const [leaves, setLeaves] = useState([])
  const [passports, setPassports] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [flights, setFlights] = useState([])
  const [alerts, setAlerts] = useState([])

  // Load Compliance Config once
  useEffect(() => {
    complianceApi.getConfig().then((cfg) => {
      setSysConfig(cfg)
      if (cfg?.vendorRoster?.length > 0) {
        setSelectedVendorId(cfg.vendorRoster[0].id)
      }
    }).catch(() => {})
  }, [])

  // Load Tracker Stats & Cases
  const loadTrackerData = useCallback(async () => {
    try {
      setTrackerLoading(true)
      const effectiveRegion = filterRegion !== 'all' ? filterRegion : (activeId && activeId !== 'all' ? activeId : undefined)

      const [statsRes, casesRes] = await Promise.all([
        complianceApi.getStats(effectiveRegion),
        complianceApi.getCases({
          regionCode: effectiveRegion,
          status: filterStatus !== 'all' ? filterStatus : undefined,
          eventCode: filterEvent !== 'all' ? filterEvent : undefined,
          assignedRole: filterRole !== 'all' ? filterRole : undefined,
          period: filterPeriod !== 'all' ? filterPeriod : undefined,
          search: searchQuery.trim() || undefined,
          sort: sortBy,
          order: sortOrder,
          page: casesPage,
          limit: casesLimit,
        }),
      ])

      setTrackerStats(statsRes || { total: 0, active: 0, pendingAction: 0, nearDue: 0, overdue: 0, closed: 0 })

      if (casesRes && casesRes.data) {
        setCases(casesRes.data)
        setCasesTotal(casesRes.total || 0)
      } else if (Array.isArray(casesRes)) {
        setCases(casesRes)
        setCasesTotal(casesRes.length)
      } else {
        setCases([])
        setCasesTotal(0)
      }
    } catch (err) {
      addToast(err.message || 'Failed to load compliance data', 'error')
    } finally {
      setTrackerLoading(false)
    }
  }, [filterRegion, activeId, filterStatus, filterEvent, filterRole, filterPeriod, searchQuery, sortBy, sortOrder, casesPage, casesLimit, addToast])

  useEffect(() => {
    if (viewMode === 'tracker') {
      loadTrackerData()
    }
  }, [viewMode, loadTrackerData])

  // Load Legacy Matrix Data when switching to matrix tab
  const loadMatrixData = useCallback(async () => {
    try {
      setMatrixLoading(true)
      const [empRes, deptRes, leaveRes, ppRes, vRes, fRes, nRes] = await Promise.all([
        getEmployees(),
        getDepartments(),
        getLeaves(),
        getPassports(),
        getVehicleAllocations(),
        getFlightTickets(),
        getNotifications(),
      ])
      const scopedEmps = scopeEmployees(user, empRes.data, activeId)
      setEmployees(scopedEmps)
      setDepartments(deptRes.data)
      setLeaves(scopeByEmpId(user, leaveRes.data, empRes.data, activeId))
      setPassports(scopeByEmpId(user, ppRes.data, empRes.data, activeId))
      setVehicles(scopeByEmpId(user, vRes.data, empRes.data, activeId))
      setFlights(scopeByEmpId(user, fRes.data, empRes.data, activeId))
      setAlerts(scopeByEmpId(user, nRes.data, empRes.data, activeId))
    } catch (err) {
      addToast(err.message || 'Failed to load matrix data', 'error')
    } finally {
      setMatrixLoading(false)
    }
  }, [user, activeId, addToast])

  useEffect(() => {
    if (viewMode === 'matrix' && employees.length === 0) {
      loadMatrixData()
    }
  }, [viewMode, employees.length, loadMatrixData])

  // Scan Expiries Handler
  const handleScanExpiries = async () => {
    try {
      setScanning(true)
      const res = await complianceApi.scan()
      addToast(
        `Automated Scan Complete: ${res.scanned} employees checked, ${res.casesCreated} new cases created, ${res.alertsCreated || 0} passport reminders generated`,
        'success',
      )
      loadTrackerData()
    } catch (err) {
      addToast(err.message || 'Scan failed', 'error')
    } finally {
      setScanning(false)
    }
  }

  const loadCasePerfComments = async (empId) => {
    try {
      setCasePerfLoading(true)
      const comments = await performanceApi.getComments(empId)
      setCasePerfComments(comments || [])
    } catch (err) {
      console.error('Failed to load performance comments for case', err)
      setCasePerfComments([])
    } finally {
      setCasePerfLoading(false)
    }
  }

  // Open Case Detail Modal
  const handleOpenCaseDetails = async (caseId) => {
    try {
      setSelectedCaseId(caseId)
      const details = await complianceApi.getCaseById(caseId)
      setCaseDetails(details)
      setModalOpen(true)
      setModalTab('timeline')
      setAdvanceComments('')
      setIqamaDurationSelect('12')
      setTerminationScenario('A')
      if (sysConfig?.vendorRoster?.length > 0) {
        setSelectedVendorId(sysConfig.vendorRoster[0].id)
      }
      if (details?.case?.EmpID) {
        loadCasePerfComments(details.case.EmpID)
      }
    } catch (err) {
      addToast(err.message || 'Failed to load case details', 'error')
    }
  }

  // Advance Stage in Modal
  const handleAdvanceStage = async (action = 'APPROVE') => {
    if (!caseDetails || !selectedCaseId) return
    try {
      setAdvancing(true)
      const meta = {}
      if (caseDetails.case.CurrentStageKey === 'HOD_DURATION') {
        meta.durationMonths = Number(iqamaDurationSelect)
      }
      if (['VENDOR_ADMIN', 'ADMIN_AJEER'].includes(caseDetails.case.CurrentStageKey) && selectedVendorId) {
        meta.vendorId = selectedVendorId
      }
      if (caseDetails.case.CurrentStageKey === 'SCENARIO_SELECTION') {
        meta.scenario = terminationScenario
      }

      const res = await complianceApi.advanceStage(selectedCaseId, {
        action,
        comments: advanceComments || undefined,
        meta: Object.keys(meta).length > 0 ? meta : undefined,
      })

      addToast(
        action === 'REJECT'
          ? 'Case rejected and closed'
          : `Advanced to: ${res.newStage || 'Next Stage'}`,
        action === 'REJECT' ? 'info' : 'success',
      )

      // Refresh details and cases table
      const refreshed = await complianceApi.getCaseById(selectedCaseId)
      setCaseDetails(refreshed)
      loadTrackerData()
    } catch (err) {
      addToast(err.message || 'Action failed', 'error')
    } finally {
      setAdvancing(false)
    }
  }

  // Toggle Checklist Item
  const handleToggleChecklist = async (progressId, currentCompleted) => {
    if (!selectedCaseId) return
    try {
      await complianceApi.updateChecklist(selectedCaseId, progressId, {
        isCompleted: !currentCompleted,
      })
      const refreshed = await complianceApi.getCaseById(selectedCaseId)
      setCaseDetails(refreshed)
      addToast('Checklist item updated', 'success')
    } catch (err) {
      addToast(err.message || 'Failed to update checklist item', 'error')
    }
  }

  // Document Upload in Modal
  const handleUploadDocument = async (e) => {
    e.preventDefault()
    if (!docFile || !selectedCaseId || !caseDetails) {
      addToast('Please select a file to upload', 'error')
      return
    }
    try {
      setUploadingDoc(true)
      const formData = new FormData()
      formData.append('file', docFile)
      formData.append('category', docCategory)
      formData.append('sourceModule', 'Compliance')
      formData.append('sourceId', String(selectedCaseId))
      formData.append('empId', String(caseDetails.case.EmpID))
      formData.append('regionCode', caseDetails.case.RegionCode)

      await documentsApi.uploadDocument(formData)
      addToast(`Document "${docFile.name}" attached to compliance case`, 'success')
      setDocFile(null)
      const refreshed = await complianceApi.getCaseById(selectedCaseId)
      setCaseDetails(refreshed)
    } catch (err) {
      addToast(err.message || 'Upload failed', 'error')
    } finally {
      setUploadingDoc(false)
    }
  }

  // Create Exit/Re-Entry Visa Case
  const handleCreateExitReentry = async (e) => {
    e.preventDefault()
    if (!exitEmpId) {
      addToast('Please provide an Employee ID', 'error')
      return
    }
    try {
      setCreatingExit(true)
      const newCase = await complianceApi.createCase({
        empId: Number(exitEmpId),
        regionCode: 'saudi',
        eventCode: 'KSA_EXIT_REENTRY',
        pipelineCode: 'KSA_EXIT_REENTRY_PIPE',
        priority: 'HIGH',
      })

      if (newCase.Status === 'BLOCKED') {
        addToast(
          `Case ${newCase.CaseNumber} created but BLOCKED: ${newCase.BlockReason}`,
          'warning',
        )
      } else {
        addToast(`Exit/Re-Entry Case ${newCase.CaseNumber} created successfully`, 'success')
      }
      setExitReentryModal(false)
      setExitEmpId('')
      loadTrackerData()
    } catch (err) {
      addToast(err.message || 'Failed to create Exit/Re-Entry case', 'error')
    } finally {
      setCreatingExit(false)
    }
  }

  // Create Outbound Visa Case
  const handleCreateOutbound = async (e) => {
    e.preventDefault()
    if (!outboundEmpId) {
      addToast('Please provide an Employee ID', 'error')
      return
    }
    try {
      setCreatingOutbound(true)
      const newCase = await complianceApi.createCase({
        empId: Number(outboundEmpId),
        regionCode: 'uae',
        eventCode: 'OUTBOUND_VISA_RENEWAL',
        pipelineCode: 'OUTBOUND_VISA_PIPE',
        priority: 'MEDIUM',
        meta: {
          visaCountry: outboundCountry,
          visaType: `${outboundCountry} Business / Visitor Visa`,
          travelCategory: outboundCategory,
        },
      })
      addToast(`Outbound Visa Tracking Case ${newCase.CaseNumber} created`, 'success')
      setOutboundModal(false)
      setOutboundEmpId('')
      loadTrackerData()
    } catch (err) {
      addToast(err.message || 'Failed to create Outbound Visa case', 'error')
    } finally {
      setCreatingOutbound(false)
    }
  }

  // Helper for event badge styling
  const getEventBadgeClass = (eventCode) => {
    if (eventCode.includes('CONTRACT')) return 'event-type-pill contract'
    if (eventCode.includes('IQAMA')) return 'event-type-pill iqama'
    if (eventCode.includes('EXIT_REENTRY')) return 'event-type-pill exit-reentry'
    if (eventCode.includes('UAE_VISA')) return 'event-type-pill uae-visa'
    if (eventCode.includes('PASSPORT')) return 'event-type-pill passport'
    if (eventCode.includes('OUTBOUND')) return 'event-type-pill outbound'
    return 'event-type-pill'
  }

  const formatEventName = (code) => {
    const map = {
      KSA_CONTRACT_RENEWAL: 'KSA Contract Renewal (75d)',
      KSA_OPEN_CONTRACT: 'KSA Open Contract (Saudi)',
      KSA_IQAMA_RENEWAL: 'KSA Iqama Renewal (40d)',
      KSA_EXIT_REENTRY: 'KSA Exit/Re-Entry Visa',
      KSA_AIRFARE: 'KSA Airfare Entitlement',
      UAE_VISA_RENEWAL: 'UAE Visa & Work Permit',
      UAE_PASSPORT_EXPIRY: 'UAE Passport Expiry',
      OUTBOUND_VISA_RENEWAL: 'Outbound Visa Renewal',
    }
    return map[code] || code.replace(/_/g, ' ')
  }

  // Days remaining calculation
  const getDaysRemaining = (dueDateStr) => {
    if (!dueDateStr) return null
    const diff = Math.ceil((new Date(dueDateStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  return (
    <div className="compliance-container">
      <PageHeader
        title="Employee Compliance Tracker"
        subtitle="Unified Multi-Country Compliance Pipeline · KSA & UAE Operational Modules · SLA & Dependency Engine"
      />

      {/* Top View Mode Switcher */}
      <div className="compliance-mode-switcher">
        <div className="mode-tabs-group">
          <button
            type="button"
            className={`mode-tab-btn ${viewMode === 'tracker' ? 'is-active' : ''}`}
            onClick={() => setViewMode('tracker')}
          >
            <span>Compliance Tracker Dashboard</span>
            <span className="mode-tab-badge">{trackerStats.total}</span>
          </button>
          <button
            type="button"
            className={`mode-tab-btn ${viewMode === 'matrix' ? 'is-active' : ''}`}
            onClick={() => setViewMode('matrix')}
          >
            <span>30-Day Rolling Timeline Grid</span>
          </button>
        </div>

        {viewMode === 'tracker' && (
          <div className="compliance-header-actions">
            {['HR', 'ADMIN'].includes(user?.role) && (
              <>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={handleScanExpiries}
                  disabled={scanning}
                >
                  {scanning ? 'Scanning Expiries…' : '⚡ Run Expiry Scanner'}
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => setExitReentryModal(true)}
                >
                  + Exit/Re-Entry
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => setOutboundModal(true)}
                >
                  + Outbound Visa
                </Button>
              </>
            )}
            {user?.role === 'EMPLOYEE' && (
              <Button
                variant="primary"
                size="small"
                onClick={() => {
                  setExitEmpId(String(user.empId))
                  setExitReentryModal(true)
                }}
              >
                + Apply for Exit/Re-Entry
              </Button>
            )}
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* VIEW MODE 1: SHARED COMPLIANCE TRACKER DASHBOARD                    */}
      {/* =================================================================== */}
      {viewMode === 'tracker' && (
        <>
          {/* 6 Metric Overview Cards */}
          <div className="compliance-stat-grid">
            <div className="comp-stat-card tone-primary">
              <span className="comp-stat-label">Total Cases</span>
              <span className="comp-stat-value">{trackerStats.total}</span>
              <span className="comp-stat-sub">Across authorized regions</span>
            </div>
            <div className="comp-stat-card tone-info">
              <span className="comp-stat-label">Active Cases</span>
              <span className="comp-stat-value">{trackerStats.active}</span>
              <span className="comp-stat-sub">In progress or blocked</span>
            </div>
            <div className="comp-stat-card tone-warning">
              <span className="comp-stat-label">Pending My Action</span>
              <span className="comp-stat-value">{trackerStats.pendingAction}</span>
              <span className="comp-stat-sub">Assigned to your role</span>
            </div>
            <div className="comp-stat-card tone-orange">
              <span className="comp-stat-label">Near Due (3 Days)</span>
              <span className="comp-stat-value">{trackerStats.nearDue}</span>
              <span className="comp-stat-sub">Requires urgent review</span>
            </div>
            <div className="comp-stat-card tone-danger">
              <span className="comp-stat-label">Overdue</span>
              <span className="comp-stat-value">{trackerStats.overdue}</span>
              <span className="comp-stat-sub">SLA breached</span>
            </div>
            <div className="comp-stat-card tone-success">
              <span className="comp-stat-label">Closed</span>
              <span className="comp-stat-value">{trackerStats.closed}</span>
              <span className="comp-stat-sub">Completed or finalized</span>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="compliance-filter-bar">
            <div className="filter-row-top">
              <div className="filter-search-box">
                <span className="filter-search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search by Employee Name, ID, Case Number, or Event..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCasesPage(1)
                  }}
                />
              </div>

              <div className="filter-controls-group">
                <select
                  className="filter-select"
                  value={filterRegion}
                  onChange={(e) => {
                    setFilterRegion(e.target.value)
                    setCasesPage(1)
                  }}
                >
                  <option value="all">All Regions</option>
                  <option value="saudi">🇸🇦 Saudi Arabia (KSA)</option>
                  <option value="uae">🇦🇪 United Arab Emirates</option>
                </select>

                <select
                  className="filter-select"
                  value={filterEvent}
                  onChange={(e) => {
                    setFilterEvent(e.target.value)
                    setCasesPage(1)
                  }}
                >
                  <option value="all">All Compliance Events</option>
                  <option value="KSA_CONTRACT_RENEWAL">KSA Contract Renewal</option>
                  <option value="KSA_OPEN_CONTRACT">KSA Open Contract</option>
                  <option value="KSA_IQAMA_RENEWAL">KSA Iqama Renewal</option>
                  <option value="KSA_EXIT_REENTRY">KSA Exit/Re-Entry Visa</option>
                  <option value="KSA_AIRFARE">KSA Airfare</option>
                  <option value="UAE_VISA_RENEWAL">UAE Visa & Work Permit</option>
                  <option value="UAE_PASSPORT_EXPIRY">UAE Passport Expiry</option>
                  <option value="OUTBOUND_VISA_RENEWAL">Outbound Visa Renewal</option>
                </select>

                <select
                  className="filter-select"
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(e.target.value)
                    setCasesPage(1)
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="BLOCKED">Blocked (Dependency)</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>

                <select
                  className="filter-select"
                  value={filterRole}
                  onChange={(e) => {
                    setFilterRole(e.target.value)
                    setCasesPage(1)
                  }}
                >
                  <option value="all">All Assigned Actors</option>
                  <option value="HR">HR Operations</option>
                  <option value="HOD">Head of Department (HOD)</option>
                  <option value="EMPLOYEE">Employee Action</option>
                  <option value="ADMIN">Administrator</option>
                </select>

                <select
                  className="filter-select"
                  value={filterPeriod}
                  onChange={(e) => {
                    setFilterPeriod(e.target.value)
                    setCasesPage(1)
                  }}
                >
                  <option value="all">All Expiry Periods</option>
                  <option value="30">Due in 30 Days</option>
                  <option value="60">Due in 60 Days</option>
                  <option value="90">Due in 90 Days</option>
                  <option value="overdue">Overdue / SLA Breached</option>
                </select>

                <select
                  className="filter-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="dueDate">Sort: Due Date</option>
                  <option value="triggerDate">Sort: Trigger Date</option>
                  <option value="daysRemaining">Sort: Days Remaining</option>
                  <option value="priority">Sort: Priority</option>
                </select>

                <select
                  className="filter-select"
                  style={{ minWidth: '85px' }}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                >
                  <option value="ASC">ASC</option>
                  <option value="DESC">DESC</option>
                </select>

                {(searchQuery || filterRegion !== 'all' || filterEvent !== 'all' || filterStatus !== 'all' || filterRole !== 'all' || filterPeriod !== 'all') && (
                  <button
                    type="button"
                    className="reset-filter-btn"
                    onClick={() => {
                      setSearchQuery('')
                      setFilterRegion('all')
                      setFilterEvent('all')
                      setFilterStatus('all')
                      setFilterRole('all')
                      setFilterPeriod('all')
                      setCasesPage(1)
                    }}
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Compliance Cases Table */}
          <div className="compliance-table-panel">
            <div className="compliance-table-header">
              <div className="table-title-area">
                <h3>Compliance Pipeline Cases</h3>
                <span className="table-count-sub">
                  Showing {cases.length} of {casesTotal} registered cases
                </span>
              </div>
            </div>

            {trackerLoading ? (
              <LoadingState label="Loading compliance pipeline cases…" />
            ) : cases.length === 0 ? (
              <EmptyState
                title="No compliance cases match your filter criteria"
                message="Adjust your filters or run the automated scanner to detect upcoming expiries."
              />
            ) : (
              <div className="compliance-table-wrapper">
                <table className="compliance-table">
                  <thead>
                    <tr>
                      <th>Case ID</th>
                      <th>Employee</th>
                      <th>Compliance Event</th>
                      <th>Current Stage</th>
                      <th>Status</th>
                      <th>Assigned Role</th>
                      <th>Due Date</th>
                      <th>Days Left</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map((c) => {
                      const daysLeft = getDaysRemaining(c.DueDate)
                      const isOverdue = daysLeft !== null && daysLeft < 0 && !['COMPLETED', 'CANCELLED'].includes(c.Status)
                      const isNearDue = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3 && !['COMPLETED', 'CANCELLED'].includes(c.Status)

                      return (
                        <tr key={c.CaseID}>
                          <td>
                            <button
                              type="button"
                              className="case-id-badge"
                              onClick={() => handleOpenCaseDetails(c.CaseID)}
                            >
                              {c.CaseNumber}
                            </button>
                          </td>
                          <td>
                            <div className="emp-info-cell">
                              <span className="region-flag-icon">
                                {c.RegionCode === 'saudi' ? '🇸🇦' : '🇦🇪'}
                              </span>
                              <div>
                                <div className="emp-name-text">
                                  {c.FirstName} {c.LastName}
                                </div>
                                <div className="emp-id-sub">
                                  ID: {c.EmpID} {c.EntityName ? `· ${c.EntityName}` : ''}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={getEventBadgeClass(c.EventCode)}>
                              {formatEventName(c.EventCode)}
                            </span>
                            {c.BlockReason && (
                              <div className="block-warning-tag" title={c.BlockReason}>
                                ⚠️ Blocked: {c.BlockReason.slice(0, 38)}...
                              </div>
                            )}
                          </td>
                          <td>
                            <span style={{ fontWeight: 500, color: '#1e293b' }}>
                              {c.CurrentStageKey.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td>
                            {c.Status === 'BLOCKED' ? (
                              <Badge variant="danger">BLOCKED</Badge>
                            ) : c.Status === 'COMPLETED' ? (
                              <Badge variant="success">COMPLETED</Badge>
                            ) : c.Status === 'CANCELLED' ? (
                              <Badge variant="secondary">CANCELLED</Badge>
                            ) : c.Status === 'IN_PROGRESS' ? (
                              <Badge variant="primary">IN PROGRESS</Badge>
                            ) : (
                              <Badge variant="warning">OPEN</Badge>
                            )}
                          </td>
                          <td>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                              {c.AssignedRole}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.825rem', color: '#1e293b' }}>
                              {formatDate(c.DueDate)}
                            </span>
                          </td>
                          <td>
                            {['COMPLETED', 'CANCELLED'].includes(c.Status) ? (
                              <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Closed</span>
                            ) : isOverdue ? (
                              <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.8rem' }}>
                                {Math.abs(daysLeft)}d overdue
                              </span>
                            ) : isNearDue ? (
                              <span style={{ color: '#ea580c', fontWeight: 600, fontSize: '0.8rem' }}>
                                {daysLeft}d remaining
                              </span>
                            ) : (
                              <span style={{ color: '#10b981', fontWeight: 500, fontSize: '0.8rem' }}>
                                {daysLeft}d left
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Button
                              variant="secondary"
                              size="small"
                              onClick={() => handleOpenCaseDetails(c.CaseID)}
                            >
                              View / Action
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {casesTotal > casesLimit && (
              <div className="compliance-pagination">
                <span className="pagination-info">
                  Page {casesPage} of {Math.ceil(casesTotal / casesLimit)}
                </span>
                <div className="pagination-controls">
                  <button
                    type="button"
                    className="page-btn"
                    disabled={casesPage <= 1}
                    onClick={() => setCasesPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  {Array.from({ length: Math.ceil(casesTotal / casesLimit) }, (_, i) => i + 1)
                    .slice(Math.max(0, casesPage - 3), casesPage + 2)
                    .map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`page-btn ${p === casesPage ? 'active' : ''}`}
                        onClick={() => setCasesPage(p)}
                      >
                        {p}
                      </button>
                    ))}
                  <button
                    type="button"
                    className="page-btn"
                    disabled={casesPage >= Math.ceil(casesTotal / casesLimit)}
                    onClick={() => setCasesPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* =================================================================== */}
      {/* VIEW MODE 2: LEGACY 30-DAY ROLLING MATRIX                           */}
      {/* =================================================================== */}
      {viewMode === 'matrix' && (
        <>
          {matrixLoading ? (
            <LoadingState label="Loading 30-day timeline matrix…" />
          ) : (
            <>
              <ComplianceMatrixGrid
                employees={employees}
                departments={departments}
                leaves={leaves}
                passports={passports}
                vehicles={vehicles}
                flights={flights}
              />

              <section className="panel" style={{ marginTop: '1rem' }}>
                <div className="panel__header">
                  <h2>Open Compliance Alerts</h2>
                  <Link to="/notifications" className="muted">
                    Notification center
                  </Link>
                </div>
                <div className="panel__body" style={{ paddingTop: 0, paddingBottom: 0 }}>
                  <ul className="list-plain">
                    {alerts.length === 0 ? (
                      <li className="muted">No unread alerts</li>
                    ) : (
                      alerts.slice(0, 5).map((n) => (
                        <li key={n.id}>
                          <div className="alert-list-item">
                            <strong>{n.alertType}</strong>
                            <div className="alert-list-item__meta">
                              <EmpCell empId={n.empId} />
                              <span className="cell-secondary">
                                Trigger {formatDate(n.triggerDate)}
                              </span>
                            </div>
                          </div>
                          <Badge variant={n.proposed ? 'warning' : statusBadgeVariant(n.status)}>
                            {n.proposed ? 'Proposed' : n.status}
                          </Badge>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {/* =================================================================== */}
      {/* CASE DETAIL & WORKFLOW MODAL                                        */}
      {/* =================================================================== */}
      {modalOpen && caseDetails && (
        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={`Compliance Case ${caseDetails.case.CaseNumber}`}
          size="large"
        >
          <div className="case-modal-header">
            <div className="case-modal-title">
              <h2>
                {formatEventName(caseDetails.case.EventCode)} — {caseDetails.case.FirstName} {caseDetails.case.LastName}
              </h2>
              <div className="case-modal-sub">
                Region: {caseDetails.case.RegionCode === 'saudi' ? '🇸🇦 Saudi Arabia' : '🇦🇪 United Arab Emirates'} · Employee ID: {caseDetails.case.EmpID}
              </div>
            </div>
            <div>
              {caseDetails.case.Status === 'BLOCKED' ? (
                <Badge variant="danger">BLOCKED</Badge>
              ) : caseDetails.case.Status === 'COMPLETED' ? (
                <Badge variant="success">COMPLETED</Badge>
              ) : caseDetails.case.Status === 'CANCELLED' ? (
                <Badge variant="secondary">CANCELLED</Badge>
              ) : (
                <Badge variant="primary">{caseDetails.case.Status}</Badge>
              )}
            </div>
          </div>

          {/* Blocked Dependency Alert Banner */}
          {caseDetails.case.Status === 'BLOCKED' && (
            <div className="case-blocked-banner">
              <span style={{ fontSize: '1.25rem' }}>⚠️</span>
              <div>
                <div className="blocked-banner-title">Action Blocked by Mandatory Dependency Rule</div>
                <div>{caseDetails.case.BlockReason}</div>
              </div>
            </div>
          )}

          {/* Modal Navigation Tabs */}
          <div className="modal-nav-tabs">
            <button
              type="button"
              className={`modal-tab-btn ${modalTab === 'timeline' ? 'active' : ''}`}
              onClick={() => setModalTab('timeline')}
            >
              Timeline & Details
            </button>
            <button
              type="button"
              className={`modal-tab-btn ${modalTab === 'documents' ? 'active' : ''}`}
              onClick={() => setModalTab('documents')}
            >
              Documents ({caseDetails.documents?.length || 0})
            </button>
            <button
              type="button"
              className={`modal-tab-btn ${modalTab === 'checklist' ? 'active' : ''}`}
              onClick={() => setModalTab('checklist')}
            >
              Closure Checklist ({caseDetails.checklist?.filter((c) => c.IsCompleted).length || 0}/{caseDetails.checklist?.length || 0})
            </button>
            <button
              type="button"
              className={`modal-tab-btn ${modalTab === 'history' ? 'active' : ''}`}
              onClick={() => setModalTab('history')}
            >
              Audit History ({caseDetails.history?.length || 0})
            </button>
            <button
              type="button"
              className={`modal-tab-btn ${modalTab === 'performance' ? 'active' : ''}`}
              onClick={() => {
                setModalTab('performance')
                if (caseDetails?.case?.EmpID) {
                  loadCasePerfComments(caseDetails.case.EmpID)
                }
              }}
            >
              Performance Log ({casePerfComments.length})
            </button>
          </div>

          {/* TAB 1: TIMELINE & DETAILS */}
          {modalTab === 'timeline' && (
            <div>
              <div className="detail-meta-grid">
                <div className="meta-field-item">
                  <label>Current Stage</label>
                  <span>{caseDetails.case.CurrentStageKey.replace(/_/g, ' ')}</span>
                </div>
                <div className="meta-field-item">
                  <label>Assigned Actor</label>
                  <span>{caseDetails.case.AssignedRole}</span>
                </div>
                <div className="meta-field-item">
                  <label>Due Date</label>
                  <span>{formatDate(caseDetails.case.DueDate)}</span>
                </div>
                <div className="meta-field-item">
                  <label>Priority</label>
                  <span>{caseDetails.case.Priority}</span>
                </div>
                {caseDetails.case.IqamaNumber && (
                  <div className="meta-field-item">
                    <label>Iqama Number & Expiry</label>
                    <span>{caseDetails.case.IqamaNumber} (Exp: {formatDate(caseDetails.case.IqamaExpiry)})</span>
                  </div>
                )}
                {caseDetails.case.VisaNumber && (
                  <div className="meta-field-item">
                    <label>Visa Number & Expiry</label>
                    <span>{caseDetails.case.VisaNumber} (Exp: {formatDate(caseDetails.case.VisaExpiry)})</span>
                  </div>
                )}
              </div>

              {/* Event Specific Meta Context */}
              {caseDetails.case.EventCode === 'KSA_EXIT_REENTRY' && (
                <div className="panel" style={{ marginBottom: '1.25rem', background: '#fffbeb', borderColor: '#fde68a' }}>
                  <div className="panel__body" style={{ fontSize: '0.85rem', color: '#92400e' }}>
                    <div style={{ fontWeight: 700, marginBottom: '4px' }}>KSA Exit/Re-Entry Validation Context:</div>
                    {caseDetails.case.MetaJson && (
                      <div>
                        {(() => {
                          try {
                            const meta = JSON.parse(caseDetails.case.MetaJson)
                            return (
                              <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                                <li>Payment Responsibility: <strong>{meta.paymentResponsibility}</strong> ({meta.paymentRuleNote})</li>
                                <li>Visa Validity: <strong>{meta.visaValidityDays || 60} days</strong></li>
                                <li>Iqama Days Remaining: <strong>{meta.iqamaDaysRemaining} days</strong></li>
                              </ul>
                            )
                          } catch (e) {
                            return null
                          }
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Section 4: Performance Context Banner for Contract/Residency Renewals */}
              <div className="panel" style={{ marginBottom: '1.25rem', background: '#f8fafc', borderColor: '#e2e8f0', borderRadius: '6px' }}>
                <div className="panel__body" style={{ padding: '0.85rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
                      🌟 Performance Observation History (Contract Renewal Input)
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {casePerfComments.length > 0
                        ? `${casePerfComments.length} continuous observation${casePerfComments.length === 1 ? '' : 's'} recorded (${casePerfComments.filter((c) => c.Sentiment === 'GOOD').length} Good, ${casePerfComments.filter((c) => c.Sentiment === 'BAD').length} Bad, ${casePerfComments.filter((c) => c.Weight === 'HIGH').length} High Impact)`
                        : 'No performance observations recorded for this employee yet.'}
                    </div>
                  </div>
                  <Button size="small" variant="secondary" onClick={() => setModalTab('performance')}>
                    View Performance Log
                  </Button>
                </div>
              </div>

              {/* Pipeline Stage Progression Timeline */}
              <div className="pipeline-timeline-container">
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#334155' }}>Pipeline Progression</h4>
                <div className="timeline-step-list">
                  {caseDetails.stages?.map((stage, idx) => {
                    const currentIndex = caseDetails.stages.findIndex((s) => s.StageKey === caseDetails.case.CurrentStageKey)
                    const isCompleted = idx < currentIndex || caseDetails.case.Status === 'COMPLETED'
                    const isCurrent = stage.StageKey === caseDetails.case.CurrentStageKey && caseDetails.case.Status !== 'COMPLETED'

                    return (
                      <div
                        key={stage.StageKey}
                        className={`timeline-step-item ${isCompleted ? 'is-completed' : ''} ${isCurrent ? 'is-current' : ''}`}
                      >
                        <div className="timeline-step-dot">{isCompleted ? '✓' : idx + 1}</div>
                        <div className="timeline-step-name">{stage.StageName}</div>
                        <div className="timeline-step-sub">
                          Role: {stage.ActorRole} · SLA: {stage.DefaultSLADays} {stage.IsBusinessDays ? 'business' : 'calendar'} days
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Advance Action Controls (if case is active) */}
              {!['COMPLETED', 'CANCELLED'].includes(caseDetails.case.Status) && (
                <div className="panel" style={{ marginTop: '1.25rem', borderColor: '#bfdbfe', background: '#eff6ff' }}>
                  <div className="panel__header" style={{ padding: '0.75rem 1rem' }}>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#1e40af' }}>Execute Stage Action</h4>
                  </div>
                  <div className="panel__body" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Stage specific input controls */}
                    {caseDetails.case.CurrentStageKey === 'HOD_DURATION' && (
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#1e40af', marginBottom: 4 }}>
                          Select Iqama Renewal Duration (BRD Configured):
                        </label>
                        <select
                          className="filter-select"
                          value={iqamaDurationSelect}
                          onChange={(e) => setIqamaDurationSelect(e.target.value)}
                        >
                          <option value="12">12 Months (Configured Fee: SAR {sysConfig?.ksaIqama12mFee || 10350})</option>
                          <option value="6">6 Months (Configured Fee: SAR {sysConfig?.ksaIqama6mFee || 5175})</option>
                          <option value="3">3 Months (Configured Fee: SAR {sysConfig?.ksaIqama3mFee || 2588})</option>
                        </select>
                      </div>
                    )}

                    {['VENDOR_ADMIN', 'ADMIN_AJEER'].includes(caseDetails.case.CurrentStageKey) && sysConfig?.vendorRoster && (
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#1e40af', marginBottom: 4 }}>
                          Select Configured KSA Processing Vendor:
                        </label>
                        <select
                          className="filter-select"
                          value={selectedVendorId}
                          onChange={(e) => setSelectedVendorId(e.target.value)}
                        >
                          {sysConfig.vendorRoster.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name} (SLA: {v.slaDays} business days · Fee: SAR {v.fee})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {caseDetails.case.CurrentStageKey === 'SCENARIO_SELECTION' && (
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#1e40af', marginBottom: 4 }}>
                          Select Termination Settlement Scenario:
                        </label>
                        <select
                          className="filter-select"
                          value={terminationScenario}
                          onChange={(e) => setTerminationScenario(e.target.value)}
                        >
                          <option value="A">Scenario A: With Notice (2 months notice + 2 months salary)</option>
                          <option value="B">Scenario B: Without Notice (4 months salary)</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#1e40af', marginBottom: 4 }}>
                        Stage Notes / Justification:
                      </label>
                      <input
                        type="text"
                        placeholder="Enter stage comments or notes (mandatory for rejection)..."
                        value={advanceComments}
                        onChange={(e) => setAdvanceComments(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          border: '1px solid #bfdbfe',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                      <Button
                        variant="primary"
                        size="small"
                        onClick={() => handleAdvanceStage('APPROVE')}
                        disabled={advancing}
                      >
                        {advancing ? 'Processing…' : '✓ Confirm & Advance Stage'}
                      </Button>
                      <Button
                        variant="danger"
                        size="small"
                        onClick={() => handleAdvanceStage('REJECT')}
                        disabled={advancing}
                      >
                        ✕ Reject Stage
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DOCUMENTS */}
          {modalTab === 'documents' && (
            <div>
              {['HR', 'ADMIN', 'EMPLOYEE'].includes(user?.role) && (
                <form onSubmit={handleUploadDocument} className="doc-upload-box">
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#334155' }}>
                    Upload & Attach Supporting Document
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                      className="filter-select"
                      value={docCategory}
                      onChange={(e) => setDocCategory(e.target.value)}
                    >
                      <option value="Compliance">Compliance Document</option>
                      <option value="Contract">Signed Contract</option>
                      <option value="Passport">Passport Copy</option>
                      <option value="Medical">Medical Screening</option>
                      <option value="Payment Receipt">Payment Receipt</option>
                    </select>

                    <input
                      type="file"
                      onChange={(e) => setDocFile(e.target.files[0])}
                      style={{ fontSize: '0.85rem' }}
                    />

                    <Button
                      type="submit"
                      variant="primary"
                      size="small"
                      disabled={uploadingDoc || !docFile}
                    >
                      {uploadingDoc ? 'Uploading…' : 'Upload to Case'}
                    </Button>
                  </div>
                </form>
              )}

              {caseDetails.documents?.length === 0 ? (
                <EmptyState
                  title="No documents uploaded"
                  message="Attach required supporting files using the form above."
                />
              ) : (
                <table className="compliance-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Category</th>
                      <th>Version</th>
                      <th>Size</th>
                      <th>Uploaded At</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caseDetails.documents.map((d) => (
                      <tr key={d.DocumentID}>
                        <td style={{ fontWeight: 600 }}>{d.FileName}</td>
                        <td>{d.Category}</td>
                        <td>v{d.Version}</td>
                        <td>{Math.round(d.FileSize / 1024)} KB</td>
                        <td>{formatDate(d.CreatedAt)}</td>
                        <td>
                          <a
                            href={documentsApi.getDownloadUrl(d.DocumentID)}
                            target="_blank"
                            rel="noreferrer"
                            className="case-id-badge"
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
          )}

          {/* TAB 3: CLOSURE CHECKLIST */}
          {modalTab === 'checklist' && (
            <div>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 12px 0' }}>
                All applicable checklist items must be satisfied before the case can be marked closed.
              </p>

              {caseDetails.checklist?.length === 0 ? (
                <div style={{ padding: '1rem', color: '#64748b' }}>No checklist items registered for this pipeline.</div>
              ) : (
                <table className="checklist-items-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>Done</th>
                      <th>Checklist Requirement</th>
                      <th>Status</th>
                      <th>Completed Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caseDetails.checklist.map((item) => {
                      const isNa = item.ItemLabel.includes('N/A')
                      return (
                        <tr key={item.ProgressID}>
                          <td>
                            <input
                              type="checkbox"
                              checked={!!item.IsCompleted}
                              disabled={isNa || !['HR', 'ADMIN'].includes(user?.role)}
                              onChange={() => handleToggleChecklist(item.ProgressID, item.IsCompleted)}
                            />
                          </td>
                          <td style={{ fontWeight: 500 }}>
                            {item.ItemLabel}
                          </td>
                          <td>
                            {isNa ? (
                              <span className="checklist-na-badge">Not Applicable</span>
                            ) : item.IsCompleted ? (
                              <Badge variant="success">Completed</Badge>
                            ) : (
                              <Badge variant="warning">Pending</Badge>
                            )}
                          </td>
                          <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                            {item.CompletedAt ? formatDate(item.CompletedAt) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 4: AUDIT HISTORY */}
          {modalTab === 'history' && (
            <div>
              <table className="compliance-table">
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Action Taken</th>
                    <th>Actor Role</th>
                    <th>Entered At</th>
                    <th>Completed At</th>
                    <th>Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {caseDetails.history?.map((h) => (
                    <tr key={h.HistoryID}>
                      <td style={{ fontWeight: 600 }}>{h.StageName || h.StageKey}</td>
                      <td>
                        <Badge variant={h.ActionTaken === 'REJECTED' ? 'danger' : 'secondary'}>
                          {h.ActionTaken}
                        </Badge>
                      </td>
                      <td>{h.ActorRole}</td>
                      <td style={{ fontSize: '0.8rem' }}>{formatDate(h.EnteredAt)}</td>
                      <td style={{ fontSize: '0.8rem' }}>{h.CompletedAt ? formatDate(h.CompletedAt) : '—'}</td>
                      <td style={{ fontSize: '0.85rem', color: '#475569' }}>{h.Comments || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 5: PERFORMANCE LOG (SECTION 4 INPUT FOR CONTRACT RENEWAL) */}
          {modalTab === 'performance' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#0f172a' }}>
                    Continuous Performance Observations
                  </h4>
                  <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                    Continuous qualitative feedback log for #{caseDetails.case.EmpID} — {caseDetails.case.FirstName} {caseDetails.case.LastName}
                  </p>
                </div>
                <Link to="/performance" style={{ fontSize: '0.85rem', color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                  Open Performance Module →
                </Link>
              </div>

              {casePerfLoading ? (
                <LoadingState message="Loading performance observations..." />
              ) : casePerfComments.length === 0 ? (
                <EmptyState
                  title="No performance observations yet"
                  description="No continuous performance comments have been logged for this employee. Managers and HR can add comments from the Performance module."
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {casePerfComments.map((c) => (
                    <div
                      key={c.CommentID}
                      style={{
                        padding: '12px 14px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        borderLeft: c.Sentiment === 'GOOD' ? '4px solid #16a34a' : '4px solid #dc2626',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>{c.CreatedByName}</strong>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{formatDate(c.CreatedAt)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: c.Sentiment === 'GOOD' ? '#dcfce7' : '#fee2e2',
                              color: c.Sentiment === 'GOOD' ? '#15803d' : '#b91c1c',
                            }}
                          >
                            {c.Sentiment === 'GOOD' ? '👍 GOOD' : '👎 BAD'}
                          </span>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: c.Weight === 'HIGH' ? '#fff7ed' : '#f1f5f9',
                              color: c.Weight === 'HIGH' ? '#c2410c' : '#475569',
                              border: c.Weight === 'HIGH' ? '1px solid #fdba74' : '1px solid #cbd5e1',
                            }}
                          >
                            {c.Weight === 'HIGH' ? '🔥 HIGH' : 'NORMAL'}
                          </span>
                        </div>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155', whiteSpace: 'pre-wrap' }}>
                        {c.CommentText || c.Comment}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="case-modal-footer">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Close
            </Button>
          </div>
        </Modal>
      )}

      {/* =================================================================== */}
      {/* NEW EXIT/RE-ENTRY VISA MODAL                                        */}
      {/* =================================================================== */}
      {exitReentryModal && (
        <Modal
          isOpen={exitReentryModal}
          onClose={() => setExitReentryModal(false)}
          title="New KSA Exit/Re-Entry Visa Request"
        >
          <form onSubmit={handleCreateExitReentry} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
              Initiates an Exit/Re-Entry Visa compliance workflow for a non-Saudi employee in KSA.
              <br />
              <strong>Mandatory rule:</strong> Iqama must have at least 45 days remaining validity, or the case will be blocked.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Employee ID:
              </label>
              <input
                type="number"
                placeholder="Enter Employee ID (e.g. 3 or 18)"
                value={exitEmpId}
                onChange={(e) => setExitEmpId(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <Button type="button" variant="secondary" onClick={() => setExitReentryModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={creatingExit || !exitEmpId}>
                {creatingExit ? 'Creating…' : 'Submit Request'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* =================================================================== */}
      {/* NEW OUTBOUND VISA TRACKING MODAL                                    */}
      {/* =================================================================== */}
      {outboundModal && (
        <Modal
          isOpen={outboundModal}
          onClose={() => setOutboundModal(false)}
          title="New Outbound Visa Renewal Tracking"
        >
          <form onSubmit={handleCreateOutbound} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
              Track existing outbound visas (US, UK, Schengen, India, etc.) held by employees for planned travel.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Employee ID:
              </label>
              <input
                type="number"
                placeholder="Enter Employee ID (e.g. 2 or 23)"
                value={outboundEmpId}
                onChange={(e) => setOutboundEmpId(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Destination / Visa Authority:
              </label>
              <select
                className="filter-select"
                style={{ width: '100%' }}
                value={outboundCountry}
                onChange={(e) => setOutboundCountry(e.target.value)}
              >
                <option value="US">United States (B1/B2 Visa)</option>
                <option value="UK">United Kingdom (Standard Visitor Visa)</option>
                <option value="Schengen">Schengen Area (Type C Business Visa)</option>
                <option value="India">India (Business / Conference e-Visa)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Travel Category:
              </label>
              <select
                className="filter-select"
                style={{ width: '100%' }}
                value={outboundCategory}
                onChange={(e) => setOutboundCategory(e.target.value)}
              >
                <option value="Standard">Standard Employee (60 Days Lead Time)</option>
                <option value="Manager">Manager / Frequent Traveler</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <Button type="button" variant="secondary" onClick={() => setOutboundModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={creatingOutbound || !outboundEmpId}>
                {creatingOutbound ? 'Creating…' : 'Start Tracking'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
