import { test as base, expect } from '@playwright/test'

// Every test fails on a browser error or an uncaught exception, so a page
// that crashes while still showing something is caught too.
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
    await use(page)
    expect(errors, 'erreurs dans la console').toEqual([])
  },
})

export { expect }

// A small project with a version, a few items and a note, created once per run.
export async function seed(request) {
  const post = async (url, data) => {
    const res = await request.post(`/api${url}`, { data })
    expect(res.ok(), `POST ${url}`).toBeTruthy()
    return res.json()
  }
  const projects = await (await request.get('/api/projects')).json()
  const existing = projects.find((p) => p.name === 'Démo')
  if (existing) return existing
  const project = await post('/projects', { name: 'Démo', description: 'Projet de test' })
  await post('/milestones', { project_id: project.id, version: '1.0.0', title: 'Première version' })
  await post('/items', { project_id: project.id, kind: 'bug', title: 'Bug planifié', target_version: '1.0.0', priority: 'high' })
  await post('/items', { project_id: project.id, kind: 'task', title: 'Tâche sans version' })
  await post('/docs', { project_id: project.id, type: 'note', title: 'Note de démo', content: 'Bonjour' })
  return project
}
