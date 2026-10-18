import { Button, Tooltip, theme } from 'antd'
import { SunFilled, SunOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange } from '../api/client.js'
import { t } from '../i18n/index.js'

export const todayDate = () => dayjs().format('YYYY-MM-DD')
export const isPlanned = (item) => !!item.focus_date && item.focus_date <= todayDate()

export async function setFocus(item, on) {
  const updated = await api.put(`/items/${item.id}`, { focus_date: on ? todayDate() : null })
  notifyChange()
  return updated
}

// Adds an open item to the "Today" list, or removes it.
export default function TodayButton({ item, onChange }) {
  const { token } = theme.useToken()
  if (!['todo', 'in_progress'].includes(item.status)) return null
  const planned = isPlanned(item)
  return (
    <Tooltip title={planned ? t('Retirer de ma journée') : t('Ajouter à ma journée')}>
      <Button
        size="small"
        type="text"
        aria-pressed={planned}
        aria-label={planned ? t('Retirer de ma journée') : t('Ajouter à ma journée')}
        icon={planned ? <SunFilled style={{ color: token.colorWarning }} /> : <SunOutlined style={{ opacity: 0.5 }} />}
        onClick={async (e) => { e.stopPropagation(); onChange?.(await setFocus(item, !planned)) }}
      />
    </Tooltip>
  )
}
