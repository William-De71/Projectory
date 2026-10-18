import { Flex, Typography } from 'antd'
import TimePanel from '../components/TimePanel.jsx'

export default function TimeTracking() {
  return (
    <Flex vertical gap={16}>
      <Typography.Title level={3} style={{ margin: 0 }}>Temps passé</Typography.Title>
      <TimePanel />
    </Flex>
  )
}
