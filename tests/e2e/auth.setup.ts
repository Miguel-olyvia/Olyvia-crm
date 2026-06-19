import { test as setup } from '@playwright/test'
import path from 'path'

const authFile = path.join(__dirname, '../.auth/user.json')

setup('autenticar utilizador', async ({ page }) => {
  await page.goto('/auth')
  await page.waitForLoadState('networkidle')

  await page.locator('input[type="email"]').fill(process.env.TEST_EMAIL || 'carvalhomiguel319@gmail.com')
  await page.locator('input[type="password"]').fill(process.env.TEST_PASSWORD || 'Migasdela007#')
  await page.locator('button[type="submit"]').click()

  await page.waitForURL(url => !url.toString().includes('/auth'), { timeout: 15000 })
  await page.context().storageState({ path: authFile })
})
