import { test, expect } from './fixtures.js'

test('créer une tâche dans un projet sans dépôt, créé depuis le formulaire', async ({ page }) => {
  await page.goto('/items')
  await page.getByRole('button', { name: 'Bug / tâche' }).first().click()
  const panel = page.locator('.ant-drawer-open')
  await panel.getByLabel('Titre').fill('Créer la scène du soir')

  await panel.getByRole('combobox', { name: 'Projet' }).fill('Maison')
  await page.locator('.ant-select-dropdown:visible').getByText('+ Créer le projet « Maison »').click()
  await expect(page.getByText('Projet « Maison » créé')).toBeVisible()

  await page.keyboard.press('Control+Enter')
  await expect(panel).toHaveCount(0)
  const row = page.locator('tr', { hasText: 'Créer la scène du soir' })
  await expect(row.getByRole('link', { name: 'Maison' })).toBeVisible()
})
