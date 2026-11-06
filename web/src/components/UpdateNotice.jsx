import { useCallback, useEffect, useRef, useState } from 'react'
import { App, Alert, Button, Card, Descriptions, Flex, Modal, Spin, Typography, theme } from 'antd'
import { CloudDownloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api } from '../api/client.js'
import { t } from '../i18n/index.js'
import Markdown from './Markdown.jsx'

const CHECK_EVERY = 6 * 60 * 60 * 1000
const SEEN_KEY = 'projectory:update-notified'
const STATUS_EVENT = 'projectory:update-status'
const COMMAND = 'docker compose pull && docker compose up -d'
const RELEASES_URL = 'https://github.com/William-De71/Projectory/releases'

const label = (version) => (/^\d/.test(version) ? `v${version}` : version)

// Asks GitHub now and tells the menu link; `open` shows the dialog if there is a new version.
async function searchForUpdate({ open = false } = {}) {
  const status = await api.get('/update?refresh=1')
  // The answer is on screen: no need for the notification as well.
  if (status.available) {
    try { localStorage.setItem(SEEN_KEY, status.latest.version) } catch { /* storage unavailable */ }
  }
  window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: { status, open } }))
  return status
}

// Search from a menu or a button: the result comes as a message or the dialog.
export function useUpdateSearch() {
  const { message } = App.useApp()
  const [searching, setSearching] = useState(false)
  const search = useCallback(async () => {
    setSearching(true)
    try {
      const status = await searchForUpdate({ open: true })
      if (status.error) message.warning(t('Vérification impossible : {error}', { error: status.error }))
      else if (!status.comparable) message.info(t('Version de développement : elle n’est pas comparée aux versions publiées.'))
      else if (!status.available) message.success(t('Projectory est à jour.'))
    } catch (err) {
      message.error(t('Vérification impossible : {error}', { error: err.message }))
    } finally {
      setSearching(false)
    }
  }, [message])
  return { search, searching }
}

// Waits for the container to come back with another version, then reloads.
async function waitForNewVersion(current, deadline) {
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000))
    try {
      const { version } = await api.get('/health')
      if (version && version !== current) return true
    } catch { /* restarting */ }
  }
  return false
}

// Release notes and, with Watchtower configured, the one-click update.
function UpdateDialog({ status, open, onClose }) {
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState(null)

  const update = async () => {
    setUpdating(true)
    setError(null)
    try {
      await api.post('/update')
      if (await waitForNewVersion(status.current, Date.now() + 5 * 60 * 1000)) return window.location.reload()
      setError(t('Toujours pas de nouvelle version après 5 minutes : regarde les journaux de Watchtower.'))
    } catch (err) {
      setError(err.message)
    }
    setUpdating(false)
  }

  return (
    <Modal
      open={open}
      onCancel={() => !updating && onClose()}
      title={t('Projectory v{v}', { v: status.latest.version })}
      width="min(720px, calc(100vw - 24px))"
      footer={
        <Flex gap={8} justify="end">
          <Button href={status.latest.url} target="_blank" rel="noreferrer">{t('Voir sur GitHub')}</Button>
          {status.can_update && (
            <Button type="primary" icon={<CloudDownloadOutlined />} loading={updating} onClick={update}>{t('Mettre à jour maintenant')}</Button>
          )}
        </Flex>
      }
    >
      <Flex vertical gap={12}>
        <Typography.Text type="secondary">{t('Version actuelle : v{v}', { v: status.current })}</Typography.Text>
        {updating && (
          <Alert type="info" showIcon icon={<Spin size="small" />} message={t('Mise à jour en cours… Projectory redémarre, la page se rechargera toute seule.')} />
        )}
        {error && <Alert type="error" showIcon message={error} />}
        {!status.can_update && (
          <Alert
            type="info"
            showIcon
            message={t('Pour mettre à jour, sur le serveur :')}
            description={
              <Flex vertical gap={4}>
                <Typography.Text code copyable>{COMMAND}</Typography.Text>
                <span>{t('Pour un bouton de mise à jour ici, active Watchtower (voir le README).')}</span>
              </Flex>
            }
          />
        )}
        <div style={{ maxHeight: '50vh', overflowY: 'auto' }}><Markdown>{status.latest.notes}</Markdown></div>
      </Flex>
    </Modal>
  )
}

