import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, App, Button, Card, Checkbox, Col, Empty, Flex, List, Row, Select, Spin, Tag, Tooltip, Typography } from 'antd'
import { CheckOutlined, CloseOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange, useApi } from '../api/client.js'
import { ITEM_KIND, ITEM_STATUS, OPEN_STATUSES, PRIORITY, formatMinutes } from '../components/labels.js'
import { LabelTag } from '../components/Tags.jsx'
import { useItemPanel } from '../components/ItemPanel.jsx'
import { setFocus, todayDate } from '../components/TodayButton.jsx'
import ForumReplyModal, { needsForumReply } from '../components/ForumReplyModal.jsx'
import { t } from '../i18n/index.js'

const FOCUS_LIMIT = 5
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const isOpen = (it) => OPEN_STATUSES.includes(it.status)

function ItemTags({ item, today }) {
  return (
    <Flex gap={2} wrap>
      <Link to={`/projects/${item.project_id}/items`}><Tag>{item.project_name}</Tag></Link>
      <LabelTag map={ITEM_KIND} value={item.kind} />
      {item.priority !== 'normal' && <LabelTag map={PRIORITY} value={item.priority} />}
      {['in_progress', 'testing', 'blocked'].includes(item.status) && <LabelTag map={ITEM_STATUS} value={item.status} />}
      {item.due_date && (
        <Tag color={item.due_date < today ? 'red' : item.due_date === today ? 'orange' : 'default'}>
          {item.due_date < today ? t('en retard · {date}', { date: dayjs(item.due_date).format('D MMM') }) : item.due_date === today ? t('échéance aujourd’hui') : dayjs(item.due_date).format('D MMM')}
        </Tag>
      )}
    </Flex>
  )
}

// Candidate list (due, suggestions) with a button to plan the item for today.
function Candidates({ title, items, today, onAdd, onOpen, empty }) {
  return (
    <Card size="small" title={title}>
      <List
        size="small"
        dataSource={items}
        locale={{ emptyText: <Typography.Text type="secondary">{empty}</Typography.Text> }}
        renderItem={(it) => (
          <List.Item
            actions={[
              <Tooltip key="add" title={t('Ajouter à ma journée')}>
                <Button size="small" icon={<PlusOutlined />} aria-label={t('Ajouter à ma journée')} onClick={() => onAdd(it)} />
              </Tooltip>,
            ]}
          >
            <Flex vertical gap={4} style={{ minWidth: 0 }}>
              <Typography.Link onClick={() => onOpen(it)} ellipsis>{it.title}</Typography.Link>
              <ItemTags item={it} today={today} />
            </Flex>
          </List.Item>
        )}
      />
    </Card>
  )
}

