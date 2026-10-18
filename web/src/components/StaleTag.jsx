import { Tag, Tooltip } from 'antd'
import { ClockCircleOutlined } from '@ant-design/icons'
import { t } from '../i18n/index.js'

// "No reply for 12 d" (issue) or "Waiting for 6 d" (PR / MR).
export default function StaleTag({ item }) {
  const label = item.reason === 'no_reply' ? t('sans réponse depuis {n} j', { n: item.age_days }) : t('en attente depuis {n} j', { n: item.age_days })
  return (
    <Tooltip title={item.reason === 'no_reply' ? t('Aucun commentaire depuis l’ouverture') : t('Aucune activité récente')}>
      <Tag color="warning" icon={<ClockCircleOutlined />} style={{ marginInlineEnd: 0 }}>{label}</Tag>
    </Tooltip>
  )
}
