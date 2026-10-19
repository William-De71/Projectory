import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Empty, Flex, Input, Segmented, Select, Spin, Typography } from 'antd'
import { CloudDownloadOutlined, PlusOutlined } from '@ant-design/icons'
import { useApi } from '../api/client.js'
import { PROJECT_STATUS, options } from '../components/labels.js'
import ProjectCard from '../components/ProjectCard.jsx'
import ProjectForm from '../components/ProjectForm.jsx'
import GithubImport from '../components/GithubImport.jsx'
import { t } from '../i18n/index.js'

export default function Projects() {
  const navigate = useNavigate()
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(null)
  const [importing, setImporting] = useState(false)

  // Opened from the command palette: /projects?new=1 or ?import=1
  useEffect(() => {
    if (searchParams.get('new')) setCreating({})
    if (searchParams.get('import')) setImporting(true)
    if (searchParams.get('new') || searchParams.get('import')) setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])
  const { data: categories } = useApi('/categories', { listen: true })
  const query = new URLSearchParams()
  if (status) query.set('status', status)
  const { data, loading } = useApi(`/projects?${query}`, { listen: true })

  const projects = useMemo(() => (data || []).filter((p) =>
    (category === 'all' || String(p.category_id) === category || (category === 'none' && !p.category_id)) &&
    (!q || `${p.name} ${p.description} ${p.client} ${(p.tags || []).join(' ')}`.toLowerCase().includes(q.toLowerCase()))
  ), [data, category, q])

  return (
    <Flex vertical gap={16}>
      <Flex align="center" gap={12} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>{t('Projets')}</Typography.Title>
        <Button icon={<CloudDownloadOutlined />} style={{ marginLeft: 'auto' }} onClick={() => setImporting(true)}>{t('Importer des dépôts')}</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating({})}>{t('Nouveau projet')}</Button>
      </Flex>
      <Flex gap={8} wrap align="center">
        {/* Many categories: scroll inside instead of widening the page on mobile. */}
        <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
          <Segmented
            value={category}
            onChange={setCategory}
            options={[
              { value: 'all', label: t('Tous ({n})', { n: data?.length ?? 0 }) },
              ...(categories || []).map((c) => ({ value: String(c.id), label: <span><span style={{ color: c.color }}>●</span> {c.name}</span> })),
            ]}
          />
        </div>
        <Select allowClear placeholder={t('Statut (hors archivés)')} style={{ width: 200 }} value={status} onChange={setStatus} options={options(PROJECT_STATUS)} />
        <Input.Search placeholder={t('Filtrer par nom, client, tag…')} allowClear onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
      </Flex>
      <Spin spinning={loading}>
        {projects.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
        ) : (
          !loading && <Empty description={t('Aucun projet ici')}><Button type="primary" onClick={() => setCreating({})}>{t('Créer un projet')}</Button></Empty>
        )}
      </Spin>
      <GithubImport open={importing} onClose={() => setImporting(false)} />
      <ProjectForm project={creating} onClose={() => setCreating(null)} onSaved={(p) => { setCreating(null); if (p) navigate(`/projects/${p.id}`) }} />
    </Flex>
  )
}
