import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, App, AutoComplete, Button, Card, DatePicker, Empty, Flex, Form, Input, Modal, Popconfirm, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { BranchesOutlined, CloseOutlined, DeleteOutlined, DownOutlined, IssuesCloseOutlined, LinkOutlined, PlusOutlined, QuestionCircleOutlined, SaveOutlined, SearchOutlined, UpOutlined } from '@ant-design/icons'
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
import ItemChecklist, { ChecklistTag } from './ItemChecklist.jsx'
import ItemLinks from './ItemLinks.jsx'
import { overlayOpen, useItemPanel } from './ItemPanel.jsx'
import { openShortcuts } from './ShortcutsHelp.jsx'

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

const MORE_KEY = 'projectory:item-more'
function readMore() {
  try { return localStorage.getItem(MORE_KEY) === '1' } catch { return false }
}

// Side panel to create or edit a bug / task. `item` null = closed. A new item
// starts with the essentials only; the other fields wait behind "More options".
export function ItemForm({ item, onClose, onSaved }) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [linked, setLinked] = useState(null)
  const [more, setMore] = useState(readMore)
  const toggleMore = () => setMore((m) => {
    try { localStorage.setItem(MORE_KEY, m ? '0' : '1') } catch { /* storage unavailable */ }
    return !m
  })
  const showAll = !!item?.id || more
  useEffect(() => setLinked(null), [item])
  const current = linked || item
  const projectId = Form.useWatch('project_id', form) ?? item?.project_id
  const kind = Form.useWatch('kind', form)

  useEffect(() => {
    if (!item) return
    form.resetFields()
    form.setFieldsValue({ kind: 'bug', status: 'todo', priority: 'normal', source: 'manual', ...item, due_date: item.due_date ? dayjs(item.due_date) : null })
  }, [item, form])

  // New item: the project's template for its kind, as long as the text was not edited.
  const { data: project } = useApi(item && !item.id && projectId ? `/projects/${projectId}` : null)
  const appliedTemplate = useRef('')
  useEffect(() => { appliedTemplate.current = '' }, [item])
  useEffect(() => {
    if (!item || item.id || !project || !kind) return
    const template = project.item_templates?.[kind] || ''
    const body = form.getFieldValue('body') || ''
    if (body && body !== appliedTemplate.current) return
    // Not an edit by the user: closing right away must not ask to discard changes.
    form.setFields([{ name: 'body', value: template, touched: false }])
    appliedTemplate.current = template
  }, [item, project, kind, form])

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
      width={showAll ? 820 : 560}
      drawer
      saving={saving}
      onSave={save}
      isDirty={() => form.isFieldsTouched()}
      onDelete={item?.id ? remove : null}
      deleteTitle={t('Supprimer ?')}
    >
      <IssueLink item={current} onLinked={setLinked} />
      <Form form={form} layout="vertical">
        <Form.Item name="title" label={t('Titre')} rules={[{ required: true, message: t('Titre obligatoire') }]}>
          <Input autoFocus />
        </Form.Item>
        <Flex gap={12} wrap>
          <Form.Item name="project_id" label={t('Projet')} rules={[{ required: true, message: t('Projet obligatoire') }]} style={{ minWidth: 220, flex: 2 }}>
            <ProjectSelect />
          </Form.Item>
          <Form.Item name="kind" label={t('Type')} style={{ minWidth: 150, flex: 1 }}><Select options={options(ITEM_KIND)} /></Form.Item>
        </Flex>
        {!item?.id && (
          <Button type="link" size="small" icon={more ? <UpOutlined /> : <DownOutlined />} onClick={toggleMore} style={{ padding: 0, marginBottom: 16 }}>
            {more ? t('Moins d’options') : t('Plus d’options : statut, priorité, échéance, description…')}
          </Button>
        )}
        {/* Hidden, not unmounted: defaults and the project template keep their values. */}
        <div style={showAll ? undefined : { display: 'none' }}>
        <Flex gap={12} wrap>
          <Form.Item name="status" label={t('Statut')} style={{ minWidth: 150, flex: 1 }}><Select options={options(ITEM_STATUS)} /></Form.Item>
          <Form.Item name="priority" label={t('Priorité')} style={{ minWidth: 150, flex: 1 }}><Select options={options(PRIORITY)} /></Form.Item>
          <Form.Item name="due_date" label={t('Échéance')} style={{ minWidth: 150, flex: 1 }}><DatePicker format="L" style={{ width: '100%' }} /></Form.Item>
        </Flex>
        <Flex gap={12} wrap>
          <Form.Item name="source" label={t('Source')} style={{ minWidth: 150, flex: 1 }}>
            <Select options={options(SOURCE).filter((o) => o.value !== 'version')} />
          </Form.Item>
          <Form.Item name="target_version" label={t('Version cible')} style={{ minWidth: 120, flex: 1 }}><Input placeholder={t('ex. 1.3.0')} /></Form.Item>
        </Flex>
        <Form.Item name="external_url" label={t('Lien (post du forum, issue, mail…)')}><Input placeholder="https://…" /></Form.Item>
        <Form.Item name="pr_url" label={t('Pull request / merge request liée')}>
          <PrInput projectId={projectId} />
        </Form.Item>
        <Form.Item name="body" label={t('Description / étapes de reproduction')} className="md-editor">
          <MarkdownInput autoSize={{ minRows: 10, maxRows: 40 }} placeholder={[t('1. Aller sur…'), t('2. Cliquer sur…'), '', t('Attendu : …'), t('Obtenu : …'), t('Version : …')].join('\n')} />
        </Form.Item>
        <Form.Item name="checklist" label={t('Sous-tâches')}>
          <ItemChecklist />
        </Form.Item>
        </div>
        {item?.id && (
          <Form.Item label={t('Liens avec d’autres éléments')}>
            <ItemLinks item={item} />
          </Form.Item>
        )}
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
                    <ChecklistTag checklist={it.checklist} />
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

