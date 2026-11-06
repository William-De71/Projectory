import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures.js'

test('créer, télécharger et supprimer une sauvegarde', async ({ page }) => {
  await page.goto('/settings')
  const card = page.locator('.ant-card', { hasText: 'Sauvegardes automatiques' })
  await card.getByRole('button', { name: 'Sauvegarder maintenant' }).click()
  const row = card.locator('tbody tr', { hasText: /projectory-\d{4}-\d{2}-\d{2}\.db/ })
  await expect(row).toHaveCount(1)
  const name = (await row.locator('td').first().innerText()).trim()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    row.getByRole('link', { name: `Télécharger ${name}` }).click(),
  ])
  expect(download.suggestedFilename()).toBe(name)
  // A real SQLite file, not an error page.
  expect(readFileSync(await download.path()).subarray(0, 15).toString()).toBe('SQLite format 3')

  await row.getByRole('button', { name: `Supprimer « ${name} »` }).click()
  const confirm = page.locator('.ant-popconfirm')
  await expect(confirm.getByText('C’est la dernière sauvegarde.')).toBeVisible()
  await confirm.getByRole('button', { name: /OK|Oui/ }).click()
  await expect(card.getByText('Aucune sauvegarde pour l’instant')).toBeVisible()
  await page.reload()
  await expect(page.locator('.ant-card', { hasText: 'Sauvegardes automatiques' }).getByText('Aucune sauvegarde pour l’instant')).toBeVisible()
})
