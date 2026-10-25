import { Link, useNavigate } from 'react-router-dom'
import { Alert, App, Button, Card, Dropdown, Flex, List, Popconfirm, Result, Spin, Tag, Tooltip, Typography } from 'antd'
import { CheckOutlined, ClockCircleOutlined, MoreOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange, useApi } from '../api/client.js'
import ItemRow from '../components/ItemRow.jsx'
import { useItemPanel } from '../components/ItemPanel.jsx'
import { todayDate } from '../components/TodayButton.jsx'
import { t } from '../i18n/index.js'

const SECTIONS = [
  { key: 'overdue', label: 'Échéance dépassée' },
  { key: 'testing', label: 'En test depuis plus d’une semaine' },
  { key: 'in_progress', label: 'En cours, sans changement depuis une semaine' },
  { key: 'stale', label: 'À faire ou bloqué, sans changement depuis trois semaines' },
]

// Long section titles wrap on phones instead of being cut.
const CARD_STYLES = { title: { whiteSpace: 'normal', padding: '8px 0' } }
const SectionTitle = ({ label, n }) => <Flex gap={8} align="center" wrap>{label}<Tag style={{ marginInlineEnd: 0 }}>{n}</Tag></Flex>

const later = (amount, unit) => dayjs(todayDate()).add(amount, unit).format('YYYY-MM-DD')

// The decisions of the review; each one takes the item out of it. Keeping an
// overdue item would not: it has to be done, postponed or dropped.
function ItemDecisions({ item, run, overdue }) {
  const { offerForumReply } = useItemPanel()
  const done = () => run(item, { status: 'done' }, offerForumReply)
  return (
    <Flex gap={6} wrap style={{ paddingLeft: 2 }}>
      <Button size="small" icon={<CheckOutlined />} onClick={done}>{t('Terminé')}</Button>
      {!overdue && (
        <Tooltip title={t('Toujours d’actualité : sort de la revue')}>
          <Button size="small" onClick={() => run(item, {})}>{t('Garder')}</Button>
        </Tooltip>
      )}
      <Dropdown
        trigger={['click']}
        menu={{
          items: [
            { key: 'week', label: t('Échéance dans une semaine') },
            { key: 'month', label: t('Échéance dans un mois') },
            { key: 'none', label: t('Sans échéance') },
          ],
          onClick: ({ key }) => run(item, { due_date: key === 'none' ? null : key === 'week' ? later(1, 'week') : later(1, 'month') }),
        }}
      >
        <Button size="small" icon={<ClockCircleOutlined />}>{t('Reporter')}</Button>
      </Dropdown>
      <Dropdown
        trigger={['click']}
        menu={{
          items: [
            { key: 'today', label: t('Ajouter à ma journée') },
            { key: 'wontfix', label: t('Abandonner'), danger: true },
          ],
          onClick: ({ key }) => run(item, key === 'today' ? { focus_date: todayDate() } : { status: 'wontfix' }),
        }}
      >
        <Button size="small" type="text" icon={<MoreOutlined />} aria-label={t('Plus d’actions')} />
      </Dropdown>
    </Flex>
  )
}

