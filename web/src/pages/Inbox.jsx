import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, Button, Empty, Flex, List, Segmented, Spin, Tabs, Tag, Typography } from 'antd'
import { api, notifyChange, useApi } from '../api/client.js'
import InboxList from '../components/InboxList.jsx'
import ProjectSelect from '../components/ProjectSelect.jsx'
import StaleTag from '../components/StaleTag.jsx'
import { refLabel } from '../components/labels.js'
import { useTodoCounts } from '../components/todoCounts.js'
import MyGithub from './MyGithub.jsx'
import Dependencies from './Dependencies.jsx'
import Releases from './Releases.jsx'
import { t } from '../i18n/index.js'

// News found by the syncs, read / unread.
function News() {
  const [scope, setScope] = useState('unread')
  const [source, setSource] = useState('all')
  const [projectId, setProjectId] = useState(null)
  const query = new URLSearchParams()
  if (scope === 'unread') query.set('unread', '1')
  if (source !== 'all') query.set('source', source)
  if (projectId) query.set('project_id', projectId)
  const { data, loading, reload } = useApi(`/inbox?${query}`, { listen: true })

  const markAll = async () => {
    await api.post('/inbox/read-all', { project_id: projectId, source: source === 'all' ? undefined : source })
    notifyChange()
  }

  return (
    <Flex vertical gap={16}>
      <Typography.Text type="secondary">{t(
        'Nouvelles issues et PR/MR, CI, notifications GitHub perso, nouvelles versions publiées et nouveaux sujets de forum détectés à chaque synchro.'
      )}</Typography.Text>
      <Flex gap={8} wrap>
        <Segmented value={scope} onChange={setScope} options={[{ value: 'unread', label: t('Non lus') }, { value: 'all', label: t('Tout') }]} />
        <Segmented
          value={source}
          onChange={setSource}
          options={[{ value: 'all', label: t('Toutes sources') }, { value: 'repo', label: t('Dépôts') }, { value: 'forum', label: t('Forums') }, { value: 'version', label: t('Versions') }]}
        />
        <ProjectSelect allowClear value={projectId} onChange={setProjectId} style={{ width: 220 }} placeholder={t('Tous les projets')} />
        <Button style={{ marginLeft: 'auto' }} onClick={markAll} disabled={!data?.some((x) => !x.read_at)}>{t('Tout marquer comme lu')}</Button>
      </Flex>
      <InboxList entries={data} loading={loading} onChange={reload} />
    </Flex>
  )
}

// Issues without an answer and PRs without activity (thresholds in the settings).
function Stale() {
  const navigate = useNavigate()
  const { data, loading } = useApi('/stale', { listen: true })
  return (
    <Flex vertical gap={16}>
      <Flex gap={12} wrap align="center">
        <Typography.Text type="secondary">{t('Issues sans réponse et PR / MR sans activité')}</Typography.Text>
        <Button type="link" style={{ marginLeft: 'auto', padding: 0 }} onClick={() => navigate('/settings')}>{t('Réglages')}</Button>
      </Flex>
      <List
        loading={loading}
        dataSource={data?.items || []}
        locale={{ emptyText: <Empty description={t('Rien ne dort 👌')} /> }}
        renderItem={(s) => (
          <List.Item>
            <Flex vertical gap={2} style={{ minWidth: 0, width: '100%' }}>
              <a href={s.url} target="_blank" rel="noreferrer"><Typography.Text ellipsis style={{ color: 'inherit' }}>{refLabel(s.forge, s.type, s.number)} {s.title}</Typography.Text></a>
              <Flex gap={4} wrap>
                <Tag>{s.project_name}</Tag>
                <StaleTag item={s} />
              </Flex>
            </Flex>
          </List.Item>
        )}
      />
    </Flex>
  )
}

const TABS = [
  { key: 'news', label: 'Nouveautés', Panel: News },
  { key: 'github', label: 'Mon GitHub', color: 'magenta', title: 'Reviews à faire et PR qui demandent une action', Panel: MyGithub },
  { key: 'deps', label: 'Dépendances', color: 'green', title: 'Mises à jour au vert, prêtes à fusionner', Panel: Dependencies },
  { key: 'releases', label: 'À publier', color: 'orange', title: 'Releases en échec, bloquées ou à lancer', Panel: Releases },
  { key: 'stale', label: 'En attente', color: 'gray', Panel: Stale },
]

// Everything that waits for the user, one tab per kind. Without a tab in the
// URL, opens the first one with something to do.
export default function Inbox() {
  const { tab } = useParams()
  const navigate = useNavigate()
  const counts = useTodoCounts()
  const chosen = TABS.some((x) => x.key === tab) ? tab : null
  if (!chosen && !counts.loaded) return <Spin><div style={{ height: 300 }} /></Spin>
  const active = chosen || (TABS.find((x) => x.key !== 'stale' && counts[x.key]) || TABS[0]).key

  return (
    <Flex vertical gap={8}>
      <Typography.Title level={3} style={{ margin: 0 }}>{t('À traiter')}</Typography.Title>
      <Tabs
        activeKey={active}
        onChange={(key) => navigate(`/inbox/${key}`)}
        destroyOnHidden
        items={TABS.map(({ key, label, color, title, Panel }) => ({
          key,
          label: <Flex gap={6} align="center">{t(label)}<Badge count={counts[key]} size="small" color={color} title={title && t(title)} /></Flex>,
          children: <Panel />,
        }))}
      />
    </Flex>
  )
}
