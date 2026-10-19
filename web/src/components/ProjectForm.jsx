import { useEffect, useState } from 'react'
import { App, Button, Divider, Flex, Form, Input, Modal, Popconfirm, Select, Switch, Typography } from 'antd'
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { api, notifyChange, useApi } from '../api/client.js'
import { FORGES, PROJECT_STATUS, options } from './labels.js'
import { t } from '../i18n/index.js'

const VERSION_TYPES = [
  { value: 'repo', label: 'Releases du dépôt', placeholder: 'dépôt configuré ci-dessus (GitHub, GitLab ou Gitea)', noRef: true },
  { value: 'github', label: 'Release GitHub (autre dépôt)', placeholder: 'owner/repo' },
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

// Dialog to create (project = {}) or edit a project. `project` null = closed.
export default function ProjectForm({ project, onClose, onSaved }) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const { data: categories } = useApi('/categories')
  const forumSources = Form.useWatch('forum_sources', form) || []
  const forge = Form.useWatch('forge', form) || 'github'

  useEffect(() => {
    if (!project) return
    form.resetFields()
    form.setFieldsValue({
      status: 'active', tags: [], links: [], version_sources: [], forum_sources: [], pinned: false, notify: true, forge: 'github', forge_url: '',
      ...project,
    })
  }, [project, form])

  const save = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const body = { ...values, category_id: values.category_id ?? null }
      const saved = project.id ? await api.put(`/projects/${project.id}`, body) : await api.post('/projects', body)
      message.success(project.id ? t('Projet mis à jour') : t('Projet créé — lance une synchro pour récupérer GitHub / forums'))
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
    message.success(t('Projet supprimé'))
    notifyChange()
    onSaved?.(null)
  }

  return (
    <Modal
      open={!!project}
      onCancel={onClose}
      centered
      width="min(760px, calc(100vw - 24px))"
      title={project?.id ? t('Modifier {name}', { name: project.name }) : t('Nouveau projet')}
      destroyOnHidden
      // Long form: the body scrolls, the buttons stay visible.
      styles={{ body: { maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', paddingRight: 8 } }}
      footer={
        <Flex gap={8} justify="space-between">
          {project?.id ? (
            <Popconfirm title={t('Supprimer le projet et tout son contenu (bugs, specs, notes) ?')} onConfirm={remove}>
              <Button danger>{t('Supprimer')}</Button>
            </Popconfirm>
          ) : <span />}
          <Flex gap={8}>
            <Button onClick={onClose}>{t('Annuler')}</Button>
            <Button type="primary" loading={saving} onClick={save}>{t('Enregistrer')}</Button>
          </Flex>
        </Flex>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label={t('Nom')} rules={[{ required: true, message: t('Nom obligatoire') }]}>
          <Input autoFocus />
        </Form.Item>
        <Flex gap={12} wrap>
          <Form.Item name="category_id" label={t('Catégorie')} style={{ flex: 1, minWidth: 180 }}>
            <Select allowClear options={(categories || []).map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="status" label={t('Statut')} style={{ flex: 1, minWidth: 160 }}>
            <Select options={options(PROJECT_STATUS)} />
          </Form.Item>
          <Form.Item name="pinned" label={t('Épinglé')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="notify" label={t('Notifications')} valuePropName="checked" tooltip={t('Envoyer les nouveautés de ce projet sur ntfy')}>
            <Switch />
          </Form.Item>
        </Flex>
        <Flex gap={12} wrap>
          <Form.Item name="client" label={t('Client / organisation')} style={{ flex: 1, minWidth: 200 }}>
            <Input placeholder={t('ex. Gladys Assistant, ACME…')} />
          </Form.Item>
          <Form.Item name="tags" label={t('Tags')} style={{ flex: 1, minWidth: 200 }}>
            <Select mode="tags" placeholder={t('node, domotique…')} tokenSeparators={[',']} />
          </Form.Item>
        </Flex>
        <Form.Item name="description" label={t('Description')}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} />
        </Form.Item>

        <Divider titlePlacement="start">{t('Dépôt & liens')}</Divider>
        <Flex gap={12} wrap>
          <Form.Item name="forge" label={t('Forge')} style={{ width: 170 }}>
            <Select options={Object.entries(FORGES).map(([value, f]) => ({ value, label: f.label }))} onChange={(f) => form.setFieldValue('forge_url', FORGES[f].defaultUrl === 'https://github.com' ? '' : FORGES[f].defaultUrl)} />
          </Form.Item>
          {forge !== 'github' && (
            <Form.Item name="forge_url" label={t('Adresse de l\'instance')} style={{ flex: 1, minWidth: 220 }} rules={[{ required: true, message: t('Adresse obligatoire') }, { type: 'url', message: t('URL invalide') }]}>
              <Input placeholder={forge === 'gitlab' ? 'https://gitlab.com' : 'https://git.mondomaine.fr'} />
            </Form.Item>
          )}
        </Flex>
        <Flex gap={12} wrap>
          <Form.Item name="repo" label={t('Dépôt')} style={{ flex: 1, minWidth: 220 }} extra={t('{path} ou URL — issues, {prs} et CI seront suivies', { path: forge === 'gitlab' ? t('groupe / projet') : 'owner/repo', prs: forge === 'gitlab' ? 'MR' : 'PR' })}>
            <Input placeholder={forge === 'gitlab' ? 'mon-groupe/mon-projet' : 'GladysAssistant/Gladys'} />
          </Form.Item>
          <Form.Item name="homepage" label={t('Site / démo')} style={{ flex: 1, minWidth: 220 }}>
            <Input placeholder="https://…" />
          </Form.Item>
        </Flex>
        <SourceList name="links" addLabel={t('Ajouter un lien (doc, CI, prod, Figma…)')} initial={{ label: '', url: '' }}>
          {(field) => (
            <>
              <Form.Item name={[field.name, 'label']} style={{ marginBottom: 0, width: 160 }}><Input placeholder={t('Libellé')} /></Form.Item>
              <Form.Item name={[field.name, 'url']} style={{ marginBottom: 0, flex: 1, minWidth: 200 }}><Input placeholder="https://…" /></Form.Item>
            </>
          )}
        </SourceList>

        <Divider titlePlacement="start">{t('Versions')}</Divider>
        <Form.Item name="deployed_version" label={t('Version utilisée / déployée chez toi')} extra={t(
          'Comparée aux dernières versions publiées ci-dessous pour signaler une mise à jour'
        )}>
          <Input placeholder={t('ex. 4.45.0')} style={{ maxWidth: 200 }} />
        </Form.Item>
        <SourceList name="version_sources" addLabel={t('Surveiller une version')} initial={{ type: 'repo', ref: '' }}>
          {(field) => (
            <>
              <Form.Item name={[field.name, 'type']} style={{ marginBottom: 0, width: 190 }}><Select options={VERSION_TYPES.map((v) => ({ ...v, label: t(v.label) }))} /></Form.Item>
              <Form.Item noStyle shouldUpdate>
                {() => {
                  const type = VERSION_TYPES.find((v) => v.value === form.getFieldValue(['version_sources', field.name, 'type']))
                  return (
                    <Form.Item name={[field.name, 'ref']} style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                      <Input placeholder={type?.placeholder && t(type.placeholder)} disabled={type?.noRef} />
                    </Form.Item>
                  )
                }}
              </Form.Item>
            </>
          )}
        </SourceList>

        <Divider titlePlacement="start">{t('Forums & flux')}</Divider>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>{t(
          'Les nouveaux sujets arrivent dans la boîte de réception, d\'où tu peux les transformer en bug. Discourse (forum Gladys) : URL'
        ) + ' '}<code>https://community.gladysassistant.com</code>{t(', chemin d\'une catégorie ou d\'un tag (')}<code>c/bug/5</code>, <code>tag/zigbee</code>{t(') ou une recherche (')}<code>zigbee2mqtt order:latest</code>).
        </Typography.Paragraph>
        <SourceList name="forum_sources" addLabel={t('Ajouter un forum / flux')} initial={{ type: 'discourse', url: '' }}>
          {(field) => {
            const forumType = forumSources[field.name]?.type
            return (
              <Flex vertical gap={6} style={{ flex: 1, padding: 8, border: '1px dashed rgba(127,127,127,.3)', borderRadius: 6 }}>
                <Flex gap={8} wrap>
                  <Form.Item name={[field.name, 'type']} style={{ marginBottom: 0, width: 170 }}><Select options={FORUM_TYPES.map((f) => ({ ...f, label: t(f.label) }))} /></Form.Item>
                  <Form.Item name={[field.name, 'label']} style={{ marginBottom: 0, flex: 1, minWidth: 140 }}><Input placeholder={t('Libellé (optionnel)')} /></Form.Item>
                </Flex>
                <Form.Item name={[field.name, 'url']} rules={[{ required: true, message: t('URL obligatoire') }]} style={{ marginBottom: 0 }}>
                  <Input placeholder={forumType === 'rss' ? t('URL du flux RSS / Atom') : t('URL du forum Discourse')} />
                </Form.Item>
                <Flex gap={8} wrap>
                  {forumType !== 'rss' && (
                    <Form.Item name={[field.name, 'path']} style={{ marginBottom: 0, flex: 1, minWidth: 160 }}><Input placeholder={t('Chemin : c/bug/5, tag/zigbee… (vide = derniers sujets)')} /></Form.Item>
                  )}
                  <Form.Item name={[field.name, 'query']} style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
                    <Input placeholder={forumType === 'rss' ? t('Mots-clés à filtrer, séparés par des virgules') : t('ou recherche (remplace le chemin)')} />
                  </Form.Item>
                </Flex>
              </Flex>
            )
          }}
        </SourceList>
      </Form>
    </Modal>
  )
}
