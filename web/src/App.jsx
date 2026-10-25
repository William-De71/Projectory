import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { App as AntApp, ConfigProvider, theme } from 'antd'
import frFR from 'antd/locale/fr_FR'
import enUS from 'antd/locale/en_US'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import 'dayjs/locale/en'
import relativeTime from 'dayjs/plugin/relativeTime'
import utc from 'dayjs/plugin/utc'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import { api } from './api/client.js'
import { getLang, hasSavedLang, setLang as storeLang } from './i18n/index.js'
import AppLayout from './components/AppLayout.jsx'
import { ItemPanelProvider } from './components/ItemPanel.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Today from './pages/Today.jsx'
import MyGithub from './pages/MyGithub.jsx'
import Projects from './pages/Projects.jsx'
import ProjectDetail from './pages/ProjectDetail.jsx'
import Inbox from './pages/Inbox.jsx'
import Items from './pages/Items.jsx'
import Notes from './pages/Notes.jsx'
import TimeTracking from './pages/TimeTracking.jsx'
import Settings from './pages/Settings.jsx'
import Dependencies from './pages/Dependencies.jsx'
import Search from './pages/Search.jsx'

dayjs.extend(relativeTime)
dayjs.extend(utc)
dayjs.extend(localizedFormat)
dayjs.locale(getLang())

const ANTD_LOCALES = { fr: frFR, en: enUS }

function readDark() {
  try {
    const saved = localStorage.getItem('projectory:dark')
    if (saved !== null) return saved === '1'
  } catch { /* storage unavailable */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export default function App() {
  const [dark, setDark] = useState(readDark)
  const [lang, setLangState] = useState(getLang)

  const changeLang = (next, { persist = true } = {}) => {
    storeLang(next)
    dayjs.locale(next)
    document.documentElement.lang = next
    setLangState(next)
    // The server writes changelogs, notifications and inbox titles in this language.
    if (persist) api.put('/settings/locale', { lang: next }).catch(() => {})
  }

  // First visit on this browser: follow the language saved on the server.
  useEffect(() => {
    document.documentElement.lang = getLang()
    api.get('/settings/locale').then(({ lang: serverLang }) => {
      if (!hasSavedLang() && serverLang && serverLang !== getLang()) changeLang(serverLang, { persist: false })
      else if (serverLang !== getLang()) api.put('/settings/locale', { lang: getLang() }).catch(() => {})
    }).catch(() => {})
  }, [])
  const toggleDark = () => {
    setDark((d) => {
      try { localStorage.setItem('projectory:dark', d ? '0' : '1') } catch { /* ignore */ }
      return !d
    })
  }

  return (
    <ConfigProvider locale={ANTD_LOCALES[lang]} theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
      {/* Remount on language change: texts are translated at render time. */}
      <AntApp key={lang}>
        <BrowserRouter>
          <ItemPanelProvider>
            <Routes>
              <Route element={<AppLayout dark={dark} onToggleDark={toggleDark} lang={lang} onChangeLang={changeLang} />}>
                <Route index element={<Dashboard />} />
                <Route path="today" element={<Today />} />
                <Route path="mine" element={<MyGithub />} />
                <Route path="projects" element={<Projects />} />
                <Route path="projects/:id" element={<ProjectDetail />} />
                <Route path="projects/:id/:tab" element={<ProjectDetail />} />
                <Route path="inbox" element={<Inbox />} />
                <Route path="items" element={<Items />} />
                <Route path="notes" element={<Notes />} />
                <Route path="time" element={<TimeTracking />} />
                <Route path="settings" element={<Settings />} />
                <Route path="deps" element={<Dependencies />} />
                <Route path="search" element={<Search />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </ItemPanelProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}
