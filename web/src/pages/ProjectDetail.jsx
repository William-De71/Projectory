import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, App, Badge, Button, Card, Descriptions, Empty, Flex, Result, Spin, Table, Tabs, Tag, Tooltip, Typography } from 'antd'
import { ArrowLeftOutlined, EditOutlined, GlobalOutlined, LinkOutlined, StarOutlined, SyncOutlined, WarningOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange, useApi } from '../api/client.js'
import { FORGES, PROJECT_STATUS, repoUrl } from '../components/labels.js'
import { CategoryTag, LabelTag } from '../components/Tags.jsx'
import Markdown from '../components/Markdown.jsx'
import ProjectForm from '../components/ProjectForm.jsx'
import ItemsPanel from '../components/ItemsPanel.jsx'
import GithubPanel from '../components/GithubPanel.jsx'
import RoadmapPanel from '../components/RoadmapPanel.jsx'
import StatsPanel from '../components/StatsPanel.jsx'
import ForgeIcon from '../components/ForgeIcon.jsx'
import DocsPanel from '../components/DocsPanel.jsx'
import InboxList from '../components/InboxList.jsx'
import TimePanel from '../components/TimePanel.jsx'
import { compareVersions } from '../components/versions.js'
import CiStatus, { CI } from '../components/CiStatus.jsx'
import { t } from '../i18n/index.js'

const VERSION_LABELS = { repo: 'Dépôt', github: 'GitHub', npm: 'npm', docker: 'Docker Hub' }

