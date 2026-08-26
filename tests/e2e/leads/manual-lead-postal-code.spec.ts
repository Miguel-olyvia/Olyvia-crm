import { test, expect } from '@playwright/test'
import { LeadsPage } from '../../fixtures/pages'

/**
 * Empirical check for the "postal code becomes a dash" hypothesis.
 *
 * Writes ONLY to the `nike` organization. The spec aborts if the active
 * organization stored in localStorage is anything else.
 */
const NIKE_ORG_ID = process.env.E2E_ORG_ID || 'b6ffce4f-f630-4933-833a-008649757a33'
const CAMPAIGN_NAME = process.env.E2E_LEAD_CAMPAIGN || 'teste'
const VALID_POSTAL_CODE = '1234-567'

// The leads page keeps long-lived requests open, so `networkidle` and the
// 30s default are both too optimistic here.
test.describe.configure({ timeout: 180_000 })

const uniqueSuffix = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`

async function openCreateDialogInNike(page: import('@playwright/test').Page) {
  const leads = new LeadsPage(page)
  await page.goto('/home', { waitUntil: 'domcontentloaded' })
  await page.evaluate((id) => localStorage.setItem('activeCompanyId', id), NIKE_ORG_ID)
  await page.goto('/leads', { waitUntil: 'domcontentloaded' })
  await leads.newButton().waitFor({ timeout: 60_000 })

  const activeCompanyId = await page.evaluate(() => localStorage.getItem('activeCompanyId'))
  expect(activeCompanyId, 'refusing to write outside the nike organization').toBe(NIKE_ORG_ID)

  await leads.newButton().click({ timeout: 30_000 })
  const dialog = leads.createDialog()
  await dialog.root().waitFor()
  await dialog.selectCampaign(CAMPAIGN_NAME)
  // Campaign fields are fetched asynchronously — wait for them before filling.
  await dialog.input('Código Postal').waitFor({ timeout: 30_000 })
  const checked = await dialog.checkFirstOption(/servi.o|.rea/i)
  expect(checked, 'required multi-select option must be selectable').toBe(true)
  return dialog
}

test.describe('manual lead creation — postal code', () => {
  test('stores a correctly typed postal code verbatim', async ({ page }) => {
    const consoleMessages: string[] = []
    page.on('console', (msg) => consoleMessages.push(msg.text()))

    const dialog = await openCreateDialogInNike(page)
    const suffix = uniqueSuffix()

    await dialog.fill('Nome', `E2ECP${suffix}`)
    await dialog.fill('Apelido', 'PostalCode')
    await dialog.fill('Email', `e2ecp${suffix}@example.test`)
    await dialog.fill('Telefone', '912345678')
    await dialog.fill('Morada', 'Rua de Teste 123')
    await dialog.fill('Código Postal', VALID_POSTAL_CODE)
    await dialog.fill('Localidade', 'LISBOA')
    await dialog.fillRemainingDropdowns()

    // The value must survive re-render untouched before submit.
    await expect(dialog.input('Código Postal')).toHaveValue(VALID_POSTAL_CODE)

    await dialog.submitButton().click()
    await expect(dialog.root()).toBeHidden({ timeout: 20000 })

    // The address must reach anew_addresses AND anew_entity_addresses — an
    // orphan address row is invisible to the client (SELECT needs the link).
    const addressFailure = consoleMessages.find((m) => m.includes('address sync failed'))
    expect(addressFailure ?? '', 'address sync must not fail').toBe('')

    await page.goto('/leads', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(`E2ECP${suffix}`, { exact: false }).first()).toBeVisible({ timeout: 60_000 })
  })

  test('rejects a postal code that is not in the 0000-000 format', async ({ page }) => {
    const dialog = await openCreateDialogInNike(page)
    const suffix = uniqueSuffix()

    await dialog.fill('Nome', `E2EDASH${suffix}`)
    await dialog.fill('Apelido', 'PostalCode')
    await dialog.fill('Email', `e2edash${suffix}@example.test`)
    await dialog.fill('Telefone', '912345678')
    await dialog.fill('Morada', 'Rua de Teste 123')
    await dialog.fill('Código Postal', '-')
    await dialog.fill('Localidade', 'LISBOA')
    await dialog.fillRemainingDropdowns()

    await dialog.submitButton().click()

    // A lone dash must not be accepted as a filled required postal code:
    // the dialog stays open and the toast names the offending field.
    await expect(page.getByText(/Código Postal.*(obrigatório|formato)/i).first()).toBeVisible({
      timeout: 10_000,
    })
    await expect(dialog.root()).toBeVisible()
  })
})
