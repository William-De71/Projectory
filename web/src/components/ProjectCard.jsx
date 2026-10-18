import { useNavigate } from 'react-router-dom'
import { Badge, Card, Flex, Tag, Tooltip, Typography } from 'antd'
import { BugOutlined, GithubOutlined, PullRequestOutlined, PushpinFilled, WarningOutlined } from '@ant-design/icons'
import { PROJECT_STATUS } from './labels.js'
import { CategoryTag, LabelTag } from './Tags.jsx'

const stripMarkdown = (md) => md.replace(/[*_`#>~]|\[([^\]]*)\]\([^)]*\)/g, (m, label) => label ?? '')

export function latestVersion(p) {
  return (p.versions || []).find((v) => v.version)?.version
}

export default function ProjectCard({ project: p }) {
  const navigate = useNavigate()
  const latest = latestVersion(p)
  return (
    <Badge.Ribbon text={p.unread ? `${p.unread} nouveau${p.unread > 1 ? 'x' : ''}` : null} color="red" style={{ display: p.unread ? undefined : 'none' }}>
      <Card hoverable size="small" onClick={() => navigate(`/projects/${p.id}`)} style={{ height: '100%', borderTop: `3px solid ${p.category_color || 'transparent'}` }}>
        <Flex vertical gap={8}>
          <Flex gap={6} align="center">
            {p.pinned && <PushpinFilled style={{ color: '#fa8c16' }} />}
            <Typography.Text strong style={{ fontSize: 15 }} ellipsis>{p.name}</Typography.Text>
          </Flex>
          <Flex gap={4} wrap>
            <CategoryTag name={p.category_name} color={p.category_color} />
            <LabelTag map={PROJECT_STATUS} value={p.status} />
            {p.client && <Tag>{p.client}</Tag>}
          </Flex>
          {p.description && <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0, fontSize: 13 }}>{stripMarkdown(p.description)}</Typography.Paragraph>}
          <Flex gap={14} wrap style={{ fontSize: 13 }}>
            <Tooltip title="Bugs / tâches ouverts"><span><BugOutlined /> {p.open_items}</span></Tooltip>
            {p.repo && <Tooltip title="Issues GitHub ouvertes"><span><GithubOutlined /> {p.open_issues}</span></Tooltip>}
            {p.repo && <Tooltip title="PR ouvertes"><span><PullRequestOutlined /> {p.open_prs}</span></Tooltip>}
            {(latest || p.deployed_version) && (
              <Tooltip title={`Utilisée : ${p.deployed_version || '?'} — dernière : ${latest || '?'}`}>
                <Tag color={p.outdated ? 'orange' : 'default'} style={{ marginInlineEnd: 0 }}>
                  {p.outdated && <WarningOutlined />} {p.deployed_version || '?'}{latest && latest.replace(/^v/, '') !== p.deployed_version.replace(/^v/, '') ? ` → ${latest}` : ''}
                </Tag>
              </Tooltip>
            )}
            {p.sync_error && <Tooltip title={p.sync_error}><WarningOutlined style={{ color: '#ff4d4f' }} /></Tooltip>}
          </Flex>
        </Flex>
      </Card>
    </Badge.Ribbon>
  )
}
