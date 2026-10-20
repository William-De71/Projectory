import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { App, Avatar, Button, Empty, Flex, Input, List, Segmented, Select, Tag, Tooltip, Typography } from 'antd'
import { CommentOutlined, EyeOutlined, PullRequestOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange, useApi } from '../api/client.js'
import { refLabel } from './labels.js'
import ForgeIcon from './ForgeIcon.jsx'
import StaleTag from './StaleTag.jsx'
import PrStatus from './PrStatus.jsx'
import { t } from '../i18n/index.js'

// Why an item concerns the user, as computed by the sync (token owner).
const MINE = {
  review: { label: 'review demandée', color: 'magenta' },
  assignee: { label: 'assigné à toi', color: 'purple' },
  mention: { label: 'tu es mentionné', color: 'cyan' },
  author: { label: 'ouvert par toi', color: 'blue' },
}
const DEFAULT_FILTERS = { scope: 'all', labels: [], author: null, q: '' }

// Projects limited to the user's items open on "For me" until another view is chosen.
function readFilters(key, mineOnly) {
  const defaults = { ...DEFAULT_FILTERS, scope: mineOnly ? 'mine' : 'all' }
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(key) || '{}') } } catch { return defaults }
}

// Open issues & PRs / MRs mirrored by the last sync.
export default function GithubPanel({ projectId, project }) {
  const { message } = App.useApp()
  const [type, setType] = useState('issue')
  // Filters are remembered per project: on a busy repository they are the default view.
  const storageKey = `projectory:gh-filters:${projectId || 'all'}`
  const [filters, setFilters] = useState(() => readFilters(storageKey, project?.mine_only))
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ ...filters, q: '' })) } catch { /* storage unavailable */ }
  }, [storageKey, filters])
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }))
  const query = new URLSearchParams({ type })
  if (projectId) query.set('project_id', projectId)
  const { data, loading } = useApi(`/github-items?${query}`, { listen: true })
  const { data: stale } = useApi('/stale', { listen: true })
  const staleById = new Map((stale?.items || []).map((s) => [s.id, s]))
  const forge = project?.forge || 'github'

  const rows = data || []
  const scopes = {
    all: () => true,
    mine: (it) => (it.mine || []).length > 0,
    review: (it) => (it.mine || []).includes('review'),
    author: (it) => (it.mine || []).includes('author'),
  }
  const count = (scope) => rows.filter(scopes[scope]).length
  const labelOptions = useMemo(() => [...new Set(rows.flatMap((it) => (it.labels || []).map((l) => l.name)))].sort().map((v) => ({ value: v, label: v })), [rows])
  const authorOptions = useMemo(() => [...new Set(rows.map((it) => it.author).filter(Boolean))].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v })), [rows])
  const needle = filters.q.trim().toLowerCase()
  const scope = scopes[filters.scope] ? filters.scope : 'all'
  const visible = rows.filter((it) => scopes[scope](it)
    && (!filters.labels.length || filters.labels.every((l) => (it.labels || []).some((x) => x.name === l)))
    && (!filters.author || it.author === filters.author)
    && (!needle || `#${it.number} ${it.title}`.toLowerCase().includes(needle)))
  const filtered = visible.length !== rows.length

  if (projectId && !project?.repo) return <Empty description={t('Aucun dépôt configuré pour ce projet')} />

  const track = async (it) => {
    try {
      await api.post(`/github-items/${it.id}/track`)
      message.success(t('Ajouté aux bugs & tâches du projet'))
      notifyChange()
    } catch (err) {
      message.error(err.message)
    }
  }

  return (
    <Flex vertical gap={12}>
      <Flex wrap align="center" style={{ columnGap: 24, rowGap: 8 }}>
        <Segmented
          value={type}
          onChange={setType}
          options={[{ value: 'issue', label: t('Issues ouvertes') }, { value: 'pr', label: forge === 'gitlab' ? t('Merge requests ouvertes') : t('Pull requests ouvertes') }]}
        />
        <Segmented
          value={scope}
          onChange={(v) => setFilter('scope', v)}
          options={[
            { value: 'all', label: t('Tout ({n})', { n: rows.length }) },
            { value: 'mine', label: t('Me concernant ({n})', { n: count('mine') }) },
            ...(type === 'pr' ? [{ value: 'review', label: t('Review demandée ({n})', { n: count('review') }) }] : []),
            { value: 'author', label: t('Ouvert par moi ({n})', { n: count('author') }) },
          ]}
        />
      </Flex>
      <Flex gap={8} wrap align="center">
        <Input allowClear prefix={<SearchOutlined />} placeholder={t('Titre ou numéro…')} value={filters.q} onChange={(e) => setFilter('q', e.target.value)} style={{ width: 220 }} />
        <Select mode="multiple" allowClear placeholder={t('Labels')} value={filters.labels} onChange={(v) => setFilter('labels', v)} options={labelOptions} style={{ minWidth: 200, maxWidth: 360 }} maxTagCount="responsive" />
        <Select allowClear showSearch placeholder={t('Auteur')} value={filters.author} onChange={(v) => setFilter('author', v ?? null)} options={authorOptions} style={{ width: 180 }} />
        {filtered && (
          <Typography.Text type="secondary">
            {t('{n} sur {total}', { n: visible.length, total: rows.length })}
            {' · '}<Typography.Link onClick={() => setFilters(DEFAULT_FILTERS)}>{t('Tout afficher')}</Typography.Link>
          </Typography.Text>
        )}
      </Flex>
      <List
        loading={loading}
        dataSource={visible}
        locale={{
          emptyText: <Empty description={
            !rows.length ? t('Rien d\'ouvert (ou pas encore synchronisé)')
              : scope !== 'all' && !count(scope) ? t('Rien ne te concerne ici. Ces filtres utilisent le compte du token de la forge (Paramètres → Forges et tokens).')
                : t('Aucun résultat avec ces filtres')
          } />,
        }}
        renderItem={(it) => (
          <List.Item
            actions={[
              it.comments ? <span key="c" style={{ opacity: 0.6 }}><CommentOutlined /> {it.comments}</span> : null,
              it.item_id
                ? <Tag key="t" color="green" style={{ marginInlineEnd: 0 }}>{t('Suivi')}</Tag>
                : <Tooltip key="t" title={t('Suivre dans Bugs & tâches')}><Button size="small" icon={<EyeOutlined />} onClick={() => track(it)} /></Tooltip>,
            ].filter(Boolean)}
          >
            <List.Item.Meta
              avatar={<Avatar size="small" src={forge === 'github' && it.author ? `https://github.com/${it.author}.png?size=40` : undefined} icon={type === 'pr' ? <PullRequestOutlined /> : <ForgeIcon forge={forge} />} />}
              title={
                <Flex gap={6} wrap align="center">
                  <a href={it.url} target="_blank" rel="noreferrer">{refLabel(forge, it.type, it.number)} {it.title}</a>
                  {(it.mine || []).filter((r) => MINE[r]).map((r) => <Tag key={r} color={MINE[r].color} bordered={false}>{t(MINE[r].label)}</Tag>)}
                  {it.type === 'pr' && <PrStatus state={it.pr_state} />}
                  {it.draft && <Tag>{t('Brouillon')}</Tag>}
                  {staleById.has(it.id) && <StaleTag item={staleById.get(it.id)} />}
                  {(it.labels || []).map((l) => <Tag key={l.name} color={l.color}>{l.name}</Tag>)}
                </Flex>
              }
              description={
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {!projectId && <><Link to={`/projects/${it.project_id}/github`}>{it.project_name}</Link> · </>}
                  {it.author}{' ' + t('· ouvert') + ' '}{dayjs(it.created_at).fromNow()}{' ' + t('· maj') + ' '}{dayjs(it.updated_at).fromNow()}
                </Typography.Text>
              }
            />
          </List.Item>
        )}
      />
    </Flex>
  )
}
