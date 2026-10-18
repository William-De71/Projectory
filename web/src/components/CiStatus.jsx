import { Tag, Tooltip } from 'antd'
import { CheckCircleFilled, CloseCircleFilled, MinusCircleFilled, SyncOutlined } from '@ant-design/icons'

export const CI = {
  success: { label: 'CI OK', color: 'success', icon: <CheckCircleFilled style={{ color: '#52c41a' }} /> },
  failure: { label: 'CI en échec', color: 'error', icon: <CloseCircleFilled style={{ color: '#ff4d4f' }} /> },
  pending: { label: 'CI en cours', color: 'processing', icon: <SyncOutlined spin style={{ color: '#1677ff' }} /> },
  neutral: { label: 'CI annulée / ignorée', color: 'default', icon: <MinusCircleFilled style={{ color: '#8c8c8c' }} /> },
}

// Compact icon (cards) or tag (headers) for a GitHub Actions conclusion.
export default function CiStatus({ ci, variant = 'icon' }) {
  const entry = CI[ci?.conclusion]
  if (!entry) return null
  const detail = ci.runs.map((r) => `${r.name} : ${r.conclusion || r.status}`).join(' · ')
  if (variant === 'tag') {
    return (
      <Tooltip title={detail}>
        <Tag color={entry.color} icon={entry.icon}>{entry.label}</Tag>
      </Tooltip>
    )
  }
  return <Tooltip title={`${entry.label} — ${detail}`}>{entry.icon}</Tooltip>
}
