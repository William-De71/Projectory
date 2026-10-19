import { useEffect, useState } from 'react'
import { App, Button, Flex, Input, Modal, Typography } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange } from '../api/client.js'
import { t } from '../i18n/index.js'

export const needsForumReply = (item) => item?.source === 'forum' && !!item.external_url && item.status === 'done' && !item.forum_replied_at

export function forumReplyText(item) {
  const fixed = item.target_version ? t('C’est corrigé dans la version {v} ✅', { v: item.target_version }) : t('C’est corrigé ✅')
  return [t('Bonjour,'), fixed, item.issue_url, t('Merci pour le signalement !')].filter(Boolean).join('\n\n')
}

// Message ready to post on the forum topic a fixed bug came from. Discourse
// needs an account to post, so the text is copied and the topic opened.
export default function ForumReplyModal({ item, onClose }) {
  const { message } = App.useApp()
  const [text, setText] = useState('')
  useEffect(() => { if (item) setText(forumReplyText(item)) }, [item])

  const markReplied = async () => {
    await api.put(`/items/${item.id}`, { forum_replied_at: dayjs.utc().format('YYYY-MM-DD HH:mm:ss') })
    notifyChange()
    onClose()
  }
  const copyAndOpen = async () => {
    try { await navigator.clipboard.writeText(text) } catch { /* clipboard unavailable: the text stays visible */ }
    message.success(t('Message copié : colle-le dans la réponse du sujet'))
    window.open(item.external_url, '_blank', 'noopener')
    await markReplied()
  }

  return (
    <Modal
      open={!!item}
      onCancel={onClose}
      title={t('Répondre sur le forum')}
      destroyOnHidden
      footer={
        <Flex gap={8} justify="space-between" wrap>
          <Button onClick={onClose}>{t('Plus tard')}</Button>
          <Flex gap={8} wrap>
            <Button onClick={markReplied}>{t('Déjà répondu')}</Button>
            <Button type="primary" icon={<CopyOutlined />} onClick={copyAndOpen}>{t('Copier et ouvrir le sujet')}</Button>
          </Flex>
        </Flex>
      }
    >
      <Typography.Paragraph type="secondary">
        {t('« {title} » est corrigé. Préviens la personne qui l’a signalé sur le forum :', { title: item?.title })}
      </Typography.Paragraph>
      <Input.TextArea value={text} onChange={(e) => setText(e.target.value)} autoSize={{ minRows: 6, maxRows: 14 }} />
    </Modal>
  )
}
