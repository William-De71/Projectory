import { useState } from 'react'
import { Alert, App, Button, Card, Flex, Input, InputNumber, Popconfirm, Select, Switch, Table, Typography } from 'antd'
import { CalendarOutlined, CopyOutlined, DownloadOutlined, ReloadOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, useApi } from '../api/client.js'
import { t } from '../i18n/index.js'

const weekdays = () => [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: d, label: dayjs().day(d).format('dddd') }))
const hoursOptions = Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${String(h).padStart(2, '0')}:00` }))

async function copy(text, message) {
  try {
    await navigator.clipboard.writeText(text)
    message.success(t('Copié'))
  } catch {
    message.error(t('Copie impossible — copie le lien à la main'))
  }
}

export function DigestSettings() {
  const { message } = App.useApp()
  const { data, setData } = useApi('/digest')
  const [sending, setSending] = useState(false)
  if (!data) return null
  const update = async (patch) => {
    try {
      setData(await api.put('/settings/digest', { ...data, ...patch }))
    } catch (err) {
      message.error(err.message)
    }
  }
  const send = async () => {
    setSending(true)
    try {
      await api.post('/digest/send')
      message.success(t('Résumé envoyé — vérifie ton téléphone'))
    } catch (err) {
      message.error(err.message)
    } finally {
      setSending(false)
    }
  }
  return (
    <Card size="small" title={t('Résumé hebdomadaire (ntfy)')}>
      <Typography.Paragraph type="secondary">
        {t('Une notification par semaine : CI en échec, PR en attente, issues sans réponse, éléments prioritaires, échéances des 14 prochains jours, mises à jour disponibles.')}
      </Typography.Paragraph>
      <Flex gap={12} wrap align="center" style={{ marginBottom: 12 }}>
        <Flex gap={8} align="center"><Switch checked={data.enabled} onChange={(enabled) => update({ enabled })} /> {t('Activé')}</Flex>
        <Select value={data.day} onChange={(day) => update({ day })} options={weekdays()} style={{ width: 140 }} />
        <Select value={data.hour} onChange={(hour) => update({ hour })} options={hoursOptions} style={{ width: 100 }} />
        <Button icon={<SendOutlined />} onClick={send} loading={sending}>{t('Envoyer maintenant')}</Button>
        {data.last_sent_at && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('Dernier envoi {when}', { when: dayjs(data.last_sent_at).fromNow() })}</Typography.Text>}
      </Flex>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('Aperçu')}</Typography.Text>
      <pre style={{ margin: '4px 0 0', padding: 12, borderRadius: 6, background: 'rgba(127,127,127,.08)', whiteSpace: 'pre-wrap', fontSize: 13 }}>
        <strong>{data.preview.title}</strong>{'\n'}{data.preview.message}
      </pre>
    </Card>
  )
}

export function StaleSettings() {
  const { message } = App.useApp()
  const { data, setData } = useApi('/stale')
  if (!data) return null
  const update = async (patch) => {
    try {
      const saved = await api.put('/settings/stale', { ...data, ...patch })
      setData({ ...data, ...saved })
    } catch (err) {
      message.error(err.message)
    }
  }
  return (
    <Card size="small" title={t('Issues et PR qui dorment')}>
      <Typography.Paragraph type="secondary">
        {t('Signalées au tableau de bord, dans l’onglet du dépôt et dans le résumé hebdomadaire.')}
      </Typography.Paragraph>
      <Flex gap={24} wrap>
        <Flex gap={8} align="center">
          {t('Issue sans réponse depuis')}
          <InputNumber min={1} max={365} value={data.issue_days} onChange={(issue_days) => issue_days && update({ issue_days })} style={{ width: 80 }} />
          {t('jours')}
        </Flex>
        <Flex gap={8} align="center">
          {t('PR / MR sans activité depuis')}
          <InputNumber min={1} max={365} value={data.pr_days} onChange={(pr_days) => pr_days && update({ pr_days })} style={{ width: 80 }} />
          {t('jours')}
        </Flex>
      </Flex>
    </Card>
  )
}

export function CalendarSettings() {
  const { message } = App.useApp()
  const { data, setData } = useApi('/settings/calendar')
  if (!data) return null
  const url = `${window.location.origin}${data.path}`
  const regenerate = async () => {
    setData(await api.post('/settings/calendar/regenerate'))
    message.success(t('Nouveau lien créé : l’ancien ne fonctionne plus'))
  }
  return (
    <Card size="small" title={t('Calendrier (ICS)')}>
      <Typography.Paragraph type="secondary">
        {t('Abonne ton agenda (Google, Apple, Thunderbird…) à ce lien pour voir les échéances des bugs et tâches et les dates des versions. Le lien contient une clé secrète : ne le partage pas.')}
      </Typography.Paragraph>
      <Flex gap={8} wrap>
        <Input value={url} readOnly style={{ flex: 1, minWidth: 260, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
        <Button icon={<CopyOutlined />} onClick={() => copy(url, message)}>{t('Copier')}</Button>
        <Button icon={<CalendarOutlined />} href={url.replace(/^https?:/, 'webcal:')}>{t('Ouvrir dans l’agenda')}</Button>
        <Popconfirm title={t('Créer un nouveau lien ? L’ancien cessera de fonctionner.')} onConfirm={regenerate}>
          <Button icon={<ReloadOutlined />}>{t('Nouveau lien')}</Button>
        </Popconfirm>
      </Flex>
      {window.location.hostname === 'localhost' && (
        <Alert style={{ marginTop: 12 }} type="info" showIcon message={t('Ouvre Projectory avec son adresse réseau (ex. http://192.168.1.10:3001) pour obtenir un lien utilisable depuis ton téléphone.')} />
      )}
    </Card>
  )
}

const size = (bytes) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1e3))} Ko`)

