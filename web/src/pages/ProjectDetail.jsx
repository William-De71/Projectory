import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, App, Badge, Button, Card, Descriptions, Empty, Flex, Result, Spin, Table, Tabs, Tag, Tooltip, Typography } from 'antd'
import { ArrowLeftOutlined, EditOutlined, GithubOutlined, GlobalOutlined, LinkOutlined, StarOutlined, SyncOutlined, WarningOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange, useApi } from '../api/client.js'
import { PROJECT_STATUS } from '../components/labels.js'
import { CategoryTag, LabelTag } from '../components/Tags.jsx'
import Markdown from '../components/Markdown.jsx'
import ProjectForm from '../components/ProjectForm.jsx'
import ItemsPanel from '../components/ItemsPanel.jsx'
import GithubPanel from '../components/GithubPanel.jsx'
import DocsPanel from '../components/DocsPanel.jsx'
import InboxList from '../components/InboxList.jsx'
import TimePanel from '../components/TimePanel.jsx'
import { compareVersions } from '../components/versions.js'

const VERSION_LABELS = { github: 'GitHub', npm: 'npm', docker: 'Docker Hub' }

function Overview({ project: p }) {
  const versions = p.versions || []
  return (
    <Flex vertical gap={16}>
      {p.sync_error && <Alert type="warning" showIcon message="Erreurs à la dernière synchro" description={<pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{p.sync_error}</pre>} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Card size="small" title="Description">
          {p.description ? <Markdown>{p.description}</Markdown> : <Typography.Text type="secondary">Pas de description</Typography.Text>}
          {!!p.tags?.length && <Flex gap={4} wrap style={{ marginTop: 8 }}>{p.tags.map((t) => <Tag key={t}>{t}</Tag>)}</Flex>}
        </Card>
        <Card size="small" title="Liens">
          <Flex vertical gap={6}>
            {p.repo && <a href={`https://github.com/${p.repo}`} target="_blank" rel="noreferrer"><GithubOutlined /> {p.repo}</a>}
            {p.homepage && <a href={p.homepage} target="_blank" rel="noreferrer"><GlobalOutlined /> {p.homepage}</a>}
            {(p.links || []).filter((l) => l?.url).map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noreferrer"><LinkOutlined /> {l.label || l.url}</a>
            ))}
            {!p.repo && !p.homepage && !p.links?.length && <Typography.Text type="secondary">Aucun lien</Typography.Text>}
          </Flex>
        </Card>
        {p.github && (
          <Card size="small" title="GitHub">
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="Étoiles"><StarOutlined /> {p.github.stars}</Descriptions.Item>
              <Descriptions.Item label="Dernier push">{p.github.pushed_at ? dayjs(p.github.pushed_at).fromNow() : '—'}</Descriptions.Item>
              <Descriptions.Item label="Branche">{p.github.default_branch}</Descriptions.Item>
              {p.github.language && <Descriptions.Item label="Langage">{p.github.language}</Descriptions.Item>}
              {p.github.archived && <Descriptions.Item label="État"><Tag color="red">Archivé</Tag></Descriptions.Item>}
            </Descriptions>
          </Card>
        )}
      </div>
      <Card size="small" title={<>Versions {p.deployed_version && <Tag style={{ marginLeft: 8 }}>utilisée : {p.deployed_version}</Tag>}</>}>
        {versions.length ? (
          <Table
            rowKey={(v) => `${v.type}:${v.ref}`}
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
            dataSource={versions}
            columns={[
              { title: 'Source', render: (_, v) => <>{VERSION_LABELS[v.type] || v.type} <Typography.Text type="secondary">{v.ref || p.repo}</Typography.Text></> },
              {
                title: 'Dernière version',
                render: (_, v) => v.error ? <Tooltip title={v.error}><Tag color="red">erreur</Tag></Tooltip> : (
                  <Flex gap={6} align="center">
                    {v.url ? <a href={v.url} target="_blank" rel="noreferrer">{v.version}</a> : v.version}
                    {p.deployed_version && v.version && compareVersions(v.version, p.deployed_version) > 0 && <Tag color="orange"><WarningOutlined /> à mettre à jour</Tag>}
                  </Flex>
                ),
              },
              { title: 'Publiée', render: (_, v) => (v.published_at ? dayjs(v.published_at).format('DD/MM/YYYY') : '—') },
              { title: 'Vérifiée', responsive: ['md'], render: (_, v) => (v.checked_at ? dayjs(v.checked_at).fromNow() : '—') },
            ]}
          />
        ) : (
          <Typography.Text type="secondary">Aucune source de version — ajoute-en dans « Modifier » (GitHub, npm, Docker Hub).</Typography.Text>
        )}
      </Card>
    </Flex>
  )
}

