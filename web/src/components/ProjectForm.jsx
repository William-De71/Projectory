import { useEffect, useState } from 'react'
import { App, Button, Divider, Drawer, Flex, Form, Input, Popconfirm, Select, Switch, Typography } from 'antd'
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { api, notifyChange, useApi } from '../api/client.js'
import { PROJECT_STATUS, options } from './labels.js'

const VERSION_TYPES = [
  { value: 'github', label: 'GitHub release/tag', placeholder: 'owner/repo (vide = dépôt du projet)' },
  { value: 'npm', label: 'Paquet npm', placeholder: 'ex. fastify' },
  { value: 'docker', label: 'Image Docker Hub', placeholder: 'ex. gladysassistant/gladys' },
]

const FORUM_TYPES = [
  { value: 'discourse', label: 'Forum Discourse' },
  { value: 'rss', label: 'Flux RSS / Atom' },
]

function SourceList({ name, addLabel, children, initial }) {
  return (
    <Form.List name={name}>
      {(fields, { add, remove }) => (
        <Flex vertical gap={8}>
          {fields.map((field) => (
            <Flex key={field.key} gap={8} align="start" wrap>
              {children(field)}
              <MinusCircleOutlined onClick={() => remove(field.name)} style={{ marginTop: 9 }} />
            </Flex>
          ))}
          <Button type="dashed" onClick={() => add(initial)} icon={<PlusOutlined />}>{addLabel}</Button>
        </Flex>
      )}
    </Form.List>
  )
}

