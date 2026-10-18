import { useEffect, useState } from 'react'
import { Alert, App, Button, Card, Checkbox, Flex, Form, Input, Switch, Typography } from 'antd'
import { SendOutlined } from '@ant-design/icons'
import { api, useApi } from '../api/client.js'

export default function NotificationSettings({ notifyError }) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const { data, setData } = useApi('/settings/ntfy')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (data) form.setFieldsValue({ ...data, token: '' })
  }, [data, form])

  const save = async () => {
    setSaving(true)
    try {
      const values = await form.validateFields()
      setData(await api.put('/settings/ntfy', values))
      message.success('Notifications enregistrées')
      return true
    } catch (err) {
      if (err.message) message.error(err.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    if (!(await save())) return
    setTesting(true)
    try {
      await api.post('/settings/ntfy/test')
      message.success('Notification envoyée — vérifie ton téléphone')
    } catch (err) {
      message.error(err.message)
    } finally {
      setTesting(false)
    }
  }

  const clearToken = async () => {
    setData(await api.put('/settings/ntfy', { clear_token: true }))
    message.success('Token supprimé')
  }

  if (!data) return null
  const events = Object.entries(data.available_events).map(([value, label]) => ({ value, label }))

  return (
    <Card size="small" title="Notifications push (ntfy)" extra={<a href="https://docs.ntfy.sh/subscribe/phone/" target="_blank" rel="noreferrer">Installer l'app ntfy</a>}>
      <Form form={form} layout="vertical">
        <Typography.Paragraph type="secondary">
          Reçois sur ton téléphone les nouveautés détectées à chaque synchro. Abonne-toi au même topic dans l'app ntfy.
          Sur ntfy.sh, les topics sont publics : choisis un nom difficile à deviner, ou utilise ton propre serveur ntfy avec un token.
        </Typography.Paragraph>
        {notifyError && <Alert type="error" showIcon style={{ marginBottom: 12 }} message="Dernier envoi en échec" description={notifyError} />}
        <Form.Item name="enabled" label="Activées" valuePropName="checked"><Switch /></Form.Item>
        <Flex gap={12} wrap>
          <Form.Item name="server" label="Serveur" style={{ flex: 1, minWidth: 220 }} rules={[{ type: 'url', message: 'URL invalide' }]}>
            <Input placeholder="https://ntfy.sh" />
          </Form.Item>
          <Form.Item name="topic" label="Topic" style={{ flex: 1, minWidth: 200 }}>
            <Input placeholder="ex. projets-william-7f3k2" />
          </Form.Item>
        </Flex>
        <Flex gap={12} wrap align="end">
          <Form.Item name="token" label="Token d'accès (serveur protégé)" style={{ flex: 1, minWidth: 220 }} extra={data.token_set ? 'Un token est enregistré — laisse vide pour le conserver' : 'Optionnel'}>
            <Input.Password placeholder={data.token_set ? '••••••••' : 'tk_…'} autoComplete="new-password" />
          </Form.Item>
          {data.token_set && <Form.Item><Button onClick={clearToken}>Supprimer le token</Button></Form.Item>}
          <Form.Item name="app_url" label="Adresse de Projectory" style={{ flex: 1, minWidth: 220 }} extra="Pour ouvrir le projet en touchant une notification groupée" rules={[{ type: 'url', message: 'URL invalide' }]}>
            <Input placeholder="http://192.168.1.10:3001" />
          </Form.Item>
        </Flex>
        <Form.Item name="events" label="Événements notifiés">
          <Checkbox.Group options={events} />
        </Form.Item>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          Chaque projet peut être rendu muet dans sa fiche (« Modifier » → Notifications). Au-delà de 3 nouveautés pour un même projet, elles sont regroupées en une seule notification.
        </Typography.Paragraph>
        <Flex gap={8}>
          <Button type="primary" onClick={save} loading={saving}>Enregistrer</Button>
          <Button icon={<SendOutlined />} onClick={test} loading={testing}>Enregistrer et envoyer un test</Button>
        </Flex>
      </Form>
    </Card>
  )
}
