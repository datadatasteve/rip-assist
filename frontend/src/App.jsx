import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/shared/Layout'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { DataProvider } from './hooks/useData'
import Auth from './pages/Auth'
import CheckIn from './pages/CheckIn'
import Dashboard from './pages/Dashboard'
import Habits from './pages/Habits'
import Lanes from './pages/Lanes'
import Settings from './pages/Settings'
import Tasks from './pages/Tasks'

const DevDashboard = lazy(() => import('./pages/DevDashboard'))

// HashRouter: GitHub Pages has no SPA rewrites, so routes live after '#'.
function Shell() {
  const { user, loading } = useAuth()
  if (loading) return <div className="empty" style={{ paddingTop: '30vh' }}>Loading…</div>
  if (!user) return <Auth />
  return (
    <DataProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/lanes" element={<Lanes />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/dev" element={<Suspense fallback={<div className="empty">Loading…</div>}><DevDashboard /></Suspense>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </DataProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </AuthProvider>
  )
}
