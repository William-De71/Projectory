import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { App, AutoComplete, Badge, Button, Dropdown, Flex, Grid, Input, Layout, Menu, Tag, Tooltip, Typography, theme } from 'antd'
import {
  AppstoreOutlined, BugOutlined, EditOutlined, FileTextOutlined, GlobalOutlined, HomeOutlined,
  InboxOutlined, MoonOutlined, PlusOutlined, QuestionCircleOutlined, ReadOutlined, SearchOutlined, SettingOutlined, SunOutlined, SyncOutlined, TagOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange, useChangeListener } from '../api/client.js'
import DocEditor from './DocEditor.jsx'
import CommandPalette, { isPaletteShortcut } from './CommandPalette.jsx'
import ShortcutsHelp, { openShortcuts } from './ShortcutsHelp.jsx'
import UpdateNotice from './UpdateNotice.jsx'
import { resultPath } from '../pages/Search.jsx'
import { useTodoCounts } from './todoCounts.js'
import OfflineBanner from './OfflineBanner.jsx'
import { isTyping } from './ItemsPanel.jsx'
import { overlayOpen, useItemPanel } from './ItemPanel.jsx'
import { t } from '../i18n/index.js'

const { Sider, Header, Content } = Layout

const RELEASES_URL = 'https://github.com/William-De71/Projectory/releases'

const NEW_ITEM_KEY = 'N'
const HELP_KEY = '?'
const SAFE_BOTTOM = 'env(safe-area-inset-bottom)'
const releaseUrl = (version) => (/^\d+\.\d+\.\d+$/.test(version) ? `${RELEASES_URL}/tag/v${version}` : RELEASES_URL)

const SEARCH_TYPES = { project: 'Projet', item: 'Suivi', doc: 'Doc', github: 'GitHub' }