// Saved filter sets of the lists, shared by every project page.
function SavedViews({ current, onApply }) {
  const { message } = App.useApp()
  const { data: views, setData } = useApi('/settings/views', { listen: true })
  const [naming, setNaming] = useState(null)
  const save = async (next) => {
    try {
      setData(await api.put('/settings/views', { items: next }))
    } catch (err) {
      message.error(err.message)
    }
  }
  const remove = (id) => save((views || []).filter((v) => v.id !== id))
  return (
    <>
      <Select
        placeholder={t('Vues')}
        value={null}
        style={{ width: 110 }}
        popupMatchSelectWidth={220}
        onChange={(id) => { const view = views.find((v) => v.id === id); if (view) onApply(view.filters) }}
        notFoundContent={t('Aucune vue enregistrée')}
        options={(views || []).map((v) => ({
          value: v.id,
          label: (
            <Flex justify="space-between" align="center" gap={8}>
              <span>{v.name}</span>
              <CloseOutlined aria-label={t('Supprimer la vue')} style={{ fontSize: 10, opacity: 0.6 }} onClick={(e) => { e.stopPropagation(); remove(v.id) }} />
            </Flex>
          ),
        }))}
      />
      <Tooltip title={t('Enregistrer ces filtres comme vue')}>
        <Button icon={<SaveOutlined />} aria-label={t('Enregistrer ces filtres comme vue')} onClick={() => setNaming('')} />
      </Tooltip>
      <Modal
        open={naming !== null}
        title={t('Enregistrer la vue')}
        okText={t('Enregistrer')}
        okButtonProps={{ disabled: !naming?.trim() }}
        onCancel={() => setNaming(null)}
        onOk={async () => { await save([...(views || []), { name: naming.trim(), filters: current }]); setNaming(null) }}
        destroyOnHidden
      >
        <Input autoFocus value={naming || ''} onChange={(e) => setNaming(e.target.value)} placeholder={t('ex. Bugs urgents')} onPressEnter={async () => { if (naming?.trim()) { await save([...(views || []), { name: naming.trim(), filters: current }]); setNaming(null) } }} />
      </Modal>
    </>
  )
}

