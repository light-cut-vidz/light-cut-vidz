import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AboutModal from './components/AboutModal'
import ChangelogModal from './components/ChangelogModal'
import UpdateBanner from './components/UpdateBanner'
import QueueManager from './components/QueueManager'
import { LangProvider } from './i18n'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LangProvider>
      <App />
      <AboutModal />
      <ChangelogModal />
      <UpdateBanner />
      <QueueManager />
    </LangProvider>
  </React.StrictMode>
)
