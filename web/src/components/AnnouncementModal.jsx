import { useEffect, useState } from 'react'
import { App, Button, Flex, Input, Modal, Select, Typography } from 'antd'
import { CopyOutlined, SendOutlined } from '@ant-design/icons'
import { api } from '../api/client.js'
import { t } from '../i18n/index.js'

// Discourse can prefill a new topic from the URL; long texts are copied instead.
const MAX_URL = 6000
const host = (url) => { try { return new URL(url).host } catch { return url } }

// Release announcement for the forum: a new prefilled topic, or a reply to copy into a followed topic.
export default function AnnouncementModal({ state, projectId, onClose }) {
  const { message } = App.useApp()
  const [data, setData] = useState(null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [topic, setTopic] = useState(null)

  useEffect(() => {
    if (!state) return setData(null)
    api.get(`/projects/${projectId}/announcement?version=${encodeURIComponent(state.version)}`).then((res) => {
      setData(res)
      setTitle(res.title)
      setText(res.markdown)
      setTopic(res.topics[0]?.url ?? null)
    }).catch((err) => message.error(err.message))
  }, [state, projectId, message])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      message.success(t('Annonce copiée'))
      return true
    } catch {
      message.error(t('Copie impossible — sélectionne le texte'))
      return false
    }
  }
  const newTopic = async (forum) => {
    const url = `${forum}/new-topic?title=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`
    if (url.length > MAX_URL) {
      await copy()
      return window.open(`${forum}/new-topic?title=${encodeURIComponent(title)}`, '_blank', 'noopener')
    }
    window.open(url, '_blank', 'noopener')
  }
  const reply = async () => {
    await copy()
    window.open(topic, '_blank', 'noopener')
  }

  return (
    <Modal
      open={!!state}
      onCancel={onClose}
      width="min(760px, calc(100vw - 24px))"
      title={t('Annonce de la version {v}', { v: state?.version })}
      destroyOnHidden
      footer={
        <Flex gap={8} wrap justify="end">
          <Button icon={<CopyOutlined />} onClick={copy}>{t('Copier')}</Button>
          {(data?.forums || []).map((forum) => (
            <Button key={forum} type="primary" icon={<SendOutlined />} onClick={() => newTopic(forum)}>{t('Nouveau sujet sur {host}', { host: host(forum) })}</Button>
          ))}
        </Flex>
      }
    >
      <Flex vertical gap={8}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} addonBefore={t('Titre')} />
        <Input.TextArea value={text} onChange={(e) => setText(e.target.value)} autoSize={{ minRows: 10, maxRows: 22 }} className="md-editor" />
        {!!data?.topics.length && (
          <Flex gap={8} align="center" wrap>
            <Typography.Text type="secondary">{t('Ou répondre dans un sujet suivi :')}</Typography.Text>
            <Select value={topic} onChange={setTopic} style={{ flex: 1, minWidth: 220 }} options={data.topics.map((tp) => ({ value: tp.url, label: tp.title || tp.url }))} />
            <Button onClick={reply}>{t('Copier et ouvrir')}</Button>
          </Flex>
        )}
        {!data?.forums.length && !data?.topics.length && data && (
          <Typography.Text type="secondary">{t('Aucun forum Discourse configuré sur ce projet : copie le texte et colle-le où tu veux.')}</Typography.Text>
        )}
      </Flex>
    </Modal>
  )
}
