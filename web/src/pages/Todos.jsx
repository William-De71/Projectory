import { Link } from 'react-router-dom'
import { Alert, Card, Flex, Spin, Typography } from 'antd'
import { useApi } from '../api/client.js'
import { t } from '../i18n/index.js'
import TodoList, { TodoAdd } from '../components/TodoList.jsx'

// The general list, then the list of each project that has one.
export default function Todos() {
  const { data, error } = useApi('/todos', { listen: true })
  const todos = data || []
  const general = todos.filter((todo) => !todo.project_id)
  const projects = [...new Map(todos.filter((todo) => todo.project_id).map((todo) => [todo.project_id, todo.project_name]))]
    .sort((a, b) => a[1].localeCompare(b[1]))

  return (
    <Flex vertical gap={16}>
      <Typography.Title level={3} style={{ margin: 0 }}>{t('Todo list')}</Typography.Title>
      <TodoAdd chooseProject />
      {error && <Alert type="error" showIcon message={error.message} />}
      <Spin spinning={!data && !error}>
        <Flex vertical gap={16}>
          <Card size="small" title={t('Liste générale')}>
            <TodoList todos={general} />
          </Card>
          {projects.map(([id, name]) => (
            <Card key={id} size="small" title={<Link to={`/projects/${id}/todos`}>{name}</Link>}>
              <TodoList todos={todos.filter((todo) => todo.project_id === id)} projectId={id} />
            </Card>
          ))}
        </Flex>
      </Spin>
    </Flex>
  )
}
