import { test, expect, Page } from '@playwright/test'
import { LeadsPage } from '../../fixtures/pages'

/**
 * Empirical check that a lead's address reaches the entity (anew_addresses +
 * anew_entity_addresses) not just at creation, but also when it is added or
 * corrected later via the Lead edit dialog — the case that was reported
 * broken: linkEntityAddress() used to insert(...).select("id").single()
 * straight from the browser's authenticated client, which RLS always
 * rejected (authenticated_select_anew_addresses only exposes addresses
 * already linked to an entity/org, so the RETURNING of a brand-new insert
 * was blocked with 42501). It now delegates to the sync_entity_primary_address
 * RPC (SECURITY DEFINER), applied in migration 20261113290000.
 *
 * Writes ONLY to the `nike` organization. The spec aborts if the active
 * organization stored in localStorage is anything else.
 */
const NIKE_ORG_ID = process.env.E2E_ORG_ID || 'b6ffce4f-f630-4933-833a-008649757a33'
const SUPABASE_URL = 'https://tzbfgwpckrfbqcolqxtm.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_qOl0nV8ON0rD_lxnJ-0-wA_VupJyT2Y'

test.describe.configure({ timeout: 180_000 })

const uniqueSuffix = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`

/** Runs a Supabase REST GET as the currently logged-in user — reads the
 * access_token straight out of the same non-httpOnly session cookie
 * @supabase/ssr already sets in this browser context (it is app-domain, not
 * supabase-domain, so `credentials: "include"` on a cross-origin fetch to
 * the Supabase REST API is a no-op and Supabase's `Access-Control-Allow-
 * Origin: *` even rejects credentialed cross-origin requests outright).
 * Goes through the real user's RLS end to end — no service role involved. */
async function restGet(page: Page, path: string): Promise<any> {
  return page.evaluate(
    async ({ url, key, path }) => {
      const cookieMatch = document.cookie.match(/sb-[^=]*-auth-token=([^;]+)/)
      if (!cookieMatch) throw new Error('no supabase auth-token cookie found')
      const raw = decodeURIComponent(cookieMatch[1]).replace(/^base64-/, '')
      const session = JSON.parse(atob(raw))
      const accessToken = session.access_token
      if (!accessToken) throw new Error('no access_token in session cookie')

      const res = await fetch(`${url}/rest/v1/${path}`, {
        headers: { apikey: key, Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new Error(`REST ${path} -> ${res.status}: ${await res.text()}`)
      return res.json()
    },
    { url: SUPABASE_URL, key: SUPABASE_ANON_KEY, path },
  )
}

async function findLeadBySuffix(page: Page, suffix: string): Promise<{ id: string; entity_id: string }> {
  const rows = await restGet(
    page,
    `anew_leads?select=id,entity_id&organization_id=eq.${NIKE_ORG_ID}&search_text=ilike.*${suffix}*&order=created_at.desc&limit=1`,
  )
  expect(rows.length, `lead with suffix ${suffix} must exist`).toBeGreaterThan(0)
  expect(rows[0].entity_id, 'lead must have an entity_id').toBeTruthy()
  return rows[0]
}

async function primaryAddressLinks(page: Page, entityId: string): Promise<any[]> {
  return restGet(
    page,
    `anew_entity_addresses?select=id,address_id,is_primary,valid_to,anew_addresses(street,postal_code,city)` +
      `&entity_id=eq.${entityId}&is_primary=eq.true&valid_to=is.null`,
  )
}

async function ensureNikeOrg(page: Page) {
  const leads = new LeadsPage(page)
  await page.goto('/home', { waitUntil: 'domcontentloaded' })
  await page.evaluate((id) => localStorage.setItem('activeCompanyId', id), NIKE_ORG_ID)
  await page.goto('/leads', { waitUntil: 'domcontentloaded' })
  await leads.newButton().waitFor({ timeout: 60_000 })
  const activeCompanyId = await page.evaluate(() => localStorage.getItem('activeCompanyId'))
  expect(activeCompanyId, 'refusing to write outside the nike organization').toBe(NIKE_ORG_ID)
  return leads
}

/**
 * Creates a lead with only the required identity fields — no address. The
 * `teste` campaign marks Morada/Código Postal/Localidade as required, so this
 * deliberately creates the lead WITHOUT selecting a campaign (base
 * company-level fields only, where address is not mandatory) — this is
 * exactly the "lead sem morada utilizável" scenario the user described.
 */
/** Base (no-campaign) field labels are i18n-translated, unlike the PT-only
 * campaign-defined ones the other lead specs rely on — matches PT or EN. */
async function fillBaseField(dialog: ReturnType<import('../../fixtures/pages').LeadsPage['createDialog']>, labels: string, value: string) {
  await dialog.fill(labels, value)
}

async function createLeadWithoutAddress(page: Page, suffix: string) {
  const leads = await ensureNikeOrg(page)
  await leads.newButton().click({ timeout: 30_000 })
  const dialog = leads.createDialog()
  await dialog.root().waitFor()

  const isEnglish = await dialog.root().locator('text=/First Name/i').count() > 0
  await fillBaseField(dialog, isEnglish ? 'First Name' : 'Nome', `E2EEDIT${suffix}`)
  await fillBaseField(dialog, isEnglish ? 'Last Name' : 'Apelido', 'AddressSync')
  await fillBaseField(dialog, 'Email', `e2eedit${suffix}@example.test`)
  await fillBaseField(dialog, isEnglish ? 'Phone' : 'Telefone', '912345678')
  // Deliberately NOT filling Morada/Código Postal/Localidade (no campaign
  // selected here means the address fields aren't even rendered) — and
  // deliberately NOT calling fillRemainingDropdowns(), which would pick the
  // first option of the still-unset "Campaign" combobox too and pull in a
  // campaign whose fields (incl. address) are required.

  await dialog.submitButton().click()
  await expect(dialog.root()).toBeHidden({ timeout: 20000 })
}

/** `?open=<id>` (AnewLeads.tsx) opens the read-only details dialog, not the
 * edit one directly — it has its own "Editar" button that swaps to
 * AnewLeadEditDialog. */
async function openEditDialogFor(page: Page, leadId: string) {
  await page.goto(`/leads?open=${leadId}`, { waitUntil: 'domcontentloaded' })
  const detailsDialog = page.locator('[role="dialog"]').last()
  await detailsDialog.waitFor({ timeout: 20_000 })
  // The details dialog also has an "Editar" TAB (role="tab") — the actual
  // action button that swaps to AnewLeadEditDialog is a plain button.
  const editButton = detailsDialog
    .locator('button:not([role="tab"])')
    .filter({ hasText: /^\s*Editar\s*$/i })
    .first()
  await editButton.click({ timeout: 15_000 })
  const editDialog = (new LeadsPage(page)).editDialog()
  await editDialog.root().waitFor({ timeout: 20_000 })
  return editDialog
}

test.describe('lead edit — address reaches the entity', () => {
  test('address added later via edit dialog reaches anew_entity_addresses (previously broken)', async ({ page }) => {
    const consoleMessages: string[] = []
    page.on('console', (msg) => consoleMessages.push(msg.text()))

    const suffix = uniqueSuffix()
    await createLeadWithoutAddress(page, suffix)

    const { id: leadId, entity_id: entityId } = await findLeadBySuffix(page, suffix)

    // Sanity: no address yet (created without one).
    const before = await primaryAddressLinks(page, entityId)
    expect(before.length, 'entity must start with no primary address').toBe(0)

    // Open the edit dialog via `?open=<id>` -> details dialog -> "Editar", and
    // fill in the address that was missing at creation.
    const editDialog = await openEditDialogFor(page, leadId)
    await editDialog.fill('Morada', 'Rua da Correcao 42')
    await editDialog.fill('Código Postal', '4000-123')
    await editDialog.fill('Localidade', 'PORTO')
    await editDialog.saveButton().click()
    await expect(editDialog.root()).toBeHidden({ timeout: 20000 })

    // No "address not updated" failure toast.
    const addressFailure = consoleMessages.find(
      (m) => m.includes('address sync failed') || m.includes('Error linking lead\'s address'),
    )
    expect(addressFailure ?? '', 'address sync on edit must not fail').toBe('')

    const after = await primaryAddressLinks(page, entityId)
    expect(after.length, 'entity must now have exactly one active primary address').toBe(1)
    expect(after[0].anew_addresses.street).toBe('Rua da Correcao 42')
    expect(after[0].anew_addresses.postal_code).toBe('4000-123')
    expect(after[0].anew_addresses.city.toUpperCase()).toBe('PORTO')

    // Edit again with a DIFFERENT address — must replace, not duplicate.
    const editDialog2 = await openEditDialogFor(page, leadId)
    await editDialog2.fill('Morada', 'Avenida Nova 99')
    await editDialog2.fill('Código Postal', '1000-999')
    await editDialog2.fill('Localidade', 'LISBOA')
    await editDialog2.saveButton().click()
    await expect(editDialog2.root()).toBeHidden({ timeout: 20000 })

    const afterEdit2 = await primaryAddressLinks(page, entityId)
    expect(afterEdit2.length, 'must still be exactly one active primary link (no duplicate)').toBe(1)
    expect(afterEdit2[0].anew_addresses.street).toBe('Avenida Nova 99')
    expect(afterEdit2[0].anew_addresses.postal_code).toBe('1000-999')

    // Calling with the exact same data again must stay idempotent (no 2nd link).
    const editDialog3 = await openEditDialogFor(page, leadId)
    await editDialog3.saveButton().click()
    await expect(editDialog3.root()).toBeHidden({ timeout: 20000 })

    const afterNoop = await primaryAddressLinks(page, entityId)
    expect(afterNoop.length, 'idempotent re-save must not create a second link').toBe(1)
    expect(afterNoop[0].address_id).toBe(afterEdit2[0].address_id)
  })

  test('a filler address typed in the edit dialog creates no address record', async ({ page }) => {
    const suffix = uniqueSuffix()
    await createLeadWithoutAddress(page, suffix)
    const { id: leadId, entity_id: entityId } = await findLeadBySuffix(page, suffix)

    const editDialog = await openEditDialogFor(page, leadId)
    await editDialog.fill('Morada', '-')
    await editDialog.fill('Código Postal', '-')
    await editDialog.fill('Localidade', '-')
    await editDialog.saveButton().click()
    await expect(editDialog.root()).toBeHidden({ timeout: 20000 })

    const after = await primaryAddressLinks(page, entityId)
    expect(after.length, 'filler address must not create an address record').toBe(0)
  })
})
