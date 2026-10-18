import { Select } from 'antd'
import { useApi } from '../api/client.js'
import { t } from '../i18n/index.js'

export default function ProjectSelect(props) {
  const { data } = useApi('/projects')
  return (
    <Select
      showSearch={{ optionFilterProp: 'label' }}
      placeholder={t('Projet')}
      options={(data || []).map((p) => ({ value: p.id, label: p.name }))}
      {...props}
    />
  )
}
