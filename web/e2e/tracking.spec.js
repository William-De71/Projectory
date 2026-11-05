import { test, expect, seed } from './fixtures.js'

let project
test.beforeAll(async ({ request }) => { project = await seed(request) })

test('estimation, temps passé et historique dans le panneau d’une tâche', async ({ page, request }) => {
  const res = await request.post('/api/items', { data: { project_id: project.id, kind: 'task', title: 'Tâche chronométrée' } })
  const item = await res.json()
  await page.goto(`/items?item=${item.id}`)
  const panel = page.locator('.ant-drawer-open')
  await expect(panel.getByLabel('Titre')).toHaveValue('Tâche chronométrée')

  await panel.getByLabel('Estimation').fill('2')
  await panel.getByLabel('Heures').fill('1.5')
  await panel.getByPlaceholder('Ce qui a été fait').fill('Première passe')
  await panel.getByRole('button', { name: 'plus Ajouter' }).click()
  await expect(panel.getByText('Première passe')).toBeVisible()
  await expect(panel.getByText('1 h 30 / 2 h')).toBeVisible()

  await panel.getByRole('combobox', { name: 'Statut' }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('En cours', { exact: true }).click()
  await page.keyboard.press('Control+Enter')
  await expect(panel).toHaveCount(0)

  // Back in the list: the time shows on the row, the change in the history.
  const row = page.locator('tr', { hasText: 'Tâche chronométrée' })
  await expect(row.getByText('1 h 30 / 2 h')).toBeVisible()
  await row.getByRole('link', { name: 'Tâche chronométrée' }).or(row.getByText('Tâche chronométrée')).first().click()
  await expect(panel.getByText('À faire → En cours')).toBeVisible()
})

test('créer une tâche depuis le texte sélectionné d’une note', async ({ page, request }) => {
  // The item panel was opened before: it must still show above the note dialog.
  await request.post('/api/items', { data: { project_id: project.id, kind: 'task', title: 'Déjà ouverte' } })
  await page.goto('/items')
  await page.getByText('Déjà ouverte').click()
  await expect(page.locator('.ant-drawer-open').getByLabel('Titre')).toHaveValue('Déjà ouverte')
  await page.keyboard.press('Escape')
  await expect(page.locator('.ant-drawer-open')).toHaveCount(0)

  await page.goto(`/projects/${project.id}/notes`)
  await page.getByText('Note de démo').click()
  const dialog = page.locator('.ant-modal-wrap').filter({ has: page.getByRole('tab', { name: 'Aperçu' }) })
  const text = dialog.locator('textarea')
  await text.fill('Intro\n- [ ] Vérifier la sauvegarde\nFin')
  const button = dialog.getByRole('button', { name: 'Créer une tâche depuis la sélection' })
  await expect(button).toBeDisabled()
  // Second line, selected with the keyboard.
  await text.focus()
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await button.click()

  const panel = page.locator('.ant-drawer-open')
  await expect(panel.getByLabel('Titre')).toHaveValue('Vérifier la sauvegarde')
  // Clickable, and typing goes to the panel rather than back to the dialog.
  await panel.getByLabel('Titre').fill('Vérifier la sauvegarde complète')
  await expect(panel.getByLabel('Titre')).toHaveValue('Vérifier la sauvegarde complète')
  await panel.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(panel).toHaveCount(0)

  // The note now links to the task, and is saved: closing asks nothing.
  await expect(text).toHaveValue(/- \[ \] Vérifier la sauvegarde \[→ #\d+\]\(\/items\?item=\d+\)\nFin/)
  await dialog.locator('.ant-modal-footer').getByRole('button', { name: 'Fermer' }).click()
  await expect(page.getByText('Fermer sans enregistrer ?')).toHaveCount(0)
  const docs = await (await request.get(`/api/docs?project_id=${project.id}`)).json()
  expect(docs.find((d) => d.title === 'Note de démo').content).toContain('[→ #')
  const items = await (await request.get(`/api/items?project_id=${project.id}`)).json()
  expect(items.find((i) => i.title === 'Vérifier la sauvegarde complète').body).toContain('?doc=')
})

test('alertes d’échéance dans les paramètres', async ({ page }) => {
  await page.goto('/settings')
  const card = page.locator('.ant-card', { hasText: 'Alertes d’échéance (ntfy)' })
  await expect(card).toBeVisible()
  await expect(card.getByRole('switch')).not.toBeChecked()
})
