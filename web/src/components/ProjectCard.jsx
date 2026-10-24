import { useNavigate } from 'react-router-dom'
import { Badge, Card, Flex, Tag, Tooltip, Typography } from 'antd'
import { BugOutlined, PullRequestOutlined, PushpinFilled, WarningOutlined } from '@ant-design/icons'
import ForgeIcon from './ForgeIcon.jsx'
import { PROJECT_STATUS } from './labels.js'
import { CategoryTag, LabelTag } from './Tags.jsx'
import CiStatus from './CiStatus.jsx'
import { t } from '../i18n/index.js'

const stripMarkdown = (md) => md.replace(/[*_`#>~]|\[([^\]]*)\]\([^)]*\)/g, (m, label) => label ?? '')

export function versionLabel(deployed, latest) {
  if (!deployed) return latest
  if (!latest || latest.replace(/^v/, '') === deployed.replace(/^v/, '')) return deployed
  return `${deployed} → ${latest}`
}

export function latestVersion(p) {
  return (p.versions || []).find((v) => v.version)?.version
}

export default function ProjectCard({ project: p }) {
  const navigate = useNavigate()
  const latest = latestVersion(p)
  return (
    <Badge.Ribbon text={p.unread ? (p.unread > 1 ? t('{n} nouveaux', { n: p.unread }) : t('{n} nouveau', { n: p.unread })) : null} color="red" style={{ display: p.unread ? undefined : 'none' }}>
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
            <Tooltip title={t('Bugs / tâches ouverts')}><span><BugOutlined /> {p.open_items}</span></Tooltip>
            {p.repo && <Tooltip title={t('Issues ouvertes sur le dépôt')}><span><ForgeIcon forge={p.forge} /> {p.open_issues}</span></Tooltip>}
            {p.repo && <Tooltip title={p.forge === 'gitlab' ? t('MR ouvertes') : t('PR ouvertes')}><span><PullRequestOutlined /> {p.open_prs}</span></Tooltip>}
            <CiStatus ci={p.github?.ci} />
            {(latest || p.deployed_version) && (
              <Tooltip title={p.deployed_version ? t('Utilisée : {used} — dernière : {latest}', { used: p.deployed_version, latest: latest || '?' }) : t('Dernière version publiée')}>
                <Tag color={p.outdated ? 'orange' : 'default'} style={{ marginInlineEnd: 0 }}>
                  {p.outdated && <WarningOutlined />} {versionLabel(p.deployed_version, latest)}
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
