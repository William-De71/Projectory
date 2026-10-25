import { App, Button, Flex, Tag, Tooltip, Typography } from 'antd'
import { CheckOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { api, notifyChange } from '../api/client.js'
import { ITEM_KIND, ITEM_STATUS, OPEN_STATUSES, PRIORITY } from './labels.js'
import { LabelTag } from './Tags.jsx'
import { ChecklistTag } from './ItemChecklist.jsx'
import TodayButton, { todayDate } from './TodayButton.jsx'
import { useItemPanel } from './ItemPanel.jsx'
import { t } from '../i18n/index.js'

const SHOWN_STATUSES = ['in_progress', 'testing', 'blocked', 'done', 'wontfix']

// Project · type · priority · status · due date, in that order everywhere.
export function ItemTags({ item, showProject = true, children }) {
  const today = todayDate()
  const open = OPEN_STATUSES.includes(item.status)
  return (
    <Flex gap={2} wrap>
      {showProject && item.project_name && <Link to={`/projects/${item.project_id}/items`}><Tag>{item.project_name}</Tag></Link>}
      <LabelTag map={ITEM_KIND} value={item.kind} />
      {item.priority && item.priority !== 'normal' && <LabelTag map={PRIORITY} value={item.priority} />}
      {SHOWN_STATUSES.includes(item.status) && <LabelTag map={ITEM_STATUS} value={item.status} />}
      {item.due_date && (
        <Tag color={!open ? 'default' : item.due_date < today ? 'red' : item.due_date === today ? 'orange' : 'default'}>
          {open && item.due_date < today ? t('en retard · {date}', { date: dayjs(item.due_date).format('D MMM') }) : open && item.due_date === today ? t('échéance aujourd’hui') : dayjs(item.due_date).format('D MMM')}
        </Tag>
      )}
      <ChecklistTag checklist={item.checklist} />
      {children}
    </Flex>
  )
}

// One line for a bug / task, the same in every list: the title opens the side
// panel, the tags follow, and "done" / "my day" show on hover (always on touch
// screens). `prefix` goes before the title (a checkbox), `actions` replace the
// hover ones, `tags` are added after the standard tags.
export default function ItemRow({ item, showProject = true, prefix, actions, tags }) {
  const { message } = App.useApp()
  const { openItem, offerForumReply } = useItemPanel()
  const open = OPEN_STATUSES.includes(item.status)
  const finish = async (e) => {
    e.stopPropagation()
    try {
      const updated = await api.put(`/items/${item.id}`, { status: 'done' })
      notifyChange()
      offerForumReply(updated)
    } catch (err) {
      message.error(err.message)
    }
  }
  const hoverActions = open && (
    <>
      <TodayButton item={item} />
      <Tooltip title={t('Marquer terminé')}>
        <Button size="small" type="text" icon={<CheckOutlined />} aria-label={t('Marquer terminé')} onClick={finish} />
      </Tooltip>
    </>
  )
  return (
    <Flex gap={12} align="start" className="item-row" style={{ width: '100%', minWidth: 0 }}>
      {prefix}
      <Flex vertical gap={4} style={{ minWidth: 0, flex: 1 }}>
        <Typography.Link onClick={() => openItem(item)} delete={!open} type={open ? undefined : 'secondary'} ellipsis>{item.title}</Typography.Link>
        <ItemTags item={item} showProject={showProject}>{tags}</ItemTags>
      </Flex>
      <Flex gap={2} align="center" className={actions ? undefined : 'item-row-actions'}>{actions || hoverActions}</Flex>
    </Flex>
  )
}
