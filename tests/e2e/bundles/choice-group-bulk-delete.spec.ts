import { test, expect, Page } from '@playwright/test'

/**
 * Eliminação em lote das opções de um Grupo de Escolha de um bundle.
 *
 * Antes: cada opção só podia ser eliminada uma a uma pelo caixote da linha —
 * inviável num grupo com 150 opções. Agora cada opção tem uma caixa de
 * selecção e um botão "Eliminar selecionadas (N)" que faz UMA só chamada ao
 * servidor (rpc_delete_bundle_components, migração 20261114010000).
 *
 * Escreve APENAS na organização `nike`. O spec aborta se a organização ativa
 * em localStorage for outra. Toda a preparação de dados usa os mesmos RPCs
 * que a aplicação usa (rpc_create_bundle / rpc_create_bundle_choice_group /
 * rpc_add_bundle_components), com a sessão do utilizador autenticado — sem
 * service role, sem SQL avulso.
 */
const NIKE_ORG_ID = process.env.E2E_ORG_ID || 'b6ffce4f-f630-4933-833a-008649757a33'
const SUPABASE_URL = 'https://tzbfgwpckrfbqcolqxtm.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_qOl0nV8ON0rD_lxnJ-0-wA_VupJyT2Y'
const OPTION_COUNT = 5

test.describe.configure({ timeout: 240_000 })

