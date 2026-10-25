import { Link, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Col, Flex, List, Row, Statistic, Tag, Tooltip, Typography } from 'antd'
import { PullRequestOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { formatMinutes } from '../components/labels.js'
import ProjectCard, { latestVersion } from '../components/ProjectCard.jsx'
import { t } from '../i18n/index.js'

// What needs a look before anything else: no project yet, red CI, failed syncs.
export function DashboardAlerts({ data }) {
  const navigate = useNavigate()
  return (
    <>
      {data.stats.projects === 0 && (
        <Alert
          type="info"
          showIcon
          message={t('Bienvenue !')}
          description={t(
            'Commence par créer un projet : renseigne son dépôt GitHub, les versions à surveiller et éventuellement un forum. La synchro tourne ensuite automatiquement.'
          )}
          action={<Button type="primary" onClick={() => navigate('/projects?new=1')}>{t('Créer un projet')}</Button>}
        />
      )}
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
    </>
  )
}

// Key figures, pinned projects, available updates and recent PRs. Every
// figure opens the list behind it; the sections keep their place.
export default function Dashboard({ data }) {
  const navigate = useNavigate()
  const { stats } = data

  const tiles = [
    { title: t('Projets actifs'), value: `${stats.active} / ${stats.projects}`, to: '/projects' },
    { title: t('Non lus'), value: stats.unread, to: '/inbox/news', color: stats.unread ? '#ff4d4f' : undefined },
    { title: t('Bugs ouverts'), value: stats.open_bugs, to: '/items' },
    { title: t('Issues ouvertes'), value: stats.open_issues, to: '/projects' },
    { title: t('PR / MR'), value: stats.open_prs, to: '/inbox/github' },
    { title: t('CI en échec'), value: stats.ci_failing, to: '/projects', color: stats.ci_failing ? '#ff4d4f' : undefined },
    { title: t('En attente'), value: stats.stale, to: '/inbox/stale', tip: t('Issues sans réponse et PR / MR sans activité') },
    // Only for those who log their time.
    stats.minutes_this_month > 0 && { title: t('Temps ce mois'), value: formatMinutes(stats.minutes_this_month), to: '/settings/time' },
  ].filter(Boolean)

  return (
    <Flex vertical gap={16}>
      <Row gutter={[12, 12]}>
        {tiles.map((tile) => (
          <Col key={tile.title} xs={12} md={6} xl={3}>
            <Card size="small" hoverable onClick={() => navigate(tile.to)}>
              <Statistic title={tile.tip ? <Tooltip title={tile.tip}>{tile.title}</Tooltip> : tile.title} value={tile.value} valueStyle={{ color: tile.color }} />
            </Card>
          </Col>
        ))}
      </Row>

      {!!data.pinned.length && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {data.pinned.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card size="small" title={t('Mises à jour disponibles')}>
            {data.outdated.length ? (
              <List
                dataSource={data.outdated}
                renderItem={(p) => (
                  <List.Item className="clickable" onClick={() => navigate(`/projects/${p.id}`)}>
                    <Typography.Text>{p.name}</Typography.Text>
                    <Tag color="orange">{p.deployed_version} → {latestVersion(p)}</Tag>
                  </List.Item>
                )}
              />
            ) : <Typography.Text type="secondary">{t('Tout est à jour')}</Typography.Text>}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title={t('PR récentes')}>
            {data.recent_prs.length ? (
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
            ) : <Typography.Text type="secondary">{t('Aucune PR ouverte')}</Typography.Text>}
          </Card>
        </Col>
      </Row>
    </Flex>
  )
}
