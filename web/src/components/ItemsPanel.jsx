import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { App, Button, Card, DatePicker, Drawer, Empty, Flex, Form, Input, Popconfirm, Segmented, Select, Table, Tag, Typography } from 'antd'
import { LinkOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange, useApi } from '../api/client.js'
import { ITEM_KIND, ITEM_STATUS, PRIORITY, SOURCE, options } from './labels.js'
import { LabelTag } from './Tags.jsx'
import Markdown from './Markdown.jsx'
import ProjectSelect from './ProjectSelect.jsx'

export function ItemForm({ item, onClose, onSaved, withProjectPicker }) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!item) return
    form.resetFields()
    form.setFieldsValue({ kind: 'bug', status: 'todo', priority: 'normal', source: 'manual', ...item, due_date: item.due_date ? dayjs(item.due_date) : null })
  }, [item, form])

  const save = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const body = { ...values, project_id: values.project_id ?? item.project_id, due_date: values.due_date ? values.due_date.format('YYYY-MM-DD') : null }
      const saved = item.id ? await api.put(`/items/${item.id}`, body) : await api.post('/items', body)
      notifyChange()
      onSaved?.(saved)
    } catch (err) {
      message.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    await api.del(`/items/${item.id}`)
    notifyChange()
    onSaved?.(null)
  }

  return (
    <Drawer
      open={!!item}
      onClose={onClose}
      size={Math.min(640, window.innerWidth)}
      title={item?.id ? 'Modifier' : 'Nouveau bug / tâche'}
      destroyOnHidden
      extra={
        <Flex gap={8}>
          {item?.id && <Popconfirm title="Supprimer ?" onConfirm={remove}><Button danger>Supprimer</Button></Popconfirm>}
          <Button type="primary" loading={saving} onClick={save}>Enregistrer</Button>
        </Flex>
      }
    >
      <Form form={form} layout="vertical">
        {withProjectPicker && (
          <Form.Item name="project_id" label="Projet" rules={[{ required: true, message: 'Projet obligatoire' }]}>
            <ProjectSelect />
          </Form.Item>
        )}
        <Form.Item name="title" label="Titre" rules={[{ required: true, message: 'Titre obligatoire' }]}>
          <Input autoFocus />
        </Form.Item>
        <Flex gap={12} wrap>
          <Form.Item name="kind" label="Type" style={{ minWidth: 150, flex: 1 }}><Select options={options(ITEM_KIND)} /></Form.Item>
          <Form.Item name="status" label="Statut" style={{ minWidth: 150, flex: 1 }}><Select options={options(ITEM_STATUS)} /></Form.Item>
          <Form.Item name="priority" label="Priorité" style={{ minWidth: 150, flex: 1 }}><Select options={options(PRIORITY)} /></Form.Item>
        </Flex>
        <Flex gap={12} wrap>
          <Form.Item name="source" label="Source" style={{ minWidth: 150, flex: 1 }}>
            <Select options={options(SOURCE).filter((o) => o.value !== 'version')} />
          </Form.Item>
          <Form.Item name="target_version" label="Version cible" style={{ minWidth: 120, flex: 1 }}><Input placeholder="ex. 1.3.0" /></Form.Item>
          <Form.Item name="due_date" label="Échéance" style={{ minWidth: 150, flex: 1 }}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
        </Flex>
        <Form.Item name="external_url" label="Lien (post du forum, issue, mail…)"><Input placeholder="https://…" /></Form.Item>
        <Form.Item name="body" label="Description / étapes de reproduction" className="md-editor">
          <Input.TextArea autoSize={{ minRows: 6, maxRows: 24 }} placeholder={'1. Aller sur…\n2. Cliquer sur…\n\nAttendu : …\nObtenu : …\nVersion : …'} />
        </Form.Item>
      </Form>
    </Drawer>
  )
}

const BOARD_COLUMNS = ['todo', 'in_progress', 'done']

function Board({ items, onOpen, onMove }) {
  return (
    <Flex gap={12} align="start" style={{ overflowX: 'auto' }}>
      {BOARD_COLUMNS.map((status) => {
        const col = items.filter((i) => i.status === status || (status === 'done' && i.status === 'wontfix'))
        return (
          <Card
            key={status}
            size="small"
            title={<>{ITEM_STATUS[status].label} <Tag>{col.length}</Tag></>}
            style={{ flex: 1, minWidth: 260 }}
            styles={{ body: { display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80 } }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onMove(Number(e.dataTransfer.getData('text/plain')), status)}
          >
            {col.map((it) => (
              <Card
                key={it.id}
                size="small"
                hoverable
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', String(it.id))}
                onClick={() => onOpen(it)}
              >
                <Flex vertical gap={4}>
                  <Typography.Text strong delete={it.status === 'wontfix'}>{it.title}</Typography.Text>
                  <Flex gap={2} wrap>
                    <LabelTag map={ITEM_KIND} value={it.kind} />
                    {it.priority !== 'normal' && <LabelTag map={PRIORITY} value={it.priority} />}
                    {it.project_name && <Tag>{it.project_name}</Tag>}
                  </Flex>
                </Flex>
              </Card>
            ))}
          </Card>
        )
      })}
    </Flex>
  )
}

