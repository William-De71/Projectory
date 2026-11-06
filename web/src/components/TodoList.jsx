import { useState } from 'react'
import { App, Button, Checkbox, Flex, Input, Popconfirm, Typography } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { api, notifyChange } from '../api/client.js'
import { t } from '../i18n/index.js'
import ProjectSelect from './ProjectSelect.jsx'

// Adds a to-do to a project's list; with `chooseProject`, the list is picked here
// and no project means the general list.
export function TodoAdd({ projectId = null, chooseProject = false }) {
  const { message } = App.useApp()
  const [text, setText] = useState('')
  const [chosen, setChosen] = useState()
  const [saving, setSaving] = useState(false)

  const add = async () => {
    if (!text.trim() || saving) return
    setSaving(true)
    try {
      await api.post('/todos', { text, project_id: chooseProject ? (chosen ?? null) : projectId })
      setText('')
      notifyChange()
    } catch (err) {
      message.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Flex gap={8} wrap>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPressEnter={add}
        placeholder={t('Ajouter une todo…')}
        aria-label={t('Ajouter une todo…')}
        style={{ flex: '1 1 240px' }}
      />
      {chooseProject && (
        <ProjectSelect allowClear value={chosen} onChange={setChosen} placeholder={t('Liste générale')} aria-label={t('Liste')} style={{ width: 200 }} />
      )}
      <Button type="primary" icon={<PlusOutlined />} loading={saving} disabled={!text.trim()} onClick={add}>{t('Ajouter')}</Button>
    </Flex>
  )
}

function TodoRow({ todo }) {
  const { message } = App.useApp()
  const done = !!todo.done_at
  const run = async (action) => {
    try {
      await action()
      notifyChange()
    } catch (err) {
      message.error(err.message)
    }
  }
  const rename = (text) => {
    if (text.trim() && text !== todo.text) run(() => api.put(`/todos/${todo.id}`, { text }))
  }
  return (
    <Flex gap={8} align="start">
      <Checkbox checked={done} aria-label={todo.text} onChange={(e) => run(() => api.put(`/todos/${todo.id}`, { done: e.target.checked }))} />
      <Typography.Text
        delete={done}
        type={done ? 'secondary' : undefined}
        editable={{ onChange: rename, tooltip: t('Modifier'), triggerType: ['icon'] }}
        style={{ flex: 1, minWidth: 0, insetInlineStart: 0, margin: 0, overflowWrap: 'anywhere' }}
      >
        {todo.text}
      </Typography.Text>
      <Button size="small" type="text" icon={<DeleteOutlined />} aria-label={t('Supprimer « {text} »', { text: todo.text })} onClick={() => run(() => api.del(`/todos/${todo.id}`))} />
    </Flex>
  )
}

// One list: open to-dos first, then the done ones, which can be cleared together.
export default function TodoList({ todos, projectId = null, emptyText }) {
  const { message } = App.useApp()
  const doneCount = todos.filter((todo) => todo.done_at).length

  const clearDone = async () => {
    try {
      await api.del(`/todos/done?project_id=${projectId ?? 'none'}`)
      notifyChange()
    } catch (err) {
      message.error(err.message)
    }
  }

  if (!todos.length) return <Typography.Text type="secondary">{emptyText || t('Rien à faire ici')}</Typography.Text>
  return (
    <Flex vertical gap={8}>
      {todos.map((todo) => <TodoRow key={todo.id} todo={todo} />)}
      {doneCount > 0 && (
        <Popconfirm title={t('Supprimer les {n} todo terminées de cette liste ?', { n: doneCount })} onConfirm={clearDone}>
          <Button size="small" type="link" style={{ alignSelf: 'start', padding: 0 }}>{t('Effacer les terminées ({n})', { n: doneCount })}</Button>
        </Popconfirm>
      )}
    </Flex>
  )
}
