import { useState } from 'react'
import { App, Button, Card, ColorPicker, Descriptions, Flex, Input, InputNumber, Popconfirm, Table, Tag, Typography } from 'antd'
import { DeleteOutlined, DownloadOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange, useApi } from '../api/client.js'
import NotificationSettings from '../components/NotificationSettings.jsx'

function Categories() {
  const { message } = App.useApp()
  const { data, loading, reload } = useApi('/categories', { listen: true })
  const [name, setName] = useState('')

  const update = async (id, body) => {
    try {
      await api.put(`/categories/${id}`, body)
      notifyChange()
    } catch (err) {
      message.error(err.message)
    }
  }
  const add = async () => {
    if (!name.trim()) return
    try {
      await api.post('/categories', { name: name.trim(), position: (data?.length || 0) + 1 })
      setName('')
      notifyChange()
    } catch (err) {
      message.error(err.message)
    }
  }
  const remove = async (id) => {
    await api.del(`/categories/${id}`)
    reload()
    notifyChange()
  }

  return (
    <Card size="small" title="Catégories" extra={<Typography.Text type="secondary">Ex. Freelance, Perso, Gladys, Asso…</Typography.Text>}>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        loading={loading}
        dataSource={data || []}
        columns={[
          { title: 'Couleur', dataIndex: 'color', width: 80, render: (c, r) => <ColorPicker value={c} onChangeComplete={(v) => update(r.id, { color: v.toHexString() })} size="small" /> },
          { title: 'Nom', dataIndex: 'name', render: (n, r) => <Input defaultValue={n} variant="borderless" onBlur={(e) => e.target.value !== n && update(r.id, { name: e.target.value })} /> },
          { title: 'Ordre', dataIndex: 'position', width: 90, render: (v, r) => <InputNumber size="small" defaultValue={v} onBlur={(e) => update(r.id, { position: Number(e.target.value) })} style={{ width: 60 }} /> },
          { title: 'Projets', dataIndex: 'project_count', width: 80 },
          {
            width: 50,
            render: (_, r) => (
              <Popconfirm title="Supprimer ? Les projets resteront, sans catégorie." onConfirm={() => remove(r.id)}>
                <Button size="small" type="text" icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
      />
      <Flex gap={8} style={{ marginTop: 12 }}>
        <Input placeholder="Nouvelle catégorie" value={name} onChange={(e) => setName(e.target.value)} onPressEnter={add} style={{ maxWidth: 260 }} />
        <Button icon={<PlusOutlined />} onClick={add}>Ajouter</Button>
      </Flex>
    </Card>
  )
}

export default function Settings() {
  const { data: sync } = useApi('/sync/status', { listen: true })
  return (
    <Flex vertical gap={16}>
      <Typography.Title level={3} style={{ margin: 0 }}>Paramètres</Typography.Title>
      <Categories />
      <NotificationSettings notifyError={sync?.notify_error} />
      <Card size="small" title="Synchronisation">
        {sync && (
          <Descriptions size="small" column={1}>
            <Descriptions.Item label="Token GitHub">
              {sync.github_token ? <Tag color="green">configuré</Tag> : <Tag color="orange">absent — limité à 60 requêtes/heure, dépôts publics uniquement</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="Fréquence">{sync.interval_minutes ? `toutes les ${sync.interval_minutes} min` : 'désactivée (manuelle uniquement)'}</Descriptions.Item>
            <Descriptions.Item label="Dernière synchro">{sync.last_run_at ? `${dayjs(sync.last_run_at).format('DD/MM/YYYY HH:mm')} (${Math.round(sync.last_duration_ms / 1000)} s)` : '—'}</Descriptions.Item>
            {!!sync.errors?.length && <Descriptions.Item label="Erreurs"><pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{sync.errors.join('\n')}</pre></Descriptions.Item>}
          </Descriptions>
        )}
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          Se règle via les variables d'environnement <code>GITHUB_TOKEN</code> et <code>SYNC_INTERVAL_MINUTES</code> (voir le README).
        </Typography.Paragraph>
      </Card>
      <Card size="small" title="Sauvegarde">
        <Typography.Paragraph>Toutes les données sont dans <code>data/projectory.db</code> (SQLite). Tu peux aussi exporter un JSON lisible :</Typography.Paragraph>
        <Button icon={<DownloadOutlined />} href="/api/export">Exporter en JSON</Button>
      </Card>
    </Flex>
  )
}