// Same change on the selected rows: status, priority, target version, or deletion.
function BulkBar({ ids, onDone, onClear }) {
  const { message } = App.useApp()
  const [version, setVersion] = useState('')
  const run = async (body) => {
    try {
      await api.post('/items/bulk', { ids, ...body })
      message.success(body.delete ? t('{n} élément(s) supprimé(s)', { n: ids.length }) : t('{n} élément(s) modifié(s)', { n: ids.length }))
      notifyChange()
      onDone()
    } catch (err) {
      message.error(err.message)
    }
  }
  return (
    <Flex gap={8} wrap align="center" style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(22, 119, 255, 0.08)' }}>
      <Typography.Text strong>{t('{n} sélectionné(s)', { n: ids.length })}</Typography.Text>
      <Select size="small" placeholder={t('Statut…')} value={null} style={{ width: 140 }} options={options(ITEM_STATUS)} onChange={(status) => run({ changes: { status } })} />
      <Select size="small" placeholder={t('Priorité…')} value={null} style={{ width: 130 }} options={options(PRIORITY)} onChange={(priority) => run({ changes: { priority } })} />
      <Space.Compact size="small">
        <Input size="small" placeholder={t('Version cible…')} value={version} onChange={(e) => setVersion(e.target.value)} style={{ width: 130 }} />
        <Button size="small" onClick={() => run({ changes: { target_version: version.trim() } })}>{t('Appliquer')}</Button>
      </Space.Compact>
      <Popconfirm title={t('Supprimer {n} élément(s) ?', { n: ids.length })} onConfirm={() => run({ delete: true })}>
        <Button size="small" danger icon={<DeleteOutlined />}>{t('Supprimer')}</Button>
      </Popconfirm>
      <Button size="small" type="text" onClick={onClear}>{t('Désélectionner')}</Button>
    </Flex>
  )
}

// Status reached with "s": through the work in progress, then done.
const NEXT_STATUS = { todo: 'in_progress', in_progress: 'testing', testing: 'done', blocked: 'in_progress', done: 'todo', wontfix: 'todo' }
const PAGE_SIZE = 25
const DEFAULT_FILTERS = { scope: 'open', kind: null, priority: null, status: null, q: '' }

