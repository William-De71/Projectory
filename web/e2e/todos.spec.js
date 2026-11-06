import { test, expect, seed } from './fixtures.js'

let project
test.beforeAll(async ({ request }) => { project = await seed(request) })

test('todo générale et todo de projet, depuis la page et la fiche projet', async ({ page }) => {
  await page.goto('/todos')
  const input = page.getByRole('textbox', { name: 'Ajouter une todo…' })
  const general = page.locator('.ant-card', { hasText: 'Liste générale' })

  // No project chosen: the general list.
  await input.fill('Renouveler le domaine')
  await input.press('Enter')
  await expect(general.getByText('Renouveler le domaine')).toBeVisible()
  await expect(input).toHaveValue('')

  // A project chosen: its own card, linking to its tab.
  await page.getByRole('combobox', { name: 'Liste' }).click()
  await page.locator('.ant-select-dropdown:visible').getByText(project.name, { exact: true }).click()
  await input.fill('Préparer la démo')
  await page.getByRole('button', { name: 'plus Ajouter' }).click()
  const card = page.locator('.ant-card', { hasText: 'Préparer la démo' })
  await expect(card.getByRole('link', { name: project.name })).toBeVisible()
  await expect(general.getByText('Préparer la démo')).toHaveCount(0)

  await card.getByRole('link', { name: project.name }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/todos$`))
  const tab = page.getByRole('tabpanel')
  await expect(tab.getByText('Préparer la démo')).toBeVisible()
  await expect(tab.getByText('Renouveler le domaine')).toHaveCount(0)

  // Added from the project: same list, and the tab counts what is left.
  await tab.getByRole('textbox', { name: 'Ajouter une todo…' }).fill('Écrire le changelog')
  await page.keyboard.press('Enter')
  await expect(tab.getByText('Écrire le changelog')).toBeVisible()
  await expect(page.getByRole('tab', { name: /Todo 2/ })).toBeVisible()
})

test('cocher, renommer, supprimer et effacer les terminées', async ({ page, request }) => {
  await request.post('/api/todos', { data: { text: 'À cocher' } })
  await request.post('/api/todos', { data: { text: 'À renommer' } })
  await request.post('/api/todos', { data: { text: 'À supprimer' } })
  await page.goto('/todos')
  const general = page.locator('.ant-card', { hasText: 'Liste générale' })

  await general.getByRole('checkbox', { name: 'À cocher' }).click()
  await expect(general.locator('del', { hasText: 'À cocher' })).toBeVisible()

  const row = general.locator('.ant-typography', { hasText: 'À renommer' })
  await row.getByRole('button', { name: 'Modifier' }).click()
  await general.locator('textarea').fill('Renommée')
  await general.locator('textarea').press('Enter')
  await expect(general.getByText('Renommée')).toBeVisible()

  await general.getByRole('button', { name: 'Supprimer « À supprimer »' }).click()
  await expect(general.getByText('À supprimer')).toHaveCount(0)

  await general.getByRole('button', { name: 'Effacer les terminées (1)' }).click()
  await page.locator('.ant-popconfirm').getByRole('button', { name: /OK|Oui/ }).click()
  await expect(general.getByText('À cocher')).toHaveCount(0)
  await expect(general.getByText('Renommée')).toBeVisible()
})
