import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { App as AntApp, ConfigProvider, theme } from 'antd'
import frFR from 'antd/locale/fr_FR'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import relativeTime from 'dayjs/plugin/relativeTime'
import utc from 'dayjs/plugin/utc'
import AppLayout from './components/AppLayout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Projects from './pages/Projects.jsx'
import ProjectDetail from './pages/ProjectDetail.jsx'
import Inbox from './pages/Inbox.jsx'
import Items from './pages/Items.jsx'
import Notes from './pages/Notes.jsx'
import TimeTracking from './pages/TimeTracking.jsx'
import Settings from './pages/Settings.jsx'

dayjs.extend(relativeTime)
dayjs.extend(utc)
dayjs.locale('fr')

function readDark() {
  try {
    const saved = localStorage.getItem('projectory:dark')
    if (saved !== null) return saved === '1'
  } catch { /* storage unavailable */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export default function App() {
  const [dark, setDark] = useState(readDark)
  const toggleDark = () => {
    setDark((d) => {
      try { localStorage.setItem('projectory:dark', d ? '0' : '1') } catch { /* ignore */ }
      return !d
    })
  }

  return (
    <ConfigProvider locale={frFR} theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
      <AntApp>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout dark={dark} onToggleDark={toggleDark} />}>
              <Route index element={<Dashboard />} />
              <Route path="projects" element={<Projects />} />
              <Route path="projects/:id" element={<ProjectDetail />} />
              <Route path="projects/:id/:tab" element={<ProjectDetail />} />
              <Route path="inbox" element={<Inbox />} />
              <Route path="items" element={<Items />} />
              <Route path="notes" element={<Notes />} />
              <Route path="time" element={<TimeTracking />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}
