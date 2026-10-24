import { useEffect, useRef, useState } from 'react'
import { Alert, App } from 'antd'
import { CloudSyncOutlined, DisconnectOutlined } from '@ant-design/icons'
import { flushOutbox, readOutbox } from '../api/client.js'
import { t } from '../i18n/index.js'

// Offline: says the data shown is the last loaded, and sends the bugs / notes
// written meanwhile once the connection is back.
export default function OfflineBanner() {
  const { message, notification } = App.useApp()
  const [online, setOnline] = useState(navigator.onLine)
  const [waiting, setWaiting] = useState(() => readOutbox().length)
  const previous = useRef(waiting)

  useEffect(() => {
    const flush = async () => {
      const sent = await flushOutbox()
      if (sent) message.success(t('{n} élément(s) créé(s) hors ligne envoyé(s)', { n: sent }))
    }
    const goOnline = () => { setOnline(true); flush() }
    const goOffline = () => setOnline(false)
    const onOutbox = () => {
      const count = readOutbox().length
      if (count > previous.current) message.info(t('Enregistré hors ligne : envoyé au retour du réseau'))
      previous.current = count
      setWaiting(count)
    }
    const onRejected = (e) => notification.error({
      title: t('Non enregistré : « {title} »', { title: e.detail.title }),
      description: e.detail.error,
      duration: 0,
    })
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    window.addEventListener('projectory:outbox', onOutbox)
    window.addEventListener('projectory:outbox-rejected', onRejected)
    if (navigator.onLine) flush()
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('projectory:outbox', onOutbox)
      window.removeEventListener('projectory:outbox-rejected', onRejected)
    }
  }, [message, notification])

  if (online && !waiting) return null
  return (
    <Alert
      banner
      type={online ? 'info' : 'warning'}
      icon={online ? <CloudSyncOutlined /> : <DisconnectOutlined />}
      message={online
        ? t('Envoi de {n} élément(s) créé(s) hors ligne…', { n: waiting })
        : waiting
          ? t('Hors ligne : données de la dernière visite. {n} élément(s) en attente d’envoi.', { n: waiting })
          : t('Hors ligne : données de la dernière visite. Les nouveaux bugs, tâches et notes seront envoyés au retour du réseau.')}
    />
  )
}
