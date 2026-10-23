import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, App, AutoComplete, Button, Card, DatePicker, Empty, Flex, Form, Input, Popconfirm, Segmented, Select, Table, Tag, Tooltip, Typography } from 'antd'
import { BranchesOutlined, IssuesCloseOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange, useApi } from '../api/client.js'
import { ITEM_KIND, ITEM_STATUS, OPEN_STATUSES, PRIORITY, SOURCE, options, prLabel } from './labels.js'
import { LabelTag } from './Tags.jsx'
import Markdown from './Markdown.jsx'
import MarkdownInput from './MarkdownInput.jsx'
import TodayButton from './TodayButton.jsx'
import ForumReplyModal, { needsForumReply } from './ForumReplyModal.jsx'
import ProjectSelect from './ProjectSelect.jsx'
import { t } from '../i18n/index.js'
import FormModal from './FormModal.jsx'

// Opens an issue on the project's forge; the issue link then lives on the item.
function IssueLink({ item, onLinked }) {
  const { message } = App.useApp()
  const [creating, setCreating] = useState(false)
  if (!item?.id) return null
  if (item.issue_url) {
    return (
      <Alert
        type="info"
        showIcon
        icon={<IssuesCloseOutlined />}
        style={{ marginBottom: 16 }}
        message={<>{t('Issue liée :') + ' '}<a href={item.issue_url} target="_blank" rel="noreferrer">{item.issue_number ? `#${item.issue_number}` : item.issue_url}</a></>}
        description={t(
          'Quand l\'issue est fermée sur la forge, cet élément passe automatiquement à « Terminé » à la synchro suivante.'
        )}
      />
    )
  }
  const create = async () => {
    setCreating(true)
    try {
      const updated = await api.post(`/items/${item.id}/issue`, { labels: item.kind === 'bug' ? ['bug'] : item.kind === 'feature' ? ['enhancement'] : [] })
      message.success(t('Issue #{n} créée', { n: updated.issue_number }))
      notifyChange()
      onLinked(updated)
    } catch (err) {
      message.error(err.message)
    } finally {
      setCreating(false)
    }
  }
  return (
    <Popconfirm
      title={t('Créer l\'issue sur le dépôt du projet ?')}
      description={t(
        'Titre et description sont repris, avec le lien du forum et la version cible. Les modifications non enregistrées ne sont pas incluses.'
      )}
      onConfirm={create}
    >
      <Button icon={<IssuesCloseOutlined />} loading={creating} style={{ marginBottom: 16 }}>{t('Créer l\'issue sur le dépôt')}</Button>
    </Popconfirm>
  )
}

// Open PRs / MRs of the project as suggestions; any URL can be pasted too.
function PrInput({ projectId, value, onChange }) {
  const { data } = useApi(projectId ? `/github-items?project_id=${projectId}&type=pr` : null)
  const prOptions = (data || []).map((pr) => ({ value: pr.url, label: `#${pr.number} ${pr.title}` }))
  return (
    <Flex gap={8} align="center">
      <AutoComplete
        value={value}
        onChange={onChange}
        options={prOptions}
        allowClear
        style={{ flex: 1 }}
        placeholder={prOptions.length ? t('Choisir une PR ouverte ou coller son URL') : 'https://…/pull/12'}
        filterOption={(input, opt) => opt.label.toLowerCase().includes(input.toLowerCase()) || opt.value.includes(input)}
      />
      {value && <a href={value} target="_blank" rel="noreferrer"><LinkOutlined /></a>}
    </Flex>
  )
}