function GlobalSearch({ onOpenPalette }) {
  const navigate = useNavigate()
  const [options, setOptions] = useState([])
  const [value, setValue] = useState('')

  const search = async (q) => {
    setValue(q)
    if (q.trim().length < 2) return setOptions([])
    const results = await api.get(`/search?q=${encodeURIComponent(q)}`).catch(() => [])
    setOptions([{
      value: 'all',
      label: <Typography.Text type="secondary">{t('Voir tous les résultats pour « {q} »', { q: q.trim() })}</Typography.Text>,
    }, ...results.map((r) => ({
      value: `${r.type}-${r.id}`,
      result: r,
      label: (
        <Flex gap={8} align="center">
          <Tag>{t(SEARCH_TYPES[r.type])}</Tag>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
          {r.project_name && <span style={{ opacity: 0.55, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{r.project_name}</span>}
        </Flex>
      ),
    }))])
  }

  const select = (_, { result: r }) => {
    const q = value
    setValue('')
    setOptions([])
    if (!r) return navigate(`/search?q=${encodeURIComponent(q.trim())}`)
    const path = resultPath(r)
    return path ? navigate(path) : window.open(r.url, '_blank', 'noopener')
  }

  return (
    <AutoComplete value={value} options={options} onSearch={search} onSelect={select} style={{ flex: 1, maxWidth: 420, minWidth: 0 }} popupMatchSelectWidth={360}>
      <Input
        prefix={<SearchOutlined />}
        placeholder={t('Rechercher projets, bugs, specs, notes…')}
        allowClear
        suffix={<Tooltip title={t('Palette de commandes')}><Tag style={{ cursor: 'pointer', marginInlineEnd: 0, fontSize: 11 }} onClick={onOpenPalette}>{navigator.platform?.startsWith('Mac') ? '⌘K' : 'Ctrl K'}</Tag></Tooltip>}
      />
    </AutoComplete>
  )
}

// Sync button showing how fresh the data is; a dot warns about failed sources.
function SyncButton({ compact, syncing, onSync }) {
  const [status, setStatus] = useState(null)
  const refresh = useCallback(() => { api.get('/sync/status').then(setStatus).catch(() => {}) }, [])
  useEffect(() => {
    refresh()
    // Also re-renders the "x min ago" label.
    const timer = setInterval(refresh, 60_000)
    return () => clearInterval(timer)
  }, [refresh])
  useChangeListener(refresh)


  const running = syncing || status?.running
  const when = status?.last_run_at ? dayjs(status.last_run_at).fromNow() : null
  const errors = status?.errors?.length || 0
  return (
    <Tooltip
      title={(
        <Flex vertical>
          <span>{t('Synchroniser GitHub, versions et forums')}</span>
          <span style={{ opacity: 0.75 }}>{running ? t('Synchronisation en cours…') : when ? t('Dernière synchro {when}', { when }) : t('Pas encore synchronisé')}</span>
          {errors > 0 && <span style={{ opacity: 0.75 }}>{t('{n} erreur(s) à la dernière synchro', { n: errors })}</span>}
        </Flex>
      )}
    >
      <Badge dot={errors > 0} color="orange" offset={[-4, 4]}>
        <Button icon={<SyncOutlined spin={running} />} onClick={onSync} disabled={running}>
          {compact ? null : running ? t('Synchro…') : when || t('Synchroniser')}
        </Button>
      </Badge>
    </Tooltip>
  )
}

export default function AppLayout({ dark, onToggleDark, lang, onChangeLang }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const [syncing, setSyncing] = useState(false)
  const [quickNote, setQuickNote] = useState(null)
  const [palette, setPalette] = useState(false)
  const { newItem } = useItemPanel()

  // "+ New": the project of the current page is filled in.
  const projectId = Number(location.pathname.match(/^\/projects\/(\d+)/)?.[1]) || undefined
  const create = (what) => {
    if (what === 'item') return newItem({ project_id: projectId })
    if (what === 'project') return navigate('/projects?new=1')
    return setQuickNote({ type: what, project_id: projectId })
  }
  const createRef = useRef(create)
  createRef.current = create
  const [version, setVersion] = useState(null)
  useEffect(() => { api.get('/health').then((h) => setVersion(h.version)).catch(() => {}) }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (isPaletteShortcut(e)) {
        e.preventDefault()
        setPalette((open) => !open)
        return
      }
      // N: new bug / task, from any page.
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target) && !overlayOpen()) {
        e.preventDefault()
        createRef.current('item')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // Until the breakpoint is measured, guess from the window: no flash of the wrong layout.
  const screens = Grid.useBreakpoint()
  const mobile = screens.lg === undefined ? window.innerWidth < 992 : !screens.lg

  // One badge for the "To do" page: unread news, GitHub actions, green updates.
  const counts = useTodoCounts()
  const todo = counts.news + counts.github + counts.deps

  const syncAll = async () => {
    setSyncing(true)
    try {
      const res = await api.post('/sync')
      if (res.skipped) message.info(t('Une synchronisation est déjà en cours'))
      else if (res.errors?.length) message.warning(t('Synchronisation terminée avec {n} erreur(s) — voir le tableau de bord', { n: res.errors.length }))
      else message.success(t('Synchronisation terminée'))
      notifyChange()
    } catch (err) {
      message.error(err.message)
    } finally {
      setSyncing(false)
    }
  }

  const newMenu = [
    { key: 'item', icon: <BugOutlined />, label: t('Bug / tâche'), extra: NEW_ITEM_KEY },
    { key: 'note', icon: <EditOutlined />, label: t('Note') },
    { key: 'spec', icon: <FileTextOutlined />, label: t('Spécification') },
    { type: 'divider' },
    { key: 'project', icon: <AppstoreOutlined />, label: t('Projet') },
  ]
  const prefsMenu = [
    { key: 'theme', icon: dark ? <SunOutlined /> : <MoonOutlined />, label: dark ? t('Thème clair') : t('Thème sombre') },
    { key: 'lang', icon: <GlobalOutlined />, label: lang === 'fr' ? 'English' : 'Français' },
    { key: 'shortcuts', icon: <QuestionCircleOutlined />, label: t('Raccourcis clavier'), extra: HELP_KEY },
    { type: 'divider' },
    { key: 'settings', icon: <SettingOutlined />, label: t('Tous les paramètres') },
    // No sidebar on phones: the version moves here.
    ...(mobile && version ? [{ key: 'version', icon: <TagOutlined />, label: t('Notes de version') + ` · ${/^\d/.test(version) ? `v${version}` : version}` }] : []),
  ]
  const onPrefs = ({ key }) => {
    if (key === 'theme') onToggleDark()
    else if (key === 'lang') onChangeLang(lang === 'fr' ? 'en' : 'fr')
    else if (key === 'shortcuts') openShortcuts()
    else if (key === 'version') window.open(releaseUrl(version), '_blank', 'noopener')
    else navigate('/settings')
  }

  const items = [
    { key: '/', icon: <HomeOutlined />, label: t('Accueil') },
    { key: '/inbox', icon: <InboxOutlined />, label: <Flex justify="space-between" align="center">{t('À traiter') + ' '}<Badge count={todo} size="small" title={t('Non lus, actions GitHub et mises à jour prêtes à fusionner')} /></Flex> },
    { key: '/projects', icon: <AppstoreOutlined />, label: t('Projets') },
    { key: '/items', icon: <BugOutlined />, label: t('Bugs & tâches') },
    { key: '/notes', icon: <ReadOutlined />, label: t('Notes & specs') },
  ]
  const selected = items.map((i) => i.key).filter((k) => k !== '/' && location.pathname.startsWith(k))[0] || (location.pathname === '/' ? '/' : '')
  // Phones: the same five entries as a tab bar at the bottom of the screen.
  const tabBar = [
    { key: '/', icon: <HomeOutlined />, label: t('Accueil') },
    { key: '/inbox', icon: <Badge count={todo} size="small" offset={[6, 0]}><InboxOutlined style={{ fontSize: 20 }} /></Badge>, label: t('À traiter') },
    { key: '/projects', icon: <AppstoreOutlined />, label: t('Projets') },
    { key: '/items', icon: <BugOutlined />, label: t('Tâches') },
    { key: '/notes', icon: <ReadOutlined />, label: t('Notes') },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* "light" Sider follows the dark algorithm too; its "dark" theme is a fixed navy blue. */}
      {/* Sticky so the menu and the version stay in view on long pages. */}
      {!mobile && (
        <Sider
          width={230}
          theme="light"
          style={{ borderRight: `1px solid ${token.colorBorderSecondary}`, position: 'sticky', top: 0, height: '100vh', zIndex: 10 }}
        >
          <Flex vertical style={{ height: '100%' }}>
            <div style={{ padding: '18px 20px', fontWeight: 700, fontSize: 18 }}><img src="/icons/icon.svg" alt="" width={24} height={24} style={{ verticalAlign: '-5px', marginRight: 8 }} />Projectory</div>
            <Menu mode="inline" selectedKeys={[selected]} items={items} onClick={({ key }) => navigate(key)} style={{ borderInlineEnd: 0, flex: 1, overflowY: 'auto' }} />
            {version && (
              <Flex vertical gap={4} style={{ padding: '12px 20px', fontSize: 12, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
                <a
                  href={releaseUrl(version)}
                  target="_blank"
                  rel="noreferrer"
                  title={t('Notes de version')}
                  style={{ color: token.colorTextTertiary }}
                >
                  {/^\d/.test(version) ? `v${version}` : version}
                </a>
                <UpdateNotice />
              </Flex>
            )}
          </Flex>
        </Sider>
      )}
      <Layout>
        <Header style={{ background: token.colorBgContainer, padding: mobile ? '0 12px' : '0 16px', lineHeight: 'normal', borderBottom: `1px solid ${token.colorBorderSecondary}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <GlobalSearch onOpenPalette={() => setPalette(true)} />
          <Flex gap={8} style={{ marginLeft: 'auto' }}>
            <Dropdown menu={{ items: newMenu, onClick: ({ key }) => create(key) }} trigger={['click']}>
              <Button type="primary" icon={<PlusOutlined />} aria-label={t('Nouveau')}>{mobile ? null : t('Nouveau')}</Button>
            </Dropdown>
            <SyncButton compact={mobile} syncing={syncing} onSync={syncAll} />
            <Dropdown menu={{ items: prefsMenu, onClick: onPrefs }} trigger={['click']}>
              <Button icon={<SettingOutlined />} aria-label={t('Préférences')} />
            </Dropdown>
          </Flex>
        </Header>
        <OfflineBanner />
        <Content style={{ padding: mobile ? `12px 12px calc(76px + ${SAFE_BOTTOM})` : 24, maxWidth: 1400, width: '100%', margin: '0 auto' }}>
          {mobile && <UpdateNotice />}
          <Outlet />
        </Content>
      </Layout>
      {mobile && (
        <nav
          aria-label={t('Navigation')}
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20, display: 'flex',
            paddingBottom: SAFE_BOTTOM, background: token.colorBgContainer, borderTop: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          {tabBar.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => navigate(tab.key)}
              aria-current={selected === tab.key ? 'page' : undefined}
              style={{
                flex: 1, height: 56, border: 0, background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                fontSize: 11, color: selected === tab.key ? token.colorPrimary : token.colorTextSecondary,
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1, color: 'inherit' }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      )}
      <ShortcutsHelp />
      <DocEditor doc={quickNote} withProjectPicker onClose={() => setQuickNote(null)} onSaved={() => { setQuickNote(null); notifyChange() }} />
      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        actions={{
          newItem: () => create('item'),
          quickNote: () => create('note'),
          newSpec: () => create('spec'),
          sync: syncAll,
          toggleDark: onToggleDark,
          toggleLang: () => onChangeLang(lang === 'fr' ? 'en' : 'fr'),
          shortcuts: openShortcuts,
        }}
      />
    </Layout>
  )
}
