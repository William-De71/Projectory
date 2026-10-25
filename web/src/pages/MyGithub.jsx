import { Link } from 'react-router-dom'
import { App, Button, Card, Empty, Flex, List, Spin, Tag, Tooltip, Typography } from 'antd'
import { PlusSquareOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange, useApi } from '../api/client.js'
import { refLabel } from '../components/labels.js'
import PrStatus from '../components/PrStatus.jsx'
import { useItemPanel } from '../components/ItemPanel.jsx'
import { t } from '../i18n/index.js'

const SECTIONS = [
  { key: 'review', title: 'Reviews demandées', match: (it) => it.mine.includes('review'), empty: 'Aucune review en attente' },
  { key: 'prs', title: 'Mes PR', match: (it) => it.type === 'pr' && it.mine.includes('author'), empty: 'Aucune PR ouverte' },
  { key: 'assigned', title: 'Assignées à moi', match: (it) => it.mine.includes('assignee'), empty: 'Rien d’assigné' },
  { key: 'mentions', title: 'Mentions', match: (it) => it.mine.includes('mention'), empty: 'Aucune mention' },
  { key: 'issues', title: 'Mes issues', match: (it) => it.type === 'issue' && it.mine.includes('author'), empty: 'Aucune issue ouverte' },
]

// PRs and reviews waiting for the user: reviews to do, own PRs that need something.
export const needsAction = (it) => it.mine.includes('review')
  || (it.type === 'pr' && it.mine.includes('author') && (it.pr_state?.review === 'changes_requested' || it.pr_state?.conflict || it.pr_state?.ci === 'failure'))

// Title of the task created from an item: what needs doing comes first.
function taskFor(it) {
  const ref = `${refLabel(it.forge, it.type, it.number)} ${it.title}`
  const st = it.type === 'pr' ? it.pr_state || {} : {}
  if (st.conflict) return { title: t('Résoudre le conflit : {ref}', { ref }), priority: 'high' }
  if (st.review === 'changes_requested') return { title: t('Corriger les retours de review : {ref}', { ref }), priority: 'high' }
  if (st.ci === 'failure') return { title: t('Corriger la CI : {ref}', { ref }), priority: 'high' }
  if (it.mine.includes('review')) return { title: t('Faire la review : {ref}', { ref }), priority: 'normal' }
  return { title: ref, priority: 'normal' }
}

function Row({ it }) {
  const { message } = App.useApp()
  const { openItem } = useItemPanel()
  const createTask = async () => {
    try {
      await api.post(`/github-items/${it.id}/track`, { kind: 'task', ...taskFor(it) })
      message.success(t('Tâche créée dans {project}', { project: it.project_name }))
      notifyChange()
    } catch (err) {
      message.error(err.message)
    }
  }
  return (
    <List.Item
      actions={[
        it.item_id
          ? <Tag key="t" color="green" className="clickable" style={{ marginInlineEnd: 0 }} onClick={() => openItem(it.item_id)}>{t('Tâche créée')}</Tag>
          : <Tooltip key="t" title={t('Créer une tâche : « {title} »', { title: taskFor(it).title })}><Button size="small" icon={<PlusSquareOutlined />} aria-label={t('Créer une tâche')} onClick={createTask} /></Tooltip>,
      ]}
    >
      <Flex vertical gap={4} style={{ minWidth: 0, width: '100%' }}>
        <a href={it.url} target="_blank" rel="noreferrer">{refLabel(it.forge, it.type, it.number)} {it.title}</a>
        <Flex gap={4} wrap align="center">
          <Link to={`/projects/${it.project_id}/github`}><Tag style={{ marginInlineEnd: 0 }}>{it.project_name}</Tag></Link>
          {it.type === 'pr' && <PrStatus state={it.pr_state} />}
          {it.draft && <Tag style={{ marginInlineEnd: 0 }}>{t('Brouillon')}</Tag>}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {it.author} · {t('maj {when}', { when: dayjs(it.updated_at).fromNow() })}
          </Typography.Text>
        </Flex>
      </Flex>
    </List.Item>
  )
}

// Issues and PRs that concern the user (author, assignee, review, mention), across projects.
export default function MyGithub() {
  const { data, loading } = useApi('/my-github', { listen: true })
  if (!data) return <Spin spinning={loading}><div style={{ height: 300 }} /></Spin>

  const sections = SECTIONS.map((sec) => ({ ...sec, rows: data.filter(sec.match) }))
  const ordered = [...sections.filter((sec) => sec.rows.length), ...sections.filter((sec) => !sec.rows.length)]

  return (
    <Flex vertical gap={16}>
      <Typography.Text type="secondary">{t('Issues et PR qui te concernent, sur tous tes projets')}</Typography.Text>
      {!data.length ? (
        <Empty description={t('Rien pour l’instant. Ces listes utilisent le compte du token de la forge (Paramètres → Forges et tokens) et se remplissent à la synchro.')} />
      ) : (
        <div style={{ columnWidth: 420, columnGap: 16 }}>
          {ordered.map((sec) => (
            <Card
              key={sec.key}
              size="small"
              title={<>{t(sec.title)} <Tag style={{ marginInlineStart: 4 }}>{sec.rows.length}</Tag></>}
              style={{ breakInside: 'avoid', marginBottom: 16 }}
            >
              {sec.rows.length
                ? <List size="small" dataSource={sec.rows} rowKey="id" renderItem={(it) => <Row it={it} />} />
                : <Typography.Text type="secondary">{t(sec.empty)}</Typography.Text>}
            </Card>
          ))}
        </div>
      )}
    </Flex>
  )
}