// Sidebar link + one-time notification when a newer Projectory release exists.
export default function UpdateNotice() {
  const { notification } = App.useApp()
  const { token } = theme.useToken()
  const [status, setStatus] = useState(null)
  const [open, setOpen] = useState(false)
  const notified = useRef(false)

  const check = useCallback(() => api.get('/update').then(setStatus).catch(() => {}), [])
  useEffect(() => {
    check()
    const timer = setInterval(check, CHECK_EVERY)
    // A manual search updates the link right away.
    const onStatus = (e) => {
      setStatus(e.detail.status)
      if (e.detail.open && e.detail.status.available) setOpen(true)
    }
    window.addEventListener(STATUS_EVENT, onStatus)
    return () => {
      clearInterval(timer)
      window.removeEventListener(STATUS_EVENT, onStatus)
    }
  }, [check])

  // Tell once per version, even across reloads.
  useEffect(() => {
    if (!status?.available || notified.current) return
    notified.current = true
    let seen = null
    try { seen = localStorage.getItem(SEEN_KEY) } catch { /* storage unavailable */ }
    if (seen === status.latest.version) return
    try { localStorage.setItem(SEEN_KEY, status.latest.version) } catch { /* storage unavailable */ }
    notification.info({
      key: 'update',
      title: t('Projectory v{v} est disponible', { v: status.latest.version }),
      description: t('Tu utilises la v{v}.', { v: status.current }),
      icon: <CloudDownloadOutlined style={{ color: token.colorPrimary }} />,
      actions: <Button type="primary" size="small" onClick={() => { notification.destroy('update'); setOpen(true) }}>{t('Voir')}</Button>,
      duration: 0,
    })
  }, [status, notification, token.colorPrimary])

  if (!status?.available) return null

  return (
    <>
      <a onClick={() => setOpen(true)} style={{ color: token.colorPrimary, fontWeight: 600 }}>
        <CloudDownloadOutlined /> {t('v{v} disponible', { v: status.latest.version })}
      </a>
      <UpdateDialog status={status} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

// Settings card: installed and latest versions, and the manual search.
export function UpdateSettings() {
  const [status, setStatus] = useState(null)
  const [searching, setSearching] = useState(false)
  const [failure, setFailure] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => { api.get('/update').then(setStatus).catch((err) => setFailure(err.message)) }, [])

  const search = async () => {
    setSearching(true)
    setFailure(null)
    try {
      setStatus(await searchForUpdate())
    } catch (err) {
      setFailure(err.message)
    } finally {
      setSearching(false)
    }
  }

  const error = failure || status?.error
  return (
    <Card size="small" title={t('Mises à jour de Projectory')}>
      <Flex vertical gap={12} align="start">
        {status && (
          <Descriptions size="small" column={1}>
            <Descriptions.Item label={t('Version installée')}>{label(status.current)}</Descriptions.Item>
            <Descriptions.Item label={t('Dernière version publiée')}>{status.latest ? label(status.latest.version) : '—'}</Descriptions.Item>
            <Descriptions.Item label={t('Dernière vérification')}>{status.checked_at ? dayjs(status.checked_at).format('L LT') : '—'}</Descriptions.Item>
          </Descriptions>
        )}
        {error && <Alert type="warning" showIcon message={t('Vérification impossible : {error}', { error })} />}
        {status?.available && <Alert type="info" showIcon message={t('Projectory v{v} est disponible', { v: status.latest.version })} />}
        {status && !status.comparable && <Alert type="info" showIcon message={t('Version de développement : elle n’est pas comparée aux versions publiées.')} />}
        {status && !error && status.comparable && status.latest && !status.available && <Alert type="success" showIcon message={t('Projectory est à jour.')} />}
        <Flex gap={8} wrap align="center">
          <Button icon={<SearchOutlined />} loading={searching} onClick={search}>{t('Rechercher une mise à jour')}</Button>
          {status?.available && <Button type="primary" icon={<CloudDownloadOutlined />} onClick={() => setOpen(true)}>{t('Voir la mise à jour')}</Button>}
          <a href={RELEASES_URL} target="_blank" rel="noreferrer">{t('Notes de version')}</a>
        </Flex>
      </Flex>
      {status?.available && <UpdateDialog status={status} open={open} onClose={() => setOpen(false)} />}
    </Card>
  )
}
