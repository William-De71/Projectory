import { test, expect } from './fixtures.js'

const release = { version: '99.0.0', url: 'https://github.com/William-De71/Projectory/releases/tag/v99.0.0', notes: '### Nouveautés\n- Tout est neuf', published_at: '2026-11-06T00:00:00Z' }
const base = { current: '1.0.0', comparable: true, can_update: false, image_tag: 'latest', checked_at: '2026-11-06T10:00:00Z' }
const answer = (route, body) => route.fulfill({ json: body })

test('rechercher une mise à jour : à jour, puis nouvelle version', async ({ page }) => {
  await page.route('**/api/update*', (route) => (new URL(route.request().url()).searchParams.get('refresh')
    ? answer(route, { ...base, latest: release, available: true })
    : answer(route, { ...base, latest: { ...release, version: '1.0.0' }, available: false })))
  await page.goto('/settings')

  const card = page.locator('.ant-card', { hasText: 'Mises à jour de Projectory' })
  await expect(card.getByText('Projectory est à jour.')).toBeVisible()
  await card.getByRole('button', { name: 'Rechercher une mise à jour' }).click()

  await expect(card.getByText('Projectory v99.0.0 est disponible')).toBeVisible()
  await expect(card.getByText('Projectory est à jour.')).toHaveCount(0)
  // The sidebar follows, without a second announcement.
  await expect(page.getByText('v99.0.0 disponible')).toBeVisible()
  await expect(page.locator('.ant-notification-notice')).toHaveCount(0)

  await card.getByRole('button', { name: 'Voir la mise à jour' }).click()
  const dialog = page.locator('.ant-modal')
  await expect(dialog.getByText('Tout est neuf')).toBeVisible()
  await expect(dialog.getByText('docker compose pull')).toBeVisible()
})

test('rechercher une mise à jour : un échec ne dit pas « à jour »', async ({ page }) => {
  await page.route('**/api/update*', (route) => answer(route, { ...base, latest: null, checked_at: null, available: false, error: 'GitHub a répondu 503' }))
  await page.goto('/settings')
  const card = page.locator('.ant-card', { hasText: 'Mises à jour de Projectory' })
  await expect(card.getByText('Vérification impossible : GitHub a répondu 503')).toBeVisible()
  await expect(card.getByText('Projectory est à jour.')).toHaveCount(0)
})