const uniqueSuffix = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`

/** GET ao PostgREST com o access_token do utilizador autenticado (mesmo
 * padrão de tests/e2e/leads/lead-edit-address-sync.spec.ts): passa pelo RLS
 * real, nunca pelo service role. */
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

/** POST /rest/v1/rpc/<fn> com a sessão do utilizador autenticado. */
async function restRpc(page: Page, fn: string, args: Record<string, unknown>): Promise<any> {
  return page.evaluate(
    async ({ url, key, fn, args }) => {
      const cookieMatch = document.cookie.match(/sb-[^=]*-auth-token=([^;]+)/)
      if (!cookieMatch) throw new Error('no supabase auth-token cookie found')
      const raw = decodeURIComponent(cookieMatch[1]).replace(/^base64-/, '')
      const session = JSON.parse(atob(raw))
      const accessToken = session.access_token
      if (!accessToken) throw new Error('no access_token in session cookie')

      const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
      })
      if (!res.ok) throw new Error(`RPC ${fn} -> ${res.status}: ${await res.text()}`)
      const text = await res.text()
      return text ? JSON.parse(text) : null
    },
    { url: SUPABASE_URL, key: SUPABASE_ANON_KEY, fn, args },
  )
}

/** Navega para /bundles e espera pela listagem. A app pode redirecionar para
 * o dashboard enquanto a sessão/organização ainda está a resolver, por isso a
 * navegação é reafirmada até a página de bundles ficar montada. */
async function gotoBundles(page: Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto('/bundles', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    const mounted = await page
      .locator('input[placeholder*="SKU"], input[placeholder*="sku"]')
      .first()
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false)
    if (mounted) return
  }
  throw new Error('bundles page did not mount')
}

async function ensureNikeOrg(page: Page) {
  await page.goto('/home', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.evaluate((id) => localStorage.setItem('activeCompanyId', id), NIKE_ORG_ID)
  await gotoBundles(page)
  const activeCompanyId = await page.evaluate(() => localStorage.getItem('activeCompanyId'))
  expect(activeCompanyId, 'refusing to write outside the nike organization').toBe(NIKE_ORG_ID)
}

interface Fixture {
  bundleId: string
  bundleName: string
  groupId: string
  componentIds: string[]
}

/** Cria, na nike, um bundle com um grupo de escolha e OPTION_COUNT opções. */
async function createFixture(page: Page): Promise<Fixture> {
  const suffix = uniqueSuffix()
  const bundleName = `E2E-BULKDEL-${suffix}`

  const bundle = await restRpc(page, 'rpc_create_bundle', {
    p_organization_id: NIKE_ORG_ID,
    p_sku: `E2EBD${suffix}`,
    p_name: bundleName,
    p_description: 'Fixture E2E — eliminação em lote de opções',
    p_pricing_type: 'fixed_price',
    p_fixed_price: 100,
    p_discount_percent: null,
    p_discount_fixed: null,
    p_status: 'draft',
    p_valid_from: null,
    p_valid_to: null,
  })
  expect(bundle?.organization_id, 'bundle must belong to nike').toBe(NIKE_ORG_ID)

  const group = await restRpc(page, 'rpc_create_bundle_choice_group', {
    p_bundle_id: bundle.id,
    p_group: {
      name: `Opções ${suffix}`,
      description: null,
      min_selections: 1,
      max_selections: 1,
      is_required: true,
      sort_order: 0,
    },
  })

  const products = await restGet(
    page,
    `products?select=id,name&organization_id=eq.${NIKE_ORG_ID}&deleted_at=is.null&order=name&limit=${OPTION_COUNT}`,
  )
  expect(products.length, `nike must have at least ${OPTION_COUNT} products`).toBe(OPTION_COUNT)

  await restRpc(page, 'rpc_add_bundle_components', {
    p_bundle_id: bundle.id,
    p_items: products.map((product: any, index: number) => ({
      choice_group_id: group.id,
      product_id: product.id,
      service_id: null,
      quantity: 1,
      pricing_mode: 'original',
      is_optional: false,
      sort_order: index,
    })),
  })

  const components = await dbComponents(page, group.id)
  expect(components.length).toBe(OPTION_COUNT)

  return {
    bundleId: bundle.id,
    bundleName,
    groupId: group.id,
    componentIds: components.map((c: any) => c.id),
  }
}

async function dbComponents(page: Page, groupId: string): Promise<any[]> {
  return restGet(page, `bundle_components?select=id,product_id&choice_group_id=eq.${groupId}&order=sort_order`)
}

async function dbGroupExists(page: Page, groupId: string): Promise<boolean> {
  const rows = await restGet(page, `bundle_choice_groups?select=id&id=eq.${groupId}`)
  return rows.length === 1
}

/** Abre Editar Bundle → separador Grupos de Escolha, com o grupo expandido. */
async function openChoiceGroupEditor(page: Page, fixture: Fixture) {
  await gotoBundles(page)
  const search = page.locator('input[placeholder*="SKU"], input[placeholder*="sku"]').first()
  await search.waitFor({ timeout: 60_000 })
  await search.fill(fixture.bundleName)

  const row = page.locator('table tbody tr', { hasText: fixture.bundleName })
  await row.first().waitFor({ timeout: 30_000 })
  // A 1ª célula é a checkbox de selecção em massa da própria listagem — o
  // lápis "Editar" é o 1º botão da última célula (ações).
  await row.first().locator('td').last().locator('button').first().click()

  const dialog = page.locator('[role="dialog"]').first()
  await dialog.waitFor({ timeout: 30_000 })
  await dialog.locator('button[role="tab"]').nth(2).click()

  const groupHeader = dialog.locator('text=/^Opções /').first()
  await groupHeader.waitFor({ timeout: 30_000 })
  await groupHeader.click()

  await page.locator('[data-testid^="choice-option-checkbox-"]').first().waitFor({ timeout: 30_000 })
  return dialog
}

function optionCheckbox(page: Page, componentId: string) {
  return page.locator(`[data-testid="choice-option-checkbox-${componentId}"]`)
}

test.describe('Bundles — opções de Grupo de Escolha: eliminação em lote', () => {
  test('seleccionar três opções e eliminar remove só essas três, numa só chamada', async ({ page }) => {
    await ensureNikeOrg(page)
    const fixture = await createFixture(page)

    const toDelete = fixture.componentIds.slice(0, 3)
    const toKeep = fixture.componentIds.slice(3)

    await openChoiceGroupEditor(page, fixture)

    for (const id of toDelete) {
      await optionCheckbox(page, id).click()
    }

    const bulkRpcCalls: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/rpc/rpc_delete_bundle_component')) bulkRpcCalls.push(req.url())
    })

    const deleteButton = page.locator('[data-testid="choice-options-delete-selected"]')
    await expect(deleteButton).toBeVisible()
    await expect(deleteButton).toContainText('(3)')
    await deleteButton.click()

    await expect
      .poll(async () => (await dbComponents(page, fixture.groupId)).length, { timeout: 30_000 })
      .toBe(OPTION_COUNT - 3)

    const remaining = (await dbComponents(page, fixture.groupId)).map((c: any) => c.id).sort()
    expect(remaining).toEqual([...toKeep].sort())

    // UMA só chamada ao servidor para o lote (e não uma por linha).
    expect(bulkRpcCalls.length, 'exactly one delete RPC round trip').toBe(1)
    expect(bulkRpcCalls[0]).toContain('rpc_delete_bundle_components')

    await restRpc(page, 'rpc_delete_bundle', { p_id: fixture.bundleId, p_organization_id: NIKE_ORG_ID })
  })

  test('seleccionar todas e eliminar esvazia o grupo mas o grupo continua a existir', async ({ page }) => {
    await ensureNikeOrg(page)
    const fixture = await createFixture(page)

    await openChoiceGroupEditor(page, fixture)

    for (const id of fixture.componentIds) {
      await optionCheckbox(page, id).click()
    }

    const deleteButton = page.locator('[data-testid="choice-options-delete-selected"]')
    await expect(deleteButton).toContainText(`(${OPTION_COUNT})`)
    await deleteButton.click()

    await expect
      .poll(async () => (await dbComponents(page, fixture.groupId)).length, { timeout: 30_000 })
      .toBe(0)

    expect(await dbGroupExists(page, fixture.groupId), 'group must survive its options').toBe(true)

    await restRpc(page, 'rpc_delete_bundle', { p_id: fixture.bundleId, p_organization_id: NIKE_ORG_ID })
  })

  test('o caixote individual continua a eliminar uma única opção', async ({ page }) => {
    await ensureNikeOrg(page)
    const fixture = await createFixture(page)

    const dialog = await openChoiceGroupEditor(page, fixture)

    // O caixote da 1ª linha de opção (o botão destrutivo dentro da própria linha).
    const firstRow = dialog
      .locator(`[data-testid="choice-option-checkbox-${fixture.componentIds[0]}"]`)
      .locator('xpath=..')
    await firstRow.locator('button').last().click()

    await expect
      .poll(async () => (await dbComponents(page, fixture.groupId)).length, { timeout: 30_000 })
      .toBe(OPTION_COUNT - 1)

    const remaining = (await dbComponents(page, fixture.groupId)).map((c: any) => c.id)
    expect(remaining).not.toContain(fixture.componentIds[0])

    await restRpc(page, 'rpc_delete_bundle', { p_id: fixture.bundleId, p_organization_id: NIKE_ORG_ID })
  })
})
