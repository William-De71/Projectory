import { useMemo, useState } from 'react'
import { Alert, App, Button, Checkbox, Flex, Input, Modal, Select, Table, Tag, Typography } from 'antd'
import { GithubOutlined, LockOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange, useApi } from '../api/client.js'
import { PROJECT_STATUS, options } from './labels.js'

// Bulk-creates projects from the repositories of a GitHub user / organisation.
export default function GithubImport({ open, onClose }) {
  const { message } = App.useApp()
  const { data: categories } = useApi(open ? '/categories' : null)
  const [owner, setOwner] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('')
  const [showForks, setShowForks] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [selected, setSelected] = useState([])
  const [categoryId, setCategoryId] = useState(null)
  const [status, setStatus] = useState('active')
  const [trackReleases, setTrackReleases] = useState(true)
  const [importing, setImporting] = useState(false)

  const load = async (value = owner) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/github/repos?owner=${encodeURIComponent(value.trim())}`)
      setResult(res)
      setOwner(res.owner)
      setSelected([])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const repos = useMemo(() => (result?.repos || []).filter((r) =>
    (showForks || !r.fork) &&
    (showArchived || !r.archived) &&
    (!filter || `${r.name} ${r.description} ${r.topics.join(' ')}`.toLowerCase().includes(filter.toLowerCase()))
  ), [result, filter, showForks, showArchived])

  const doImport = async () => {
    setImporting(true)
    try {
      const chosen = result.repos.filter((r) => selected.includes(r.full_name))
      const res = await api.post('/github/import', { repos: chosen, category_id: categoryId, status, track_releases: trackReleases })
      message.success(`${res.created} projet(s) créé(s)${res.skipped ? `, ${res.skipped} déjà suivi(s)` : ''} — première synchro lancée en arrière-plan`)
      notifyChange()
      onClose()
      setResult(null)
    } catch (err) {
      message.error(err.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={Math.min(980, window.innerWidth - 32)}
      title={<><GithubOutlined /> Importer des dépôts GitHub</>}
      okText={selected.length ? `Importer ${selected.length} dépôt${selected.length > 1 ? 's' : ''}` : 'Importer'}
      okButtonProps={{ disabled: !selected.length, loading: importing }}
      onOk={doImport}
      afterOpenChange={(visible) => { if (visible && !result) load('') }}
    >
      <Flex vertical gap={12}>
        <Flex gap={8} wrap>
          <Input.Search
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            onSearch={(v) => load(v)}
            placeholder="Utilisateur ou organisation (vide = propriétaire du token)"
            enterButton="Charger"
            loading={loading}
            style={{ maxWidth: 420 }}
          />
          <Input placeholder="Filtrer (ex. gladys-)" allowClear value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 200 }} />
          <Checkbox checked={showForks} onChange={(e) => setShowForks(e.target.checked)}>Forks</Checkbox>
          <Checkbox checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)}>Archivés</Checkbox>
        </Flex>
        {error && <Alert type="error" showIcon message={error} />}
        <Table
          rowKey="full_name"
          size="small"
          loading={loading}
          dataSource={repos}
          pagination={false}
          scroll={{ y: 360 }}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: setSelected,
            getCheckboxProps: (r) => ({ disabled: r.tracked }),
          }}
          columns={[
            {
              title: 'Dépôt',
              dataIndex: 'name',
              render: (name, r) => (
                <Flex vertical>
                  <Flex gap={6} align="center">
                    <Typography.Text strong>{name}</Typography.Text>
                    {r.private && <LockOutlined />}
                    {r.fork && <Tag>fork</Tag>}
                    {r.archived && <Tag>archivé</Tag>}
                    {r.tracked && <Tag color="green">déjà suivi</Tag>}
                  </Flex>
                  {r.description && <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>{r.description}</Typography.Text>}
                </Flex>
              ),
            },
            { title: 'Langage', dataIndex: 'language', width: 110, responsive: ['md'] },
            { title: 'Dernier push', dataIndex: 'pushed_at', width: 130, responsive: ['md'], render: (d) => (d ? dayjs(d).fromNow() : '—') },
          ]}
        />
        <Flex gap={12} wrap align="center">
          <Typography.Text>Pour les projets créés :</Typography.Text>
          <Select allowClear placeholder="Catégorie" style={{ width: 180 }} value={categoryId} onChange={setCategoryId} options={(categories || []).map((c) => ({ value: c.id, label: c.name }))} />
          <Select style={{ width: 150 }} value={status} onChange={setStatus} options={options(PROJECT_STATUS)} />
          <Checkbox checked={trackReleases} onChange={(e) => setTrackReleases(e.target.checked)}>Surveiller les releases</Checkbox>
        </Flex>
      </Flex>
    </Modal>
  )
}
