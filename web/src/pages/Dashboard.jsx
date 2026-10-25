import { Link, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Col, Flex, List, Row, Spin, Statistic, Tag, Tooltip, Typography } from 'antd'
import { PullRequestOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useApi } from '../api/client.js'
import { ITEM_KIND, PRIORITY, formatMinutes, refLabel } from '../components/labels.js'
import StaleTag from '../components/StaleTag.jsx'
import { LabelTag } from '../components/Tags.jsx'
import InboxList from '../components/InboxList.jsx'
import { useItemPanel } from '../components/ItemPanel.jsx'
import ProjectCard, { latestVersion } from '../components/ProjectCard.jsx'
import { t } from '../i18n/index.js'

export default function Dashboard() {
  const navigate = useNavigate()
  const { openItem } = useItemPanel()
  const { data, loading, reload } = useApi('/dashboard', { listen: true })
  if (!data) return <Spin spinning={loading}><div style={{ height: 300 }} /></Spin>
  const { stats } = data

  const tiles = [
    { title: t('Projets actifs'), value: `${stats.active} / ${stats.projects}`, to: '/projects' },
    { title: t('Non lus'), value: stats.unread, to: '/inbox', color: stats.unread ? '#ff4d4f' : undefined },
    { title: t('Bugs ouverts'), value: stats.open_bugs, to: '/items' },
    { title: t('Issues ouvertes'), value: stats.open_issues },
    { title: t('PR / MR'), value: stats.open_prs },
    { title: t('CI en échec'), value: stats.ci_failing, color: stats.ci_failing ? '#ff4d4f' : undefined },
    { title: t('En attente'), value: stats.stale, tip: t('Issues sans réponse et PR / MR sans activité') },
    { title: t('Temps ce mois'), value: formatMinutes(stats.minutes_this_month), to: '/time' },
  ]

  const sections = [
    {
      key: 'inbox',
      title: t('Nouveautés'),
      extra: <Link to="/inbox">{t('Tout voir')}</Link>,
      empty: !data.inbox.length,
      emptyText: t('Rien de nouveau'),
      content: <InboxList entries={data.inbox} onChange={reload} />,
    },
    {
      key: 'urgent',
      title: t('Prioritaire / échéance proche'),
      extra: <Link to="/items">{t('Tout voir')}</Link>,
      empty: !data.urgent.length,
      emptyText: t('Rien d\'urgent'),
      content: (
        <List
          dataSource={data.urgent}
          renderItem={(it) => (
            <List.Item className="clickable" onClick={() => openItem(it.id)}>
              <Flex vertical gap={2} style={{ width: '100%' }}>
                <Typography.Text strong ellipsis>{it.title}</Typography.Text>
                <Flex gap={4} wrap>
                  <Tag>{it.project_name}</Tag>
                  <LabelTag map={ITEM_KIND} value={it.kind} />
                  <LabelTag map={PRIORITY} value={it.priority} />
                  {it.due_date && <Tag color={dayjs(it.due_date).isBefore(dayjs(), 'day') ? 'red' : 'gold'}>{dayjs(it.due_date).format('D MMM')}</Tag>}
                </Flex>
              </Flex>
            </List.Item>
          )}
        />
      ),
    },
    {
      key: 'stale',
      title: t('En attente'),
      extra: <Link to="/settings">{t('Réglages')}</Link>,
      empty: !data.stale.length,
      emptyText: t('Rien ne dort 👌'),
      content: (
        <List
          dataSource={data.stale}
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
      ),
    },
    {
      key: 'outdated',
      title: t('Mises à jour disponibles'),
      empty: !data.outdated.length,
      emptyText: t('Tout est à jour'),
      content: (
        <List
          dataSource={data.outdated}
          renderItem={(p) => (
            <List.Item className="clickable" onClick={() => navigate(`/projects/${p.id}`)}>
              <Typography.Text>{p.name}</Typography.Text>
              <Tag color="orange">{p.deployed_version} → {latestVersion(p)}</Tag>
            </List.Item>
          )}
        />
      ),
    },
    {
      key: 'prs',
      title: t('PR récentes'),
      empty: !data.recent_prs.length,
      emptyText: t('Aucune PR ouverte'),
      content: (
        <List
          dataSource={data.recent_prs}
          renderItem={(pr) => (
            <List.Item>
              <Flex vertical gap={2} style={{ minWidth: 0 }}>
                <a href={pr.url} target="_blank" rel="noreferrer"><PullRequestOutlined /> #{pr.number} {pr.title}</a>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{pr.project_name} · {pr.author} · {dayjs(pr.updated_at).fromNow()}</Typography.Text>
              </Flex>
            </List.Item>
          )}
        />
      ),
    },
  ]

  return (
    <Flex vertical gap={16}>
      <Flex align="baseline" gap={12} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>{t('Tableau de bord')}</Typography.Title>
        <Typography.Text type="secondary">
          {data.sync.running ? t('Synchronisation en cours…') : data.sync.last_run_at ? t('Dernière synchro {when}', { when: dayjs(data.sync.last_run_at).fromNow() }) : t('Pas encore synchronisé')}
        </Typography.Text>
      </Flex>

      {stats.projects === 0 && (
        <Alert
          type="info"
          showIcon
          message={t('Bienvenue !')}
          description={t(
            'Commence par créer un projet : renseigne son dépôt GitHub, les versions à surveiller et éventuellement un forum. La synchro tourne ensuite automatiquement.'
          )}
          action={<Button type="primary" onClick={() => navigate('/projects')}>{t('Créer un projet')}</Button>}
        />
      )}

      <Row gutter={[12, 12]}>
        {tiles.map((tile) => (
          <Col key={tile.title} xs={12} md={6} xl={3}>
            <Card size="small" hoverable={!!tile.to} onClick={() => tile.to && navigate(tile.to)}>
              <Statistic title={tile.tip ? <Tooltip title={tile.tip}>{tile.title}</Tooltip> : tile.title} value={tile.value} valueStyle={{ color: tile.color }} />
            </Card>
          </Col>
        ))}
      </Row>

      {!!data.ci_failing.length && (
        <Alert
          type="error"
          showIcon
          message={t('CI en échec')}
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
          message={t('Certaines synchros ont échoué')}
          description={data.with_errors.map((p) => <div key={p.id}><Link to={`/projects/${p.id}`}>{p.name}</Link> : {p.sync_error.split('\n')[0]}</div>)}
        />
      )}

      {!!data.pinned.length && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {data.pinned.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}

      {/* Sections flow into balanced columns; those with content come first. */}
      <div style={{ columnWidth: 380, columnGap: 16 }}>
        {sections.filter((sec) => !sec.empty).concat(sections.filter((sec) => sec.empty)).map((sec) => (
          <Card key={sec.key} size="small" title={sec.title} extra={sec.extra} style={{ breakInside: 'avoid', marginBottom: 16 }}>
            {sec.empty ? <Typography.Text type="secondary">{sec.emptyText}</Typography.Text> : sec.content}
          </Card>
        ))}
      </div>
    </Flex>
  )
}
