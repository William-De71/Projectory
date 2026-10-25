import { Collapse, Empty, Flex, List, Typography } from 'antd'
import { useApi } from '../api/client.js'
import ReleaseRow from '../components/ReleaseRow.jsx'
import { t } from '../i18n/index.js'

const rowList = (rows, onChange) => (
  <List bordered dataSource={rows} renderItem={(row) => <List.Item><ReleaseRow row={row} onChange={onChange} /></List.Item>} />
)

// Releases of every repository: the ones to repair, in progress, to launch,
// then the quiet ones folded away.
export default function Releases() {
  const { data, loading, setData } = useApi('/releases', { listen: true })
  const rows = data || []
  const replace = (next) => setData((list) => list.map((r) => (r.id === next.id ? next : r)))
  const by = (...statuses) => rows.filter((r) => statuses.includes(r.release.status))
  const urgent = by('stuck', 'failed')
  const running = by('running')
  const pending = by('pending')
  const quiet = by('quiet')
  const done = by('up_to_date', 'unknown')

  return (
    <Flex vertical gap={16}>
      <Typography.Text type="secondary">{t(
        'Commits pas encore publiés et dernier run du workflow de release de chaque dépôt, d’après la dernière synchro. Seuls feat, fix, perf et les changements cassants appellent une version.'
      )}</Typography.Text>
      {!loading && !urgent.length && !running.length && !pending.length && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Rien à publier ni à réparer 👌')} />
      )}
      {!!urgent.length && <Section title={t('À réparer')}>{rowList(urgent, replace)}</Section>}
      {!!running.length && <Section title={t('En cours')}>{rowList(running, replace)}</Section>}
      {!!pending.length && <Section title={t('À publier')}>{rowList(pending, replace)}</Section>}
      {(!!quiet.length || !!done.length) && (
        <Collapse
          ghost
          items={[
            quiet.length && { key: 'quiet', label: t('Commits qui n’appellent pas de version ({n})', { n: quiet.length }), children: rowList(quiet, replace) },
            done.length && { key: 'done', label: t('À jour ({n})', { n: done.length }), children: rowList(done, replace) },
          ].filter(Boolean)}
        />
      )}
    </Flex>
  )
}

function Section({ title, children }) {
  return (
    <Flex vertical gap={8}>
      <Typography.Text strong>{title}</Typography.Text>
      {children}
    </Flex>
  )
}
