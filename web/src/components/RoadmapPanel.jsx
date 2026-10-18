import { useState } from 'react'
import { App, Button, Card, Checkbox, DatePicker, Empty, Flex, Form, Input, List, Modal, Popconfirm, Progress, Select, Tabs, Tag, Typography } from 'antd'
import { CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, ExportOutlined, FileTextOutlined, PlusOutlined, RocketOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange, useApi } from '../api/client.js'
import { FORGES, ITEM_KIND, ITEM_STATUS, MILESTONE_STATUS } from './labels.js'
import { LabelTag } from './Tags.jsx'
import { ItemForm } from './ItemsPanel.jsx'
import Markdown from './Markdown.jsx'
import { compareVersions } from './versions.js'

function bump(version, part) {
  const [major = 0, minor = 0, patch = 0] = String(version || '0.0.0').replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  const prefix = String(version || '').startsWith('v') ? 'v' : ''
  if (part === 'major') return `${prefix}${major + 1}.0.0`
  if (part === 'minor') return `${prefix}${major}.${minor + 1}.0`
  return `${prefix}${major}.${minor}.${patch + 1}`
}

function MilestoneModal({ milestone, latest, onClose, onSaved }) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const save = async () => {
    const values = await form.validateFields()
    const body = { ...values, due_date: values.due_date ? values.due_date.format('YYYY-MM-DD') : null }
    try {
      if (milestone.id) await api.put(`/milestones/${milestone.id}`, body)
      else await api.post('/milestones', { ...body, project_id: milestone.project_id })
      notifyChange()
      onSaved()
    } catch (err) {
      message.error(err.message)
    }
  }
  return (
    <Modal open={!!milestone} title={milestone?.id ? `Modifier ${milestone.version}` : 'Nouvelle version'} onCancel={onClose} onOk={save} okText="Enregistrer" destroyOnHidden
      afterOpenChange={(open) => open && form.setFieldsValue({ ...milestone, due_date: milestone.due_date ? dayjs(milestone.due_date) : null })}>
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item name="version" label="Version" rules={[{ required: true, message: 'Version obligatoire' }]}
          extra={!milestone?.id && (
            <Flex gap={6} style={{ marginTop: 6 }}>
              {['patch', 'minor', 'major'].map((part) => (
                <Button key={part} size="small" onClick={() => form.setFieldValue('version', bump(latest, part))}>{part} → {bump(latest, part)}</Button>
              ))}
            </Flex>
          )}>
          <Input placeholder="1.2.0" autoFocus />
        </Form.Item>
        <Form.Item name="title" label="Nom / thème"><Input placeholder="ex. Exports et partage" /></Form.Item>
        <Form.Item name="due_date" label="Date prévue"><DatePicker format="DD/MM/YYYY" /></Form.Item>
        <Form.Item name="description" label="Notes (reprises en tête du changelog)"><Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} /></Form.Item>
      </Form>
    </Modal>
  )
}

function ChangelogModal({ state, onClose }) {
  const { message } = App.useApp()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(state.markdown)
      message.success('Copié')
    } catch {
      message.error('Copie impossible — sélectionne le texte dans l’onglet Markdown')
    }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([state.markdown], { type: 'text/markdown' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: state.filename })
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <Modal open={!!state} title={state?.title} onCancel={onClose} width={Math.min(820, window.innerWidth - 32)}
      footer={[<Button key="d" icon={<DownloadOutlined />} onClick={download}>Télécharger</Button>, <Button key="c" type="primary" icon={<CopyOutlined />} onClick={copy}>Copier le Markdown</Button>]}>
      {state && (
        <Tabs items={[
          { key: 'preview', label: 'Aperçu', children: <Markdown>{state.markdown}</Markdown> },
          { key: 'md', label: 'Markdown', children: <Input.TextArea value={state.markdown} readOnly autoSize={{ minRows: 10, maxRows: 30 }} className="md-editor" /> },
        ]} />
      )}
    </Modal>
  )
}

