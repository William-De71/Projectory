import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, App, Button, Flex, Form, Input, List, Modal, Popconfirm, Segmented, Spin, Switch, Tag, Tooltip, Typography } from 'antd'
import { ExportOutlined, RedoOutlined, ReloadOutlined, RocketOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange } from '../api/client.js'
import { t } from '../i18n/index.js'

export const RELEASE_STATUS = {
  stuck: { label: 'Bloquée', color: 'volcano' },
  failed: { label: 'En échec', color: 'red' },
  running: { label: 'En cours', color: 'processing' },
  pending: { label: 'À publier', color: 'orange' },
  quiet: { label: 'Rien à publier', color: 'default' },
  up_to_date: { label: 'À jour', color: 'green' },
  unknown: { label: 'Pas de release', color: 'default' },
}
// What asks for the user: a release to repair or to launch.
export const needsRelease = (row) => ['stuck', 'failed', 'pending'].includes(row.release?.status)

const BUMP_COLORS = { major: 'red', minor: 'blue', patch: 'default' }
const TYPE_ORDER = ['breaking', 'feat', 'fix', 'perf']

const runText = (run) => {
  const when = dayjs(run.created_at).fromNow()
  if (run.status !== 'completed') return t('lancée {when}', { when })
  if (run.conclusion === 'success') return t('réussie {when}', { when })
  if (run.conclusion === 'cancelled') return t('annulée {when}', { when })
  return t('en échec {when}', { when })
}

// "Launch the release" dialog: the workflow's own inputs, the suggested bump preselected.
function LaunchModal({ row, onClose, onLaunched }) {
  const { message } = App.useApp()
  const [spec, setSpec] = useState(null)
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  const [form] = Form.useForm()
  const { release } = row

  useEffect(() => {
    api.get(`/projects/${row.id}/release/workflow`).then(setSpec).catch((err) => setError(err.message))
  }, [row.id])

  const initial = Object.fromEntries((spec?.inputs || []).map((input) => [
    input.name,
    input.options?.includes(release.bump) ? release.bump : input.type === 'boolean' ? input.default === true || input.default === 'true' : input.default ?? undefined,
  ]))

  const launch = async () => {
    setSending(true)
    try {
      await api.post(`/projects/${row.id}/release/dispatch`, { inputs: form.getFieldsValue() })
      message.success(t('Release lancée sur {name}', { name: row.name }))
      onLaunched()
      onClose()
    } catch (err) {
      message.error(err.message)
    } finally {
      setSending(false)
    }
  }

  const manual = spec && spec.inputs !== null
  return (
    <Modal
      open
      title={t('Publier {name}', { name: row.name })}
      onCancel={onClose}
      okText={t('Lancer la release')}
      okButtonProps={{ icon: <RocketOutlined />, loading: sending, disabled: !manual }}
      onOk={launch}
      destroyOnHidden
    >
      {error && <Alert type="error" showIcon message={error} />}
      {!spec && !error && <Spin />}
      {spec && (
        <Flex vertical gap={12}>
          <Typography.Text type="secondary">
            {t('Workflow « {name} » sur la branche par défaut.', { name: spec.workflow.name })}
            {release.next_version && <> {t('Version estimée d’après les commits : {v}.', { v: release.next_version })}</>}
          </Typography.Text>
          {!manual ? (
            <Alert type="info" showIcon message={t('Ce workflow publie tout seul à chaque push sur la branche principale : il n’y a rien à lancer ici.')} />
          ) : (
            <Form form={form} layout="vertical" initialValues={initial} key={JSON.stringify(initial)}>
              {spec.inputs.map((input) => (
                <Form.Item key={input.name} name={input.name} label={input.description || input.name} valuePropName={input.type === 'boolean' ? 'checked' : 'value'} style={{ marginBottom: 12 }}>
                  {input.options ? <Segmented options={input.options} />
                    : input.type === 'boolean' ? <Switch />
                      : <Input placeholder={input.default ? String(input.default) : input.required ? t('obligatoire') : t('facultatif')} />}
                </Form.Item>
              ))}
            </Form>
          )}
        </Flex>
      )}
    </Modal>
  )
}

