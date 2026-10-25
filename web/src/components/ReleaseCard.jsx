import { Card } from 'antd'
import { useApi } from '../api/client.js'
import ReleaseRow from './ReleaseRow.jsx'
import { t } from '../i18n/index.js'

// Next release of one project (Versions tab), once a sync has looked at its repository.
export default function ReleaseCard({ projectId }) {
  const { data, setData } = useApi(`/projects/${projectId}/release`, { listen: true })
  if (!data?.release) return null
  return (
    <Card size="small" title={t('Prochaine release')}>
      <ReleaseRow row={data} showProject={false} onChange={setData} />
    </Card>
  )
}
