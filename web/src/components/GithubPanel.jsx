import { useState } from 'react'
import { Link } from 'react-router-dom'
import { App, Avatar, Button, Empty, Flex, List, Segmented, Tag, Tooltip, Typography } from 'antd'
import { CommentOutlined, EyeOutlined, PullRequestOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange, useApi } from '../api/client.js'
import { refLabel } from './labels.js'
import ForgeIcon from './ForgeIcon.jsx'
import StaleTag from './StaleTag.jsx'
import { t } from '../i18n/index.js'

// Open issues & PRs / MRs mirrored by the last sync.
export default function GithubPanel({ projectId, project }) {
  const { message } = App.useApp()
  const [type, setType] = useState('issue')
  const query = new URLSearchParams({ type })
  if (projectId) query.set('project_id', projectId)
  const { data, loading } = useApi(`/github-items?${query}`, { listen: true })
  const { data: stale } = useApi('/stale', { listen: true })
  const staleById = new Map((stale?.items || []).map((s) => [s.id, s]))
  const forge = project?.forge || 'github'

  if (projectId && !project?.repo) return <Empty description={t('Aucun dépôt configuré pour ce projet')} />

  const track = async (it) => {
    try {
      await api.post(`/github-items/${it.id}/track`)
      message.success(t('Ajouté aux bugs & tâches du projet'))
      notifyChange()
    } catch (err) {
      message.error(err.message)
    }
  }

  return (
    <Flex vertical gap={12}>
      <Segmented
        value={type}
        onChange={setType}
        options={[{ value: 'issue', label: t('Issues ouvertes') }, { value: 'pr', label: forge === 'gitlab' ? t('Merge requests ouvertes') : t('Pull requests ouvertes') }]}
        style={{ alignSelf: 'start' }}
      />
      <List
        loading={loading}
        dataSource={data || []}
        locale={{ emptyText: <Empty description={t('Rien d\'ouvert (ou pas encore synchronisé)')} /> }}
        renderItem={(it) => (
          <List.Item
            actions={[
              it.comments ? <span key="c" style={{ opacity: 0.6 }}><CommentOutlined /> {it.comments}</span> : null,
              <Tooltip key="t" title={t('Suivre dans Bugs & tâches')}><Button size="small" icon={<EyeOutlined />} onClick={() => track(it)} /></Tooltip>,
            ].filter(Boolean)}
          >
            <List.Item.Meta
              avatar={<Avatar size="small" src={forge === 'github' && it.author ? `https://github.com/${it.author}.png?size=40` : undefined} icon={type === 'pr' ? <PullRequestOutlined /> : <ForgeIcon forge={forge} />} />}
              title={
                <Flex gap={6} wrap align="center">
                  <a href={it.url} target="_blank" rel="noreferrer">{refLabel(forge, it.type, it.number)} {it.title}</a>
                  {it.draft && <Tag>{t('Brouillon')}</Tag>}
                  {staleById.has(it.id) && <StaleTag item={staleById.get(it.id)} />}
                  {(it.labels || []).map((l) => <Tag key={l.name} color={l.color}>{l.name}</Tag>)}
                </Flex>
              }
              description={
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {!projectId && <><Link to={`/projects/${it.project_id}/github`}>{it.project_name}</Link> · </>}
                  {it.author}{' ' + t('· ouvert') + ' '}{dayjs(it.created_at).fromNow()}{' ' + t('· maj') + ' '}{dayjs(it.updated_at).fromNow()}
                </Typography.Text>
              }
            />
          </List.Item>
        )}
      />
    </Flex>
  )
}