// One repository: where it stands, the commits waiting, the last release run.
// While a run is in progress the state refreshes itself.
export default function ReleaseRow({ row, showProject = true, onChange }) {
  const { message } = App.useApp()
  const [launching, setLaunching] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showCommits, setShowCommits] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const watch = useRef(0)
  const { release } = row
  const status = RELEASE_STATUS[release.status]
  const broken = (release.status === 'failed' || release.status === 'stuck') && release.run

  const refresh = async (quiet) => {
    setRefreshing(true)
    try {
      const next = await api.post(`/projects/${row.id}/release/refresh`)
      onChange?.(next)
      return next
    } catch (err) {
      if (!quiet) message.error(err.message)
      return null
    } finally {
      setRefreshing(false)
    }
  }

  // Runs in progress: check again every 15 s.
  useEffect(() => {
    if (release.status !== 'running' && release.status !== 'stuck') return
    const timer = setInterval(() => refresh(true), 15_000)
    return () => clearInterval(timer)
  }, [release.status, row.id])

  // Just launched: the run takes a few seconds to show up.
  const afterLaunch = () => {
    const before = release.run?.id
    watch.current = 0
    const tick = async () => {
      const next = await refresh(true)
      if (next?.release.run?.id !== before || ++watch.current >= 6) return notifyChange()
      setTimeout(tick, 5000)
    }
    setTimeout(tick, 4000)
  }

  const retry = async () => {
    setRetrying(true)
    try {
      await api.post(`/projects/${row.id}/release/retry`)
      message.success(t('Étapes en échec relancées sur {name}', { name: row.name }))
      setTimeout(() => refresh(true).then(notifyChange), 4000)
    } catch (err) {
      message.error(err.message)
    } finally {
      setRetrying(false)
    }
  }

  const types = TYPE_ORDER.filter((k) => release.types?.[k]).map((k) => `${release.types[k]} ${k}`)
  const others = (release.ahead_by || 0) - TYPE_ORDER.reduce((n, k) => n + (release.types?.[k] || 0), 0)
  if (others > 0) types.push(t('{n} autre(s)', { n: others }))

  return (
    <Flex vertical gap={6} style={{ width: '100%', minWidth: 0 }}>
      <Flex gap={8} align="center" wrap>
        {showProject && <Link to={`/projects/${row.id}/roadmap`}><Typography.Text strong>{row.name}</Typography.Text></Link>}
        <Tag color={status.color} style={{ marginInlineEnd: 0 }}>{t(status.label)}</Tag>
        {release.tag && (
          <Tag style={{ marginInlineEnd: 0 }}>
            {release.next_version ? `${release.tag} → ${release.next_version}` : release.tag}
          </Tag>
        )}
        {release.bump && <Tag color={BUMP_COLORS[release.bump]} style={{ marginInlineEnd: 0 }}>{release.bump}</Tag>}
        <Flex gap={4} style={{ marginLeft: 'auto' }}>
          {release.run && <Tooltip title={t('Voir le run')}><Button size="small" type="text" icon={<ExportOutlined />} href={release.run.url} target="_blank" aria-label={t('Voir le run')} /></Tooltip>}
          <Tooltip title={t('Actualiser')}><Button size="small" type="text" icon={<ReloadOutlined />} loading={refreshing} onClick={() => refresh(false)} aria-label={t('Actualiser')} /></Tooltip>
          {broken ? (
            <Popconfirm
              title={release.status === 'stuck' ? t('Annuler le run bloqué puis relancer ses étapes en échec ?') : t('Relancer les étapes en échec du run ?')}
              description={t('Ce qui a déjà réussi (version, tag) n’est pas refait.')}
              onConfirm={retry}
            >
              <Button size="small" type="primary" danger icon={<RedoOutlined />} loading={retrying}>{t('Relancer')}</Button>
            </Popconfirm>
          ) : release.workflow && (
            <Button size="small" type={release.status === 'pending' ? 'primary' : 'default'} icon={<RocketOutlined />} onClick={() => setLaunching(true)} disabled={release.status === 'running'}>
              {t('Publier')}
            </Button>
          )}
        </Flex>
      </Flex>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {release.ahead_by ? (
          <Typography.Link style={{ fontSize: 12 }} onClick={() => setShowCommits((v) => !v)}>
            {t('{n} commit(s) depuis {tag}', { n: release.ahead_by, tag: release.tag })}
          </Typography.Link>
        ) : release.tag ? t('Aucun commit depuis {tag}', { tag: release.tag }) : t('Aucune version publiée')}
        {!!types.length && ` (${types.join(' · ')})`}
        {release.run && <> · {release.workflow.name} {runText(release.run)}</>}
        {!release.workflow && release.tag && <> · {t('aucun workflow de release')}</>}
      </Typography.Text>
      {release.status === 'stuck' && (
        <Typography.Text type="warning" style={{ fontSize: 12 }}>{t('Le run tourne depuis plus de 30 min : « Relancer » l’annule puis relance ses étapes en échec.')}</Typography.Text>
      )}
      {showCommits && (
        <List
          size="small"
          dataSource={release.commits}
          style={{ maxHeight: 260, overflowY: 'auto' }}
          renderItem={(c) => (
            <List.Item style={{ padding: '2px 0' }}>
              <Typography.Text style={{ fontSize: 12 }} ellipsis>
                <a href={c.url} target="_blank" rel="noreferrer"><code>{c.sha}</code></a> {c.title}
              </Typography.Text>
            </List.Item>
          )}
        />
      )}
      {launching && <LaunchModal row={row} onClose={() => setLaunching(false)} onLaunched={afterLaunch} />}
    </Flex>
  )
}
