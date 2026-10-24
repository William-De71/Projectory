import { useCallback, useEffect, useRef, useState } from 'react'
import { App, Alert, Button, Flex, Modal, Spin, Typography, theme } from 'antd'
import { CloudDownloadOutlined } from '@ant-design/icons'
import { api } from '../api/client.js'
import { t } from '../i18n/index.js'
import Markdown from './Markdown.jsx'

const CHECK_EVERY = 6 * 60 * 60 * 1000
const SEEN_KEY = 'projectory:update-notified'
const COMMAND = 'docker compose pull && docker compose up -d'

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

// Sidebar link + one-time notification when a newer Projectory release exists;
// the dialog shows its notes and, with Watchtower configured, updates in one click.
export default function UpdateNotice() {
  const { notification } = App.useApp()
  const { token } = theme.useToken()
  const [status, setStatus] = useState(null)
  const [open, setOpen] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState(null)
  const notified = useRef(false)

  const check = useCallback(() => api.get('/update').then(setStatus).catch(() => {}), [])
  useEffect(() => {
    check()
    const timer = setInterval(check, CHECK_EVERY)
    return () => clearInterval(timer)
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
    <>
      <a onClick={() => setOpen(true)} style={{ color: token.colorPrimary, fontWeight: 600 }}>
        <CloudDownloadOutlined /> {t('v{v} disponible', { v: status.latest.version })}
      </a>
      <Modal
        open={open}
        onCancel={() => !updating && setOpen(false)}
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
    </>
  )
}
