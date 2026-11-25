import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyTheme, getStoredThemeId, DEFAULT_THEME_ID, THEMES } from './themes'

// Apply the saved theme before first paint to avoid a flash of defaults.
// (User themes load async later; the built-in fallback applies here.)
const stored = getStoredThemeId()
applyTheme((stored && THEMES[stored]) || THEMES[DEFAULT_THEME_ID])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
