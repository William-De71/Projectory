import { useMemo, useState } from 'react'
import { Alert, App, Button, Checkbox, Flex, Input, Modal, Select, Table, Tag, Typography } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange, useApi } from '../api/client.js'
import { FORGES, PROJECT_STATUS, options } from './labels.js'
import ForgeIcon from './ForgeIcon.jsx'
import { t } from '../i18n/index.js'

// Bulk-creates projects from the repositories of a user / organisation / group on any forge.
export default function GithubImport({ open, onClose }) {
  const { message } = App.useApp()
  const { data: categories } = useApi(open ? '/categories' : null)
  const [owner, setOwner] = useState('')
  const [forge, setForge] = useState('github')
  const [forgeUrl, setForgeUrl] = useState('')
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

  const load = async (value = owner, f = forge, url = forgeUrl) => {
    if (f !== 'github' && !url) return setError("Indique l'adresse de l'instance")
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/forges/repos?forge=${f}&url=${encodeURIComponent(url)}&owner=${encodeURIComponent(value.trim())}`)
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
      const res = await api.post('/forges/import', { forge, forge_url: forgeUrl, repos: chosen, category_id: categoryId, status, track_releases: trackReleases })
      message.success(res.skipped
        ? t('{created} projet(s) créé(s), {skipped} déjà suivi(s) — première synchro lancée en arrière-plan', res)
        : t('{created} projet(s) créé(s) — première synchro lancée en arrière-plan', res))
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
      title={<><ForgeIcon forge={forge} />{' ' + t('Importer des dépôts')}</>}
      okText={selected.length ? (selected.length > 1 ? t('Importer {n} dépôts', { n: selected.length }) : t('Importer {n} dépôt', { n: selected.length })) : t('Importer')}
      okButtonProps={{ disabled: !selected.length, loading: importing }}
      onOk={doImport}
      afterOpenChange={async (visible) => {
        if (!visible || result) return
        // Reopen on the forge / owner used last time.
        const last = await api.get('/forges/last-import').catch(() => ({}))
        const f = last.forge || 'github'
        setForge(f)
        setForgeUrl(last.url || '')
        setOwner(last.owner || '')
        if (f === 'github' || last.url) load(last.owner || '', f, last.url || '')
      }}
    >
      <Flex vertical gap={12}>
        <Flex gap={8} wrap>
          <Select value={forge} style={{ width: 160 }} options={Object.entries(FORGES).map(([value, f]) => ({ value, label: f.label }))}
            onChange={(f) => { setForge(f); setForgeUrl(f === 'gitlab' ? 'https://gitlab.com' : ''); setResult(null); setSelected([]) }} />
          {forge !== 'github' && <Input value={forgeUrl} onChange={(e) => setForgeUrl(e.target.value)} placeholder={forge === 'gitlab' ? 'https://gitlab.com' : 'https://git.mondomaine.fr'} style={{ width: 240 }} />}
        </Flex>
        <Flex gap={8} wrap>
          <Input.Search
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            onSearch={(v) => load(v)}
            placeholder={forge === 'gitlab' ? t('Utilisateur ou groupe (vide = propriétaire du token)') : t('Utilisateur ou organisation (vide = propriétaire du token)')}
            enterButton="Charger"
            loading={loading}
            style={{ maxWidth: 420 }}
          />
          <Input placeholder={t('Filtrer (ex. gladys-)')} allowClear value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 200 }} />
          <Checkbox checked={showForks} onChange={(e) => setShowForks(e.target.checked)}>{t('Forks')}</Checkbox>
          <Checkbox checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)}>{t('Archivés')}</Checkbox>
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
              title: t('Dépôt'),
              dataIndex: 'name',
              render: (name, r) => (
                <Flex vertical>
                  <Flex gap={6} align="center">
                    <Typography.Text strong>{name}</Typography.Text>
                    {r.private && <LockOutlined />}
                    {r.fork && <Tag>{t('fork')}</Tag>}
                    {r.archived && <Tag>{t('archivé')}</Tag>}
                    {r.tracked && <Tag color="green">{t('déjà suivi')}</Tag>}
                  </Flex>
                  {r.description && <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>{r.description}</Typography.Text>}
                </Flex>
              ),
            },
            { title: t('Langage'), dataIndex: 'language', width: 110, responsive: ['md'] },
            { title: t('Dernier push'), dataIndex: 'pushed_at', width: 130, responsive: ['md'], render: (d) => (d ? dayjs(d).fromNow() : '—') },
          ]}
        />
        <Flex gap={12} wrap align="center">
          <Typography.Text>{t('Pour les projets créés :')}</Typography.Text>
          <Select allowClear placeholder={t('Catégorie')} style={{ width: 180 }} value={categoryId} onChange={setCategoryId} options={(categories || []).map((c) => ({ value: c.id, label: c.name }))} />
          <Select style={{ width: 150 }} value={status} onChange={setStatus} options={options(PROJECT_STATUS)} />
          <Checkbox checked={trackReleases} onChange={(e) => setTrackReleases(e.target.checked)}>{t('Surveiller les releases')}</Checkbox>
        </Flex>
      </Flex>
    </Modal>
  )
}
