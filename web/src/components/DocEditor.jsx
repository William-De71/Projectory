import { useEffect, useState } from 'react'
import { App, Button, Drawer, Flex, Form, Input, Popconfirm, Segmented, Select, Switch, Tabs } from 'antd'
import { api } from '../api/client.js'
import { DOC_STATUS, options } from './labels.js'
import Markdown from './Markdown.jsx'
import MarkdownInput from './MarkdownInput.jsx'
import ProjectSelect from './ProjectSelect.jsx'
import { getLang, t } from '../i18n/index.js'

const SPEC_TEMPLATES = {
  fr: `## Contexte
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
`,
  en: `## Context
Why is this needed? Who asked for it?

## Goals
- 

## Out of scope
- 

## Expected behaviour
1. 

## Acceptance criteria
- [ ] 

## Open questions
- 
`,
}

export const specTemplate = () => SPEC_TEMPLATES[getLang()] || SPEC_TEMPLATES.fr

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
      content: doc.content ?? (doc.type === 'spec' ? specTemplate() : ''),
    })
  }, [doc, form])

  const save = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const body = { ...values, project_id: values.project_id ?? null }
      const saved = doc.id ? await api.put(`/docs/${doc.id}`, body) : await api.post('/docs', body)
      message.success(t('Enregistré'))
      onSaved?.(saved)
    } catch (err) {
      message.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    await api.del(`/docs/${doc.id}`)
    message.success(t('Supprimé'))
    onDeleted?.(doc)
    onClose()
  }

  const onTypeChange = (type) => {
    if (type === 'spec' && !form.getFieldValue('content')) form.setFieldValue('content', specTemplate())
  }

  return (
    <Drawer
      open={!!doc}
      onClose={onClose}
      size={Math.min(960, window.innerWidth)}
      title={doc?.id ? t('Modifier') : type === 'spec' ? t('Nouvelle spécification') : t('Nouvelle note')}
      destroyOnHidden
      extra={
        <Flex gap={8}>
          {doc?.id && (
            <Popconfirm title={t('Supprimer ce document ?')} onConfirm={remove}>
              <Button danger>{t('Supprimer')}</Button>
            </Popconfirm>
          )}
          <Button type="primary" loading={saving} onClick={save}>{t('Enregistrer')}</Button>
        </Flex>
      }
    >
      <Form form={form} layout="vertical" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save() } }}>
        <Flex gap={12} wrap>
          <Form.Item name="type" label={t('Type')}>
            <Segmented options={[{ value: 'note', label: t('Note') }, { value: 'spec', label: t('Spécification') }]} onChange={onTypeChange} />
          </Form.Item>
          {type === 'spec' && (
            <Form.Item name="status" label={t('Statut')} style={{ minWidth: 140 }}>
              <Select options={options(DOC_STATUS)} />
            </Form.Item>
          )}
          {withProjectPicker && (
            <Form.Item name="project_id" label={t('Projet (vide = note globale)')} style={{ minWidth: 240, flex: 1 }}>
              <ProjectSelect allowClear />
            </Form.Item>
          )}
          <Form.Item name="pinned" label={t('Épinglé')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Flex>
        <Form.Item name="title" label={t('Titre')} rules={[{ required: true, message: t('Titre obligatoire') }]}>
          <Input autoFocus placeholder={type === 'spec' ? t('Ex. Synchronisation des capteurs Zigbee') : t('Ex. Réunion client du 12/10')} />
        </Form.Item>
        <Tabs
          items={[
            {
              key: 'edit',
              label: t('Écrire (Markdown)'),
              forceRender: true,
              children: (
                <Form.Item name="content" className="md-editor" style={{ marginBottom: 0 }}>
                  <MarkdownInput autoSize={{ minRows: 16, maxRows: 40 }} placeholder={t('Markdown supporté : # titres, - listes, - [ ] cases à cocher, `code`…')} />
                </Form.Item>
              ),
            },
            { key: 'preview', label: t('Aperçu'), children: <Markdown>{content}</Markdown> },
          ]}
        />
      </Form>
    </Drawer>
  )
}
