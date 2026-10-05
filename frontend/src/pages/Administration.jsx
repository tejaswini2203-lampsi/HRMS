import { useState, useEffect, useCallback } from 'react'
import { masterApi } from '../services/api/hrms'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageHeader from '../components/common/PageHeader'
import StatCard from '../components/common/StatCard'
import Badge from '../components/common/Badge'
import Button from '../components/common/Button'
import Modal from '../components/common/Modal'
import LoadingState from '../components/common/LoadingState'
import './Administration.css'

export default function AdministrationPage() {
  const { user } = useAuth()
  const { addToast } = useToast()

  const [activeTab, setActiveTab] = useState('configs')
  const [loading, setLoading] = useState(true)

  // Master datasets
  const [regions, setRegions] = useState([])
  const [entities, setEntities] = useState([])
  const [eventTypes, setEventTypes] = useState([])
  const [pipelines, setPipelines] = useState([])
  const [stages, setStages] = useState([])
  const [slaRules, setSlaRules] = useState([])
  const [templates, setTemplates] = useState([])
  const [configs, setConfigs] = useState([])

  // Edit Template Modal
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [templateContent, setTemplateContent] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  // Edit Config Modal
  const [editingConfig, setEditingConfig] = useState(null)
  const [configValue, setConfigValue] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)

  const loadAllMasters = useCallback(async () => {
    try {
      setLoading(true)
      const [
        regRes,
        entRes,
        evRes,
        pipeRes,
        stageRes,
        tmplRes,
        confRes,
      ] = await Promise.all([
        masterApi.getRegions(),
        masterApi.getEntities(),
        masterApi.getEventTypes(),
        masterApi.getPipelines(),
        masterApi.getPipelineStages(),
        masterApi.getLetterTemplates(),
        masterApi.getConfigs(),
      ])

      setRegions(regRes || [])
      setEntities(entRes || [])
      setEventTypes(evRes || [])
      setPipelines(pipeRes || [])
      setStages(stageRes || [])
      setTemplates(tmplRes || [])
      setConfigs(confRes || [])
    } catch (err) {
      addToast(err.message || 'Failed to load configuration masters', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadAllMasters()
  }, [loadAllMasters])

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return
    try {
      setSavingTemplate(true)
      await masterApi.updateLetterTemplate(editingTemplate.TemplateID, templateContent)
      addToast('Letter template updated and version incremented (Audited)', 'success')
      setEditingTemplate(null)
      loadAllMasters()
    } catch (err) {
      addToast(err.message || 'Failed to save template', 'error')
    } finally {
      setSavingTemplate(false)
    }
  }

  const handleSaveConfig = async () => {
    if (!editingConfig) return
    try {
      setSavingConfig(true)
      await masterApi.updateConfig(editingConfig.ConfigKey, configValue)
      addToast(`Configuration "${editingConfig.ConfigKey}" updated (Audited)`, 'success')
      setEditingConfig(null)
      loadAllMasters()
    } catch (err) {
      addToast(err.message || 'Failed to save config', 'error')
    } finally {
      setSavingConfig(false)
    }
  }

  return (
    <div className="administration-page">
      <PageHeader
        title="⚙️ Administration & Configuration Master"
        subtitle="Manage regional jurisdictions, legal entities, SLA rules, workflow pipelines, templates, and integration flags"
      >
        <div className="admin-header-actions">
          <Button variant="primary" onClick={loadAllMasters}>
            Refresh Masters
          </Button>
        </div>
      </PageHeader>

      <div className="admin-stats">
        <StatCard title="Active Regions" value="UAE + KSA (Active)" icon="globe" variant="primary" />
        <StatCard title="Future Regions" value="India (Inactive/Preserved)" icon="layers" variant="info" />
        <StatCard title="Audit Enforcement" value="Every Change Audited" icon="shield" variant="success" />
        <StatCard title="Feature Flags" value={configs.length} icon="cpu" variant="default" />
      </div>

      {/* Tabs */}
      <div className="admin-tab-bar">
        <button
          type="button"
          className={`admin-tab ${activeTab === 'configs' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('configs')}
        >
          Feature Flags & System Config ({configs.length})
        </button>
        <button
          type="button"
          className={`admin-tab ${activeTab === 'regions' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('regions')}
        >
          Regions & Entities
        </button>
        <button
          type="button"
          className={`admin-tab ${activeTab === 'pipelines' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('pipelines')}
        >
          Workflows & Stages ({pipelines.length})
        </button>
        <button
          type="button"
          className={`admin-tab ${activeTab === 'templates' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          Letter Templates ({templates.length})
        </button>
      </div>

      {/* Content Panels */}
      <div className="admin-content-panel">
        {loading ? (
          <LoadingState message="Loading administration configuration..." />
        ) : (
          <>
            {/* 1. Feature Flags & Configs */}
            {activeTab === 'configs' && (
              <div className="config-section">
                <div className="section-intro">
                  <h4>System Configuration & Feature Flags</h4>
                  <p>
                    All configuration updates are automatically audited. Unresolved business rules
                    are marked as <em>Pending Confirmation</em>.
                  </p>
                </div>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Configuration Key</th>
                      <th>Current Value</th>
                      <th>Description</th>
                      <th>Last Updated</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configs.map((c) => (
                      <tr key={c.ConfigKey}>
                        <td>
                          <code>{c.ConfigKey}</code>
                        </td>
                        <td>
                          <span
                            className={`config-value-pill ${c.ConfigValue === 'true' ? 'val-true' : c.ConfigValue === 'false' ? 'val-false' : ''}`}
                          >
                            {c.ConfigValue}
                          </span>
                        </td>
                        <td>{c.Description}</td>
                        <td>{new Date(c.UpdatedAt).toLocaleDateString()}</td>
                        <td>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingConfig(c)
                              setConfigValue(c.ConfigValue)
                            }}
                          >
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 2. Regions & Entities */}
            {activeTab === 'regions' && (
              <div className="regions-section">
                <h4>Jurisdiction Regions</h4>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Region Name</th>
                      <th>Status</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regions.map((r) => (
                      <tr key={r.RegionID}>
                        <td>
                          <strong>{r.Code}</strong>
                        </td>
                        <td>{r.Name}</td>
                        <td>
                          <Badge variant={r.Status === 'Active' ? 'success' : 'default'}>
                            {r.Status === 'Active' ? 'Active' : 'Future / Inactive'}
                          </Badge>
                        </td>
                        <td>{r.Description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h4 style={{ marginTop: '24px' }}>Operating Legal Entities</h4>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Entity ID</th>
                      <th>Entity Legal Name</th>
                      <th>Region</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entities.map((e) => (
                      <tr key={e.EntityID}>
                        <td>#{e.EntityID}</td>
                        <td>
                          <strong>{e.EntityName}</strong>
                        </td>
                        <td>
                          <span className="region-pill">
                            {e.RegionCode === 'saudi' ? '🇸🇦 KSA' : e.RegionCode === 'uae' ? '🇦🇪 UAE' : '🇮🇳 India'}
                          </span>
                        </td>
                        <td>
                          <Badge variant={e.IsActive ? 'success' : 'default'}>
                            {e.IsActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 3. Workflows & Stages */}
            {activeTab === 'pipelines' && (
              <div className="pipelines-section">
                <h4>Configured Compliance Pipelines & 13-Stage Sequences</h4>
                {pipelines.map((pipe) => {
                  const pipeStages = stages.filter((s) => s.PipelineCode === pipe.PipelineCode)
                  return (
                    <div key={pipe.PipelineID} className="pipeline-card">
                      <div className="pipe-header">
                        <div>
                          <strong>{pipe.PipelineName}</strong>{' '}
                          <code>({pipe.PipelineCode})</code>
                        </div>
                        <span className="region-pill">
                          {pipe.RegionCode === 'saudi' ? '🇸🇦 KSA' : '🇦🇪 UAE'}
                        </span>
                      </div>
                      <div className="pipe-stages-list">
                        {pipeStages.map((st) => (
                          <div key={st.StageID} className="pipe-stage-row">
                            <span className="seq-circle">{st.SequenceOrder}</span>
                            <span className="st-name">{st.StageName}</span>
                            <span className="st-role">Role: {st.ActorRole}</span>
                            <span className="st-sla">
                              SLA: {st.DefaultSLADays} {st.IsBusinessDays ? 'Business Days' : 'Calendar Days'}
                            </span>
                            {st.IsConditional && (
                              <span className="st-cond">Branch: {st.BranchCondition} Only</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 4. Letter Templates */}
            {activeTab === 'templates' && (
              <div className="templates-section">
                <h4>11 Standard Letter Templates</h4>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Template Code</th>
                      <th>Letter Type</th>
                      <th>Version</th>
                      <th>Merge Fields</th>
                      <th>Requires E-Sign</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((t) => (
                      <tr key={t.TemplateID}>
                        <td>
                          <strong>{t.TemplateCode}</strong>
                        </td>
                        <td>{t.LetterType}</td>
                        <td>v{t.Version}</td>
                        <td>
                          <small className="merge-text">{t.MergeFields}</small>
                        </td>
                        <td>
                          <Badge variant={t.RequiresSignatory ? 'warning' : 'default'}>
                            {t.RequiresSignatory ? 'Yes (Signatory Required)' : 'No'}
                          </Badge>
                        </td>
                        <td>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingTemplate(t)
                              setTemplateContent(t.Content)
                            }}
                          >
                            Edit Template
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Template Modal */}
      {editingTemplate && (
        <Modal
          isOpen={Boolean(editingTemplate)}
          onClose={() => setEditingTemplate(null)}
          title={`Edit Template: ${editingTemplate.LetterType} (v${editingTemplate.Version})`}
        >
          <div className="edit-template-modal">
            <p className="template-help">
              Available Merge Fields: <code>{'{{EmployeeName}}'}</code>,{' '}
              <code>{'{{EmployeeID}}'}</code>, <code>{'{{Designation}}'}</code>,{' '}
              <code>{'{{JoiningDate}}'}</code>, <code>{'{{Salary}}'}</code>,{' '}
              <code>{'{{Entity}}'}</code>, <code>{'{{Region}}'}</code>
            </p>
            <textarea
              rows={12}
              value={templateContent}
              onChange={(e) => setTemplateContent(e.target.value)}
              className="template-editor"
            />
            <div className="modal-actions-right">
              <Button variant="outline" onClick={() => setEditingTemplate(null)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={savingTemplate} onClick={handleSaveTemplate}>
                {savingTemplate ? 'Saving...' : 'Save & Increment Version'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Config Modal */}
      {editingConfig && (
        <Modal
          isOpen={Boolean(editingConfig)}
          onClose={() => setEditingConfig(null)}
          title={`Edit Configuration: ${editingConfig.ConfigKey}`}
        >
          <div className="edit-config-modal">
            <p className="config-desc-text">{editingConfig.Description}</p>
            <div className="form-group">
              <label>Configuration Value:</label>
              <input
                type="text"
                value={configValue}
                onChange={(e) => setConfigValue(e.target.value)}
                required
              />
            </div>
            <div className="modal-actions-right">
              <Button variant="outline" onClick={() => setEditingConfig(null)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={savingConfig} onClick={handleSaveConfig}>
                {savingConfig ? 'Saving...' : 'Save Setting'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
