import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StandaloneTerminalWindow } from './components/StandaloneWindow/StandaloneTerminalWindow.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

const urlParams = new URLSearchParams(window.location.search);
const popupTabId = urlParams.get('popupTabId');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {popupTabId ? <StandaloneTerminalWindow /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
)
