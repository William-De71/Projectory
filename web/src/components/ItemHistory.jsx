import { Flex, Typography } from 'antd'
import dayjs from 'dayjs'
import { useApi } from '../api/client.js'
import { HISTORY_FIELDS, HISTORY_SOURCES, ITEM_KIND, ITEM_STATUS, PRIORITY } from './labels.js'
import { t } from '../i18n/index.js'

const LABELS = { status: ITEM_STATUS, priority: PRIORITY, kind: ITEM_KIND }

const formatValue = (field, value) => {
  if (!value) return '—'
  if (field === 'due_date') return dayjs(value).format('L')
  const label = LABELS[field]?.[value]?.label
  return label ? t(label) : value
}

function When({ at }) {
  const date = dayjs.utc(at).local()
  return <Typography.Text type="secondary" title={date.format('L LT')} style={{ fontSize: 12, minWidth: 90 }}>{date.fromNow()}</Typography.Text>
}

// What changed on a saved item, newest first, and what changed it when it was not the user.
export default function ItemHistory({ item }) {
  const { data } = useApi(`/items/${item.id}/history`, { listen: true })
  return (
    <Flex vertical gap={4} style={{ maxHeight: 220, overflowY: 'auto' }}>
      {(data || []).map((e) => (
        <Flex key={e.id} gap={8} align="baseline" wrap>
          <When at={e.created_at} />
          <span style={{ flex: 1, minWidth: 200 }}>
            <Typography.Text strong>{t(HISTORY_FIELDS[e.field] || e.field)}</Typography.Text>{' : '}
            {formatValue(e.field, e.old_value)} → {formatValue(e.field, e.new_value)}
            {HISTORY_SOURCES[e.source] && <Typography.Text type="secondary"> ({t(HISTORY_SOURCES[e.source])})</Typography.Text>}
          </span>
        </Flex>
      ))}
      <Flex gap={8} align="baseline" wrap>
        <When at={item.created_at} />
        <Typography.Text type="secondary">{t('Création')}</Typography.Text>
      </Flex>
    </Flex>
  )
}
