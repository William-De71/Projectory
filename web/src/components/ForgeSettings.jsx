import { useEffect, useState } from 'react'
import { Alert, App, Button, Card, Checkbox, Flex, Input, Select, Switch, Table, Tag, Typography } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { api, notifyChange, useApi } from '../api/client.js'
import { FORGES } from './labels.js'

// Tokens per forge instance. The server never sends tokens back: an empty
// field keeps the stored one.
export function ForgeAccounts() {
  const { message } = App.useApp()
  const { data, setData } = useApi('/settings/forges')
  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (data) setRows(data.accounts.map((a) => ({ ...a, token: '' }))) }, [data])

  const update = (i, patch) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)))
  const save = async () => {
    setSaving(true)
    try {
      setData(await api.put('/settings/forges', { accounts: rows.map(({ token_set, ...a }) => a) }))
      message.success('Comptes enregistrés')
      notifyChange()
    } catch (err) {
      message.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card size="small" title="Forges et tokens" extra={<Typography.Text type="secondary">GitHub, GitLab, Gitea / Forgejo</Typography.Text>}>
      <Typography.Paragraph type="secondary">
        Un token par instance. Pour GitHub, la variable <code>GITHUB_TOKEN</code> reste prise en compte si aucun compte n'est saisi ici.
        Droits conseillés : lecture du dépôt, des issues, des PR/MR et de la CI ; <b>écriture des issues</b> pour créer une issue depuis un bug suivi.
      </Typography.Paragraph>
      <Table
        rowKey={(r, i) => r.id || `new-${i}`}
        size="small"
        pagination={false}
        dataSource={rows}
        locale={{ emptyText: 'Aucun compte' }}
        columns={[
          {
            title: 'Forge', width: 170,
            render: (_, r, i) => <Select size="small" value={r.type} style={{ width: 150 }} options={Object.entries(FORGES).map(([value, f]) => ({ value, label: f.label }))} onChange={(type) => update(i, { type, url: FORGES[type].defaultUrl === 'https://github.com' ? '' : FORGES[type].defaultUrl })} />,
          },
          {
            title: 'Adresse',
            render: (_, r, i) => r.type === 'github'
              ? <Typography.Text type="secondary">github.com</Typography.Text>
              : <Input size="small" value={r.url} placeholder="https://git.mondomaine.fr" onChange={(e) => update(i, { url: e.target.value })} />,
          },
          {
            title: 'Token',
            render: (_, r, i) => (
              <Flex gap={6} align="center">
                <Input.Password size="small" value={r.token} placeholder={r.token_set ? '•••••••• (inchangé)' : 'Coller le token'} autoComplete="new-password" onChange={(e) => update(i, { token: e.target.value })} />
                {r.token_set && <Tag color="green">enregistré</Tag>}
              </Flex>
            ),
          },
          { width: 40, render: (_, r, i) => <Button size="small" type="text" icon={<DeleteOutlined />} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} /> },
        ]}
      />
      <Flex gap={8} style={{ marginTop: 12 }}>
        <Button icon={<PlusOutlined />} onClick={() => setRows((r) => [...r, { type: 'gitea', url: '', token: '' }])}>Ajouter un compte</Button>
        <Button type="primary" onClick={save} loading={saving}>Enregistrer</Button>
      </Flex>
    </Card>
  )
}

export function GithubNotificationSettings() {
  const { message } = App.useApp()
  const { data, setData } = useApi('/settings/github-notifications', { listen: true })
  if (!data) return null
  const update = async (patch) => {
    try {
      setData(await api.put('/settings/github-notifications', patch))
    } catch (err) {
      message.error(err.message)
    }
  }
  return (
    <Card size="small" title="Notifications GitHub personnelles">
      <Typography.Paragraph type="secondary">
        Reviews demandées, mentions, réponses sur tes PR (par exemple vers GladysAssistant/Gladys) : elles arrivent dans la boîte de réception,
        rattachées au projet correspondant s'il est suivi, et partent sur ntfy si l'événement est coché.
      </Typography.Paragraph>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="L'API des notifications GitHub n'accepte que les tokens « classiques » avec le scope notifications (les tokens fine-grained sont refusés)."
      />
      {!data.token_set && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="Aucun token GitHub configuré." />}
      <Flex vertical gap={12}>
        <Flex gap={8} align="center"><Switch checked={data.enabled} onChange={(enabled) => update({ enabled })} /> Activées</Flex>
        <Checkbox.Group
          value={data.reasons}
          onChange={(reasons) => update({ reasons })}
          options={Object.entries(data.available_reasons).map(([value, label]) => ({ value, label }))}
          disabled={!data.enabled}
        />
      </Flex>
    </Card>
  )
}
