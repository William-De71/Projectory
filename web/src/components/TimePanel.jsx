import { useState } from 'react'
import { Link } from 'react-router-dom'
import { App, Button, DatePicker, Flex, Form, Input, InputNumber, Popconfirm, Statistic, Table } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange, useApi } from '../api/client.js'
import { formatMinutes } from './labels.js'
import ProjectSelect from './ProjectSelect.jsx'
import { t } from '../i18n/index.js'

// Time log for one project, or for every project with a month picker.
export default function TimePanel({ projectId }) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [month, setMonth] = useState(dayjs())
  const query = new URLSearchParams()
  if (projectId) query.set('project_id', projectId)
  else {
    query.set('from', month.startOf('month').format('YYYY-MM-DD'))
    query.set('to', month.endOf('month').format('YYYY-MM-DD'))
  }
  const { data, loading, reload } = useApi(`/time?${query}`)
  const rows = data || []
  const total = rows.reduce((s, r) => s + r.minutes, 0)
  const byProject = Object.values(rows.reduce((acc, r) => {
    acc[r.project_id] ??= { project_id: r.project_id, project_name: r.project_name, minutes: 0 }
    acc[r.project_id].minutes += r.minutes
    return acc
  }, {})).sort((a, b) => b.minutes - a.minutes)

  const add = async (values) => {
    try {
      await api.post('/time', {
        project_id: projectId ? Number(projectId) : values.project_id,
        date: values.date.format('YYYY-MM-DD'),
        minutes: Math.round((values.hours || 0) * 60),
        note: values.note || '',
      })
      form.resetFields(['hours', 'note'])
      reload()
      notifyChange()
    } catch (err) {
      message.error(err.message)
    }
  }

  const remove = async (id) => {
    await api.del(`/time/${id}`)
    reload()
    notifyChange()
  }

  return (
    <Flex vertical gap={16}>
      <Form form={form} layout="inline" onFinish={add} initialValues={{ date: dayjs() }} style={{ rowGap: 8 }}>
        {!projectId && (
          <Form.Item name="project_id" rules={[{ required: true, message: t('Projet ?') }]}>
            <ProjectSelect style={{ width: 200 }} />
          </Form.Item>
        )}
        <Form.Item name="date" rules={[{ required: true }]}><DatePicker format="L" /></Form.Item>
        <Form.Item name="hours" rules={[{ required: true, message: t('Durée ?') }]}>
          <InputNumber min={0.25} step={0.25} placeholder={t('Heures')} suffix="h" style={{ width: 110 }} />
        </Form.Item>
        <Form.Item name="note" style={{ flex: 1, minWidth: 200 }}><Input placeholder={t('Ce qui a été fait')} /></Form.Item>
        <Button type="primary" htmlType="submit">{t('Ajouter')}</Button>
      </Form>
      <Flex gap={32} wrap align="center">
        {!projectId && <DatePicker picker="month" value={month} onChange={(m) => m && setMonth(m)} format="MMMM YYYY" allowClear={false} />}
        <Statistic title={projectId ? t('Total') : t('Total du mois')} value={formatMinutes(total)} />
        {!projectId && byProject.map((p) => (
          <Statistic key={p.project_id} title={<Link to={`/projects/${p.project_id}/time`}>{p.project_name}</Link>} value={formatMinutes(p.minutes)} valueStyle={{ fontSize: 18 }} />
        ))}
      </Flex>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 30, hideOnSinglePage: true }}
        columns={[
          { title: t('Date'), dataIndex: 'date', width: 110, render: (d) => dayjs(d).format('L') },
          ...(projectId ? [] : [{ title: t('Projet'), dataIndex: 'project_name', render: (n, r) => <Link to={`/projects/${r.project_id}`}>{n}</Link> }]),
          { title: t('Durée'), dataIndex: 'minutes', width: 100, render: formatMinutes },
          { title: t('Note'), dataIndex: 'note' },
          { width: 50, render: (_, r) => <Popconfirm title={t('Supprimer ?')} onConfirm={() => remove(r.id)}><Button size="small" type="text" icon={<DeleteOutlined />} /></Popconfirm> },
        ]}
      />
    </Flex>
  )
}