export default function ProjectDetail() {
  const { id, tab = 'overview' } = useParams()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [editing, setEditing] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const { data: p, error, loading, reload, setData } = useApi(`/projects/${id}`, { listen: true })
  const inbox = useApi(`/inbox?project_id=${id}`, { listen: true })

  if (error) return <Result status="404" title="Projet introuvable" extra={<Button onClick={() => navigate('/projects')}>Retour</Button>} />
  if (!p) return <Spin spinning={loading}><div style={{ height: 200 }} /></Spin>

  const sync = async () => {
    setSyncing(true)
    try {
      const res = await api.post(`/projects/${id}/sync`)
      setData(res.project)
      if (res.errors.length) message.warning('Synchro terminée avec des erreurs')
      else message.success('Projet synchronisé')
      notifyChange()
    } catch (err) {
      message.error(err.message)
    } finally {
      setSyncing(false)
    }
  }

  const markAllRead = async () => {
    await api.post('/inbox/read-all', { project_id: Number(id) })
    notifyChange()
  }

  const tabs = [
    { key: 'overview', label: 'Aperçu', children: <Overview project={p} /> },
    { key: 'items', label: <>Bugs & tâches <Badge count={p.open_items} size="small" color="blue" /></>, children: <ItemsPanel projectId={id} /> },
    { key: 'github', label: <>GitHub <Badge count={p.open_issues + p.open_prs} size="small" color="geekblue" /></>, children: <GithubPanel projectId={id} repo={p.repo} /> },
    { key: 'specs', label: 'Spécifications', children: <DocsPanel projectId={id} type="spec" /> },
    { key: 'notes', label: 'Notes', children: <DocsPanel projectId={id} type="note" /> },
    {
      key: 'inbox',
      label: <>Activité <Badge count={p.unread} size="small" /></>,
      children: (
        <Flex vertical gap={8}>
          {p.unread > 0 && <Button style={{ alignSelf: 'end' }} onClick={markAllRead}>Tout marquer comme lu</Button>}
          {inbox.data?.length || inbox.loading ? <InboxList entries={inbox.data} loading={inbox.loading} onChange={() => { inbox.reload(); reload() }} showProject={false} /> : <Empty description="Aucune activité — configure GitHub / forums / versions puis synchronise" />}
        </Flex>
      ),
    },
    { key: 'time', label: 'Temps', children: <TimePanel projectId={id} /> },
  ]

  return (
    <Flex vertical gap={16}>
      <Flex gap={12} align="center" wrap>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')} />
        <Typography.Title level={3} style={{ margin: 0 }}>{p.name}</Typography.Title>
        <CategoryTag name={p.category_name} color={p.category_color} />
        <LabelTag map={PROJECT_STATUS} value={p.status} />
        {p.client && <Tag>{p.client}</Tag>}
        {p.outdated && <Tag color="orange" icon={<WarningOutlined />}>Mise à jour disponible</Tag>}
        <Flex gap={8} style={{ marginLeft: 'auto' }} align="center">
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {p.last_synced_at ? `Synchro ${dayjs.utc(p.last_synced_at).local().fromNow()}` : 'Jamais synchronisé'}
          </Typography.Text>
          <Button icon={<SyncOutlined spin={syncing} />} onClick={sync} disabled={syncing}>Synchroniser</Button>
          <Button type="primary" icon={<EditOutlined />} onClick={() => setEditing(p)}>Modifier</Button>
        </Flex>
      </Flex>
      <Tabs activeKey={tab} onChange={(key) => navigate(`/projects/${id}/${key}`)} items={tabs} destroyOnHidden />
      <ProjectForm project={editing} onClose={() => setEditing(null)} onSaved={(saved) => { setEditing(null); if (saved) setData(saved); else navigate('/projects') }} />
    </Flex>
  )
}
