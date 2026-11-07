import { useState } from 'react'
import { App, Select } from 'antd'
import { api, notifyChange, useApi } from '../api/client.js'
import { t } from '../i18n/index.js'

const NEW_PROJECT = '__new_project__'

// `creatable`: a name that matches no project offers to create it on the spot
// (no repository: for work tracked here only).
export default function ProjectSelect({ creatable, onChange, ...props }) {
  const { message } = App.useApp()
  const { data, setData } = useApi('/projects')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const name = search.trim()
  const projects = (data || []).map((p) => ({ value: p.id, label: p.name }))
  const exists = projects.some((p) => p.label.toLowerCase() === name.toLowerCase())
  const options = creatable && name && !exists
    ? [...projects, { value: NEW_PROJECT, label: t('+ Créer le projet « {name} »', { name }) }]
    : projects

  const change = async (value, option) => {
    if (value !== NEW_PROJECT) return onChange?.(value, option)
    setCreating(true)
    try {
      const project = await api.post('/projects', { name })
      // Listed right away, so the field shows its name rather than its id.
      setData((list) => [...(list || []), project])
      notifyChange()
      message.success(t('Projet « {name} » créé', { name: project.name }))
      setSearch('')
      onChange?.(project.id, { value: project.id, label: project.name })
    } catch (err) {
      message.error(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Select
      showSearch={{
        optionFilterProp: 'label',
        // The "create" entry always shows while typing.
        filterOption: (input, opt) => opt.value === NEW_PROJECT || opt.label.toLowerCase().includes(input.toLowerCase()),
        ...(creatable && { searchValue: search, onSearch: setSearch }),
      }}
      placeholder={creatable ? t('Projet (tape un nom pour en créer un)') : t('Projet')}
      options={options}
      loading={creating}
      onChange={change}
      {...props}
    />
  )
}
