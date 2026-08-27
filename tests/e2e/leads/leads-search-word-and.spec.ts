import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

/**
 * Pesquisa de leads: palavra a palavra, nao frase seguida.
 *
 * Antes, AnewLeads.tsx aplicava um unico `.ilike("search_text", "%<termo>%")`,
 * ou seja correspondencia de frase contigua: procurar "joao silva" nunca
 * encontrava "Joao Pedro Silva". O mesmo predicado existia no SQL, dentro de
 * get_scoped_leads_base, que alimenta get_lead_status_counts (os contadores de
 * estado no topo) — por isso a correccao tem dois lados e ambos sao verificados
 * aqui.
 *
 * Escreve APENAS na organizacao `nike`. O spec aborta se a organizacao activa
 * em localStorage for outra, e cria a lead com as mesmas RPCs que a aplicacao
 * usa (create_lead_entity_for_org + rpc_create_lead_manual), por isso o
 * search_text e preenchido pelo trigger real.
 */
const NIKE_ORG_ID = process.env.E2E_ORG_ID || 'b6ffce4f-f630-4933-833a-008649757a33'

// A pagina de leads mantem pedidos longos abertos; 30s por defeito e optimista.
test.describe.configure({ timeout: 240_000 })

const SUFFIX = `Wa${Date.now().toString().slice(-8)}`
const FIRST = 'Joao'
const LAST = `Pedro Silva${SUFFIX} ${SUFFIX}End`
const DISPLAY = `${FIRST} ${LAST}`
const UNIQUE = `Silva${SUFFIX}`.toLowerCase()

/** Duas palavras da mesma lead que NUNCA sao contiguas em search_text. */
const TERM_GAP = `${FIRST} ${UNIQUE}`
const TERM_REVERSED = `${UNIQUE} ${FIRST}`
const TERM_SINGLE = UNIQUE
const TERM_NO_MATCH = `zzz${SUFFIX}naoexiste`

let sb: SupabaseClient
let leadId: string

function readEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
  )
}

const searchInput = (page: Page) => page.getByPlaceholder(/pesquisar por nome/i)
const listCount = (page: Page) => page.getByText(/^\d+ leads$/)

test.beforeAll(async () => {
  const env = readEnv()
  sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
  const { error } = await sb.auth.signInWithPassword({
    email: process.env.TEST_EMAIL || 'carvalhomiguel319@gmail.com',
    password: process.env.TEST_PASSWORD || 'Migasdela007#',
  })
  expect(error, 'login da fixture').toBeNull()

  const { data: newEntityId, error: entityError } = await sb.rpc('create_lead_entity_for_org', {
    p_organization_id: NIKE_ORG_ID,
    p_display_name: DISPLAY,
    p_first_name: FIRST,
    p_last_name: LAST,
  })
  expect(entityError, 'criar entidade da lead').toBeNull()

  const email = `joao.${UNIQUE}@example.test`
  const { data: lead, error: leadError } = await sb.rpc('rpc_create_lead_manual', {
    p_organization_id: NIKE_ORG_ID,
    p_root_organization_id: NIKE_ORG_ID,
    p_entity_id: newEntityId as string,
    p_entity_created_here: true,
    p_field_values: { first_name: FIRST, last_name: LAST, email, phone: '912345678' },
    p_email: email,
    p_phone: '912345678',
    p_source: null,
    p_source_id: null,
    p_campaign_id: null,
    p_assigned_to: null,
  })
  expect(leadError, 'criar lead manual').toBeNull()
  leadId = (lead as { id: string }).id

  const { data: row } = await sb
    .from('anew_leads')
    .select('organization_id, search_text')
    .eq('id', leadId)
    .single()
  expect(row?.organization_id, 'a fixture tem de ficar na organizacao nike').toBe(NIKE_ORG_ID)

  // Sem isto o teste nao provava nada: se as duas palavras fossem contiguas em
  // search_text, o predicado antigo tambem as encontraria.
  const searchText = String(row?.search_text ?? '').toLowerCase()
  expect(searchText, 'as duas palavras nao podem ser contiguas').not.toContain(TERM_GAP.toLowerCase())
  expect(searchText, 'nem na ordem inversa').not.toContain(TERM_REVERSED.toLowerCase())
})

test.afterAll(async () => {
  if (leadId) await sb.rpc('soft_delete_entity_facet', { p_kind: 'lead', p_id: leadId })
})

