import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

/**
 * Qualificar uma lead (MQL/SQL) no separador Percurso tem de actualizar o ecra
 * sem F5.
 *
 * O LeadQualificationCard ja oferecia `onQualificationUpdated`, mas ninguem o
 * ligava: o LeadJourneyTab montava-o sem o callback, por isso a gravacao
 * chegava a base de dados e o ecra ficava com a classificacao antiga ate a
 * pagina ser recarregada. O aviso passa agora por LeadJourneyTab ate
 * `handleLeadQualificationUpdated` em AnewLeads.tsx, que reutiliza
 * `handleLeadDialogUpdate` (sem payload — a qualificacao nao altera a
 * identidade da entidade) e por isso refresca a linha da lead e, via
 * refreshSingleLead -> loadStatusCounts, invalida os queryKeys do painel.
 *
 * Escreve APENAS na organizacao `nike`. O spec aborta se a organizacao activa
 * em localStorage for outra.
 *
 * Regra critica deste spec: entre o clique de qualificacao e a verificacao da
 * linha NAO pode haver navegacao, reload nem alteracao do termo de pesquisa —
 * qualquer um deles re-le a lista do servidor e mascarava o defeito.
 */
const NIKE_ORG_ID = process.env.E2E_ORG_ID || 'b6ffce4f-f630-4933-833a-008649757a33'

test.describe.configure({ timeout: 240_000 })

const SUFFIX = `Qual${Date.now().toString().slice(-8)}`
const FIRST = 'Quali'
const LAST = `Percurso${SUFFIX}`
const DISPLAY = `${FIRST} ${LAST}`

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
const leadRow = (page: Page) => page.locator('table tbody tr').filter({ hasText: SUFFIX }).first()
const detailsDialog = (page: Page) => page.locator('[role="dialog"]').last()

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

  const email = `quali.${SUFFIX.toLowerCase()}@example.test`
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

  // O badge MQL/SQL da linha da lista (LeadTableRow.tsx:285) so e renderizado
  // quando `status === "qualified"`, por isso a fixture nasce ja qualificada.
  const { error: statusError } = await sb.rpc('rpc_update_lead', {
    p_lead_id: leadId,
    p_field_values: { first_name: FIRST, last_name: LAST, email, phone: '912345678' },
    p_status: 'qualified',
    p_source: null,
    p_notes: null,
    p_assigned_to: null,
    p_status_changed: true,
    p_workflow_stage_id: null,
    p_display_name: null,
    p_first_name: null,
    p_last_name: null,
    p_qualification_type: null,
    p_qualification_changed: false,
  })
  expect(statusError, 'colocar a fixture em estado qualificada').toBeNull()

  const { data: row } = await sb
    .from('anew_leads')
    .select('organization_id, status, qualification_type')
    .eq('id', leadId)
    .single()
  expect(row?.organization_id, 'a fixture tem de ficar na organizacao nike').toBe(NIKE_ORG_ID)
  expect(row?.status, 'fixture qualificada').toBe('qualified')
  expect(row?.qualification_type, 'fixture comeca sem classificacao').toBeNull()
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

/** Filtra a lista ate restar so a fixture. Feito ANTES de qualificar. */
async function isolateFixtureRow(page: Page) {
  // O input e controlado e so aplica o termo depois de 400ms de debounce; num
  // arranque frio houve teclas perdidas antes da hidratacao, por isso o termo e
  // reposto enquanto a lista nao ficar reduzida a fixture.
  await expect
    .poll(
      async () => {
        if ((await searchInput(page).inputValue()) !== SUFFIX) {
          await searchInput(page).fill(SUFFIX)
        }
        return page.locator('table tbody tr').count()
      },
      { timeout: 90_000, intervals: [1000], message: 'a pesquisa tem de isolar a fixture' },
    )
    .toBe(1)
  await expect(leadRow(page)).toBeVisible({ timeout: 30_000 })
}

/** Abre o dialogo de detalhes clicando na linha — sem navegacao. */
async function openDetailsFromRow(page: Page) {
  await leadRow(page).click()
  const dialog = detailsDialog(page)
  await dialog.waitFor({ timeout: 30_000 })
  await dialog.locator('[role="tab"]').filter({ hasText: /Percurso/ }).click({ timeout: 30_000 })
  return dialog
}

async function closeDetails(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 20_000 })
}

/**
 * Badge de qualificacao dentro da linha da lista (a par do badge de estado).
 * "MQL"/"SQL" isolados so aparecem nesse badge, e a sessao de teste pode correr
 * em PT ou EN — por isso nao se filtra pelo rotulo do estado.
 */
function rowQualificationBadge(page: Page) {
  return leadRow(page).getByText(/^(MQL|SQL)$/)
}

/** "X de Y MQL viraram SQL" no cartao de qualificacao do painel. */
async function readMqlCounters(page: Page): Promise<{ converted: number; total: number }> {
  const text = await page
    .getByText(/\d+ de \d+ MQL viraram SQL/)
    .first()
    .innerText({ timeout: 60_000 })
  const match = text.match(/(\d+) de (\d+) MQL viraram SQL/)
  expect(match, 'cartao MQL -> SQL tem de estar visivel').not.toBeNull()
  return { converted: Number(match![1]), total: Number(match![2]) }
}

