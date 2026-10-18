import { Tag } from 'antd'

// Renders a value through one of the label maps from labels.js.
export function LabelTag({ map, value }) {
  const entry = map[value]
  if (!entry) return value ? <Tag>{value}</Tag> : null
  return <Tag color={entry.color}>{entry.label}</Tag>
}

export function CategoryTag({ name, color }) {
  if (!name) return null
  return <Tag color={color}>{name}</Tag>
}
