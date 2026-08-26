import { test as setup } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

// package.json declares "type": "module", so __dirname does not exist here —
// the whole suite failed to load before reaching a single test.
const currentDir = path.dirname(fileURLToPath(import.meta.url))
const authFile = path.join(currentDir, '../.auth/user.json')

setup.setTimeout(120_000)

setup('autenticar utilizador', async ({ page }) => {
  await page.goto('/auth', { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').waitFor({ timeout: 60000 })

  await page.locator('input[type="email"]').fill(process.env.TEST_EMAIL || 'carvalhomiguel319@gmail.com')
  await page.locator('input[type="password"]').fill(process.env.TEST_PASSWORD || 'Migasdela007#')
  await page.locator('button[type="submit"]').click()

  await page.waitForURL(url => !url.toString().includes('/auth'), { timeout: 15000 })
  await page.context().storageState({ path: authFile })
})
