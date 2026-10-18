import { Link } from 'react-router-dom'
import { Avatar, Empty, Flex, List, Segmented, Tag, Typography } from 'antd'
import { CommentOutlined, GithubOutlined, PullRequestOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useState } from 'react'
import { useApi } from '../api/client.js'

// Open GitHub issues & PRs mirrored by the last sync.
export default function GithubPanel({ projectId, repo }) {
  const [type, setType] = useState('issue')
  const query = new URLSearchParams({ type })
  if (projectId) query.set('project_id', projectId)
  const { data, loading } = useApi(`/github-items?${query}`, { listen: true })

  if (projectId && !repo) return <Empty description="Aucun dépôt GitHub configuré pour ce projet" />

  return (
    <Flex vertical gap={12}>
      <Segmented value={type} onChange={setType} options={[{ value: 'issue', label: 'Issues ouvertes' }, { value: 'pr', label: 'Pull requests ouvertes' }]} style={{ alignSelf: 'start' }} />
      <List
        loading={loading}
        dataSource={data || []}
        locale={{ emptyText: <Empty description="Rien d'ouvert (ou pas encore synchronisé)" /> }}
        renderItem={(it) => (
          <List.Item extra={it.comments ? <span style={{ opacity: 0.6 }}><CommentOutlined /> {it.comments}</span> : null}>
            <List.Item.Meta
              avatar={<Avatar size="small" src={it.author ? `https://github.com/${it.author}.png?size=40` : undefined} icon={type === 'pr' ? <PullRequestOutlined /> : <GithubOutlined />} />}
              title={
                <Flex gap={6} wrap align="center">
                  <a href={it.url} target="_blank" rel="noreferrer">#{it.number} {it.title}</a>
                  {it.draft && <Tag>Brouillon</Tag>}
                  {(it.labels || []).map((l) => <Tag key={l.name} color={l.color}>{l.name}</Tag>)}
                </Flex>
              }
              description={
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {!projectId && <><Link to={`/projects/${it.project_id}/github`}>{it.project_name}</Link> · </>}
                  {it.author} · ouvert {dayjs(it.created_at).fromNow()} · maj {dayjs(it.updated_at).fromNow()}
                </Typography.Text>
              }
            />
          </List.Item>
        )}
      />
    </Flex>
  )
}
