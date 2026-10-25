import { test, expect, seed } from './fixtures.js'

let project
test.beforeAll(async ({ request }) => { project = await seed(request) })

test('chaque entrée du menu ouvre sa page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('tab', { name: 'Ma journée' })).toBeVisible()
  const menu = page.getByRole('menu')
  for (const [entry, heading] of [['À traiter', 'À traiter'], ['Projets', 'Projets'], ['Bugs & tâches', 'Bugs & tâches'], ['Notes & specs', 'Notes & spécifications'], ['Accueil', 'Aujourd’hui']]) {
    await menu.getByText(entry, { exact: true }).click()
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
  }
})

test('les anciennes adresses mènent aux nouvelles pages', async ({ page }) => {
  await page.goto('/deps')
  await expect(page).toHaveURL(/\/inbox\/deps$/)
  await page.goto(`/projects/${project.id}/specs`)
  await expect(page.getByRole('tab', { name: /Notes & specs/, selected: true })).toBeVisible()
  await page.goto('/time')
  await expect(page).toHaveURL(/\/settings\/time$/)
})

test('la fiche projet a cinq onglets', async ({ page }) => {
  await page.goto(`/projects/${project.id}`)
  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveCount(5)
  await page.getByRole('tab', { name: /Versions/ }).click()
  await expect(page.getByText('Bug planifié')).toBeVisible()
  await page.getByRole('tab', { name: /Notes & specs/ }).click()
  await expect(page.getByText('Note de démo')).toBeVisible()
})

test('un bug s’ouvre dans le panneau latéral et se referme', async ({ page }) => {
  await page.goto('/items')
  await page.getByText('Bug planifié').click()
  const panel = page.locator('.ant-drawer-open')
  await expect(panel.getByLabel('Titre')).toHaveValue('Bug planifié')
  await expect(page).toHaveURL(/[?&]item=\d+/)
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(page).not.toHaveURL(/item=/)
})

test('« n » crée une tâche dans le projet ouvert', async ({ page }) => {
  await page.goto(`/projects/${project.id}/items`)
  await expect(page.getByText('Bug planifié')).toBeVisible()
  await page.keyboard.press('n')
  const panel = page.locator('.ant-drawer-open')
  await panel.getByLabel('Titre').fill('Créée au clavier')
  await page.keyboard.press('Control+Enter')
  await expect(panel).toHaveCount(0)
  await expect(page.getByText('Créée au clavier')).toBeVisible()
})

test('« Marquer terminé » au survol d’une ligne', async ({ page }) => {
  await page.goto(`/projects/${project.id}/roadmap`)
  const row = page.locator('.item-row', { hasText: 'Bug planifié' })
  await row.hover()
  await row.getByRole('button', { name: 'Marquer terminé' }).click()
  await expect(row.locator('del')).toHaveText('Bug planifié')
})

test('une liste filtrée sans résultat propose d’effacer les filtres', async ({ page }) => {
  await page.goto('/items')
  await page.getByPlaceholder('Filtrer… ( / )').fill('introuvable')
  await page.getByRole('button', { name: 'Effacer les filtres' }).click()
  await expect(page.getByText('Tâche sans version')).toBeVisible()
})

test('« ? » affiche les raccourcis', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('tab', { name: 'Ma journée' })).toBeVisible()
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog')).toContainText('Partout')
})

test('l’onglet « À publier » s’ouvre, vide sans dépôt synchronisé', async ({ page }) => {
  await page.goto('/inbox/releases')
  await expect(page.getByRole('tab', { name: /À publier/, selected: true })).toBeVisible()
  await expect(page.getByText('Rien à publier ni à réparer 👌')).toBeVisible()
})

test('revue de la semaine : une tâche en retard se reporte et sort de la revue', async ({ page, request }) => {
  const yesterday = new Date(Date.now() - 86400e3).toISOString().slice(0, 10)
  await request.post('/api/items', { data: { project_id: project.id, kind: 'task', title: 'Échéance ratée', due_date: yesterday } })
  await page.goto('/')
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page).toHaveURL(/\/review$/)
  const row = page.locator('.ant-list-item', { hasText: 'Échéance ratée' })
  await expect(row.getByRole('button', { name: 'Garder' })).toHaveCount(0)
  await row.getByRole('button', { name: /Reporter/ }).click()
  await page.getByText('Échéance dans une semaine').click()
  await expect(row).toHaveCount(0)
  await page.getByRole('button', { name: 'Terminer la revue' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('button', { name: 'Commencer' })).toHaveCount(0)
})

test('l’accueil sépare la journée et la vue d’ensemble en onglets', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Vue d’ensemble' }).click()
  await expect(page).toHaveURL(/\?view=overview$/)
  await expect(page.getByText('Projets actifs')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Vue d’ensemble', selected: true })).toBeVisible()
})
