import { apiRequest } from './client'

const BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
).replace(/\/$/, '')

export const workQueueApi = {
  getTasks: (params = {}) => {
    const q = new URLSearchParams()
    if (params.status) q.set('status', params.status)
    if (params.regionCode) q.set('regionCode', params.regionCode)
    if (params.priority) q.set('priority', params.priority)
    const qs = q.toString()
    return apiRequest(`/work-queue/tasks${qs ? `?${qs}` : ''}`)
  },
  getTaskById: (id) => apiRequest(`/work-queue/tasks/${id}`),
  executeAction: (id, body) =>
    apiRequest(`/work-queue/tasks/${id}/execute`, {
      method: 'POST',
      body,
    }),
}

export const complianceApi = {
  getStats: (regionCode) => {
    const q = new URLSearchParams()
    if (regionCode && regionCode !== 'all') q.set('regionCode', regionCode)
    const qs = q.toString()
    return apiRequest(`/compliance/stats${qs ? `?${qs}` : ''}`)
  },
  getConfig: () => apiRequest('/compliance/config'),
  getCases: (params = {}) => {
    const q = new URLSearchParams()
    if (params.regionCode && params.regionCode !== 'all') q.set('regionCode', params.regionCode)
    if (params.status && params.status !== 'all') q.set('status', params.status)
    if (params.eventCode && params.eventCode !== 'all') q.set('eventCode', params.eventCode)
    if (params.priority && params.priority !== 'all') q.set('priority', params.priority)
    if (params.assignedRole && params.assignedRole !== 'all') q.set('assignedRole', params.assignedRole)
    if (params.period && params.period !== 'all') q.set('period', params.period)
    if (params.search) q.set('search', params.search)
    if (params.sort) q.set('sort', params.sort)
    if (params.order) q.set('order', params.order)
    if (params.empId) q.set('empId', params.empId)
    if (params.page) q.set('page', params.page)
    if (params.limit) q.set('limit', params.limit)
    const qs = q.toString()
    return apiRequest(`/compliance/cases${qs ? `?${qs}` : ''}`)
  },
  getCaseById: (id) => apiRequest(`/compliance/cases/${id}`),
  createCase: (body) =>
    apiRequest('/compliance/cases', {
      method: 'POST',
      body,
    }),
  advanceStage: (id, body) =>
    apiRequest(`/compliance/cases/${id}/advance`, {
      method: 'PATCH',
      body,
    }),
  updateChecklist: (id, progressId, body) =>
    apiRequest(`/compliance/cases/${id}/checklist/${progressId}`, {
      method: 'PATCH',
      body,
    }),
  scan: () =>
    apiRequest('/compliance/scan', {
      method: 'POST',
    }),
}


export const requestsApi = {
  getRequests: (params = {}) => {
    const q = new URLSearchParams()
    if (params.requestType) q.set('requestType', params.requestType)
    if (params.status) q.set('status', params.status)
    if (params.regionCode) q.set('regionCode', params.regionCode)
    if (params.empId) q.set('empId', params.empId)
    const qs = q.toString()
    return apiRequest(`/requests${qs ? `?${qs}` : ''}`)
  },
  getRequestById: (id) => apiRequest(`/requests/${id}`),
  createRequest: (body) =>
    apiRequest('/requests', {
      method: 'POST',
      body,
    }),
  processApproval: (id, body) =>
    apiRequest(`/requests/${id}/approval`, {
      method: 'PATCH',
      body,
    }),
}

export const lettersApi = {
  getLetters: (params = {}) => {
    const q = new URLSearchParams()
    if (params.letterType) q.set('letterType', params.letterType)
    if (params.status) q.set('status', params.status)
    if (params.regionCode) q.set('regionCode', params.regionCode)
    if (params.empId) q.set('empId', params.empId)
    const qs = q.toString()
    return apiRequest(`/letters${qs ? `?${qs}` : ''}`)
  },
  getLetterById: (id) => apiRequest(`/letters/${id}`),
  createLetter: (body) =>
    apiRequest('/letters', {
      method: 'POST',
      body,
    }),
  issueLetter: (id, body) =>
    apiRequest(`/letters/${id}/issue`, {
      method: 'PATCH',
      body,
    }),
}

export const documentsApi = {
  getDocuments: (params = {}) => {
    const q = new URLSearchParams()
    if (params.category) q.set('category', params.category)
    if (params.sourceModule) q.set('sourceModule', params.sourceModule)
    if (params.sourceId) q.set('sourceId', params.sourceId)
    if (params.empId) q.set('empId', params.empId)
    if (params.regionCode) q.set('regionCode', params.regionCode)
    const qs = q.toString()
    return apiRequest(`/documents${qs ? `?${qs}` : ''}`)
  },
  getDocumentById: (id) => apiRequest(`/documents/${id}`),
  uploadDocument: (body) =>
    apiRequest('/documents', {
      method: 'POST',
      body,
    }),
  getDownloadUrl: (id) => {
    const token = localStorage.getItem('token')
    return `${BASE_URL}/documents/${id}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`
  },
}