export function ItemForm({ item, onClose, onSaved, withProjectPicker }) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [linked, setLinked] = useState(null)
  useEffect(() => setLinked(null), [item])
  const current = linked || item
  const projectId = Form.useWatch('project_id', form) ?? item?.project_id

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
      // Created from the "Today" view: planned for the day right away.
      if (!item.id && item.focus_date) body.focus_date = item.focus_date
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
    <FormModal
      open={!!item}
      onClose={onClose}
      title={item?.id ? t('Modifier') : t('Nouveau bug / tâche')}
      width={960}
      saving={saving}
      onSave={save}
      isDirty={() => form.isFieldsTouched()}
      onDelete={item?.id ? remove : null}
      deleteTitle={t('Supprimer ?')}
    >
      <IssueLink item={current} onLinked={setLinked} />
      <Form form={form} layout="vertical">
        {withProjectPicker && (
          <Form.Item name="project_id" label={t('Projet')} rules={[{ required: true, message: t('Projet obligatoire') }]}>
            <ProjectSelect />
          </Form.Item>
        )}
        <Form.Item name="title" label={t('Titre')} rules={[{ required: true, message: t('Titre obligatoire') }]}>
          <Input autoFocus />
        </Form.Item>
        <Flex gap={12} wrap>
          <Form.Item name="kind" label={t('Type')} style={{ minWidth: 150, flex: 1 }}><Select options={options(ITEM_KIND)} /></Form.Item>
          <Form.Item name="status" label={t('Statut')} style={{ minWidth: 150, flex: 1 }}><Select options={options(ITEM_STATUS)} /></Form.Item>
          <Form.Item name="priority" label={t('Priorité')} style={{ minWidth: 150, flex: 1 }}><Select options={options(PRIORITY)} /></Form.Item>
        </Flex>
        <Flex gap={12} wrap>
          <Form.Item name="source" label={t('Source')} style={{ minWidth: 150, flex: 1 }}>
            <Select options={options(SOURCE).filter((o) => o.value !== 'version')} />
          </Form.Item>
          <Form.Item name="target_version" label={t('Version cible')} style={{ minWidth: 120, flex: 1 }}><Input placeholder={t('ex. 1.3.0')} /></Form.Item>
          <Form.Item name="due_date" label={t('Échéance')} style={{ minWidth: 150, flex: 1 }}><DatePicker format="L" style={{ width: '100%' }} /></Form.Item>
        </Flex>
        <Form.Item name="external_url" label={t('Lien (post du forum, issue, mail…)')}><Input placeholder="https://…" /></Form.Item>
        <Form.Item name="pr_url" label={t('Pull request / merge request liée')}>
          <PrInput projectId={projectId} />
        </Form.Item>
        <Form.Item name="body" label={t('Description / étapes de reproduction')} className="md-editor">
          <MarkdownInput autoSize={{ minRows: 12, maxRows: 40 }} placeholder={[t('1. Aller sur…'), t('2. Cliquer sur…'), '', t('Attendu : …'), t('Obtenu : …'), t('Version : …')].join('\n')} />
        </Form.Item>
      </Form>
    </FormModal>
  )
}

const BOARD_COLUMNS = ['todo', 'in_progress', 'testing', 'done']
// Statuses without their own column.
const BOARD_FOLD = { blocked: 'in_progress', wontfix: 'done' }