async function openLeadsInNike(page: Page) {
  await page.goto('/home', { waitUntil: 'domcontentloaded' })
  await page.evaluate((id) => localStorage.setItem('activeCompanyId', id), NIKE_ORG_ID)
  await page.goto('/leads', { waitUntil: 'domcontentloaded' })
  await searchInput(page).waitFor({ timeout: 60_000 })

  const activeCompanyId = await page.evaluate(() => localStorage.getItem('activeCompanyId'))
  expect(activeCompanyId, 'recusa correr fora da organizacao nike').toBe(NIKE_ORG_ID)
}

/** Numero mostrado no cabecalho da lista ("N leads"). */
async function readListCount(page: Page): Promise<number> {
  const text = await listCount(page).first().innerText()
  return Number(text.replace(/\D/g, ''))
}

/**
 * Limpa o termo e espera que a lista volte ao conjunto nao filtrado.
 *
 * Sem este passo, um teste que espera 1 resultado a seguir a outro que ja
 * mostrava 1 resultado passaria antes de o novo termo chegar sequer ao
 * servidor — falso verde.
 */
async function resetSearch(page: Page) {
  await searchInput(page).fill('')
  await expect.poll(() => readListCount(page), { timeout: 60_000 }).toBeGreaterThan(1)
}

/**
 * Escreve o termo e espera pelo numero de resultados esperado.
 * O termo e debounced a 400ms e so conta a partir de 3 caracteres, por isso
 * espera-se pelo valor em vez de dormir um tempo fixo.
 */
async function searchExpecting(page: Page, term: string, expected: number) {
  await resetSearch(page)
  await searchInput(page).fill(term)
  await expect.poll(() => readListCount(page), { timeout: 60_000 }).toBe(expected)
}

/** Contador "Total" do topo da pagina, alimentado por get_lead_status_counts. */
async function readTotalCounter(page: Page): Promise<number> {
  return page.evaluate(() => {
    const label = Array.from(document.querySelectorAll('span')).find((s) =>
      /^Total:?$/i.test(s.textContent?.trim() || ''),
    )
    return Number(label?.nextElementSibling?.textContent?.trim() || 'NaN')
  })
}

test.describe('pesquisa de leads — palavra a palavra', () => {
  test('encontra a lead com palavras nao contiguas, em qualquer ordem', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(e.message))

    await openLeadsInNike(page)

    // 1. duas palavras nao contiguas — o caso que a frase seguida perdia
    await searchExpecting(page, TERM_GAP, 1)
    await expect(page.getByText(UNIQUE, { exact: false }).first()).toBeVisible({ timeout: 30_000 })

    // 2. o mesmo termo com as palavras trocadas
    await searchExpecting(page, TERM_REVERSED, 1)
    await expect(page.getByText(UNIQUE, { exact: false }).first()).toBeVisible({ timeout: 30_000 })

    // 3. uma so palavra continua a funcionar
    await searchExpecting(page, TERM_SINGLE, 1)
    await expect(page.getByText(UNIQUE, { exact: false }).first()).toBeVisible({ timeout: 30_000 })

    // 4. termo sem resultados: zero, sem erro
    await searchExpecting(page, TERM_NO_MATCH, 0)
    expect(pageErrors, 'um termo sem resultados nao pode rebentar a pagina').toEqual([])
  })

  test('a lista e o kanban devolvem o mesmo conjunto para o mesmo termo', async ({ page }) => {
    await openLeadsInNike(page)
    await searchExpecting(page, TERM_GAP, 1)
    await expect(page.getByText(UNIQUE, { exact: false }).first()).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: 'Kanban' }).click()
    await expect(page.getByText('A carregar kanban...')).toBeHidden({ timeout: 30_000 })
    await expect(page.getByText(UNIQUE, { exact: false }).first()).toBeVisible({ timeout: 30_000 })

    // O mesmo termo, agora sem correspondencia: o kanban tem de esvaziar como a lista.
    await searchInput(page).fill(TERM_NO_MATCH)
    await expect(page.getByText(UNIQUE, { exact: false })).toHaveCount(0, { timeout: 60_000 })
  })

  test('os contadores de estado acompanham o filtro', async ({ page }) => {
    await openLeadsInNike(page)

    // get_lead_status_counts vai buscar os numeros a get_scoped_leads_base, que
    // tinha o mesmo predicado de frase seguida: sem a migracao que a passou a
    // palavra a palavra, o Total ficava a 0 com a lead visivel na lista.
    await searchExpecting(page, TERM_GAP, 1)
    await expect
      .poll(() => readTotalCounter(page), { timeout: 60_000 })
      .toBe(1)

    await searchExpecting(page, TERM_NO_MATCH, 0)
    await expect
      .poll(() => readTotalCounter(page), { timeout: 60_000 })
      .toBe(0)
  })
})
