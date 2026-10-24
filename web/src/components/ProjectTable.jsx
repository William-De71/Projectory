import { useNavigate } from 'react-router-dom'
import { Flex, Table, Tag, Tooltip, Typography } from 'antd'
import { PushpinFilled, WarningOutlined } from '@ant-design/icons'
import { PROJECT_STATUS } from './labels.js'
import { CategoryTag, LabelTag } from './Tags.jsx'
import CiStatus from './CiStatus.jsx'
import { latestVersion, versionLabel } from './ProjectCard.jsx'
import { t } from '../i18n/index.js'

const CI_ORDER = { failure: 0, pending: 1, neutral: 2, success: 3 }
const byNumber = (key) => (a, b) => (a[key] || 0) - (b[key] || 0)

// Compact list of projects, an alternative to the cards grid.
export default function ProjectTable({ projects }) {
  const navigate = useNavigate()
  const columns = [
    {
      title: t('Projet'),
      dataIndex: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name, p) => (
        <Flex gap={6} align="center" wrap>
          {p.pinned && <PushpinFilled style={{ color: '#fa8c16' }} />}
          <Typography.Text strong>{name}</Typography.Text>
          {p.unread > 0 && <Tag color="red" style={{ marginInlineEnd: 0 }}>{p.unread > 1 ? t('{n} nouveaux', { n: p.unread }) : t('{n} nouveau', { n: p.unread })}</Tag>}
          {p.sync_error && <Tooltip title={p.sync_error}><WarningOutlined style={{ color: '#ff4d4f' }} /></Tooltip>}
        </Flex>
      ),
    },
    {
      title: t('Catégorie'),
      dataIndex: 'category_name',
      width: 140,
      responsive: ['md'],
      sorter: (a, b) => (a.category_name || '').localeCompare(b.category_name || ''),
      render: (name, p) => <CategoryTag name={name} color={p.category_color} />,
    },
    { title: t('Statut'), dataIndex: 'status', width: 120, responsive: ['md'], render: (v) => <LabelTag map={PROJECT_STATUS} value={v} /> },
    { title: t('Client / organisation'), dataIndex: 'client', width: 170, responsive: ['lg'], render: (v) => v && <Tag>{v}</Tag> },
    { title: t('Bugs / tâches'), dataIndex: 'open_items', width: 110, align: 'right', sorter: byNumber('open_items') },
    { title: t('Issues'), dataIndex: 'open_issues', width: 80, align: 'right', responsive: ['sm'], sorter: byNumber('open_issues'), render: (v, p) => (p.repo ? v : '') },
    { title: t('PR'), dataIndex: 'open_prs', width: 70, align: 'right', responsive: ['sm'], sorter: byNumber('open_prs'), render: (v, p) => (p.repo ? v : '') },
    {
      title: t('CI'),
      width: 60,
      align: 'center',
      responsive: ['sm'],
      sorter: (a, b) => (CI_ORDER[a.github?.ci?.conclusion] ?? 4) - (CI_ORDER[b.github?.ci?.conclusion] ?? 4),
      render: (_, p) => <CiStatus ci={p.github?.ci} />,
    },
    {
      title: t('Version'),
      width: 150,
      responsive: ['md'],
      render: (_, p) => {
        const latest = latestVersion(p)
        if (!latest && !p.deployed_version) return null
        return (
          <Tag color={p.outdated ? 'orange' : 'default'} style={{ marginInlineEnd: 0 }}>
            {p.outdated && <WarningOutlined />} {versionLabel(p.deployed_version, latest)}
          </Tag>
        )
      },
    },
  ]
  return (
    <Table
      rowKey="id"
      size="middle"
      columns={columns}
      dataSource={projects}
      pagination={{ pageSize: 50, hideOnSinglePage: true }}
      scroll={{ x: 800 }}
      onRow={(p) => ({ onClick: () => navigate(`/projects/${p.id}`), style: { cursor: 'pointer', boxShadow: `inset 3px 0 0 ${p.category_color || 'transparent'}` } })}
    />
  )
}