// Drawer to create (project = {}) or edit a project. `project` null = closed.
export default function ProjectForm({ project, onClose, onSaved }) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const { data: categories } = useApi('/categories')
  const forumSources = Form.useWatch('forum_sources', form) || []

  useEffect(() => {
    if (!project) return
    form.resetFields()
    form.setFieldsValue({
      status: 'active', tags: [], links: [], version_sources: [], forum_sources: [], pinned: false, notify: true,
      ...project,
    })
  }, [project, form])

  const save = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const body = { ...values, category_id: values.category_id ?? null }
      const saved = project.id ? await api.put(`/projects/${project.id}`, body) : await api.post('/projects', body)
      message.success(project.id ? 'Projet mis à jour' : 'Projet créé — lance une synchro pour récupérer GitHub / forums')
      notifyChange()
      onSaved?.(saved)
    } catch (err) {
      message.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    await api.del(`/projects/${project.id}`)
    message.success('Projet supprimé')
    notifyChange()
    onSaved?.(null)
  }

  return (
    <Drawer
      open={!!project}
      onClose={onClose}
      size={Math.min(720, window.innerWidth)}
      title={project?.id ? `Modifier ${project.name}` : 'Nouveau projet'}
      destroyOnHidden
      extra={
        <Flex gap={8}>
          {project?.id && (
            <Popconfirm title="Supprimer le projet et tout son contenu (bugs, specs, notes) ?" onConfirm={remove}>
              <Button danger>Supprimer</Button>
            </Popconfirm>
          )}
          <Button type="primary" loading={saving} onClick={save}>Enregistrer</Button>
        </Flex>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Nom" rules={[{ required: true, message: 'Nom obligatoire' }]}>
          <Input autoFocus />
        </Form.Item>
        <Flex gap={12} wrap>
          <Form.Item name="category_id" label="Catégorie" style={{ flex: 1, minWidth: 180 }}>
            <Select allowClear options={(categories || []).map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="status" label="Statut" style={{ flex: 1, minWidth: 160 }}>
            <Select options={options(PROJECT_STATUS)} />
          </Form.Item>
          <Form.Item name="pinned" label="Épinglé" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="notify" label="Notifications" valuePropName="checked" tooltip="Envoyer les nouveautés de ce projet sur ntfy">
            <Switch />
          </Form.Item>
        </Flex>
        <Flex gap={12} wrap>
          <Form.Item name="client" label="Client / organisation" style={{ flex: 1, minWidth: 200 }}>
            <Input placeholder="ex. Gladys Assistant, ACME…" />
          </Form.Item>
          <Form.Item name="tags" label="Tags" style={{ flex: 1, minWidth: 200 }}>
            <Select mode="tags" placeholder="node, domotique…" tokenSeparators={[',']} />
          </Form.Item>
        </Flex>
        <Form.Item name="description" label="Description">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} />
        </Form.Item>

        <Divider titlePlacement="start">GitHub & liens</Divider>
        <Flex gap={12} wrap>
          <Form.Item name="repo" label="Dépôt GitHub" style={{ flex: 1, minWidth: 220 }} extra="owner/repo ou URL — issues et PR ouvertes seront suivies">
            <Input placeholder="GladysAssistant/Gladys" />
          </Form.Item>
          <Form.Item name="homepage" label="Site / démo" style={{ flex: 1, minWidth: 220 }}>
            <Input placeholder="https://…" />
          </Form.Item>
        </Flex>
        <SourceList name="links" addLabel="Ajouter un lien (doc, CI, prod, Figma…)" initial={{ label: '', url: '' }}>
          {(field) => (
            <>
              <Form.Item name={[field.name, 'label']} style={{ marginBottom: 0, width: 160 }}><Input placeholder="Libellé" /></Form.Item>
              <Form.Item name={[field.name, 'url']} style={{ marginBottom: 0, flex: 1, minWidth: 200 }}><Input placeholder="https://…" /></Form.Item>
            </>
          )}
        </SourceList>

        <Divider titlePlacement="start">Versions</Divider>
        <Form.Item name="deployed_version" label="Version utilisée / déployée chez toi" extra="Comparée aux dernières versions publiées ci-dessous pour signaler une mise à jour">
          <Input placeholder="ex. 4.45.0" style={{ maxWidth: 200 }} />
        </Form.Item>
        <SourceList name="version_sources" addLabel="Surveiller une version" initial={{ type: 'github', ref: '' }}>
          {(field) => (
            <>
              <Form.Item name={[field.name, 'type']} style={{ marginBottom: 0, width: 190 }}><Select options={VERSION_TYPES} /></Form.Item>
              <Form.Item noStyle shouldUpdate>
                {() => {
                  const t = form.getFieldValue(['version_sources', field.name, 'type'])
                  return (
                    <Form.Item name={[field.name, 'ref']} style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                      <Input placeholder={VERSION_TYPES.find((v) => v.value === t)?.placeholder} />
                    </Form.Item>
                  )
                }}
              </Form.Item>
            </>
          )}
        </SourceList>

        <Divider titlePlacement="start">Forums & flux</Divider>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          Les nouveaux sujets arrivent dans la boîte de réception, d'où tu peux les transformer en bug.
          Discourse (forum Gladys) : URL <code>https://community.gladysassistant.com</code>, chemin d'une catégorie
          ou d'un tag (<code>c/bug/5</code>, <code>tag/zigbee</code>) ou une recherche (<code>zigbee2mqtt order:latest</code>).
        </Typography.Paragraph>
        <SourceList name="forum_sources" addLabel="Ajouter un forum / flux" initial={{ type: 'discourse', url: '' }}>
          {(field) => {
            const t = forumSources[field.name]?.type
            return (
              <Flex vertical gap={6} style={{ flex: 1, padding: 8, border: '1px dashed rgba(127,127,127,.3)', borderRadius: 6 }}>
                <Flex gap={8} wrap>
                  <Form.Item name={[field.name, 'type']} style={{ marginBottom: 0, width: 170 }}><Select options={FORUM_TYPES} /></Form.Item>
                  <Form.Item name={[field.name, 'label']} style={{ marginBottom: 0, flex: 1, minWidth: 140 }}><Input placeholder="Libellé (optionnel)" /></Form.Item>
                </Flex>
                <Form.Item name={[field.name, 'url']} rules={[{ required: true, message: 'URL obligatoire' }]} style={{ marginBottom: 0 }}>
                  <Input placeholder={t === 'rss' ? 'URL du flux RSS / Atom' : 'URL du forum Discourse'} />
                </Form.Item>
                <Flex gap={8} wrap>
                  {t !== 'rss' && (
                    <Form.Item name={[field.name, 'path']} style={{ marginBottom: 0, flex: 1, minWidth: 160 }}><Input placeholder="Chemin : c/bug/5, tag/zigbee… (vide = derniers sujets)" /></Form.Item>
                  )}
                  <Form.Item name={[field.name, 'query']} style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
                    <Input placeholder={t === 'rss' ? 'Mots-clés à filtrer, séparés par des virgules' : 'ou recherche (remplace le chemin)'} />
                  </Form.Item>
                </Flex>
              </Flex>
            )
          }}
        </SourceList>
      </Form>
    </Drawer>
  )
}
