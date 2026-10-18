import { Link, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Col, Empty, Flex, List, Row, Spin, Statistic, Tag, Typography } from 'antd'
import { PullRequestOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useApi } from '../api/client.js'
import { ITEM_KIND, PRIORITY, formatMinutes } from '../components/labels.js'
import { LabelTag } from '../components/Tags.jsx'
import InboxList from '../components/InboxList.jsx'
import ProjectCard, { latestVersion } from '../components/ProjectCard.jsx'

export default function Dashboard() {
  const navigate = useNavigate()
  const { data, loading, reload } = useApi('/dashboard', { listen: true })
  if (!data) return <Spin spinning={loading}><div style={{ height: 300 }} /></Spin>
  const { stats } = data

  const tiles = [
    { title: 'Projets actifs', value: `${stats.active} / ${stats.projects}`, to: '/projects' },
    { title: 'Non lus', value: stats.unread, to: '/inbox', color: stats.unread ? '#ff4d4f' : undefined },
    { title: 'Bugs ouverts', value: stats.open_bugs, to: '/items' },
    { title: 'Issues GitHub', value: stats.open_issues },
    { title: 'PR ouvertes', value: stats.open_prs },
    { title: 'CI en échec', value: stats.ci_failing, color: stats.ci_failing ? '#ff4d4f' : undefined },
    { title: 'Temps ce mois', value: formatMinutes(stats.minutes_this_month), to: '/time' },
  ]

  return (
    <Flex vertical gap={16}>
      <Flex align="baseline" gap={12} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>Tableau de bord</Typography.Title>
        <Typography.Text type="secondary">
          {data.sync.running ? 'Synchronisation en cours…' : data.sync.last_run_at ? `Dernière synchro ${dayjs(data.sync.last_run_at).fromNow()}` : 'Pas encore synchronisé'}
        </Typography.Text>
      </Flex>

      {stats.projects === 0 && (
        <Alert
          type="info"
          showIcon
          message="Bienvenue !"
          description="Commence par créer un projet : renseigne son dépôt GitHub, les versions à surveiller et éventuellement un forum. La synchro tourne ensuite automatiquement."
          action={<Button type="primary" onClick={() => navigate('/projects')}>Créer un projet</Button>}
        />
      )}

      <Row gutter={[12, 12]}>
        {tiles.map((t) => (
          <Col key={t.title} xs={12} md={6} xl={3}>
            <Card size="small" hoverable={!!t.to} onClick={() => t.to && navigate(t.to)}>
              <Statistic title={t.title} value={t.value} valueStyle={{ color: t.color }} />
            </Card>
          </Col>
        ))}
      </Row>

      {!!data.ci_failing.length && (
        <Alert
          type="error"
          showIcon
          message="CI en échec"
          description={data.ci_failing.map((p) => (
            <div key={p.id}>
              <Link to={`/projects/${p.id}`}>{p.name}</Link>
              {p.run && <> : <a href={p.run.url} target="_blank" rel="noreferrer">{p.run.name}</a></>}
            </div>
          ))}
        />
      )}

      {!!data.with_errors.length && (
        <Alert
          type="warning"
          showIcon
          message="Certaines synchros ont échoué"
          description={data.with_errors.map((p) => <div key={p.id}><Link to={`/projects/${p.id}`}>{p.name}</Link> : {p.sync_error.split('\n')[0]}</div>)}
        />
      )}

      {!!data.pinned.length && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {data.pinned.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card size="small" title="Nouveautés" extra={<Link to="/inbox">Tout voir</Link>}>
            <InboxList entries={data.inbox} onChange={reload} />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Flex vertical gap={16}>
            <Card size="small" title="Prioritaire / échéance proche" extra={<Link to="/items">Tout voir</Link>}>
              <List
                dataSource={data.urgent}
                locale={{ emptyText: <Empty description="Rien d'urgent" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                renderItem={(it) => (
                  <List.Item className="clickable" onClick={() => navigate(`/projects/${it.project_id}/items`)}>
                    <Flex vertical gap={2} style={{ width: '100%' }}>
                      <Typography.Text strong ellipsis>{it.title}</Typography.Text>
                      <Flex gap={4} wrap>
                        <Tag>{it.project_name}</Tag>
                        <LabelTag map={ITEM_KIND} value={it.kind} />
                        <LabelTag map={PRIORITY} value={it.priority} />
                        {it.due_date && <Tag color={dayjs(it.due_date).isBefore(dayjs(), 'day') ? 'red' : 'gold'}>{dayjs(it.due_date).format('DD/MM')}</Tag>}
                      </Flex>
                    </Flex>
                  </List.Item>
                )}
              />
            </Card>
            <Card size="small" title="Mises à jour disponibles">
              <List
                dataSource={data.outdated}
                locale={{ emptyText: <Empty description="Tout est à jour" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                renderItem={(p) => (
                  <List.Item className="clickable" onClick={() => navigate(`/projects/${p.id}`)}>
                    <Typography.Text>{p.name}</Typography.Text>
                    <Tag color="orange">{p.deployed_version} → {latestVersion(p)}</Tag>
                  </List.Item>
                )}
              />
            </Card>
            <Card size="small" title="PR récentes">
              <List
                dataSource={data.recent_prs}
                locale={{ emptyText: <Empty description="Aucune PR ouverte" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                renderItem={(pr) => (
                  <List.Item>
                    <Flex vertical gap={2} style={{ minWidth: 0 }}>
                      <a href={pr.url} target="_blank" rel="noreferrer"><PullRequestOutlined /> #{pr.number} {pr.title}</a>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{pr.project_name} · {pr.author} · {dayjs(pr.updated_at).fromNow()}</Typography.Text>
                    </Flex>
                  </List.Item>
                )}
              />
            </Card>
          </Flex>
        </Col>
      </Row>
    </Flex>
  )
}
