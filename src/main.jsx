import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './stores/themeStore'
import App from './App.jsx'
import { setUpServiceWorker } from './registerServiceWorker'

setUpServiceWorker();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
