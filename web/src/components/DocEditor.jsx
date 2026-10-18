import { useEffect, useState } from 'react'
import { App, Button, Drawer, Flex, Form, Input, Popconfirm, Segmented, Select, Switch, Tabs } from 'antd'
import { api } from '../api/client.js'
import { DOC_STATUS, options } from './labels.js'
import Markdown from './Markdown.jsx'
import ProjectSelect from './ProjectSelect.jsx'

export const SPEC_TEMPLATE = `## Contexte
Pourquoi ce besoin ? Qui le demande ?

## Objectifs
- 

## Hors périmètre
- 

## Fonctionnement attendu
1. 

## Critères d'acceptation
- [ ] 

## Questions ouvertes
- 
`

// Drawer to create or edit a spec / note. `doc` null = closed.
export default function DocEditor({ doc, onClose, onSaved, onDeleted, withProjectPicker = false }) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const type = Form.useWatch('type', form)
  const content = Form.useWatch('content', form)

  useEffect(() => {
    if (!doc) return
    form.resetFields()
    form.setFieldsValue({
      type: 'note',
      status: 'draft',
      pinned: false,
      ...doc,
      content: doc.content ?? (doc.type === 'spec' ? SPEC_TEMPLATE : ''),
    })
  }, [doc, form])

  const save = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const body = { ...values, project_id: values.project_id ?? null }
      const saved = doc.id ? await api.put(`/docs/${doc.id}`, body) : await api.post('/docs', body)
      message.success('Enregistré')
      onSaved?.(saved)
    } catch (err) {
      message.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    await api.del(`/docs/${doc.id}`)
    message.success('Supprimé')
    onDeleted?.(doc)
    onClose()
  }

  const onTypeChange = (t) => {
    if (t === 'spec' && !form.getFieldValue('content')) form.setFieldValue('content', SPEC_TEMPLATE)
  }

  return (
    <Drawer
      open={!!doc}
      onClose={onClose}
      size={Math.min(960, window.innerWidth)}
      title={doc?.id ? 'Modifier' : type === 'spec' ? 'Nouvelle spécification' : 'Nouvelle note'}
      destroyOnHidden
      extra={
        <Flex gap={8}>
          {doc?.id && (
            <Popconfirm title="Supprimer ce document ?" onConfirm={remove}>
              <Button danger>Supprimer</Button>
            </Popconfirm>
          )}
          <Button type="primary" loading={saving} onClick={save}>Enregistrer</Button>
        </Flex>
      }
    >
      <Form form={form} layout="vertical" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save() } }}>
        <Flex gap={12} wrap>
          <Form.Item name="type" label="Type">
            <Segmented options={[{ value: 'note', label: 'Note' }, { value: 'spec', label: 'Spécification' }]} onChange={onTypeChange} />
          </Form.Item>
          {type === 'spec' && (
            <Form.Item name="status" label="Statut" style={{ minWidth: 140 }}>
              <Select options={options(DOC_STATUS)} />
            </Form.Item>
          )}
          {withProjectPicker && (
            <Form.Item name="project_id" label="Projet (vide = note globale)" style={{ minWidth: 240, flex: 1 }}>
              <ProjectSelect allowClear />
            </Form.Item>
          )}
          <Form.Item name="pinned" label="Épinglé" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Flex>
        <Form.Item name="title" label="Titre" rules={[{ required: true, message: 'Titre obligatoire' }]}>
          <Input autoFocus placeholder={type === 'spec' ? 'Ex. Synchronisation des capteurs Zigbee' : 'Ex. Réunion client du 12/10'} />
        </Form.Item>
        <Tabs
          items={[
            {
              key: 'edit',
              label: 'Écrire (Markdown)',
              forceRender: true,
              children: (
                <Form.Item name="content" className="md-editor" style={{ marginBottom: 0 }}>
                  <Input.TextArea autoSize={{ minRows: 16, maxRows: 40 }} placeholder="Markdown supporté : # titres, - listes, - [ ] cases à cocher, `code`…" />
                </Form.Item>
              ),
            },
            { key: 'preview', label: 'Aperçu', children: <Markdown>{content}</Markdown> },
          ]}
        />
      </Form>
    </Drawer>
  )
}
