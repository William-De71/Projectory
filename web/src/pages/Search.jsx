import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, Empty, Flex, Input, List, Spin, Tag, Typography } from 'antd'
import { api } from '../api/client.js'
import { ITEM_KIND, ITEM_STATUS } from '../components/labels.js'
import { LabelTag } from '../components/Tags.jsx'
import { t } from '../i18n/index.js'

const GROUPS = [
  { type: 'item', label: 'Bugs & tâches' },
  { type: 'doc', label: 'Notes & specs' },
  { type: 'project', label: 'Projets' },
  { type: 'github', label: 'Issues et PR' },
]

// Where a result opens inside the app (GitHub results open on the forge).
export function resultPath(r) {
  if (r.type === 'project') return `/projects/${r.project_id}`
  if (r.type === 'item') return `/projects/${r.project_id}/items?item=${r.id}`
  if (r.type === 'doc') return r.project_id ? `/projects/${r.project_id}/${r.kind === 'spec' ? 'specs' : 'notes'}?doc=${r.id}` : `/notes?doc=${r.id}`
  return null
}

// The searched words in bold inside an excerpt.
function Highlight({ text, q }) {
  if (!text) return null
  const needle = q.trim().toLowerCase()
  const parts = []
  let rest = text
  while (needle && rest) {
    const at = rest.toLowerCase().indexOf(needle)
    if (at < 0) break
    parts.push(rest.slice(0, at), <mark key={parts.length}>{rest.slice(at, at + needle.length)}</mark>)
    rest = rest.slice(at + needle.length)
  }
  parts.push(rest)
  return <Typography.Text type="secondary" style={{ fontSize: 13 }}>{parts}</Typography.Text>
}

// Full search page (/search?q=…): bugs, notes and specs (attachment names
// included), projects, issues and PRs, with an excerpt around the match.
export default function Search() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const [input, setInput] = useState(q)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => setInput(q), [q])
  useEffect(() => {
    if (q.trim().length < 2) return setResults(null)
    setLoading(true)
    api.get(`/search?q=${encodeURIComponent(q.trim())}&limit=50`).then(setResults).catch(() => setResults([])).finally(() => setLoading(false))
  }, [q])

  return (
    <Flex vertical gap={16}>
      <Typography.Title level={3} style={{ margin: 0 }}>{t('Recherche')}</Typography.Title>
      <Input.Search
        autoFocus
        allowClear
        size="large"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onSearch={(value) => setParams(value.trim() ? { q: value.trim() } : {})}
        placeholder={t('Titre, description, nom de pièce jointe…')}
        style={{ maxWidth: 640 }}
      />
      <Spin spinning={loading}>
        {results && !results.length && <Empty description={t('Aucun résultat pour « {q} »', { q })} />}
        {results?.length > 0 && (
          <Flex vertical gap={16}>
            {GROUPS.map((group) => {
              const rows = results.filter((r) => r.type === group.type)
              if (!rows.length) return null
              return (
                <Card key={group.type} size="small" title={<>{t(group.label)} <Tag style={{ marginInlineStart: 4 }}>{rows.length}</Tag></>}>
                  <List
                    size="small"
                    dataSource={rows}
                    rowKey={(r) => `${r.type}-${r.id}`}
                    renderItem={(r) => {
                      const path = resultPath(r)
                      const title = path ? <Link to={path}>{r.title}</Link> : <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
                      return (
                        <List.Item>
                          <Flex vertical gap={2} style={{ minWidth: 0 }}>
                            <Flex gap={6} wrap align="center">
                              {title}
                              {r.type === 'item' && <LabelTag map={ITEM_KIND} value={r.kind} />}
                              {r.type === 'item' && <LabelTag map={ITEM_STATUS} value={r.status} />}
                              {r.type === 'doc' && <Tag>{r.kind === 'spec' ? t('Spécification') : t('Note')}</Tag>}
                              {r.project_name && r.type !== 'project' && <Tag>{r.project_name}</Tag>}
                            </Flex>
                            <Highlight text={r.excerpt} q={q} />
                          </Flex>
                        </List.Item>
                      )
                    }}
                  />
                </Card>
              )
            })}
          </Flex>
        )}
      </Spin>
    </Flex>
  )
}