export const signaturesApi = {
  sign: (body) =>
    apiRequest('/signatures', {
      method: 'POST',
      body,
    }),
  getSignatures: (sourceModule, sourceId) =>
    apiRequest(`/signatures?sourceModule=${encodeURIComponent(sourceModule)}&sourceId=${encodeURIComponent(sourceId)}`),
}

export const performanceApi = {
  getOverview: () => apiRequest('/performance/overview'),
  getComments: (empId, filters = {}) => {
    const q = new URLSearchParams()
    if (filters.sentiment && filters.sentiment !== 'ALL') q.set('sentiment', filters.sentiment)
    if (filters.weight && filters.weight !== 'ALL') q.set('weight', filters.weight)
    if (filters.fromDate) q.set('fromDate', filters.fromDate)
    if (filters.toDate) q.set('toDate', filters.toDate)
    if (filters.author) q.set('author', filters.author)
    const qs = q.toString()
    return apiRequest(`/performance/employees/${empId}/comments${qs ? `?${qs}` : ''}`)
  },
  addComment: (empId, body) =>
    apiRequest(`/performance/employees/${empId}/comments`, {
      method: 'POST',
      body,
    }),
}

export const auditApi = {
  getAuditLogs: (params = {}) => {
    const q = new URLSearchParams()
    if (params.module) q.set('module', params.module)
    if (params.recordId) q.set('recordId', params.recordId)
    if (params.empId) q.set('empId', params.empId)
    if (params.regionCode) q.set('regionCode', params.regionCode)
    if (params.limit) q.set('limit', params.limit)
    const qs = q.toString()
    return apiRequest(`/audit${qs ? `?${qs}` : ''}`)
  },
}

export const reportsApi = {
  getComplianceStatus: (regionCode) =>
    apiRequest(`/reports/compliance-status${regionCode ? `?regionCode=${regionCode}` : ''}`),
  getOverdueCompliance: (regionCode) =>
    apiRequest(`/reports/overdue-compliance${regionCode ? `?regionCode=${regionCode}` : ''}`),
  getSLABreaches: (regionCode) =>
    apiRequest(`/reports/sla-breaches${regionCode ? `?regionCode=${regionCode}` : ''}`),
  getWorkQueueSummary: (regionCode) =>
    apiRequest(`/reports/work-queue-summary${regionCode ? `?regionCode=${regionCode}` : ''}`),
  getKsaIqamaCosts: () => apiRequest('/reports/ksa-iqama-costs'),
  getAdvanceRequests: (regionCode) =>
    apiRequest(`/reports/advance-requests${regionCode ? `?regionCode=${regionCode}` : ''}`),
  getLetterRequests: (regionCode) =>
    apiRequest(`/reports/letter-requests${regionCode ? `?regionCode=${regionCode}` : ''}`),
}

export const masterApi = {
  getRegions: () => apiRequest('/masters/regions'),
  getEntities: (regionCode) =>
    apiRequest(`/masters/entities${regionCode ? `?regionCode=${regionCode}` : ''}`),
  getEventTypes: (regionCode) =>
    apiRequest(`/masters/event-types${regionCode ? `?regionCode=${regionCode}` : ''}`),
  getPipelines: (regionCode) =>
    apiRequest(`/masters/pipelines${regionCode ? `?regionCode=${regionCode}` : ''}`),
  getPipelineStages: (pipelineCode) =>
    apiRequest(`/masters/pipeline-stages${pipelineCode ? `?pipelineCode=${pipelineCode}` : ''}`),
  getClosureChecklists: (pipelineCode) =>
    apiRequest(`/masters/closure-checklists${pipelineCode ? `?pipelineCode=${pipelineCode}` : ''}`),
  getApprovalChains: (requestTypeCode, regionCode) => {
    const q = new URLSearchParams()
    if (requestTypeCode) q.set('requestTypeCode', requestTypeCode)
    if (regionCode) q.set('regionCode', regionCode)
    const qs = q.toString()
    return apiRequest(`/masters/approval-chains${qs ? `?${qs}` : ''}`)
  },
  getRequestTypes: () => apiRequest('/masters/request-types'),
  getLetterTemplates: (regionCode) =>
    apiRequest(`/masters/letter-templates${regionCode ? `?regionCode=${regionCode}` : ''}`),
  updateLetterTemplate: (id, content) =>
    apiRequest(`/masters/letter-templates/${id}`, {
      method: 'PATCH',
      body: { content },
    }),
  getConfigs: () => apiRequest('/masters/configs'),
  updateConfig: (key, value) =>
    apiRequest(`/masters/configs/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      body: { value },
    }),
}