export default function Today() {
  const { message } = App.useApp()
  const today = todayDate()
  const { data, loading, setData } = useApi(`/today?date=${today}`, { listen: true })
  const { data: openItems } = useApi('/items?open=1', { listen: true })
  const { openItem, newItem } = useItemPanel()
  const [replyTo, setReplyTo] = useState(null)

  if (!data) return <Spin spinning={loading}><div style={{ height: 300 }} /></Spin>

  const run = async (fn) => {
    try {
      await fn()
      notifyChange()
    } catch (err) {
      message.error(err.message)
    }
  }
  const add = (item) => run(() => setFocus(item, true))
  const remove = (item) => {
    setData((d) => ({ ...d, focus: d.focus.filter((i) => i.id !== item.id) }))
    run(() => setFocus(item, false))
  }
  // A finished item stays in today's list (ticked) until tomorrow.
  const toggleDone = (item, done) => {
    setData((d) => ({ ...d, focus: d.focus.map((i) => (i.id === item.id ? { ...i, status: done ? 'done' : 'todo' } : i)) }))
    run(async () => {
      const updated = await api.put(`/items/${item.id}`, { status: done ? 'done' : 'todo', focus_date: today })
      if (needsForumReply(updated)) setReplyTo(updated)
    })
  }

  const open = data.focus.filter(isOpen)
  const done = data.focus.length - open.length
  const planned = new Set(data.focus.map((i) => i.id))
  const pickable = (openItems || []).filter((i) => !planned.has(i.id))

  return (
    <Flex vertical gap={16}>
      <Flex align="baseline" gap={12} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>{t('Aujourd’hui')}</Typography.Title>
        <Typography.Text type="secondary">{capitalize(dayjs(today).format('dddd LL'))}</Typography.Text>
        <Link to="/time" style={{ marginLeft: 'auto' }}>
          <Tag>{t('{time} passées aujourd’hui', { time: formatMinutes(data.minutes) })}</Tag>
        </Link>
      </Flex>

      {data.ci_failing.length > 0 && (
        <Alert
          type="error"
          showIcon
          message={t('CI en échec')}
          description={<Flex gap={12} wrap>{data.ci_failing.map((p) => <Link key={p.id} to={`/projects/${p.id}`}>{p.name}</Link>)}</Flex>}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            title={t('Ma journée')}
            extra={<Typography.Text type={open.length > FOCUS_LIMIT ? 'warning' : 'secondary'}>{t('{done} / {total} terminées', { done, total: data.focus.length })}</Typography.Text>}
          >
            <Flex vertical gap={12}>
              <Flex gap={8} wrap>
                <Select
                  showSearch
                  value={null}
                  placeholder={t('Ajouter un bug ou une tâche ouverte…')}
                  style={{ flex: 1, minWidth: 220 }}
                  optionFilterProp="search"
                  options={pickable.map((i) => ({ value: i.id, search: `${i.title} ${i.project_name}`, label: <Flex justify="space-between" gap={8}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.title}</span><Typography.Text type="secondary">{i.project_name}</Typography.Text></Flex> }))}
                  onChange={(id) => add(pickable.find((i) => i.id === id))}
                  notFoundContent={t('Aucun élément ouvert')}
                />
                <Button icon={<PlusOutlined />} onClick={() => newItem({ kind: 'task', focus_date: today })}>{t('Nouvelle tâche')}</Button>
              </Flex>
              {open.length > FOCUS_LIMIT && (
                <Alert type="warning" showIcon message={t('Plus de {n} tâches ouvertes : garde l’essentiel, le reste attendra demain.', { n: FOCUS_LIMIT })} />
              )}
              <List
                dataSource={data.focus}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Rien de prévu. Choisis 3 à 5 tâches : celles en cours, les prioritaires ou les échéances.')} /> }}
                renderItem={(it) => (
                  <List.Item>
                    <Flex gap={12} align="start" style={{ minWidth: 0, width: '100%' }}>
                      <Checkbox checked={!isOpen(it)} onChange={(e) => toggleDone(it, e.target.checked)} style={{ marginTop: 2 }} aria-label={t('Terminé')} />
                      <Flex vertical gap={4} style={{ minWidth: 0, flex: 1 }}>
                        <Typography.Link onClick={() => openItem(it)} delete={!isOpen(it)} type={isOpen(it) ? undefined : 'secondary'}>{it.title}</Typography.Link>
                        <Flex gap={2} wrap>
                          <ItemTags item={it} today={today} />
                          {isOpen(it) && it.focus_date < today && <Tag color="gold">{t('reportée depuis {date}', { date: dayjs(it.focus_date).format('D MMM') })}</Tag>}
                        </Flex>
                      </Flex>
                      <Tooltip title={t('Retirer de ma journée')}>
                        <Button size="small" type="text" icon={<CloseOutlined />} aria-label={t('Retirer de ma journée')} onClick={() => remove(it)} />
                      </Tooltip>
                    </Flex>
                  </List.Item>
                )}
              />
            </Flex>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Flex vertical gap={16}>
            {data.forum_replies.length > 0 && (
              <Card size="small" title={t('À répondre sur le forum')}>
                <List
                  size="small"
                  dataSource={data.forum_replies}
                  renderItem={(it) => (
                    <List.Item actions={[<Button key="reply" size="small" onClick={() => setReplyTo(it)}>{t('Répondre')}</Button>]}>
                      <Flex vertical gap={2} style={{ minWidth: 0 }}>
                        <Typography.Text ellipsis>{it.title}</Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{it.project_name}{it.target_version ? ` · ${it.target_version}` : ''}</Typography.Text>
                      </Flex>
                    </List.Item>
                  )}
                />
              </Card>
            )}
            <Candidates title={t('À échéance')} items={data.due} today={today} onAdd={add} onOpen={openItem} empty={t('Aucune échéance dépassée ni pour aujourd’hui')} />
            <Card size="small" title={t('Reviews demandées')}>
              <List
                size="small"
                dataSource={data.reviews}
                locale={{ emptyText: <Typography.Text type="secondary">{t('Aucune review en attente (notifications GitHub perso)')}</Typography.Text> }}
                renderItem={(r) => (
                  <List.Item
                    actions={[
                      <Tooltip key="read" title={t('Marquer comme lue')}>
                        <Button size="small" type="text" icon={<CheckOutlined />} aria-label={t('Marquer comme lue')} onClick={() => run(() => api.post(`/inbox/${r.id}/read`))} />
                      </Tooltip>,
                    ]}
                  >
                    <Flex vertical gap={2} style={{ minWidth: 0 }}>
                      <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{[r.project_name, dayjs.utc(r.created_at).local().fromNow()].filter(Boolean).join(' · ')}</Typography.Text>
                    </Flex>
                  </List.Item>
                )}
              />
            </Card>
            <Candidates title={t('Suggestions')} items={data.suggestions} today={today} onAdd={add} onOpen={openItem} empty={t('Rien en cours ni de prioritaire')} />
          </Flex>
        </Col>
      </Row>
      <ForumReplyModal item={replyTo} onClose={() => setReplyTo(null)} />
    </Flex>
  )
}
