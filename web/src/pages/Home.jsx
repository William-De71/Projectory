import { Alert, Button, Flex, Spin, Tabs, Typography } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useApi } from '../api/client.js'
import Today from './Today.jsx'
import Dashboard, { DashboardAlerts } from './Dashboard.jsx'
import { todayDate } from '../components/TodayButton.jsx'
import { t } from '../i18n/index.js'

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// Home: alerts first (and the weekly review when due), then two tabs: the
// day's plan and the overview of all projects (?view=overview).
export default function Home() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'overview' ? 'overview' : 'today'
  // Keeps the other parameters (?item= of the side panel).
  const show = (key) => setParams((prev) => {
    const next = new URLSearchParams(prev)
    if (key === 'overview') next.set('view', key)
    else next.delete('view')
    return next
  }, { replace: true })
  const { data, loading } = useApi('/dashboard', { listen: true })
  const { data: review } = useApi('/review', { listen: true })
  return (
    <Flex vertical gap={16}>
      <Flex align="baseline" gap={12} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>{t('Aujourd’hui')}</Typography.Title>
        <Typography.Text type="secondary">{capitalize(dayjs(todayDate()).format('dddd LL'))}</Typography.Text>
      </Flex>
      {data && <DashboardAlerts data={data} />}
      {review?.due && (
        <Alert
          type="info"
          showIcon
          message={t('Revue de la semaine')}
          description={t('{n} élément(s) attendent une décision : échéances passées, tests à valider, tâches qui traînent.', { n: review.count })}
          action={<Button type="primary" onClick={() => navigate('/review')}>{t('Commencer')}</Button>}
        />
      )}
      <Tabs
        activeKey={view}
        onChange={show}
        destroyOnHidden
        items={[
          { key: 'today', label: t('Ma journée'), children: <Today /> },
          { key: 'overview', label: t('Vue d’ensemble'), children: data ? <Dashboard data={data} /> : <Spin spinning={loading}><div style={{ height: 200 }} /></Spin> },
        ]}
      />
    </Flex>
  )
}
