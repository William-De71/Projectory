import { test, expect, seed } from './fixtures.js'

test.beforeAll(async ({ request }) => { await seed(request) })

test('sur téléphone, la barre d’onglets du bas remplace le menu', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('menu')).toHaveCount(0)
  const nav = page.getByRole('navigation', { name: 'Navigation' })
  await expect(nav).toBeVisible()
  await nav.getByRole('button', { name: /Tâches/ }).click()
  await expect(page).toHaveURL(/\/items$/)
  await expect(page.getByText('Tâche sans version')).toBeVisible()
})