// Publishes a version in Projectory and/or as a release on the project's forge.
// mode "release": full publication; mode "forge": forge release of an already published version.
function ReleaseModal({ state, project, onClose, onDone }) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [busy, setBusy] = useState(false)
  const toForge = Form.useWatch('to_forge', form)
  const forgeLabel = FORGES[project?.forge || 'github']?.label
  const milestone = state?.milestone

  const submit = async () => {
    const v = await form.validateFields()
    const forge = v.to_forge ? { tag: v.tag, draft: v.draft, prerelease: v.prerelease } : null
    setBusy(true)
    try {
      if (state.mode === 'forge') {
        await api.post(`/milestones/${milestone.id}/forge-release`, forge)
        message.success(`Release créée sur ${forgeLabel}`)
        notifyChange()
        onDone(null)
      } else {
        const res = await api.post(`/projects/${project.id}/release`, { version: milestone.version, close_items: v.close_items, save_note: v.save_note, forge })
        if (res.forge_error) message.warning(`Version publiée, mais la release ${forgeLabel} a échoué : ${res.forge_error}`, 8)
        else message.success(`Version ${milestone.version} publiée${forge ? ` et release créée sur ${forgeLabel}` : ''}`)
        notifyChange()
        onDone(res)
      }
    } catch (err) {
      message.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={!!state}
      title={state?.mode === 'forge' ? `Release ${forgeLabel} pour ${milestone?.version}` : `Publier ${milestone?.version}`}
      okText={state?.mode === 'forge' ? 'Créer la release' : 'Publier'}
      okButtonProps={{ loading: busy }}
      onOk={submit}
      onCancel={onClose}
      destroyOnHidden
      afterOpenChange={(open) => open && form.setFieldsValue({
        close_items: true,
        save_note: true,
        to_forge: !!project?.repo,
        tag: /^v/i.test(milestone.version) ? milestone.version : `v${milestone.version}`,
        draft: false,
        prerelease: false,
      })}
    >
      <Form form={form} layout="vertical" preserve={false}>
        {state?.mode !== 'forge' && (
          <>
            <Form.Item name="close_items" valuePropName="checked" style={{ marginBottom: 4 }}>
              <Checkbox>Passer les éléments « en cours » à « terminé »</Checkbox>
            </Form.Item>
            <Form.Item name="save_note" valuePropName="checked" style={{ marginBottom: 4 }}>
              <Checkbox>Enregistrer le changelog dans les notes</Checkbox>
            </Form.Item>
            <Form.Item name="to_forge" valuePropName="checked">
              <Checkbox disabled={!project?.repo}>
                {project?.repo ? `Créer la release sur ${forgeLabel} (${project.repo})` : "Créer la release sur la forge (aucun dépôt configuré)"}
              </Checkbox>
            </Form.Item>
          </>
        )}
        {(state?.mode === 'forge' || toForge) && (
          <Flex vertical style={{ padding: 12, border: '1px dashed rgba(127,127,127,.35)', borderRadius: 8 }}>
            <Form.Item name="tag" label="Tag" rules={[{ required: true, message: 'Tag obligatoire' }]} extra={`Créé sur la branche ${project?.github?.default_branch || 'main'} s'il n'existe pas encore ; le changelog sert de description.`}>
              <Input />
            </Form.Item>
            <Flex gap={16}>
              {project?.forge !== 'gitlab' && <Form.Item name="draft" valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>Brouillon</Checkbox></Form.Item>}
              <Form.Item name="prerelease" valuePropName="checked" style={{ marginBottom: 0 }}><Checkbox>Pré-version</Checkbox></Form.Item>
            </Flex>
          </Flex>
        )}
      </Form>
    </Modal>
  )
}

