import { Flex, Typography } from 'antd'
import TimePanel from '../components/TimePanel.jsx'
import { t } from '../i18n/index.js'

export default function TimeTracking() {
  return (
    <Flex vertical gap={16}>
      <Typography.Title level={3} style={{ margin: 0 }}>{t('Temps passé')}</Typography.Title>
      <TimePanel />
    </Flex>
  )
}
