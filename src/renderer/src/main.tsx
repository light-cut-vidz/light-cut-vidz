import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ChangelogModal from './components/ChangelogModal'
import { LangProvider } from './i18n'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LangProvider>
      <App />
      <ChangelogModal />
    </LangProvider>
  </React.StrictMode>
)
