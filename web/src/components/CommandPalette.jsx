import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Empty, Flex, Input, Modal, Tag, theme, Typography } from 'antd'
import {
  AppstoreOutlined, BugOutlined, CheckSquareOutlined, GithubOutlined, ClockCircleOutlined, CloudDownloadOutlined, DeploymentUnitOutlined, EditOutlined, FileTextOutlined,
  GlobalOutlined, HomeOutlined, InboxOutlined, MoonOutlined, PlusOutlined, QuestionCircleOutlined, ReadOutlined, RocketOutlined, SearchOutlined, SettingOutlined, SyncOutlined,
} from '@ant-design/icons'
import { api } from '../api/client.js'
import { t } from '../i18n/index.js'
import { resultPath } from '../pages/Search.jsx'

const SEARCH_TYPES = { project: 'Projet', item: 'Suivi', doc: 'Doc', github: 'GitHub' }
const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export const isPaletteShortcut = (e) => (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'

// Ctrl+K / ⌘K: jump to a page or a project, search, or run an action.
export default function CommandPalette({ open, onClose, actions }) {
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const [q, setQ] = useState('')
  const [projects, setProjects] = useState([])
  const [results, setResults] = useState([])
  const [active, setActive] = useState(0)
  const listRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setQ('')
    setResults([])
    setActive(0)
    api.get('/projects').then(setProjects).catch(() => {})
  }, [open])

  // Debounced full-text search once two characters are typed.
  useEffect(() => {
    if (q.trim().length < 2) return setResults([])
    const timer = setTimeout(() => api.get(`/search?q=${encodeURIComponent(q.trim())}`).then(setResults).catch(() => {}), 150)
    return () => clearTimeout(timer)
  }, [q])

  const entries = useMemo(() => {
    const needle = normalize(q.trim())
    const match = (text) => !needle || normalize(text).includes(needle)
    const pages = [
      { label: t('Accueil'), icon: <HomeOutlined />, run: () => navigate('/'), keywords: `${t('Aujourd’hui')} ${t('Tableau de bord')}` },
      { label: t('À traiter'), icon: <InboxOutlined />, run: () => navigate('/inbox'), keywords: t('Boîte de réception') },
      { label: t('Nouveautés'), hint: t('À traiter'), icon: <InboxOutlined />, run: () => navigate('/inbox/news'), keywords: t('Boîte de réception') },
      { label: t('Mon GitHub'), hint: t('À traiter'), icon: <GithubOutlined />, run: () => navigate('/inbox/github') },
      { label: t('Dépendances'), hint: t('À traiter'), icon: <DeploymentUnitOutlined />, run: () => navigate('/inbox/deps'), keywords: 'dependabot renovate' },
      { label: t('À publier'), hint: t('À traiter'), icon: <RocketOutlined />, run: () => navigate('/inbox/releases'), keywords: 'release version workflow' },
      { label: t('Revue de la semaine'), icon: <CheckSquareOutlined />, run: () => navigate('/review'), keywords: t('tâches qui traînent') },
      { label: t('Projets'), icon: <AppstoreOutlined />, run: () => navigate('/projects') },
      { label: t('Bugs & tâches'), icon: <BugOutlined />, run: () => navigate('/items') },
      { label: t('Notes & specs'), icon: <ReadOutlined />, run: () => navigate('/notes') },
      { label: t('Temps passé'), hint: t('Paramètres'), icon: <ClockCircleOutlined />, run: () => navigate('/settings/time') },
      { label: t('Paramètres'), icon: <SettingOutlined />, run: () => navigate('/settings') },
      { label: t('Recherche'), icon: <SearchOutlined />, run: () => navigate('/search') },
    ].map((e) => ({ ...e, group: t('Aller à') }))
    const commands = [
      { label: t('Nouveau bug / tâche'), icon: <PlusOutlined />, run: actions.newItem },
      { label: t('Note rapide'), icon: <EditOutlined />, run: actions.quickNote },
      { label: t('Nouvelle spécification'), icon: <FileTextOutlined />, run: actions.newSpec },
      { label: t('Nouveau projet'), icon: <PlusOutlined />, run: () => navigate('/projects?new=1') },
      { label: t('Importer des dépôts'), icon: <CloudDownloadOutlined />, run: () => navigate('/projects?import=1') },
      { label: t('Synchroniser GitHub, versions et forums'), icon: <SyncOutlined />, run: actions.sync },
      { label: t('Changer de thème (clair / sombre)'), icon: <MoonOutlined />, run: actions.toggleDark },
      { label: t('Passer en anglais / français'), icon: <GlobalOutlined />, run: actions.toggleLang, keywords: 'language langue english français' },
      { label: t('Raccourcis clavier'), icon: <QuestionCircleOutlined />, run: actions.shortcuts, keywords: 'clavier keyboard aide help ?' },
    ].map((e) => ({ ...e, group: t('Actions') }))
    const projectEntries = projects.map((p) => ({ label: p.name, hint: p.client || p.category_name, icon: <AppstoreOutlined />, group: t('Projets'), run: () => navigate(`/projects/${p.id}`) }))
    const searchEntries = results.filter((r) => r.type !== 'project').map((r) => ({
      label: r.title,
      hint: r.project_name,
      tag: t(SEARCH_TYPES[r.type]),
      icon: <SearchOutlined />,
      group: t('Résultats'),
      always: true,
      run: () => {
        const path = resultPath(r)
        return path ? navigate(path) : window.open(r.url, '_blank', 'noopener')
      },
    }))
    if (q.trim().length >= 2) {
      searchEntries.unshift({ label: t('Voir tous les résultats pour « {q} »', { q: q.trim() }), icon: <SearchOutlined />, group: t('Résultats'), always: true, run: () => navigate(`/search?q=${encodeURIComponent(q.trim())}`) })
    }
    const filtered = [...commands, ...pages, ...projectEntries].filter((e) => match(`${e.label} ${e.hint || ''} ${e.keywords || ''}`))
    return [...filtered.slice(0, needle ? 12 : 8 + 9), ...searchEntries.slice(0, 10)]
  }, [q, projects, results, actions, navigate])

  useEffect(() => setActive(0), [q])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (entry) => {
    if (!entry) return
    onClose()
    entry.run?.()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, entries.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); run(entries[active]) }
  }

  let lastGroup = null
  return (
    <Modal open={open} onCancel={onClose} footer={null} closable={false} width={620} style={{ top: 80 }} styles={{ body: { padding: 0 } }} destroyOnHidden>
      <Input
        autoFocus
        size="large"
        variant="borderless"
        prefix={<SearchOutlined style={{ opacity: 0.5 }} />}
        placeholder={t('Aller à, chercher, créer… (↑ ↓ pour choisir, Entrée pour valider)')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}
      />
      <div ref={listRef} role="listbox" style={{ maxHeight: 420, overflowY: 'auto', padding: 6 }}>
        {!entries.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Aucun résultat')} />}
        {entries.map((e, i) => {
          const header = e.group !== lastGroup ? e.group : null
          lastGroup = e.group
          return (
            <div key={`${e.group}-${e.label}-${i}`}>
              {header && <Typography.Text type="secondary" style={{ display: 'block', fontSize: 11, padding: '8px 10px 2px', textTransform: 'uppercase', letterSpacing: 0.4 }}>{header}</Typography.Text>}
              <Flex
                role="option"
                aria-selected={i === active}
                data-index={i}
                gap={10}
                align="center"
                onMouseMove={() => setActive(i)}
                onClick={() => run(e)}
                style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', background: i === active ? token.colorPrimaryBg : 'transparent' }}
              >
                <span style={{ opacity: 0.65 }}>{e.icon}</span>
                <Typography.Text ellipsis style={{ flex: 1 }}>{e.label}</Typography.Text>
                {e.tag && <Tag style={{ marginInlineEnd: 0 }}>{e.tag}</Tag>}
                {e.hint && <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>{e.hint}</Typography.Text>}
              </Flex>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