const tab = (page: Page, name: RegExp) =>
  page.locator('[role="tablist"] [role="tab"]').filter({ hasText: name }).first()

test.describe('qualificacao MQL/SQL actualiza o ecra sem recarregar', () => {
  test('classificar no Percurso actualiza a linha da lista e os contadores do painel', async ({ page }) => {
    await openLeadsInNike(page)

    // Baseline dos contadores de qualificacao: entrar no Painel popula a cache
    // react-query (staleTime 60s). Sem invalidacao, voltar ao Painel dentro
    // desse minuto serviria o valor antigo — e o que este teste tem de apanhar.
    await tab(page, /Painel|Dashboard/).click()
    const before = await readMqlCounters(page)

    await tab(page, /Lista|List/).click()
    await isolateFixtureRow(page)

    // Estado inicial: linha qualificada (senao o badge nem seria renderizado)
    // e ainda sem classificacao.
    await expect(leadRow(page)).toContainText(/Qualificada|Qualified/, { timeout: 30_000 })
    await expect(rowQualificationBadge(page)).toHaveCount(0)

    // --- Cenario: classificar como MQL ---------------------------------
    const dialog = await openDetailsFromRow(page)
    await dialog.locator('button').filter({ hasText: /^MQL$/ }).first().click()
    await expect(dialog.getByText(/Qualificação comercial/)).toBeVisible()
    await closeDetails(page)

    // Sem reload, sem re-pesquisa: a linha tem de mostrar MQL.
    await expect(rowQualificationBadge(page)).toHaveText('MQL', { timeout: 30_000 })

    // --- Cenario: promover a SQL ---------------------------------------
    const dialog2 = await openDetailsFromRow(page)
    await dialog2.locator('button').filter({ hasText: /Promover a SQL/ }).first().click()
    await closeDetails(page)

    await expect(rowQualificationBadge(page)).toHaveText('SQL', { timeout: 30_000 })

    // --- Cenario: contadores de qualificacao do painel ------------------
    await tab(page, /Painel|Dashboard/).click()
    await expect
      .poll(async () => (await readMqlCounters(page)).total, { timeout: 60_000 })
      .toBeGreaterThan(before.total)
    const after = await readMqlCounters(page)
    expect(after.converted, 'a promocao a SQL tem de contar como conversao').toBeGreaterThan(
      before.converted,
    )

    // A base confirma o estado final (a UI nao esta apenas optimista).
    const { data: row } = await sb
      .from('anew_leads')
      .select('qualification_type, qualified_at')
      .eq('id', leadId)
      .single()
    expect(row?.qualification_type).toBe('sql')
    expect(row?.qualified_at).not.toBeNull()
  })

  test('nao regrediu: editar nome, mudar estado e atribuir comercial continuam sem F5', async ({ page }) => {
    await openLeadsInNike(page)
    await isolateFixtureRow(page)

    const newLast = `Editado${SUFFIX}`

    await leadRow(page).click()
    const details = detailsDialog(page)
    await details.waitFor({ timeout: 30_000 })
    await details
      .locator('button:not([role="tab"])')
      .filter({ hasText: /^\s*Editar\s*$/i })
      .first()
      .click({ timeout: 30_000 })

    const edit = page.locator('[role="dialog"]').last()
    await edit.locator('label:has-text("Status")').waitFor({ timeout: 30_000 })

    // Nome (identidade da entidade — o caso que exige invalidateEntities).
    const lastNameInput = edit
      .locator('label:has-text("Apelido"), label:has-text("Last Name")')
      .first()
      .locator('xpath=following-sibling::input')
    await lastNameInput.fill(newLast)

    // Estado.
    await edit.locator('label:has-text("Status")').locator('xpath=following-sibling::button').click()
    await page.locator('[role="option"]').filter({ hasText: 'Contactada' }).first().click()

    // Atribuir comercial: primeiro utilizador real da lista.
    await edit
      .locator('label:has-text("Atribuído a")')
      .locator('xpath=following-sibling::button')
      .click()
    const assignee = page.locator('[role="option"]').filter({ hasNotText: 'Não atribuído' }).first()
    const assigneeName = (await assignee.innerText()).trim()
    await assignee.click()

    await edit
      .locator('button')
      .filter({ hasText: /^\s*(Guardar\s+Altera.{0,3}es|Save\s+Changes)\s*$/i })
      .last()
      .click()

    await closeDetails(page)

    // Sem reload: a linha reflecte nome, estado e responsavel novos.
    await expect(leadRow(page)).toContainText(newLast, { timeout: 30_000 })
    await expect(leadRow(page)).toContainText(/Contactada|Contacted/, { timeout: 30_000 })
    if (assigneeName) {
      await expect(leadRow(page)).toContainText(assigneeName.split(/\s+/)[0], { timeout: 30_000 })
    }
  })
})
