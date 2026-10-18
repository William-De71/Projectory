import { useState } from 'react'
import { Button, Flex, Segmented, Typography } from 'antd'
import { api, notifyChange, useApi } from '../api/client.js'
import InboxList from '../components/InboxList.jsx'
import ProjectSelect from '../components/ProjectSelect.jsx'
import { t } from '../i18n/index.js'

export default function Inbox() {
  const [scope, setScope] = useState('unread')
  const [source, setSource] = useState('all')
  const [projectId, setProjectId] = useState(null)
  const query = new URLSearchParams()
  if (scope === 'unread') query.set('unread', '1')
  if (source !== 'all') query.set('source', source)
  if (projectId) query.set('project_id', projectId)
  const { data, loading, reload } = useApi(`/inbox?${query}`, { listen: true })

  const markAll = async () => {
    await api.post('/inbox/read-all', { project_id: projectId, source: source === 'all' ? undefined : source })
    notifyChange()
  }

  return (
    <Flex vertical gap={16}>
      <Flex align="center" gap={12} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>{t('Boîte de réception')}</Typography.Title>
        <Button style={{ marginLeft: 'auto' }} onClick={markAll} disabled={!data?.some((x) => !x.read_at)}>{t('Tout marquer comme lu')}</Button>
      </Flex>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>{t(
        'Nouvelles issues et PR/MR, CI, notifications GitHub perso, nouvelles versions publiées et nouveaux sujets de forum détectés à chaque synchro.'
      )}</Typography.Paragraph>
      <Flex gap={8} wrap>
        <Segmented value={scope} onChange={setScope} options={[{ value: 'unread', label: t('Non lus') }, { value: 'all', label: t('Tout') }]} />
        <Segmented
          value={source}
          onChange={setSource}
          options={[{ value: 'all', label: t('Toutes sources') }, { value: 'repo', label: t('Dépôts') }, { value: 'forum', label: t('Forums') }, { value: 'version', label: t('Versions') }]}
        />
        <ProjectSelect allowClear value={projectId} onChange={setProjectId} style={{ width: 220 }} placeholder={t('Tous les projets')} />
      </Flex>
      <InboxList entries={data} loading={loading} onChange={reload} />
    </Flex>
  )
}
