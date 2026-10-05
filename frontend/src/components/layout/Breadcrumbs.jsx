import { Link } from 'react-router-dom'
import './Breadcrumbs.css'

export default function Breadcrumbs({ items = [] }) {
  if (!items.length) return null

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, idx) => {
          const last = idx === items.length - 1
          return (
            <li key={`${item.label}-${idx}`}>
              {item.to && !last ? (
                <Link to={item.to}>{item.label}</Link>
              ) : (
                <span aria-current={last ? 'page' : undefined}>{item.label}</span>
              )}
              {!last ? <span className="breadcrumbs__sep" aria-hidden="true">/</span> : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
