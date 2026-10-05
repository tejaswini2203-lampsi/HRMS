import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Button from '../components/common/Button'
import BrandMark from '../components/common/BrandMark'
import FormInput from '../components/forms/FormInput'
import { DEMO_ACCOUNTS } from '../config/loginCredentials'
import { SUBSIDIARIES } from '../config/subsidiaries'
import './Login.css'

export default function LoginPage() {
  const { isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [previewSub, setPreviewSub] = useState(null)

  const activePreview = previewSub ? SUBSIDIARIES[previewSub] : null

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  const pickDemo = (account) => {
    setUsername(account.username)
    setPreviewSub(account.subsidiaryId)
    setError('')
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim()) {
      setError('Username is required')
      return
    }
    if (!password) {
      setError('Password is required')
      return
    }

    setError('')
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Unable to sign in. Check credentials and API.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="login-page"
      data-subsidiary={previewSub || undefined}
      style={
        activePreview
          ? {
              '--login-sub-accent': activePreview.branding.accent,
              '--login-sub-soft': activePreview.branding.accentSoft,
            }
          : undefined
      }
    >
      {activePreview ? (
        <div
          className="login-page__strip"
          style={{ background: activePreview.branding.strip }}
          aria-hidden="true"
        />
      ) : null}

      <div className="login-page__inner">
        <section className="login-intro">
          <div className="login-intro__brand">
            <BrandMark size={42} subsidiaryId={previewSub} />
            <strong>
              {activePreview?.branding?.productName || 'EICS'}
            </strong>
            {activePreview ? (
              <span
                className="login-intro__sub-pill"
                style={{ background: activePreview.branding.accentSoft }}
              >
                <i style={{ background: activePreview.branding.badge }} />
                {activePreview.shortLabel}
              </span>
            ) : null}
          </div>
          <h1>Employee Information &amp; Compliance System (EICS)</h1>
          <p>
            Unified platform for employee information, compliance monitoring,
            and enterprise asset management across UAE, Saudi Arabia, and India.
          </p>
          <ul className="login-intro__features">
            <li>
              <i aria-hidden="true">✓</i>
              <div>
                <strong>Multi-subsidiary workspaces</strong>
                <span>Regional branding, validation, and compliance per entity.</span>
              </div>
            </li>
            <li>
              <i aria-hidden="true">◎</i>
              <div>
                <strong>Multi-regional compliance</strong>
                <span>Passport, leave, vehicle, and flight tracking in one place.</span>
              </div>
            </li>
            <li>
              <i aria-hidden="true">◷</i>
              <div>
                <strong>Real-time auditing</strong>
                <span>Automated alerts for expirations, approvals, and renewals.</span>
              </div>
            </li>
          </ul>
        </section>

        <form className="login-card" onSubmit={onSubmit} noValidate>
          <h2>Sign In</h2>
          <p className="login-card__lead">
            Use your corporate username and password to continue.
          </p>

          <FormInput
            id="login-username"
            label="Corporate ID / Email"
            required
            autoComplete="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              const match = DEMO_ACCOUNTS.find(
                (a) => a.username === e.target.value.trim(),
              )
              setPreviewSub(match?.subsidiaryId || null)
            }}
            placeholder="e.g. name@eicscomp.com"
          />

          <div className="login-card__password">
            <div className="login-card__pw-head">
              <label htmlFor="login-password">Password</label>
              <button
                type="button"
                className="login-card__forgot"
                onClick={() =>
                  setHint('Contact your administrator to reset your password.')
                }
              >
                Forgot password?
              </button>
            </div>
            <div className="login-card__pw-field">
              <FormInput
                id="login-password"
                required
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
              />
              <button
                type="button"
                className="login-card__eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <label className="login-card__remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember this device for 30 days
          </label>

          <div className="login-demo">
            <span className="login-demo__label">Demo accounts (password: eics@4321)</span>
            <div className="login-demo__grid">
              {DEMO_ACCOUNTS.map((account) => {
                const sub = SUBSIDIARIES[account.subsidiaryId]
                return (
                  <button
                    key={account.username}
                    type="button"
                    className={
                      username === account.username ? 'is-selected' : ''
                    }
                    style={{
                      '--demo-badge': sub.branding.badge,
                      '--demo-soft': sub.branding.accentSoft,
                    }}
                    onClick={() => pickDemo(account)}
                  >
                    <i aria-hidden="true" />
                    <span>
                      <strong>{account.label}</strong>
                      <small>{account.username}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {hint ? <p className="login-card__hint">{hint}</p> : null}
          {error ? (
            <p className="login-card__error" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="login-card__submit" loading={submitting}>
            Sign In Securely
          </Button>

          <p className="login-card__help">
            Need access? Contact the IT Service Desk with your employee ID.
          </p>
        </form>
      </div>

      <footer className="login-footer">
        <span>Privacy Policy</span>
        <span>Terms of Service</span>
        <span>Compliance Standards</span>
        <span>Help Center</span>
        <small>Enterprise Employee Information &amp; Compliance System (EICS)</small>
      </footer>
    </div>
  )
}
