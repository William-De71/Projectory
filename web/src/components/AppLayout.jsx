import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { App, AutoComplete, Badge, Button, Flex, Grid, Input, Layout, Menu, Segmented, Tag, Tooltip, Typography, theme } from 'antd'
import {
  AppstoreOutlined, BugOutlined, ClockCircleOutlined, DashboardOutlined, DeploymentUnitOutlined, EditOutlined,
  InboxOutlined, MoonOutlined, CheckSquareOutlined, GithubOutlined, ReadOutlined, SearchOutlined, SettingOutlined, SunOutlined, SyncOutlined,
} from '@ant-design/icons'
import { api, notifyChange, useChangeListener } from '../api/client.js'
import DocEditor from './DocEditor.jsx'
import CommandPalette, { isPaletteShortcut } from './CommandPalette.jsx'
import UpdateNotice from './UpdateNotice.jsx'
import { resultPath } from '../pages/Search.jsx'
import { isGreen } from '../pages/Dependencies.jsx'
import OfflineBanner from './OfflineBanner.jsx'
import { ItemForm } from './ItemsPanel.jsx'
import { t } from '../i18n/index.js'

const { Sider, Header, Content } = Layout

const RELEASES_URL = 'https://github.com/William-De71/Projectory/releases'

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

export default function AppLayout({ dark, onToggleDark, lang, onChangeLang }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const [unread, setUnread] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [quickNote, setQuickNote] = useState(null)
  const [newItem, setNewItem] = useState(null)
  const [palette, setPalette] = useState(false)
  const [version, setVersion] = useState(null)
  useEffect(() => { api.get('/health').then((h) => setVersion(h.version)).catch(() => {}) }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (!isPaletteShortcut(e)) return
      e.preventDefault()
      setPalette((open) => !open)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const screens = Grid.useBreakpoint()
  const mobile = !screens.lg

  const [githubTodo, setGithubTodo] = useState(0)
  const [depsGreen, setDepsGreen] = useState(0)
  const refreshUnread = useCallback(() => {
    api.get('/inbox?unread=1&limit=1000').then((rows) => setUnread(rows.length)).catch(() => {})
    // "My GitHub" badge: reviews to do, and my PRs that need something from me.
    api.get('/my-github').then((rows) => setGithubTodo(rows.filter((it) => it.mine.includes('review')
      || (it.type === 'pr' && it.mine.includes('author') && (it.pr_state?.review === 'changes_requested' || it.pr_state?.conflict || it.pr_state?.ci === 'failure'))).length)).catch(() => {})
    // "Dependencies" badge: updates ready to merge.
    api.get('/dependency-prs').then((rows) => setDepsGreen(rows.filter(isGreen).length)).catch(() => {})
  }, [])
  useEffect(() => {
    refreshUnread()
    const timer = setInterval(refreshUnread, 60_000)
    return () => clearInterval(timer)
  }, [refreshUnread])
  useChangeListener(refreshUnread)

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

  const items = [
    { key: '/', icon: <DashboardOutlined />, label: t('Tableau de bord') },
    { key: '/today', icon: <CheckSquareOutlined />, label: t('Aujourd’hui') },
    { key: '/mine', icon: <GithubOutlined />, label: <Flex justify="space-between" align="center">{t('Mon GitHub') + ' '}<Badge count={githubTodo} size="small" color="magenta" title={t('Reviews à faire et PR qui demandent une action')} /></Flex> },
    { key: '/deps', icon: <DeploymentUnitOutlined />, label: <Flex justify="space-between" align="center">{t('Dépendances') + ' '}<Badge count={depsGreen} size="small" color="green" title={t('Mises à jour au vert, prêtes à fusionner')} /></Flex> },
    { key: '/projects', icon: <AppstoreOutlined />, label: t('Projets') },
    { key: '/inbox', icon: <InboxOutlined />, label: <Flex justify="space-between" align="center">{t('Boîte de réception') + ' '}<Badge count={unread} size="small" /></Flex> },
    { key: '/items', icon: <BugOutlined />, label: t('Bugs & tâches') },
    { key: '/notes', icon: <ReadOutlined />, label: t('Notes & specs') },
    { key: '/time', icon: <ClockCircleOutlined />, label: t('Temps passé') },
    { key: '/settings', icon: <SettingOutlined />, label: t('Paramètres') },
  ]
  const selected = items.map((i) => i.key).filter((k) => k !== '/' && location.pathname.startsWith(k))[0] || (location.pathname === '/' ? '/' : '')

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* "light" Sider follows the dark algorithm too; its "dark" theme is a fixed navy blue. */}
      {/* Sticky so the menu and the version stay in view on long pages. */}
      <Sider
        breakpoint="lg"
        collapsedWidth="0"
        width={230}
        zeroWidthTriggerStyle={{ top: 12, zIndex: 20 }}
        theme="light"
        style={{ borderRight: `1px solid ${token.colorBorderSecondary}`, position: 'sticky', top: 0, height: '100vh', zIndex: 10 }}
      >
        <Flex vertical style={{ height: '100%' }}>
          <div style={{ padding: '18px 20px', fontWeight: 700, fontSize: 18 }}><img src="/icons/icon.svg" alt="" width={24} height={24} style={{ verticalAlign: '-5px', marginRight: 8 }} />Projectory</div>
          <Menu mode="inline" selectedKeys={[selected]} items={items} onClick={({ key }) => navigate(key)} style={{ borderInlineEnd: 0, flex: 1, overflowY: 'auto' }} />
          {version && (
            <Flex vertical gap={4} style={{ padding: '12px 20px', fontSize: 12, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
              <a
                href={/^\d+\.\d+\.\d+$/.test(version) ? `${RELEASES_URL}/tag/v${version}` : RELEASES_URL}
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
      <Layout>
        <Header style={{ background: token.colorBgContainer, padding: mobile ? '0 12px 0 56px' : '0 16px', lineHeight: 'normal', borderBottom: `1px solid ${token.colorBorderSecondary}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <GlobalSearch onOpenPalette={() => setPalette(true)} />
          <Flex gap={8} style={{ marginLeft: 'auto' }}>
            <Tooltip title={mobile ? t('Note rapide') : null}>
              <Button icon={<EditOutlined />} onClick={() => setQuickNote({ type: 'note' })}>{mobile ? null : t('Note rapide')}</Button>
            </Tooltip>
            <Tooltip title={t('Synchroniser GitHub, versions et forums')}>
              <Button icon={<SyncOutlined spin={syncing} />} onClick={syncAll} disabled={syncing} />
            </Tooltip>
            <Segmented size="middle" value={lang} onChange={onChangeLang} options={[{ value: 'fr', label: 'FR' }, { value: 'en', label: 'EN' }]} />
            <Tooltip title={dark ? t('Thème clair') : t('Thème sombre')}>
              <Button icon={dark ? <SunOutlined /> : <MoonOutlined />} onClick={onToggleDark} />
            </Tooltip>
          </Flex>
        </Header>
        <OfflineBanner />
        <Content style={{ padding: mobile ? 12 : 24, maxWidth: 1400, width: '100%', margin: '0 auto' }}>
          <Outlet />
        </Content>
      </Layout>
      <DocEditor doc={quickNote} withProjectPicker onClose={() => setQuickNote(null)} onSaved={() => { setQuickNote(null); notifyChange() }} />
      <ItemForm item={newItem} withProjectPicker onClose={() => setNewItem(null)} onSaved={() => { setNewItem(null); notifyChange() }} />
      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        actions={{
          newItem: () => setNewItem({}),
          quickNote: () => setQuickNote({ type: 'note' }),
          newSpec: () => setQuickNote({ type: 'spec' }),
          sync: syncAll,
          toggleDark: onToggleDark,
          toggleLang: () => onChangeLang(lang === 'fr' ? 'en' : 'fr'),
        }}
      />
    </Layout>
  )
}
