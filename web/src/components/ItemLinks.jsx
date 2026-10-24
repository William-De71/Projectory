import { useState } from 'react'
import { App, Button, Flex, Select, Tag, Typography } from 'antd'
import { CloseOutlined, PlusOutlined } from '@ant-design/icons'
import { api, notifyChange, useApi } from '../api/client.js'
import { ITEM_STATUS, LINK_TYPES } from './labels.js'
import { LabelTag } from './Tags.jsx'
import { t } from '../i18n/index.js'

// Relations of a saved item with other items of the same project: blocked by,
// duplicate of, related to. Changes are saved right away.
export default function ItemLinks({ item }) {
  const { message } = App.useApp()
  const { data: links, reload } = useApi(`/items/${item.id}/links`)
  const { data: candidates } = useApi(`/items?project_id=${item.project_id}`)
  const [type, setType] = useState('blocked_by')
  const [target, setTarget] = useState(null)

  const linked = new Set((links || []).map((l) => l.item_id))
  const choices = (candidates || [])
    .filter((it) => it.id !== item.id && !linked.has(it.id))
    .map((it) => ({ value: it.id, label: `#${it.id} ${it.title}` }))

  const add = async () => {
    if (!target) return
    try {
      await api.post(`/items/${item.id}/links`, { target_id: target, type })
      setTarget(null)
      reload()
      notifyChange()
    } catch (err) {
      message.error(err.message)
    }
  }
  const remove = async (link) => {
    await api.del(`/item-links/${link.id}`)
    reload()
    notifyChange()
  }

  return (
    <Flex vertical gap={8}>
      {(links || []).map((l) => (
        <Flex key={l.id} gap={8} align="center" wrap>
          <Tag color={LINK_TYPES[l.type]?.color} style={{ marginInlineEnd: 0 }}>{t(LINK_TYPES[l.type]?.[l.direction] || l.type)}</Tag>
          <Typography.Text delete={l.status === 'wontfix'} style={{ flex: 1, minWidth: 160 }}>#{l.item_id} {l.title}</Typography.Text>
          <LabelTag map={ITEM_STATUS} value={l.status} />
          <Button size="small" type="text" icon={<CloseOutlined />} aria-label={t('Retirer le lien')} onClick={() => remove(l)} />
        </Flex>
      ))}
      <Flex gap={8} wrap>
        <Select
          value={type}
          onChange={setType}
          style={{ width: 160 }}
          options={Object.entries(LINK_TYPES).map(([value, l]) => ({ value, label: t(l.out) }))}
        />
        <Select
          showSearch
          allowClear
          value={target}
          onChange={setTarget}
          options={choices}
          optionFilterProp="label"
          placeholder={t('Choisir un élément du projet')}
          style={{ flex: 1, minWidth: 200 }}
          notFoundContent={t('Aucun autre élément')}
        />
        <Button icon={<PlusOutlined />} disabled={!target} onClick={add}>{t('Lier')}</Button>
      </Flex>
    </Flex>
  )
}
