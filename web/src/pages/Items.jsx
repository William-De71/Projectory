import { Flex, Typography } from 'antd'
import ItemsPanel from '../components/ItemsPanel.jsx'
import { t } from '../i18n/index.js'

export default function Items() {
  return (
    <Flex vertical gap={16}>
      <Typography.Title level={3} style={{ margin: 0 }}>{t('Bugs & tâches — tous projets')}</Typography.Title>
      <ItemsPanel />
    </Flex>
  )
}
