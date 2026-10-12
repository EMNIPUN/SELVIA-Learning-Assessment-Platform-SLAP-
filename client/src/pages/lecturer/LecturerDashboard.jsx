import { Link } from 'react-router'
import { ROUTES } from '../../constants/routes.js'
import { useAuth } from '../../hooks/useAuth.js'

export default function LecturerDashboard() {
  const { user } = useAuth()

  return (
    <section className="page">
      <header className="page-header">
        <h1>Welcome, {user.firstName}</h1>
        <p className="page-subtitle">Your SELVIA lecturer workspace.</p>
      </header>

      <div className="dashboard-grid">
        <article className="card">
          <h2 className="card-title">Courses</h2>
          <p className="card-text">Create and manage the courses you own, including drafts.</p>
          <Link to={ROUTES.LECTURER_COURSES} className="button button-primary">
            Go to Courses
          </Link>
        </article>

        <article className="card">
          <h2 className="card-title">Your account</h2>
          <dl className="account-details">
            <div>
              <dt>Name</dt>
              <dd>
                {user.firstName} {user.lastName}
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
          </dl>
        </article>
      </div>
    </section>
  )
}