// Bugs / tasks list for one project (projectId) or across all projects.
export default function ItemsPanel({ projectId }) {
  const [filters, setFilters] = useState({ scope: 'open', kind: null, priority: null })
  const [view, setView] = useState('table')
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState([])
  const query = new URLSearchParams()
  if (projectId) query.set('project_id', projectId)
  if (filters.scope === 'open' && view === 'table') query.set('open', '1')
  if (filters.kind) query.set('kind', filters.kind)
  const { data, loading, reload, setData } = useApi(`/items?${query}`, { listen: true })

  const items = useMemo(() => (data || []).filter((i) => !filters.priority || i.priority === filters.priority), [data, filters.priority])

  const updateStatus = async (id, status) => {
    setData((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)))
    await api.put(`/items/${id}`, { status })
    notifyChange()
  }

  const columns = [
    {
      title: 'Titre',
      dataIndex: 'title',
      render: (title, it) => (
        <Flex vertical gap={2}>
          <Flex gap={6} align="center">
            <Typography.Link onClick={() => setEditing(it)} delete={it.status === 'wontfix'}>{title}</Typography.Link>
            {it.external_url && <a href={it.external_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><LinkOutlined /></a>}
          </Flex>
          {!projectId && <Link to={`/projects/${it.project_id}/items`} style={{ fontSize: 12, opacity: 0.7 }}>{it.project_name}</Link>}
        </Flex>
      ),
    },
    { title: 'Type', dataIndex: 'kind', width: 130, render: (v) => <LabelTag map={ITEM_KIND} value={v} /> },
    { title: 'Priorité', dataIndex: 'priority', width: 110, render: (v) => <LabelTag map={PRIORITY} value={v} /> },
    {
      title: 'Statut',
      dataIndex: 'status',
      width: 150,
      render: (v, it) => <Select size="small" value={v} options={options(ITEM_STATUS)} onChange={(s) => updateStatus(it.id, s)} variant="borderless" style={{ width: 130 }} />,
    },
    { title: 'Source', dataIndex: 'source', width: 100, responsive: ['md'], render: (v) => <LabelTag map={SOURCE} value={v} /> },
    { title: 'Version', dataIndex: 'target_version', width: 90, responsive: ['lg'] },
    {
      title: 'Échéance / maj',
      width: 130,
      responsive: ['md'],
      render: (_, it) => it.due_date
        ? <Tag color={dayjs(it.due_date).isBefore(dayjs(), 'day') && ['todo', 'in_progress'].includes(it.status) ? 'red' : 'default'}>{dayjs(it.due_date).format('DD/MM/YYYY')}</Tag>
        : <span style={{ opacity: 0.6 }}>{dayjs.utc(it.updated_at).local().fromNow()}</span>,
    },
  ]

  return (
    <Flex vertical gap={12}>
      <Flex gap={8} wrap align="center">
        <Segmented value={view} onChange={setView} options={[{ value: 'table', label: 'Liste' }, { value: 'board', label: 'Tableau' }]} />
        {view === 'table' && (
          <Segmented value={filters.scope} onChange={(scope) => setFilters((f) => ({ ...f, scope }))} options={[{ value: 'open', label: 'Ouverts' }, { value: 'all', label: 'Tous' }]} />
        )}
        <Select allowClear placeholder="Type" style={{ width: 150 }} value={filters.kind} onChange={(kind) => setFilters((f) => ({ ...f, kind }))} options={options(ITEM_KIND)} />
        <Select allowClear placeholder="Priorité" style={{ width: 130 }} value={filters.priority} onChange={(priority) => setFilters((f) => ({ ...f, priority }))} options={options(PRIORITY)} />
        <Button type="primary" icon={<PlusOutlined />} style={{ marginLeft: 'auto' }} onClick={() => setEditing({ project_id: projectId })}>
          Bug / tâche
        </Button>
      </Flex>
      {view === 'board' ? (
        items.length ? <Board items={items} onOpen={setEditing} onMove={updateStatus} /> : <Empty description="Rien à suivre pour l'instant" />
      ) : (
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{ pageSize: 25, hideOnSinglePage: true }}
          expandable={{
            expandedRowKeys: expanded,
            onExpandedRowsChange: setExpanded,
            rowExpandable: (it) => !!it.body,
            expandedRowRender: (it) => <Markdown>{it.body}</Markdown>,
          }}
          locale={{ emptyText: <Empty description="Aucun bug ni tâche ouverts 🎉" /> }}
        />
      )}
      <ItemForm item={editing} withProjectPicker={!projectId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />
    </Flex>
  )
}
