import { useState } from 'react'
import { App, Button, DatePicker, Flex, Input, InputNumber, Popconfirm, Progress, Tag, Typography } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange, useApi } from '../api/client.js'
import { formatMinutes } from './labels.js'
import { t } from '../i18n/index.js'

// "1 h 30 / 3 h" on an item (red when over the estimate), or nothing without any.
export function TimeTag({ item }) {
  const spent = item.spent_minutes || 0
  const estimate = item.estimate_minutes
  if (!spent && !estimate) return null
  return (
    <Tag color={estimate && spent > estimate ? 'error' : 'default'} style={{ marginInlineEnd: 0 }}>
      ⏱ {formatMinutes(spent)}{estimate ? ` / ${formatMinutes(estimate)}` : ''}
    </Tag>
  )
}

// Time logged on a saved item, against its estimate. Changes are saved right away.
export default function ItemTime({ item, estimateMinutes }) {
  const { message } = App.useApp()
  const { data, reload } = useApi(`/time?item_id=${item.id}`)
  const [date, setDate] = useState(() => dayjs())
  const [hours, setHours] = useState(null)
  const [note, setNote] = useState('')
  const rows = data || []
  const spent = rows.reduce((sum, r) => sum + r.minutes, 0)

  const add = async () => {
    if (!hours || !date) return
    try {
      await api.post('/time', { item_id: item.id, date: date.format('YYYY-MM-DD'), minutes: Math.round(hours * 60), note: note.trim() })
      setHours(null)
      setNote('')
      reload()
      notifyChange()
    } catch (err) {
      message.error(err.message)
    }
  }
  const remove = async (id) => {
    await api.del(`/time/${id}`)
    reload()
    notifyChange()
  }
  const onEnter = (e) => { e.preventDefault(); add() }

  return (
    <Flex vertical gap={8}>
      {estimateMinutes ? (
        <Progress
          percent={Math.min(100, Math.round((spent / estimateMinutes) * 100))}
          status={spent > estimateMinutes ? 'exception' : 'normal'}
          size="small"
          format={() => `${formatMinutes(spent)} / ${formatMinutes(estimateMinutes)}`}
        />
      ) : rows.length > 0 && <Typography.Text strong>{t('Total : {time}', { time: formatMinutes(spent) })}</Typography.Text>}
      {rows.map((r) => (
        <Flex key={r.id} gap={8} align="center" wrap>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{dayjs(r.date).format('L')}</Typography.Text>
          <Typography.Text strong>{formatMinutes(r.minutes)}</Typography.Text>
          <Typography.Text style={{ flex: 1, minWidth: 120 }}>{r.note}</Typography.Text>
          <Popconfirm title={t('Supprimer ?')} onConfirm={() => remove(r.id)}>
            <Button size="small" type="text" icon={<DeleteOutlined />} aria-label={t('Supprimer')} />
          </Popconfirm>
        </Flex>
      ))}
      <Flex gap={8} wrap>
        <DatePicker value={date} onChange={setDate} format="L" allowClear={false} style={{ width: 130 }} />
        <InputNumber value={hours} onChange={setHours} onPressEnter={onEnter} min={0.25} step={0.25} placeholder={t('Heures')} suffix="h" aria-label={t('Heures')} style={{ width: 110 }} />
        <Input value={note} onChange={(e) => setNote(e.target.value)} onPressEnter={onEnter} placeholder={t('Ce qui a été fait')} style={{ flex: 1, minWidth: 160 }} />
        <Button icon={<PlusOutlined />} disabled={!hours} onClick={add}>{t('Ajouter')}</Button>
      </Flex>
    </Flex>
  )
}