function Board({ items, onOpen, onMove }) {
  return (
    <Flex gap={12} align="start" style={{ overflowX: 'auto' }}>
      {BOARD_COLUMNS.map((status) => {
        const col = items.filter((i) => (BOARD_FOLD[i.status] || i.status) === status)
        return (
          <Card
            key={status}
            size="small"
            title={<>{t(ITEM_STATUS[status].label)} <Tag>{col.length}</Tag></>}
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
                    {it.status === 'blocked' && <LabelTag map={ITEM_STATUS} value={it.status} />}
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
  const [replyTo, setReplyTo] = useState(null)
  const query = new URLSearchParams()
  if (projectId) query.set('project_id', projectId)
  if (filters.scope === 'open' && view === 'table') query.set('open', '1')
  if (filters.kind) query.set('kind', filters.kind)
  const { data, loading, reload, setData } = useApi(`/items?${query}`, { listen: true })

  const items = useMemo(() => (data || []).filter((i) => !filters.priority || i.priority === filters.priority), [data, filters.priority])

  const updateStatus = async (id, status) => {
    setData((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)))
    const updated = await api.put(`/items/${id}`, { status })
    notifyChange()
    // A bug reported on the forum is fixed: offer to tell the reporter.
    if (needsForumReply(updated)) setReplyTo(updated)
  }

  const columns = [
    {
      title: t('Titre'),
      dataIndex: 'title',
      render: (title, it) => (
        <Flex vertical gap={2}>
          <Flex gap={6} align="center" wrap>
            <TodayButton item={it} onChange={(updated) => setData((rows) => rows.map((r) => (r.id === updated.id ? { ...r, focus_date: updated.focus_date } : r)))} />
            <Typography.Link onClick={() => setEditing(it)} delete={it.status === 'wontfix'}>{title}</Typography.Link>
            {it.issue_url && (
              <Tooltip title={t('Issue sur le dépôt')}>
                <a href={it.issue_url} target="_blank" rel="noreferrer"><Tag style={{ marginInlineEnd: 0 }}>{it.issue_number ? `#${it.issue_number}` : 'issue'}</Tag></a>
              </Tooltip>
            )}
            {it.pr_url && (
              <Tooltip title={t('Pull / merge request liée')}>
                <a href={it.pr_url} target="_blank" rel="noreferrer"><Tag icon={<BranchesOutlined />} style={{ marginInlineEnd: 0 }}>{prLabel(it.pr_url)}</Tag></a>
              </Tooltip>
            )}
            {it.external_url && <a href={it.external_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><LinkOutlined /></a>}
            {needsForumReply(it) && (
              <Tag color="green" style={{ cursor: 'pointer', marginInlineEnd: 0 }} onClick={() => setReplyTo(it)}>{t('répondre sur le forum')}</Tag>
            )}
          </Flex>
          {!projectId && <Link to={`/projects/${it.project_id}/items`} style={{ fontSize: 12, opacity: 0.7 }}>{it.project_name}</Link>}
        </Flex>
      ),
    },
    { title: t('Type'), dataIndex: 'kind', width: 130, render: (v) => <LabelTag map={ITEM_KIND} value={v} /> },
    { title: t('Priorité'), dataIndex: 'priority', width: 110, render: (v) => <LabelTag map={PRIORITY} value={v} /> },
    {
      title: t('Statut'),
      dataIndex: 'status',
      width: 150,
      render: (v, it) => <Select size="small" value={v} options={options(ITEM_STATUS)} onChange={(s) => updateStatus(it.id, s)} variant="borderless" style={{ width: 130 }} />,
    },
    { title: t('Source'), dataIndex: 'source', width: 100, responsive: ['md'], render: (v) => <LabelTag map={SOURCE} value={v} /> },
    { title: t('Version'), dataIndex: 'target_version', width: 90, responsive: ['lg'] },
    {
      title: t('Échéance / maj'),
      width: 130,
      responsive: ['md'],
      render: (_, it) => it.due_date
        ? <Tag color={dayjs(it.due_date).isBefore(dayjs(), 'day') && OPEN_STATUSES.includes(it.status) ? 'red' : 'default'}>{dayjs(it.due_date).format('L')}</Tag>
        : <span style={{ opacity: 0.6 }}>{dayjs.utc(it.updated_at).local().fromNow()}</span>,
    },
  ]

  return (
    <Flex vertical gap={12}>
      <Flex gap={8} wrap align="center">
        <Segmented value={view} onChange={setView} options={[{ value: 'table', label: t('Liste') }, { value: 'board', label: t('Tableau') }]} />
        {view === 'table' && (
          <Segmented value={filters.scope} onChange={(scope) => setFilters((f) => ({ ...f, scope }))} options={[{ value: 'open', label: t('Ouverts') }, { value: 'all', label: t('Tous') }]} />
        )}
        <Select allowClear placeholder={t('Type')} style={{ width: 150 }} value={filters.kind} onChange={(kind) => setFilters((f) => ({ ...f, kind }))} options={options(ITEM_KIND)} />
        <Select allowClear placeholder={t('Priorité')} style={{ width: 130 }} value={filters.priority} onChange={(priority) => setFilters((f) => ({ ...f, priority }))} options={options(PRIORITY)} />
        <Button type="primary" icon={<PlusOutlined />} style={{ marginLeft: 'auto' }} onClick={() => setEditing({ project_id: projectId })}>{t('Bug / tâche')}</Button>
      </Flex>
      {view === 'board' ? (
        items.length ? <Board items={items} onOpen={setEditing} onMove={updateStatus} /> : <Empty description={t('Rien à suivre pour l\'instant')} />
      ) : (
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{ pageSize: 25, hideOnSinglePage: true }}
          scroll={{ x: 960 }}
          expandable={{
            expandedRowKeys: expanded,
            onExpandedRowsChange: setExpanded,
            rowExpandable: (it) => !!it.body,
            expandedRowRender: (it) => <Markdown>{it.body}</Markdown>,
          }}
          locale={{ emptyText: <Empty description={t('Aucun bug ni tâche ouverts 🎉')} /> }}
        />
      )}
      <ItemForm item={editing} withProjectPicker={!projectId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />
      <ForumReplyModal item={replyTo} onClose={() => { setReplyTo(null); reload() }} />
    </Flex>
  )
}
