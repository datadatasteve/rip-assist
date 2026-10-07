import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useData } from '../../hooks/useData'
import NotificationBell from './NotificationBell'
import CheckinDueBanner from '../checkins/CheckinDueBanner'
import InstallBanner from './InstallBanner'

const NAV = [
  { to: '/', label: 'Today', icon: '◎', end: true },
  { to: '/lanes', label: 'Lanes', icon: '☰' },
  { to: '/tasks', label: 'Tasks', icon: '✓' },
  { to: '/habits', label: 'Habits', icon: '↻' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

export default function Layout({ children }) {
  const { settings } = useData()
  const nav = useNavigate()
  const loc = useLocation()
  const items = settings?.dev_mode ? [...NAV.slice(0, 4), { to: '/dev', label: 'Dev', icon: '⌘' }, NAV[4]] : NAV
  const onCheckin = loc.pathname.startsWith('/checkin')

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">rip<span>·</span>assist</div>
        {items.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <span className="nav-icon">{n.icon}</span>{n.label}
          </NavLink>
        ))}
        <NavLink to="/checkin" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <span className="nav-icon">♥</span>Check-in
        </NavLink>
        <div className="spacer" />
        <small style={{ padding: '0 10px' }}>V1</small>
      </aside>

      <main className="main">
        <div className="row-between" style={{ marginBottom: 6 }}>
          <span className="brand" style={{ padding: 0 }} >{/* mobile brand */}
            <span className="mobile-only">rip<span>·</span>assist</span>
          </span>
          <NotificationBell />
        </div>
        <InstallBanner />
        <CheckinDueBanner />
        {children}
      </main>

      {!onCheckin && (
        <button className="fab primary" onClick={() => nav('/checkin?trigger=on_demand')} aria-label="Quick check-in">
          ♥ Check-in
        </button>
      )}

      <nav className="bottom-nav">
        {items.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon">{n.icon}</span>{n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
