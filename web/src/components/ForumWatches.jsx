import { useState } from 'react'
import { App, Button, Card, Flex, Input, List, Popconfirm, Typography } from 'antd'
import { DeleteOutlined, EyeOutlined } from '@ant-design/icons'
import { api, notifyChange, useApi } from '../api/client.js'
import { t } from '../i18n/index.js'

export async function followTopic({ project_id, url, title }) {
  await api.post('/forum-watches', { project_id, url, title })
  notifyChange()
}

// Forum topics followed by a project: each new reply lands in the inbox.
export default function ForumWatches({ projectId }) {
  const { message } = App.useApp()
  const { data, reload } = useApi(`/projects/${projectId}/forum-watches`, { listen: true })
  const [url, setUrl] = useState('')
  const [adding, setAdding] = useState(false)

  const add = async () => {
    if (!url.trim()) return
    setAdding(true)
    try {
      await followTopic({ project_id: projectId, url })
      setUrl('')
      reload()
    } catch (err) {
      message.error(err.message)
    } finally {
      setAdding(false)
    }
  }
  const remove = async (w) => {
    await api.del(`/forum-watches/${w.id}`)
    notifyChange()
  }

  return (
    <Card size="small" title={<><EyeOutlined /> {t('Sujets suivis sur le forum')}</>}>
      <Flex vertical gap={8}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('Chaque nouvelle réponse arrive dans l’activité et sur ntfy, même sans mention. Tes propres réponses sont ignorées si une source « mes mentions » est configurée.')}
        </Typography.Text>
        <Flex gap={8}>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} onPressEnter={add} placeholder={t('Lien du sujet Discourse (https://…/t/…/123)')} />
          <Button onClick={add} loading={adding}>{t('Suivre')}</Button>
        </Flex>
        {!!data?.length && (
          <List
            size="small"
            dataSource={data}
            renderItem={(w) => (
              <List.Item actions={[
                <Popconfirm key="del" title={t('Ne plus suivre ce sujet ?')} onConfirm={() => remove(w)}>
                  <Button size="small" type="text" icon={<DeleteOutlined />} aria-label={t('Ne plus suivre')} />
                </Popconfirm>,
              ]}>
                <a href={w.url} target="_blank" rel="noreferrer">{w.title || w.url}</a>
              </List.Item>
            )}
          />
        )}
      </Flex>
    </Card>
  )
}