// Versions of a project: progress, items, release and changelog.
export default function RoadmapPanel({ projectId, project }) {
  const { message } = App.useApp()
  const { data, loading, reload } = useApi(`/projects/${projectId}/roadmap`, { listen: true })
  const [editing, setEditing] = useState(null)
  const [changelog, setChangelog] = useState(null)
  const [item, setItem] = useState(null)
  const [releasing, setReleasing] = useState(null)

  const versions = data?.versions || []
  const latest = [...versions].map((v) => v.version).sort((a, b) => compareVersions(b, a))[0]
  const planned = versions.filter((v) => v.status === 'planned')

  const showChangelog = async (version) => {
    const res = await api.get(`/projects/${projectId}/changelog${version ? `?version=${encodeURIComponent(version)}` : ''}`)
    setChangelog({ title: version ? `Changelog ${version}` : 'Changelog complet', markdown: res.markdown, filename: version ? `CHANGELOG-${version}.md` : 'CHANGELOG.md' })
  }

  const remove = async (m) => {
    await api.del(`/milestones/${m.id}`)
    notifyChange()
  }

  const assign = async (it, version) => {
    try {
      await api.put(`/items/${it.id}`, { target_version: version })
      notifyChange()
    } catch (err) {
      message.error(err.message)
    }
  }

  return (
    <Flex vertical gap={16}>
      <Flex gap={8} wrap>
        <Typography.Text type="secondary" style={{ flex: 1, minWidth: 260 }}>
          Une version regroupe les bugs et tâches dont la « version cible » correspond. Publier une version génère son changelog.
        </Typography.Text>
        <Button icon={<FileTextOutlined />} onClick={() => showChangelog()}>Changelog complet</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ project_id: Number(projectId), version: bump(latest, 'minor') })}>Nouvelle version</Button>
      </Flex>

      {!loading && !versions.length && <Empty description="Aucune version planifiée" />}

      {versions.map((m) => (
        <Card
          key={m.version}
          size="small"
          title={
            <Flex gap={8} align="center" wrap>
              <Typography.Text strong style={{ fontSize: 15 }}>{m.version}</Typography.Text>
              {m.title && <Typography.Text type="secondary">{m.title}</Typography.Text>}
              <LabelTag map={MILESTONE_STATUS} value={m.status} />
              {m.status === 'released' && m.released_at && <Tag>{dayjs(m.released_at).format('DD/MM/YYYY')}</Tag>}
              {m.status === 'planned' && m.due_date && <Tag color={dayjs(m.due_date).isBefore(dayjs(), 'day') ? 'red' : 'default'}>prévue le {dayjs(m.due_date).format('DD/MM/YYYY')}</Tag>}
            </Flex>
          }
          extra={
            <Flex gap={6}>
              <Button size="small" icon={<FileTextOutlined />} onClick={() => showChangelog(m.version)}>Changelog</Button>
              {m.status === 'planned' && <Button size="small" type="primary" icon={<RocketOutlined />} onClick={() => setReleasing({ mode: 'release', milestone: m })}>Publier</Button>}
              {m.release_url && <Button size="small" icon={<ExportOutlined />} href={m.release_url} target="_blank">Release</Button>}
              {m.status === 'released' && m.id && !m.release_url && project?.repo && (
                <Button size="small" icon={<RocketOutlined />} onClick={() => setReleasing({ mode: 'forge', milestone: m })}>Sur {FORGES[project.forge]?.label}</Button>
              )}
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(m.id ? m : { project_id: Number(projectId), version: m.version })} />
              {m.id && <Popconfirm title="Supprimer cette version ? Les éléments gardent leur version cible." onConfirm={() => remove(m)}><Button size="small" icon={<DeleteOutlined />} /></Popconfirm>}
            </Flex>
          }
        >
          {m.total > 0
            ? <Progress percent={Math.round((m.done / m.total) * 100)} format={() => `${m.done} / ${m.total}`} status={m.status === 'released' ? 'success' : 'active'} />
            : <Typography.Text type="secondary">Aucun élément rattaché à cette version.</Typography.Text>}
          {m.description && <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>{m.description}</Typography.Paragraph>}
          {!!m.items.length && (
            <List
              size="small"
              dataSource={m.items}
              renderItem={(it) => (
                <List.Item className="clickable" onClick={() => setItem(it)}>
                  <Flex gap={6} align="center" style={{ width: '100%' }}>
                    <LabelTag map={ITEM_STATUS} value={it.status} />
                    <Typography.Text delete={it.status === 'wontfix'} style={{ flex: 1 }} ellipsis>{it.title}</Typography.Text>
                    <LabelTag map={ITEM_KIND} value={it.kind} />
                  </Flex>
                </List.Item>
              )}
            />
          )}
        </Card>
      ))}

      {!!data?.unplanned.length && (
        <Card size="small" title={`Sans version (${data.unplanned.length})`}>
          <List
            size="small"
            dataSource={data.unplanned}
            renderItem={(it) => (
              <List.Item
                actions={[
                  <Select key="v" size="small" placeholder="Planifier dans…" style={{ width: 150 }} disabled={!planned.length}
                    options={planned.map((v) => ({ value: v.version, label: v.version }))} onChange={(v) => assign(it, v)} />,
                ]}
              >
                <Flex gap={6} align="center" className="clickable" onClick={() => setItem(it)}>
                  <LabelTag map={ITEM_KIND} value={it.kind} />
                  <Typography.Text>{it.title}</Typography.Text>
                </Flex>
              </List.Item>
            )}
          />
        </Card>
      )}

      <MilestoneModal milestone={editing} latest={latest} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />
      <ChangelogModal state={changelog} onClose={() => setChangelog(null)} />
      <ReleaseModal
        state={releasing}
        project={project}
        onClose={() => setReleasing(null)}
        onDone={(res) => {
          const m = releasing.milestone
          setReleasing(null)
          reload()
          if (res) setChangelog({ title: `Changelog ${m.version}`, markdown: res.markdown, filename: `CHANGELOG-${m.version}.md` })
        }}
      />
      <ItemForm item={item} onClose={() => setItem(null)} onSaved={() => { setItem(null); reload() }} />
    </Flex>
  )
}
