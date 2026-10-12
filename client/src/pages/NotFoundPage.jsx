import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Page not found</h1>
        <p>The page you are looking for does not exist.</p>
        <div className="state-actions">
          <Link to="/" className="button button-primary">
            Go to the home page
          </Link>
        </div>
      </div>
    </div>
  )
}