function Overview({ project: p }) {
  const versions = p.versions || []
  return (
    <Flex vertical gap={16}>
      {p.sync_error && <Alert type="warning" showIcon message={t('Erreurs à la dernière synchro')} description={<pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{p.sync_error}</pre>} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Card size="small" title={t('Description')}>
          {p.description ? <Markdown>{p.description}</Markdown> : <Typography.Text type="secondary">{t('Pas de description')}</Typography.Text>}
          {!!p.tags?.length && <Flex gap={4} wrap style={{ marginTop: 8 }}>{p.tags.map((t) => <Tag key={t}>{t}</Tag>)}</Flex>}
        </Card>
        <Card size="small" title={t('Liens')}>
          <Flex vertical gap={6}>
            {p.repo && <a href={repoUrl(p)} target="_blank" rel="noreferrer"><ForgeIcon forge={p.forge} /> {p.repo}</a>}
            {p.homepage && <a href={p.homepage} target="_blank" rel="noreferrer"><GlobalOutlined /> {p.homepage}</a>}
            {(p.links || []).filter((l) => l?.url).map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noreferrer"><LinkOutlined /> {l.label || l.url}</a>
            ))}
            {!p.repo && !p.homepage && !p.links?.length && <Typography.Text type="secondary">{t('Aucun lien')}</Typography.Text>}
          </Flex>
        </Card>
        {p.github && (
          <Card size="small" title={FORGES[p.forge]?.label || t('Dépôt')}>
            <Descriptions size="small" column={1}>
              <Descriptions.Item label={t('Étoiles')}><StarOutlined /> {p.github.stars}</Descriptions.Item>
              <Descriptions.Item label={t('Dernier push')}>{p.github.pushed_at ? dayjs(p.github.pushed_at).fromNow() : '—'}</Descriptions.Item>
              <Descriptions.Item label={t('Branche')}>{p.github.default_branch}</Descriptions.Item>
              {p.github.language && <Descriptions.Item label={t('Langage')}>{p.github.language}</Descriptions.Item>}
              {p.github.archived && <Descriptions.Item label={t('État')}><Tag color="red">{t('Archivé')}</Tag></Descriptions.Item>}
            </Descriptions>
            {p.github.ci && (
              <Flex vertical gap={4} style={{ marginTop: 8 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('CI (')}{p.github.default_branch})</Typography.Text>
                {p.github.ci.runs.map((r) => (
                  <a key={r.id} href={r.url} target="_blank" rel="noreferrer">
                    {(CI[r.status !== 'completed' ? 'pending' : r.conclusion === 'success' ? 'success' : ['failure', 'timed_out', 'startup_failure'].includes(r.conclusion) ? 'failure' : 'neutral']).icon} {r.name}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}> · {dayjs(r.updated_at).fromNow()}</Typography.Text>
                  </a>
                ))}
              </Flex>
            )}
          </Card>
        )}
      </div>
      <Card size="small" title={<>{t('Versions') + ' '}{p.deployed_version && <Tag style={{ marginLeft: 8 }}>{t('utilisée :') + ' '}{p.deployed_version}</Tag>}</>}>
        {versions.length ? (
          <Table
            rowKey={(v) => `${v.type}:${v.ref}`}
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
            dataSource={versions}
            columns={[
              { title: t('Source'), render: (_, v) => <>{t(VERSION_LABELS[v.type] || v.type)} <Typography.Text type="secondary">{v.ref || p.repo}</Typography.Text></> },
              {
                title: t('Dernière version'),
                render: (_, v) => v.error ? <Tooltip title={v.error}><Tag color="red">{t('erreur')}</Tag></Tooltip> : (
                  <Flex gap={6} align="center">
                    {v.url ? <a href={v.url} target="_blank" rel="noreferrer">{v.version}</a> : v.version}
                    {p.deployed_version && v.version && compareVersions(v.version, p.deployed_version) > 0 && <Tag color="orange"><WarningOutlined />{' ' + t('à mettre à jour')}</Tag>}
                  </Flex>
                ),
              },
              { title: t('Publiée'), render: (_, v) => (v.published_at ? dayjs(v.published_at).format('L') : '—') },
              { title: t('Vérifiée'), responsive: ['md'], render: (_, v) => (v.checked_at ? dayjs(v.checked_at).fromNow() : '—') },
            ]}
          />
        ) : (
          <Typography.Text type="secondary">{t(
            'Aucune source de version — ajoute-en dans « Modifier » (releases du dépôt, npm, Docker Hub).'
          )}</Typography.Text>
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

  if (error) return <Result status="404" title={t('Projet introuvable')} extra={<Button onClick={() => navigate('/projects')}>{t('Retour')}</Button>} />
  if (!p) return <Spin spinning={loading}><div style={{ height: 200 }} /></Spin>

  const sync = async () => {
    setSyncing(true)
    try {
      const res = await api.post(`/projects/${id}/sync`)
      setData(res.project)
      if (res.errors.length) message.warning(t('Synchro terminée avec des erreurs'))
      else message.success(t('Projet synchronisé'))
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
    { key: 'overview', label: t('Aperçu'), children: <Overview project={p} /> },
    { key: 'items', label: <>{t('Bugs & tâches') + ' '}<Badge count={p.open_items} size="small" color="blue" /></>, children: <ItemsPanel projectId={id} /> },
    { key: 'github', label: <>{FORGES[p.forge]?.label || t('Dépôt')} <Badge count={p.open_issues + p.open_prs} size="small" color="geekblue" /></>, children: <GithubPanel projectId={id} project={p} /> },
    { key: 'roadmap', label: t('Versions'), children: <RoadmapPanel projectId={id} project={p} /> },
    { key: 'specs', label: t('Spécifications'), children: <DocsPanel projectId={id} type="spec" /> },
    { key: 'notes', label: t('Notes'), children: <DocsPanel projectId={id} type="note" /> },
    {
      key: 'inbox',
      label: <>{t('Activité') + ' '}<Badge count={p.unread} size="small" /></>,
      children: (
        <Flex vertical gap={8}>
          {p.unread > 0 && <Button style={{ alignSelf: 'end' }} onClick={markAllRead}>{t('Tout marquer comme lu')}</Button>}
          {inbox.data?.length || inbox.loading ? <InboxList entries={inbox.data} loading={inbox.loading} onChange={() => { inbox.reload(); reload() }} showProject={false} /> : <Empty description={t(
            'Aucune activité — configure le dépôt, les forums ou les versions puis synchronise'
          )} />}
        </Flex>
      ),
    },
    { key: 'time', label: t('Temps'), children: <TimePanel projectId={id} /> },
    { key: 'stats', label: t('Statistiques'), children: <StatsPanel projectId={id} project={p} /> },
  ]

  return (
    <Flex vertical gap={16}>
      <Flex gap={12} align="center" wrap>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')} />
        <Typography.Title level={3} style={{ margin: 0 }}>{p.name}</Typography.Title>
        <CategoryTag name={p.category_name} color={p.category_color} />
        <LabelTag map={PROJECT_STATUS} value={p.status} />
        {p.client && <Tag>{p.client}</Tag>}
        {p.outdated && <Tag color="orange" icon={<WarningOutlined />}>{t('Mise à jour disponible')}</Tag>}
        <CiStatus ci={p.github?.ci} variant="tag" />
        {p.notify === false && <Tooltip title={t('Notifications ntfy désactivées pour ce projet')}><Tag>{t('muet')}</Tag></Tooltip>}
        <Flex gap={8} style={{ marginLeft: 'auto' }} align="center">
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {p.last_synced_at ? t('Synchro {when}', { when: dayjs.utc(p.last_synced_at).local().fromNow() }) : t('Jamais synchronisé')}
          </Typography.Text>
          <Button icon={<SyncOutlined spin={syncing} />} onClick={sync} disabled={syncing}>{t('Synchroniser')}</Button>
          <Button type="primary" icon={<EditOutlined />} onClick={() => setEditing(p)}>{t('Modifier')}</Button>
        </Flex>
      </Flex>
      <Tabs activeKey={tab} onChange={(key) => navigate(`/projects/${id}/${key}`)} items={tabs} destroyOnHidden />
      <ProjectForm project={editing} onClose={() => setEditing(null)} onSaved={(saved) => { setEditing(null); if (saved) setData(saved); else navigate('/projects') }} />
    </Flex>
  )
}
