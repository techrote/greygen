import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './styles/base.css'
import './styles/animation.css'
import './styles/presets.css'
import './styles/analyzer.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Greygen root element was not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
