import { useState } from 'react'
import { Alert, Button, Card, Col, Flex, Row, Segmented, Spin, Statistic, Table, Tooltip, Typography } from 'antd'
import { ReloadOutlined, TableOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, useApi } from '../api/client.js'
import { t } from '../i18n/index.js'
import { formatMinutes } from './labels.js'
import BarChart, { Legend, useSeriesColors } from './BarChart.jsx'

const hours = (min) => Math.round((min / 60) * 10) / 10

// Weekly activity of a project: forge activity + local time and items.
export default function StatsPanel({ projectId, project }) {
  const [months, setMonths] = useState(3)
  const [showTable, setShowTable] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const { data, loading, setData } = useApi(`/projects/${projectId}/stats?months=${months}`)
  const [blue, orange] = useSeriesColors()
  const prLabel = project?.forge === 'gitlab' ? 'MR' : 'PR'

  const refresh = async () => {
    setRefreshing(true)
    try {
      setData(await api.get(`/projects/${projectId}/stats?months=${months}&refresh=1`))
    } finally {
      setRefreshing(false)
    }
  }

  if (!data) return <Spin spinning={loading}><div style={{ height: 240 }} /></Spin>
  const { totals, weeks } = data
  const tiles = [
    ...(data.has_repo ? [
      { title: t('Commits'), value: totals.commits },
      { title: t('Issues ouvertes / fermées'), value: `${totals.issues_opened} / ${totals.issues_closed}` },
      { title: t('{prs} ouvertes / fermées', { prs: prLabel }), value: `${totals.prs_opened} / ${totals.prs_closed}` },
      { title: t('Délai médian de résolution'), value: totals.issue_resolution_days == null ? '—' : t('{n} j', { n: totals.issue_resolution_days }), tip: t('Issues fermées sur la période, de l’ouverture à la fermeture') },
    ] : []),
    { title: t('Bugs & tâches créés / terminés'), value: `${totals.items_created} / ${totals.items_done}` },
    { title: t('Temps passé'), value: formatMinutes(totals.minutes) },
  ]

  const charts = [
    ...(data.has_repo ? [
      { title: t('Commits par semaine'), series: [{ key: 'commits', label: t('Commits'), color: blue }] },
      { title: t('Issues par semaine'), series: [{ key: 'issues_opened', label: t('Ouvertes'), color: blue }, { key: 'issues_closed', label: t('Fermées'), color: orange }] },
      { title: t('{prs} par semaine', { prs: prLabel }), series: [{ key: 'prs_opened', label: t('Ouvertes'), color: blue }, { key: 'prs_closed', label: t('Fermées'), color: orange }] },
    ] : []),
    { title: t('Temps passé par semaine (h)'), series: [{ key: 'hours', label: t('Heures'), color: blue }] },
  ]
  const rows = weeks.map((w) => ({ ...w, hours: hours(w.minutes) }))

  return (
    <Flex vertical gap={16}>
      <Flex gap={8} wrap align="center">
        <Segmented value={months} onChange={setMonths} options={[3, 6, 12].map((m) => ({ value: m, label: t('{n} mois', { n: m }) }))} />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('Calculé {when}', { when: dayjs(data.computed_at).fromNow() })}
        </Typography.Text>
        <Flex gap={8} style={{ marginLeft: 'auto' }}>
          <Button icon={<TableOutlined />} onClick={() => setShowTable((v) => !v)}>{showTable ? t('Graphiques') : t('Tableau')}</Button>
          <Tooltip title={t('Recalculer depuis la forge')}><Button icon={<ReloadOutlined spin={refreshing} />} onClick={refresh} disabled={refreshing} /></Tooltip>
        </Flex>
      </Flex>
      {data.error && <Alert type="warning" showIcon message={t("Activité du dépôt indisponible")} description={data.error} />}
      {!data.has_repo && <Alert type="info" showIcon message={t('Aucun dépôt configuré : seules les données locales sont affichées.')} />}

      <Row gutter={[12, 12]}>
        {tiles.map((tile) => (
          <Col key={tile.title} xs={12} md={8} xl={4}>
            <Card size="small" style={{ height: '100%' }}>
              <Statistic title={tile.tip ? <Tooltip title={tile.tip}>{tile.title}</Tooltip> : tile.title} value={tile.value} />
            </Card>
          </Col>
        ))}
      </Row>

      {showTable ? (
        <Table
          rowKey="week"
          size="small"
          dataSource={[...rows].reverse()}
          pagination={{ pageSize: 13, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: t('Semaine du'), dataIndex: 'week', render: (w) => dayjs(w).format('L') },
            ...(data.has_repo ? [
              { title: t('Commits'), dataIndex: 'commits', align: 'right' },
              { title: t('Issues ouvertes'), dataIndex: 'issues_opened', align: 'right' },
              { title: t('Issues fermées'), dataIndex: 'issues_closed', align: 'right' },
              { title: t('{prs} ouvertes', { prs: prLabel }), dataIndex: 'prs_opened', align: 'right' },
              { title: t('{prs} fermées', { prs: prLabel }), dataIndex: 'prs_closed', align: 'right' },
            ] : []),
            { title: t('Bugs & tâches créés'), dataIndex: 'items_created', align: 'right' },
            { title: t('Terminés'), dataIndex: 'items_done', align: 'right' },
            { title: t('Heures'), dataIndex: 'hours', align: 'right' },
          ]}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))', gap: 16 }}>
          {charts.map((c) => (
            <Card key={c.title} size="small" title={c.title} extra={<Legend series={c.series} />}>
              <BarChart weeks={rows} series={c.series} />
            </Card>
          ))}
        </div>
      )}
    </Flex>
  )
}
