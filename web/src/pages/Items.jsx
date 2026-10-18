import { Flex, Typography } from 'antd'
import ItemsPanel from '../components/ItemsPanel.jsx'

export default function Items() {
  return (
    <Flex vertical gap={16}>
      <Typography.Title level={3} style={{ margin: 0 }}>Bugs & tâches — tous projets</Typography.Title>
      <ItemsPanel />
    </Flex>
  )
}