export const isTyping = (el) => el && ((el.tagName === 'INPUT' && !['checkbox', 'radio'].includes(el.type)) || ['TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)

// Bugs / tasks list for one project (projectId) or across all projects.
export default function ItemsPanel({ projectId }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [view, setView] = useState('table')
  const { openItem, newItem } = useItemPanel()
  const [expanded, setExpanded] = useState([])
  const [replyTo, setReplyTo] = useState(null)
  const [selected, setSelected] = useState([])
  const [focused, setFocused] = useState(-1)
  const [page, setPage] = useState(1)
  const searchRef = useRef(null)
  const query = new URLSearchParams()
  if (projectId) query.set('project_id', projectId)
  if (filters.scope === 'open' && view === 'table') query.set('open', '1')
  if (filters.kind) query.set('kind', filters.kind)
  if (filters.status) query.set('status', filters.status)
  const { data, loading, reload, setData } = useApi(`/items?${query}`, { listen: true })

  const items = useMemo(() => {
    const needle = filters.q.trim().toLowerCase()
    return (data || []).filter((i) => (!filters.priority || i.priority === filters.priority)
      && (!needle || `${i.title} ${i.body}`.toLowerCase().includes(needle)))
  }, [data, filters.priority, filters.q])
  const setFilter = (key) => (value) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); setFocused(-1) }

  const updateStatus = async (id, status) => {
    setData((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)))
    const updated = await api.put(`/items/${id}`, { status })
    notifyChange()
    // A bug reported on the forum is fixed: offer to tell the reporter.
    if (needsForumReply(updated)) setReplyTo(updated)
  }

  // Keyboard navigation of the list (ignored while typing or in a dialog).
  const keys = useRef({})
  keys.current = { items, focused, replyTo, view, openItem }
  useEffect(() => {
    const onKey = (e) => {
      const { items: rows, focused: index, replyTo: replying, view: mode, openItem: open } = keys.current
      if (mode !== 'table' || replying || isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey || overlayOpen()) return
      const move = (to) => {
        const next = Math.max(0, Math.min(rows.length - 1, to))
        setFocused(next)
        setPage(Math.floor(next / PAGE_SIZE) + 1)
        requestAnimationFrame(() => document.querySelector(`[data-row-key="${rows[next]?.id}"]`)?.scrollIntoView({ block: 'nearest' }))
      }
      const row = rows[index]
      const actions = {
        j: () => move(index + 1),
        ArrowDown: () => move(index + 1),
        k: () => move(index < 0 ? 0 : index - 1),
        ArrowUp: () => move(index < 0 ? 0 : index - 1),
        Enter: () => row && open(row),
        e: () => row && open(row),
        s: () => row && updateStatus(row.id, NEXT_STATUS[row.status] || 'todo'),
        x: () => row && setSelected((ids) => (ids.includes(row.id) ? ids.filter((id) => id !== row.id) : [...ids, row.id])),
        '/': () => searchRef.current?.focus(),
        Escape: () => setSelected([]),
      }
      const action = actions[e.key]
      if (!action) return
      e.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const columns = [
    {
      title: t('Titre'),
      dataIndex: 'title',
      render: (title, it) => (
        <Flex vertical gap={2}>
          <Flex gap={6} align="center" wrap>
            <TodayButton item={it} onChange={(updated) => setData((rows) => rows.map((r) => (r.id === updated.id ? { ...r, focus_date: updated.focus_date } : r)))} />
            <Typography.Link onClick={() => openItem(it)} delete={it.status === 'wontfix'}>{title}</Typography.Link>
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
            <ChecklistTag checklist={it.checklist} />
            {it.open_blockers > 0 && <Tag color="error" style={{ marginInlineEnd: 0 }}>{t('bloqué par {n}', { n: it.open_blockers })}</Tag>}
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

  const current = { ...filters, view }
  const filtered = !!(filters.kind || filters.status || filters.priority || filters.q.trim())
  const addButton = <Button type="primary" icon={<PlusOutlined />} onClick={() => newItem({ project_id: projectId ? Number(projectId) : undefined })}>{t('Bug / tâche')}</Button>
  return (
    <Flex vertical gap={12}>
      <Flex gap={8} wrap align="center">
        <Segmented value={view} onChange={setView} options={[{ value: 'table', label: t('Liste') }, { value: 'board', label: t('Tableau') }]} />
        {view === 'table' && (
          <Segmented value={filters.scope} onChange={setFilter('scope')} options={[{ value: 'open', label: t('Ouverts') }, { value: 'all', label: t('Tous') }]} />
        )}
        <Button type="primary" icon={<PlusOutlined />} style={{ marginLeft: 'auto' }} onClick={() => newItem({ project_id: projectId ? Number(projectId) : undefined })}>{t('Bug / tâche')}</Button>
      </Flex>
      <Flex gap={8} wrap align="center">
        <Select allowClear placeholder={t('Type')} style={{ width: 135 }} value={filters.kind} onChange={setFilter('kind')} options={options(ITEM_KIND)} />
        <Select allowClear placeholder={t('Statut')} style={{ width: 125 }} value={filters.status} onChange={setFilter('status')} options={options(ITEM_STATUS)} />
        <Select allowClear placeholder={t('Priorité')} style={{ width: 115 }} value={filters.priority} onChange={setFilter('priority')} options={options(PRIORITY)} />
        <Input
          ref={searchRef}
          allowClear
          prefix={<SearchOutlined />}
          suffix={(
            <Tooltip title={t('Raccourcis clavier ( ? )')}>
              <QuestionCircleOutlined aria-label={t('Raccourcis clavier')} style={{ opacity: 0.5, cursor: 'pointer' }} onClick={openShortcuts} />
            </Tooltip>
          )}
          placeholder={t('Filtrer… ( / )')}
          value={filters.q}
          onChange={(e) => setFilter('q')(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur() }}
          style={{ width: 170 }}
        />
        <SavedViews current={current} onApply={({ view: savedView, ...saved }) => { setFilters({ ...DEFAULT_FILTERS, ...saved }); if (savedView) setView(savedView); setPage(1) }} />
      </Flex>
      {selected.length > 0 && view === 'table' && (
        <BulkBar ids={selected} onClear={() => setSelected([])} onDone={() => { setSelected([]); reload() }} />
      )}
      {view === 'board' ? (
        items.length ? <Board items={items} onOpen={openItem} onMove={updateStatus} /> : <Empty description={t('Rien à suivre pour l\'instant')}>{addButton}</Empty>
      ) : (
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={items}
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
          rowClassName={(it) => (items[focused]?.id === it.id ? 'row-focused' : '')}
          pagination={{ pageSize: PAGE_SIZE, current: page, onChange: setPage, hideOnSinglePage: true }}
          scroll={{ x: 960 }}
          expandable={{
            expandedRowKeys: expanded,
            onExpandedRowsChange: setExpanded,
            rowExpandable: (it) => !!it.body,
            expandedRowRender: (it) => <Markdown>{it.body}</Markdown>,
          }}
          locale={{ emptyText: <Empty description={filtered ? t('Aucun élément ne correspond aux filtres') : t('Aucun bug ni tâche ouverts 🎉')}>{filtered ? <Button onClick={() => setFilters(DEFAULT_FILTERS)}>{t('Effacer les filtres')}</Button> : addButton}</Empty> }}
        />
      )}
      <ForumReplyModal item={replyTo} onClose={() => { setReplyTo(null); reload() }} />
    </Flex>
  )
}
