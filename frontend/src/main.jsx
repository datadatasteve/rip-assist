import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { registerSW } from './lib/push'
import { applyTheme } from './pages/Settings'
import './styles.css'

try { applyTheme(localStorage.getItem('ra-theme') || 'system') } catch { /* storage unavailable */ }
registerSW()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