export function BackupSettings() {
  const { message } = App.useApp()
  const { data, setData } = useApi('/backups')
  const [running, setRunning] = useState(false)
  if (!data) return null
  const update = async (patch) => {
    try {
      setData(await api.put('/settings/backup', { ...data, ...patch }))
    } catch (err) {
      message.error(err.message)
    }
  }
  const backupNow = async () => {
    setRunning(true)
    try {
      const res = await api.post('/backups')
      setData({ ...data, backups: res.backups })
      message.success(t('Sauvegarde {name} créée', { name: res.name }))
    } catch (err) {
      message.error(err.message)
    } finally {
      setRunning(false)
    }
  }
  return (
    <Card size="small" title={t('Sauvegardes automatiques')}>
      <Typography.Paragraph type="secondary">
        {t('Copie quotidienne de la base, sans arrêter l’application. Dossier :')} <code>{data.dir}</code> {t('(variable BACKUP_DIR pour pointer vers un NAS monté).')}
      </Typography.Paragraph>
      <Flex gap={12} wrap align="center" style={{ marginBottom: 12 }}>
        <Flex gap={8} align="center"><Switch checked={data.enabled} onChange={(enabled) => update({ enabled })} /> {t('Activées')}</Flex>
        <Flex gap={6} align="center">{t('à')} <Select value={data.hour} onChange={(hour) => update({ hour })} options={hoursOptions} style={{ width: 100 }} /></Flex>
        <Flex gap={6} align="center">{t('garder')} <InputNumber min={1} max={60} value={data.keep_daily} onChange={(keep_daily) => keep_daily && update({ keep_daily })} style={{ width: 70 }} /> {t('jours')}</Flex>
        <Flex gap={6} align="center">{t('+')} <InputNumber min={0} max={52} value={data.keep_weekly} onChange={(keep_weekly) => keep_weekly != null && update({ keep_weekly })} style={{ width: 70 }} /> {t('semaines')}</Flex>
        <Button icon={<SaveOutlined />} onClick={backupNow} loading={running}>{t('Sauvegarder maintenant')}</Button>
      </Flex>
      <Table
        rowKey="name"
        size="small"
        pagination={{ pageSize: 7, hideOnSinglePage: true }}
        dataSource={data.backups}
        locale={{ emptyText: t('Aucune sauvegarde pour l’instant') }}
        columns={[
          { title: t('Fichier'), dataIndex: 'name' },
          { title: t('Date'), dataIndex: 'date', render: (d) => dayjs(d).format('L') },
          { title: t('Taille'), dataIndex: 'size', render: size, align: 'right' },
          { width: 50, render: (_, b) => <Button size="small" type="text" icon={<DownloadOutlined />} href={`/api/backups/${b.name}`} /> },
        ]}
      />
    </Card>
  )
}

export function ReleaseChecklistSettings() {
  const { message } = App.useApp()
  const { data, setData } = useApi('/settings/release-checklist')
  const [text, setText] = useState(null)
  if (!data) return null
  const value = text ?? data.items.join('\n')
  const save = async (items) => {
    try {
      const res = await api.put('/settings/release-checklist', { items })
      setData(res)
      setText(null)
      message.success(t('Checklist enregistrée'))
    } catch (err) {
      message.error(err.message)
    }
  }
  return (
    <Card size="small" title={t('Checklist de release')}>
      <Flex vertical gap={8}>
        <Typography.Text type="secondary">
          {t('Étapes à cocher sur chaque version avant de la publier (une par ligne). Les versions déjà commencées gardent leur liste.')}
        </Typography.Text>
        <Input.TextArea value={value} onChange={(e) => setText(e.target.value)} autoSize={{ minRows: 4, maxRows: 12 }} />
        <Flex gap={8}>
          <Button type="primary" icon={<SaveOutlined />} onClick={() => save(value.split('\n'))}>{t('Enregistrer')}</Button>
          {data.custom && <Button onClick={() => save([])}>{t('Revenir à la liste par défaut')}</Button>}
        </Flex>
      </Flex>
    </Card>
  )
}
