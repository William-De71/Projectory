import { Flex, Typography } from 'antd'
import DocsPanel from '../components/DocsPanel.jsx'
import { t } from '../i18n/index.js'

export default function Notes() {
  return (
    <Flex vertical gap={16}>
      <Typography.Title level={3} style={{ margin: 0 }}>{t('Notes & spécifications')}</Typography.Title>
      <DocsPanel allowTypeFilter />
    </Flex>
  )
}