// Once a week: a decision for each item left aside, then "done" until next week.
export default function Review() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const { data, loading, setData } = useApi('/review', { listen: true })

  if (!data) return <Spin spinning={loading}><div style={{ height: 300 }} /></Spin>

  const drop = (key, id) => setData((d) => ({ ...d, count: d.count - 1, sections: { ...d.sections, [key]: d.sections[key].filter((x) => x.id !== id) } }))

  const runItem = (key) => async (item, changes, then) => {
    drop(key, item.id)
    try {
      const updated = await api.put(`/items/${item.id}`, changes)
      then?.(updated)
    } catch (err) {
      message.error(err.message)
    }
    notifyChange()
  }

  const postpone = async (m, amount) => {
    drop('milestones', m.id)
    try {
      await api.put(`/milestones/${m.id}`, { due_date: dayjs(m.due_date < todayDate() ? todayDate() : m.due_date).add(1, amount).format('YYYY-MM-DD') })
    } catch (err) {
      message.error(err.message)
    }
    notifyChange()
  }

  const finish = async () => {
    await api.post('/review/done')
    message.success(t('Revue terminée, à la semaine prochaine'))
    notifyChange()
    navigate('/')
  }

  const { sections, count } = data
  const finishButton = (
    <Popconfirm
      title={t('Il reste {n} élément(s). Terminer quand même ?', { n: count })}
      disabled={!count}
      onConfirm={finish}
    >
      <Button type="primary" onClick={count ? undefined : finish}>{t('Terminer la revue')}</Button>
    </Popconfirm>
  )

  return (
    <Flex vertical gap={16}>
      <Flex align="center" gap={12} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>{t('Revue de la semaine')}</Typography.Title>
        <Typography.Text type="secondary">
          {data.last_done_at ? t('Dernière revue {when}', { when: dayjs(data.last_done_at).fromNow() }) : t('Première revue')}
        </Typography.Text>
        {!!count && <span style={{ marginLeft: 'auto' }}>{finishButton}</span>}
      </Flex>
      <Typography.Text type="secondary">{t(
        'Une décision par ligne : terminé, toujours d’actualité, reporté ou abandonné. Chaque décision sort l’élément de la revue.'
      )}</Typography.Text>
      {!!data.github_waiting && (
        <Alert
          type="info"
          showIcon
          message={t('{n} issue(s) ou PR attendent une réponse sur les dépôts', { n: data.github_waiting })}
          action={<Link to="/inbox/stale"><Button size="small">{t('Voir')}</Button></Link>}
        />
      )}
      {!count && <Result status="success" title={t('Rien à revoir 🎉')} subTitle={t('Tout ce qui est ouvert a bougé récemment.')} extra={finishButton} />}
      {SECTIONS.filter(({ key }) => sections[key].length).map(({ key, label }) => (
        <Card key={key} size="small" title={<SectionTitle label={t(label)} n={sections[key].length} />} styles={CARD_STYLES}>
          {key === 'testing' && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('Testé ? Marque-le terminé.')}</Typography.Text>}
          <List
            dataSource={sections[key]}
            renderItem={(it) => (
              <List.Item>
                <Flex vertical gap={8} style={{ width: '100%', minWidth: 0 }}>
                  <ItemRow item={it} actions={<></>} tags={key !== 'overdue' && <Tag>{t('sans changement depuis {n} j', { n: it.idle_days })}</Tag>} />
                  <ItemDecisions item={it} run={runItem(key)} overdue={key === 'overdue'} />
                </Flex>
              </List.Item>
            )}
          />
        </Card>
      ))}
      {!!sections.milestones.length && (
        <Card size="small" title={<SectionTitle label={t('Versions prévues dont la date est passée')} n={sections.milestones.length} />} styles={CARD_STYLES}>
          <List
            dataSource={sections.milestones}
            renderItem={(m) => (
              <List.Item>
                <Flex vertical gap={8} style={{ width: '100%', minWidth: 0 }}>
                  <Flex gap={8} align="center" wrap>
                    <Link to={`/projects/${m.project_id}/roadmap`}><Typography.Text strong>{m.project_name} {m.version}</Typography.Text></Link>
                    {m.title && <Typography.Text type="secondary">{m.title}</Typography.Text>}
                    <Tag color="red">{t('prévue le {date}', { date: dayjs(m.due_date).format('D MMM') })}</Tag>
                  </Flex>
                  <Flex gap={6} wrap>
                    <Button size="small" icon={<ClockCircleOutlined />} onClick={() => postpone(m, 'week')}>{t('Une semaine de plus')}</Button>
                    <Button size="small" onClick={() => postpone(m, 'month')}>{t('Un mois de plus')}</Button>
                    <Link to={`/projects/${m.project_id}/roadmap`}><Button size="small" type="link">{t('Ouvrir la version')}</Button></Link>
                  </Flex>
                </Flex>
              </List.Item>
            )}
          />
        </Card>
      )}
    </Flex>
  )
}
