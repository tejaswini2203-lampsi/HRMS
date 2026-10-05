import { Link } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import StatCard from '../components/common/StatCard'
import Button from '../components/common/Button'
import './RequestsHub.css'

export default function RequestsHubPage() {
  return (
    <div className="requests-hub-page">
      <PageHeader
        title="📥 Employee Requests Hub"
        subtitle="Manage financial advances, official certificates, and verification requests across UAE and KSA operations"
      />

      <div className="requests-hub-grid">
        <div className="request-type-card">
          <div className="card-icon-header">
            <span className="card-emoji">💰</span>
            <h3>Salary & Gratuity Advances</h3>
          </div>
          <p>
            Submit emergency salary advances and End-of-Service gratuity advance requests.
            Features structured multi-tier approval chains (Manager → HR → Finance) and repayment schedule storage.
          </p>
          <div className="card-actions">
            <Link to="/requests/advance">
              <Button variant="primary">Open Advance Requests →</Button>
            </Link>
          </div>
        </div>

        <div className="request-type-card">
          <div className="card-icon-header">
            <span className="card-emoji">📜</span>
            <h3>Official Letters & Certificates</h3>
          </div>
          <p>
            Request 11 standard HR letter templates (Experience, Salary Certificate, Increment, Promotion, etc.).
            Integrated digital e-signatures and automated template merge fields for immediate PDF generation.
          </p>
          <div className="card-actions">
            <Link to="/requests/letters">
              <Button variant="primary">Open Letter Requests →</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
