import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { App, AutoComplete, Badge, Button, Flex, Grid, Input, Layout, Menu, Segmented, Tag, Tooltip, theme } from 'antd'
import {
  AppstoreOutlined, BugOutlined, ClockCircleOutlined, DashboardOutlined, EditOutlined,
  InboxOutlined, MoonOutlined, ReadOutlined, SearchOutlined, SettingOutlined, SunOutlined, SyncOutlined,
} from '@ant-design/icons'
import { api, notifyChange, useChangeListener } from '../api/client.js'
import DocEditor from './DocEditor.jsx'
import { t } from '../i18n/index.js'

const { Sider, Header, Content } = Layout

const SEARCH_TYPES = { project: 'Projet', item: 'Suivi', doc: 'Doc', github: 'GitHub' }

function GlobalSearch() {
  const navigate = useNavigate()
  const [options, setOptions] = useState([])
  const [value, setValue] = useState('')

  const search = async (q) => {
    setValue(q)
    if (q.trim().length < 2) return setOptions([])
    const results = await api.get(`/search?q=${encodeURIComponent(q)}`).catch(() => [])
    setOptions(results.map((r) => ({
      value: `${r.type}-${r.id}`,
      result: r,
      label: (
        <Flex gap={8} align="center">
          <Tag>{t(SEARCH_TYPES[r.type])}</Tag>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
          {r.project_name && <span style={{ opacity: 0.55, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{r.project_name}</span>}
        </Flex>
      ),
    })))
  }

  const select = (_, { result: r }) => {
    setValue('')
    setOptions([])
    if (r.type === 'github') return window.open(r.url, '_blank', 'noopener')
    if (r.type === 'project') return navigate(`/projects/${r.id}`)
    if (r.type === 'item') return navigate(`/projects/${r.project_id}/items`)
    if (r.type === 'doc') return navigate(r.project_id ? `/projects/${r.project_id}/${r.kind === 'spec' ? 'specs' : 'notes'}?doc=${r.id}` : `/notes?doc=${r.id}`)
  }

  return (
    <AutoComplete value={value} options={options} onSearch={search} onSelect={select} style={{ flex: 1, maxWidth: 420, minWidth: 0 }} popupMatchSelectWidth={360}>
      <Input prefix={<SearchOutlined />} placeholder={t('Rechercher projets, bugs, specs, notes…')} allowClear />
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
  const screens = Grid.useBreakpoint()
  const mobile = !screens.lg

  const refreshUnread = useCallback(() => {
    api.get('/inbox?unread=1&limit=1000').then((rows) => setUnread(rows.length)).catch(() => {})
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
    { key: '/projects', icon: <AppstoreOutlined />, label: t('Projets') },
    { key: '/inbox', icon: <InboxOutlined />, label: <Flex justify="space-between" align="center">{t('Boîte de réception') + ' '}<Badge count={unread} size="small" /></Flex> },
    { key: '/items', icon: <BugOutlined />, label: t('Bugs & tâches') },
    { key: '/notes', icon: <ReadOutlined />, label: t('Notes & specs') },
    { key: '/time', icon: <ClockCircleOutlined />, label: t('Temps passé') },
    { key: '/settings', icon: <SettingOutlined />, label: t('Paramètres') },
  ]
  const selected = items.map((i) => i.key).filter((k) => k !== '/' && location.pathname.startsWith(k))[0] || '/'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0" width={230} zeroWidthTriggerStyle={{ top: 12, zIndex: 20 }} theme={dark ? 'dark' : 'light'} style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}>
        <div style={{ padding: '18px 20px', fontWeight: 700, fontSize: 18 }}>{t('🗂️ Projectory')}</div>
        <Menu mode="inline" selectedKeys={[selected]} items={items} onClick={({ key }) => navigate(key)} style={{ borderInlineEnd: 0 }} />
      </Sider>
      <Layout>
        <Header style={{ background: token.colorBgContainer, padding: mobile ? t('0 12px 0 56px') : t('0 16px'), lineHeight: 'normal', borderBottom: `1px solid ${token.colorBorderSecondary}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <GlobalSearch />
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
        <Content style={{ padding: mobile ? 12 : 24, maxWidth: 1400, width: '100%', margin: '0 auto' }}>
          <Outlet />
        </Content>
      </Layout>
      <DocEditor doc={quickNote} withProjectPicker onClose={() => setQuickNote(null)} onSaved={() => { setQuickNote(null); notifyChange() }} />
    </Layout>
  )
}
