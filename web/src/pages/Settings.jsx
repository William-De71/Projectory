import { useState } from 'react'
import { App, Button, Card, ColorPicker, Descriptions, Flex, Input, InputNumber, Popconfirm, Table, Tag, Typography } from 'antd'
import { DeleteOutlined, DownloadOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange, useApi } from '../api/client.js'
import NotificationSettings from '../components/NotificationSettings.jsx'
import { ForgeAccounts, GithubNotificationSettings } from '../components/ForgeSettings.jsx'
import { t } from '../i18n/index.js'

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
    <Card size="small" title={t('Catégories')} extra={<Typography.Text type="secondary">{t('Ex. Freelance, Perso, Gladys, Asso…')}</Typography.Text>}>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        loading={loading}
        dataSource={data || []}
        columns={[
          { title: t('Couleur'), dataIndex: 'color', width: 80, render: (c, r) => <ColorPicker value={c} onChangeComplete={(v) => update(r.id, { color: v.toHexString() })} size="small" /> },
          { title: t('Nom'), dataIndex: 'name', render: (n, r) => <Input defaultValue={n} variant="borderless" onBlur={(e) => e.target.value !== n && update(r.id, { name: e.target.value })} /> },
          { title: t('Ordre'), dataIndex: 'position', width: 90, render: (v, r) => <InputNumber size="small" defaultValue={v} onBlur={(e) => update(r.id, { position: Number(e.target.value) })} style={{ width: 60 }} /> },
          { title: t('Projets'), dataIndex: 'project_count', width: 80 },
          {
            width: 50,
            render: (_, r) => (
              <Popconfirm title={t('Supprimer ? Les projets resteront, sans catégorie.')} onConfirm={() => remove(r.id)}>
                <Button size="small" type="text" icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
      />
      <Flex gap={8} style={{ marginTop: 12 }}>
        <Input placeholder={t('Nouvelle catégorie')} value={name} onChange={(e) => setName(e.target.value)} onPressEnter={add} style={{ maxWidth: 260 }} />
        <Button icon={<PlusOutlined />} onClick={add}>{t('Ajouter')}</Button>
      </Flex>
    </Card>
  )
}

export default function Settings() {
  const { data: sync } = useApi('/sync/status', { listen: true })
  const { data: health } = useApi('/health')
  return (
    <Flex vertical gap={16}>
      <Typography.Title level={3} style={{ margin: 0 }}>{t('Paramètres')}</Typography.Title>
      <Categories />
      <ForgeAccounts />
      <NotificationSettings notifyError={sync?.notify_error} />
      <GithubNotificationSettings />
      <Card size="small" title={t('Synchronisation')}>
        {sync && (
          <Descriptions size="small" column={1}>
            <Descriptions.Item label={t('Token GitHub')}>
              {sync.github_token ? <Tag color="green">{t('configuré')}</Tag> : <Tag color="orange">{t('absent — limité à 60 requêtes/heure, dépôts publics uniquement')}</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label={t('Fréquence')}>{sync.interval_minutes ? t('toutes les {n} min', { n: sync.interval_minutes }) : t('désactivée (manuelle uniquement)')}</Descriptions.Item>
            <Descriptions.Item label={t('Dernière synchro')}>{sync.last_run_at ? `${dayjs(sync.last_run_at).format('L LT')} (${Math.round(sync.last_duration_ms / 1000)} s)` : '—'}</Descriptions.Item>
            {!!sync.errors?.length && <Descriptions.Item label={t('Erreurs')}><pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{sync.errors.join('\n')}</pre></Descriptions.Item>}
          </Descriptions>
        )}
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>{t('Fréquence réglable via la variable d\'environnement') + ' '}<code>SYNC_INTERVAL_MINUTES</code>{' ' + t('(voir le README).')}</Typography.Paragraph>
      </Card>
      <Card size="small" title={t('Sauvegarde')}>
        <Typography.Paragraph>{t('Toutes les données sont dans') + ' '}<code>data/projectory.db</code>{' ' + t('(SQLite). Tu peux aussi exporter un JSON lisible :')}</Typography.Paragraph>
        <Button icon={<DownloadOutlined />} href="/api/export">{t('Exporter en JSON')}</Button>
      </Card>
      {health?.version && (
        <Typography.Text type="secondary" style={{ textAlign: 'center', fontSize: 12 }}>{t('Projectory') + ' '}{health.version} — <a href="https://github.com/William-De71/projectory/releases" target="_blank" rel="noreferrer">{t('notes de version')}</a>
        </Typography.Text>
      )}
    </Flex>
  )
}
