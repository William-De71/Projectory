import { useState } from 'react'
import { Link } from 'react-router-dom'
import { App, Button, Empty, Flex, List, Modal, Select, Tag, Tooltip, Typography } from 'antd'
import { BellOutlined, BugOutlined, CheckOutlined, EyeOutlined, CloseCircleOutlined, CheckCircleOutlined, GithubOutlined, MessageOutlined, PullRequestOutlined, RocketOutlined, UndoOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange } from '../api/client.js'
import { ITEM_KIND, PRIORITY, options } from './labels.js'
import { t } from '../i18n/index.js'
import { followTopic } from './ForumWatches.jsx'

const ICONS = {
  issue: <GithubOutlined />,
  pr: <PullRequestOutlined />,
  release: <RocketOutlined />,
  discourse: <MessageOutlined />,
  discourse_mentions: <MessageOutlined />,
  rss: <MessageOutlined />,
  ci_failed: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
  ci_fixed: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  gh_notification: <BellOutlined style={{ color: '#fa8c16' }} />,
  pr_status: <PullRequestOutlined style={{ color: '#eb2f96' }} />,
  forum_followed: <MessageOutlined style={{ color: '#13c2c2' }} />,
  forum_reply: <MessageOutlined style={{ color: '#52c41a' }} />,
}
const KIND_LABELS = { issue: 'Issue', pr: 'PR', release: 'Version', discourse: 'Forum', discourse_mentions: 'Pour toi', rss: 'RSS', ci_failed: 'CI', ci_fixed: 'CI', gh_notification: 'Pour toi', pr_status: 'Ma PR', forum_reply: 'À répondre', forum_followed: 'Sujet suivi' }

function ConvertModal({ entry, onClose, onDone }) {
  const { message } = App.useApp()
  const [kind, setKind] = useState('bug')
  const [priority, setPriority] = useState('normal')
  const convert = async () => {
    try {
      await api.post(`/inbox/${entry.id}/to-item`, { kind, priority })
      message.success(t('Ajouté au suivi du projet'))
      notifyChange()
      onDone()
    } catch (err) {
      message.error(err.message)
    }
  }
  return (
    <Modal open={!!entry} title={t('Ajouter au suivi')} onCancel={onClose} onOk={convert} okText={t('Ajouter')} destroyOnHidden>
      <Typography.Paragraph strong>{entry?.title}</Typography.Paragraph>
      <Flex gap={8}>
        <Select value={kind} onChange={setKind} options={options(ITEM_KIND)} style={{ flex: 1 }} />
        <Select value={priority} onChange={setPriority} options={options(PRIORITY)} style={{ flex: 1 }} />
      </Flex>
    </Modal>
  )
}

const FOLLOWABLE = ['discourse', 'discourse_mentions']

export default function InboxList({ entries, loading, onChange, showProject = true }) {
  const { message } = App.useApp()
  const [converting, setConverting] = useState(null)

  const follow = async (entry) => {
    try {
      await followTopic({ project_id: entry.project_id, url: entry.url, title: entry.title })
      message.success(t('Sujet suivi : chaque nouvelle réponse arrivera ici'))
    } catch (err) {
      message.error(err.message)
    }
  }

  const toggleRead = async (entry) => {
    await api.post(`/inbox/${entry.id}/read`, { read: !entry.read_at })
    notifyChange()
    onChange?.()
  }

  return (
    <>
      <List
        loading={loading}
        dataSource={entries || []}
        locale={{ emptyText: <Empty description={t('Rien de nouveau')} /> }}
        renderItem={(entry) => (
          <List.Item
            actions={[
              entry.item_id ? (
                <Tag key="tracked" color="green">{t('Suivi')}</Tag>
              ) : !['release', 'ci_fixed', 'gh_notification'].includes(entry.kind) && entry.project_id ? (
                <Tooltip key="convert" title={t('Transformer en bug / tâche')}><Button size="small" icon={<BugOutlined />} onClick={() => setConverting(entry)} /></Tooltip>
              ) : null,
              FOLLOWABLE.includes(entry.kind) && entry.project_id && /\/t\//.test(entry.url) ? (
                <Tooltip key="follow" title={t('Suivre les réponses de ce sujet')}><Button size="small" icon={<EyeOutlined />} onClick={() => follow(entry)} /></Tooltip>
              ) : null,
              <Tooltip key="read" title={entry.read_at ? t('Marquer non lu') : t('Marquer lu')}>
                <Button size="small" icon={entry.read_at ? <UndoOutlined /> : <CheckOutlined />} onClick={() => toggleRead(entry)} />
              </Tooltip>,
            ].filter(Boolean)}
          >
            <List.Item.Meta
              avatar={<span style={{ fontSize: 18, opacity: entry.read_at ? 0.45 : 1 }}>{ICONS[entry.kind] || <MessageOutlined />}</span>}
              title={
                <Flex gap={6} wrap align="center" className={entry.read_at ? '' : 'unread-row'}>
                  <Tag>{t(KIND_LABELS[entry.kind] || entry.kind)}</Tag>
                  {entry.url ? (
                    <a href={entry.url} target="_blank" rel="noreferrer" onClick={() => !entry.read_at && toggleRead(entry)}>{entry.title}</a>
                  ) : entry.title}
                </Flex>
              }
              description={
                <Flex vertical gap={2}>
                  {entry.excerpt && <Typography.Text type="secondary" ellipsis={{ tooltip: entry.excerpt }} style={{ maxWidth: 800 }}>{entry.excerpt}</Typography.Text>}
                  <span style={{ fontSize: 12 }}>
                    {showProject && entry.project_name && <><Link to={`/projects/${entry.project_id}`}>{entry.project_name}</Link> · </>}
                    {dayjs.utc(entry.created_at).local().fromNow()}
                  </span>
                </Flex>
              }
            />
          </List.Item>
        )}
      />
      <ConvertModal entry={converting} onClose={() => setConverting(null)} onDone={() => { setConverting(null); onChange?.() }} />
    </>
  )
}
