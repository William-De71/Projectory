import { BranchesOutlined, GithubOutlined, GitlabOutlined } from '@ant-design/icons'

export default function ForgeIcon({ forge, ...props }) {
  if (forge === 'gitlab') return <GitlabOutlined {...props} />
  if (forge === 'gitea') return <BranchesOutlined {...props} />
  return <GithubOutlined {...props} />
}
