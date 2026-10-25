import { useState } from 'react'
import { Link } from 'react-router-dom'
import { App, Button, Empty, Flex, Popconfirm, Table, Tag, Typography } from 'antd'
import { MergeCellsOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, notifyChange, useApi } from '../api/client.js'
import { refLabel } from '../components/labels.js'
import PrStatus from '../components/PrStatus.jsx'
import { t } from '../i18n/index.js'

export const isGreen = (pr) => pr.pr_state?.ci === 'success' && !pr.pr_state?.conflict

// Dependabot / Renovate PRs of every project: merge them one by one, or all the
// green ones at once (the CI is checked again on the forge right before each merge).
export default function Dependencies() {
  const { message, modal } = App.useApp()
  const { data, loading, reload } = useApi('/dependency-prs', { listen: true })
  const [merging, setMerging] = useState({})
  const [bulk, setBulk] = useState(null)
  const rows = data || []
  const green = rows.filter(isGreen)

  const merge = async (pr, onlyGreen) => {
    setMerging((m) => ({ ...m, [pr.id]: true }))
    try {
      await api.post(`/github-items/${pr.id}/merge`, { only_green: onlyGreen })
      return true
    } catch (err) {
      return err.message
    } finally {
      setMerging((m) => ({ ...m, [pr.id]: false }))
    }
  }

  const mergeOne = async (pr) => {
    const res = await merge(pr, isGreen(pr))
    if (res === true) message.success(t('{ref} fusionnée', { ref: refLabel(pr.forge, 'pr', pr.number) }))
    else message.error(res)
    notifyChange()
    reload()
  }

  const mergeGreen = async () => {
    const failures = []
    for (const [i, pr] of green.entries()) {
      setBulk({ done: i, total: green.length })
      const res = await merge(pr, true)
      if (res !== true) failures.push(`${pr.project_name} ${refLabel(pr.forge, 'pr', pr.number)} : ${res}`)
    }
    setBulk(null)
    notifyChange()
    reload()
    const merged = green.length - failures.length
    if (!failures.length) return message.success(t('{n} PR fusionnée(s)', { n: merged }))
    modal.warning({
      title: t('{n} PR fusionnée(s), {failed} en échec', { n: merged, failed: failures.length }),
      content: <Flex vertical gap={4}>{failures.map((f) => <Typography.Text key={f} style={{ fontSize: 12 }}>{f}</Typography.Text>)}</Flex>,
      width: 640,
    })
  }

  const columns = [
    {
      title: t('Projet'),
      dataIndex: 'project_name',
      width: 220,
      render: (name, pr) => <Link to={`/projects/${pr.project_id}/github`}>{name}</Link>,
    },
    {
      title: t('Mise à jour'),
      dataIndex: 'title',
      render: (title, pr) => (
        <Flex vertical gap={2}>
          <a href={pr.url} target="_blank" rel="noreferrer">{refLabel(pr.forge, 'pr', pr.number)} {title}</a>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{pr.author} · {dayjs(pr.created_at).fromNow()}</Typography.Text>
        </Flex>
      ),
    },
    {
      title: t('État'),
      width: 200,
      render: (_, pr) => (pr.pr_state ? <Flex gap={4} wrap><PrStatus state={pr.pr_state} /></Flex> : <Tag>{t('CI inconnue')}</Tag>),
    },
    {
      title: '',
      width: 130,
      align: 'right',
      render: (_, pr) => (isGreen(pr) ? (
        <Button size="small" type="primary" loading={merging[pr.id]} disabled={!!bulk} onClick={() => mergeOne(pr)}>{t('Fusionner')}</Button>
      ) : (
        <Popconfirm title={t('La CI n’est pas au vert (ou inconnue). Fusionner quand même ?')} onConfirm={() => mergeOne(pr)} okButtonProps={{ danger: true }}>
          <Button size="small" loading={merging[pr.id]} disabled={!!bulk}>{t('Fusionner')}</Button>
        </Popconfirm>
      )),
    },
  ]

  return (
    <Flex vertical gap={16}>
      <Flex align="center" gap={12} wrap>
        <Typography.Text type="secondary">{t('PR de Dependabot et Renovate sur tous tes projets')}</Typography.Text>
        <Popconfirm
          title={t('Fusionner {n} PR au vert ?', { n: green.length })}
          description={t('La CI et les conflits sont vérifiés à nouveau sur la forge juste avant chaque fusion.')}
          onConfirm={mergeGreen}
          disabled={!green.length || !!bulk}
        >
          <Button type="primary" icon={<MergeCellsOutlined />} style={{ marginLeft: 'auto' }} disabled={!green.length} loading={!!bulk}>
            {bulk ? t('Fusion {done} / {total}…', bulk) : t('Fusionner les PR au vert ({n})', { n: green.length })}
          </Button>
        </Popconfirm>
      </Flex>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t(
        'Le token de la forge doit pouvoir fusionner (GitHub : Contents et Pull requests en écriture). L’état de la CI se met à jour à chaque synchro.'
      )}</Typography.Text>
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        scroll={{ x: 760 }}
        locale={{ emptyText: <Empty description={t('Aucune mise à jour de dépendance en attente')} /> }}
      />
    </Flex>
  )
}
