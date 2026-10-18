import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Card, Empty, Flex, Input, Segmented, Tag, Typography } from 'antd'
import { PlusOutlined, PushpinFilled } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useApi } from '../api/client.js'
import { DOC_STATUS } from './labels.js'
import { LabelTag } from './Tags.jsx'
import DocEditor from './DocEditor.jsx'
import Markdown from './Markdown.jsx'

// Specs / notes for a project, or global notes when projectId is absent.
export default function DocsPanel({ projectId, type, allowTypeFilter = false }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [editing, setEditing] = useState(null)
  const [filterType, setFilterType] = useState('all')
  const [q, setQ] = useState('')
  const query = new URLSearchParams()
  if (projectId) query.set('project_id', projectId)
  const effectiveType = type || (filterType === 'all' ? null : filterType)
  if (effectiveType === 'global') query.set('global', '1')
  else if (effectiveType) query.set('type', effectiveType)
  const { data, loading, reload } = useApi(`/docs?${query}`, { listen: true })

  // Opens the doc requested via ?doc=ID (from global search).
  useEffect(() => {
    const id = Number(searchParams.get('doc'))
    const doc = id && data?.find((d) => d.id === id)
    if (doc) {
      setEditing(doc)
      setSearchParams((p) => { p.delete('doc'); return p }, { replace: true })
    }
  }, [data, searchParams, setSearchParams])

  const docs = (data || []).filter((d) => !q || `${d.title} ${d.content}`.toLowerCase().includes(q.toLowerCase()))
  const newType = type === 'spec' ? 'spec' : 'note'

  return (
    <Flex vertical gap={12}>
      <Flex gap={8} wrap align="center">
        {allowTypeFilter && (
          <Segmented
            value={filterType}
            onChange={setFilterType}
            options={[{ value: 'all', label: 'Tout' }, { value: 'global', label: 'Notes globales' }, { value: 'note', label: 'Notes' }, { value: 'spec', label: 'Specs' }]}
          />
        )}
        <Input.Search placeholder="Filtrer…" allowClear onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
        <Button type="primary" icon={<PlusOutlined />} style={{ marginLeft: 'auto' }} onClick={() => setEditing({ type: newType, project_id: projectId ? Number(projectId) : null })}>
          {newType === 'spec' ? 'Nouvelle spec' : 'Nouvelle note'}
        </Button>
      </Flex>
      {!loading && !docs.length && <Empty description={type === 'spec' ? 'Aucune spécification' : 'Aucune note'} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {docs.map((d) => (
          <Card
            key={d.id}
            hoverable
            size="small"
            onClick={() => setEditing(d)}
            title={<Flex gap={6} align="center">{d.pinned && <PushpinFilled style={{ color: '#fa8c16' }} />}<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</span></Flex>}
            extra={d.type === 'spec' ? <LabelTag map={DOC_STATUS} value={d.status} /> : null}
          >
            <div style={{ maxHeight: 140, overflow: 'hidden', fontSize: 13, maskImage: 'linear-gradient(#000 70%, transparent)' }}>
              <Markdown>{d.content}</Markdown>
            </div>
            <Flex justify="space-between" style={{ marginTop: 8, fontSize: 12 }}>
              <Typography.Text type="secondary">{dayjs.utc(d.updated_at).local().format('DD/MM/YYYY HH:mm')}</Typography.Text>
              {!projectId && <Tag>{d.project_name || 'Global'}{d.type === 'spec' ? ' · spec' : ''}</Tag>}
            </Flex>
          </Card>
        ))}
      </div>
      <DocEditor
        doc={editing}
        withProjectPicker={!projectId}
        onClose={() => setEditing(null)}
        onSaved={(saved) => { setEditing(saved); reload() }}
        onDeleted={reload}
      />
    </Flex>
  )
}
