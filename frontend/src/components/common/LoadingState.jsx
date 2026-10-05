import './LoadingState.css'

export default function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div className="loading-state__spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className="error-state" role="alert">
      <h3>Unable to load data</h3>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="error-state__retry" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  )
}
