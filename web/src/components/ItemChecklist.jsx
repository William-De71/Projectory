import { useState } from 'react'
import { Button, Checkbox, Flex, Input, Progress, Tag } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { t } from '../i18n/index.js'

// "3/5" progress of an item's sub-tasks, or nothing without any.
export function ChecklistTag({ checklist }) {
  if (!Array.isArray(checklist) || !checklist.length) return null
  const done = checklist.filter((step) => step.done).length
  return <Tag color={done === checklist.length ? 'success' : 'default'} style={{ marginInlineEnd: 0 }}>☑ {done}/{checklist.length}</Tag>
}

// Sub-tasks of an item ([{ label, done }]); works as a Form.Item child.
export default function ItemChecklist({ value, onChange }) {
  const steps = Array.isArray(value) ? value : []
  const [draft, setDraft] = useState('')
  const update = (next) => onChange?.(next)
  const add = () => {
    const label = draft.trim()
    if (!label) return
    update([...steps, { label, done: false }])
    setDraft('')
  }
  const done = steps.filter((s) => s.done).length

  return (
    <Flex vertical gap={6}>
      {steps.length > 0 && <Progress percent={Math.round((done / steps.length) * 100)} size="small" format={() => `${done}/${steps.length}`} />}
      {steps.map((step, i) => (
        <Flex key={i} gap={8} align="center">
          <Checkbox checked={step.done} onChange={(e) => update(steps.map((s, j) => (j === i ? { ...s, done: e.target.checked } : s)))} />
          <Input
            variant="borderless"
            value={step.label}
            onChange={(e) => update(steps.map((s, j) => (j === i ? { ...s, label: e.target.value } : s)))}
            style={{ flex: 1, textDecoration: step.done ? 'line-through' : undefined, opacity: step.done ? 0.6 : 1 }}
          />
          <Button size="small" type="text" icon={<DeleteOutlined />} aria-label={t('Supprimer')} onClick={() => update(steps.filter((_, j) => j !== i))} />
        </Flex>
      ))}
      <Flex gap={8}>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={(e) => { e.preventDefault(); add() }}
          placeholder={t('Ajouter une sous-tâche (Entrée)')}
        />
        <Button icon={<PlusOutlined />} onClick={add} aria-label={t('Ajouter')} />
      </Flex>
    </Flex>
  )
}
