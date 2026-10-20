import { useEffect, useRef, useState } from 'react'
import { App, Flex, Form, Input, Segmented, Select, Switch, Tabs } from 'antd'
import dayjs from 'dayjs'
import { api, notifyChange } from '../api/client.js'
import { DOC_STATUS, options } from './labels.js'
import Markdown from './Markdown.jsx'
import MarkdownInput from './MarkdownInput.jsx'
import ProjectSelect from './ProjectSelect.jsx'
import { getLang, t } from '../i18n/index.js'
import FormModal from './FormModal.jsx'

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

// Dialog to create or edit a spec / note. `doc` null = closed.
export default function DocEditor({ doc, onClose, onSaved, onDeleted, withProjectPicker = false }) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const type = Form.useWatch('type', form)
  const content = Form.useWatch('content', form)
  // Id once saved (Ctrl+S on a new doc) and snapshot of the last saved values.
  const savedId = useRef(null)
  const baseline = useRef('')
  const snapshot = () => JSON.stringify(form.getFieldsValue(['type', 'status', 'project_id', 'pinned', 'title', 'content']))

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
    savedId.current = doc.id ?? null
    baseline.current = snapshot()
  }, [doc, form])

  // A quick note often has no title: use its first line, or the date.
  const titleFor = (values) => {
    if (values.title?.trim()) return values.title.trim()
    const first = (values.content || '').split('\n').map((l) => l.replace(/^[#>*\-\s[\]x]+/i, '').trim()).find(Boolean)
    return first ? first.slice(0, 80) : t('Note du {date}', { date: dayjs().format('L LT') })
  }

  // The button saves and closes; Ctrl+S saves and keeps editing.
  const save = async ({ close = true } = {}) => {
    // All stored values: project_id has no field when the project is implied.
    const values = form.getFieldsValue(true)
    setSaving(true)
    try {
      const body = { ...values, title: titleFor(values), project_id: values.project_id ?? null }
      const saved = savedId.current ? await api.put(`/docs/${savedId.current}`, body) : await api.post('/docs', body)
      savedId.current = saved.id
      form.setFieldValue('title', saved.title)
      baseline.current = snapshot()
      message.success(t('Enregistré'))
      notifyChange()
      if (close) onSaved?.(saved)
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
    <FormModal
      open={!!doc}
      onClose={onClose}
      width={960}
      title={doc?.id ? t('Modifier') : type === 'spec' ? t('Nouvelle spécification') : t('Nouvelle note')}
      saving={saving}
      onSave={() => save()}
      isDirty={() => snapshot() !== baseline.current}
      onDelete={doc?.id ? remove : null}
      deleteTitle={t('Supprimer ce document ?')}
    >
      <Form form={form} layout="vertical" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save({ close: false }) } }}>
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
        <Form.Item name="title" label={t('Titre')} extra={t('Facultatif : sinon la première ligne du texte sert de titre.')}>
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
    </FormModal>
  )
}
