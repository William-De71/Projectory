import { Alert, Button, Flex, Spin, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useApi } from '../api/client.js'
import Today from './Today.jsx'
import Dashboard, { DashboardAlerts } from './Dashboard.jsx'
import { todayDate } from '../components/TodayButton.jsx'
import { t } from '../i18n/index.js'

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// Home: alerts first (and the weekly review when due), then the day's plan,
// then the overview of all projects.
export default function Home() {
  const navigate = useNavigate()
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
      <Today />
      <Typography.Title level={4} style={{ margin: '8px 0 0' }}>{t('Vue d’ensemble')}</Typography.Title>
      {data ? <Dashboard data={data} /> : <Spin spinning={loading}><div style={{ height: 200 }} /></Spin>}
    </Flex>
  )
}
