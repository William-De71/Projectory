import { Tag, Tooltip } from 'antd'
import { t } from '../i18n/index.js'

// Badges for the state of a PR that concerns the user (filled by the sync).
export default function PrStatus({ state }) {
  if (!state) return null
  const tags = []
  if (state.review === 'approved') tags.push(['review', 'success', state.approvals > 1 ? t('approuvée ×{n}', { n: state.approvals }) : t('approuvée'), null])
  if (state.review === 'changes_requested') tags.push(['review', 'error', t('changements demandés'), null])
  if (state.review === 'pending') tags.push(['review', 'default', t('review en attente'), null])
  if (state.conflict) tags.push(['conflict', 'warning', t('conflit'), t('À rebaser sur la branche principale')])
  if (state.ci === 'failure') tags.push(['ci', 'error', t('CI ❌'), null])
  if (state.ci === 'pending') tags.push(['ci', 'processing', t('CI en cours'), null])
  if (state.ci === 'success') tags.push(['ci', 'success', t('CI ✓'), null])
  return tags.map(([key, color, label, tip]) => {
    const tag = <Tag key={key} color={color} style={{ marginInlineEnd: 0 }}>{label}</Tag>
    return tip ? <Tooltip key={key} title={tip}>{tag}</Tooltip> : tag
  })
}
