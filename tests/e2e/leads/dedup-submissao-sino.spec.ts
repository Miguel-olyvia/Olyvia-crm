import { test, expect, type Page } from '@playwright/test'

/**
 * Prova ao vivo, no browser, do caminho de deduplicacao de submissoes:
 *
 *  1. um visitante que JA EXISTE na organizacao volta a submeter o formulario
 *     publico -> nao nasce lead nova, a submissao liga-se a lead existente;
 *  2. o comercial responsavel ve a notificacao no SINO;
 *  3. a submissao aparece no separador "Formularios" da ficha da lead.
 *
 * Escreve SO na organizacao nike. O cenario (entidade + lead atribuida ao
 * utilizador de teste) e montado fora do teste; os identificadores chegam por
 * ambiente.
 */

const NIKE_ORG_ID = process.env.E2E_ORG_ID || 'b6ffce4f-f630-4933-833a-008649757a33'
const FORM_ID = process.env.E2E_DEDUP_FORM_ID || '11111111-2222-4333-8444-555555550001'
const DEDUP_EMAIL = process.env.E2E_DEDUP_EMAIL
const DEDUP_PHONE = process.env.E2E_DEDUP_PHONE
const LEAD_ID = process.env.E2E_DEDUP_LEAD_ID
const SUBMISSION_CAMPAIGN_NAME = process.env.E2E_DEDUP_CAMPAIGN_NAME || 'E2E Tracking Test Campaign'

test.describe.configure({ timeout: 180_000 })

test.beforeAll(() => {
  if (!DEDUP_EMAIL || !DEDUP_PHONE || !LEAD_ID) {
    throw new Error(
      'Faltam E2E_DEDUP_EMAIL, E2E_DEDUP_PHONE e E2E_DEDUP_LEAD_ID no ambiente.',
    )
  }
})

// --- 1. Submissao publica, sem sessao iniciada (como um visitante) ---------
test.describe('formulario publico', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('visitante que ja existe volta a submeter o formulario publico', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

    await page.goto(`/form?form_id=${FORM_ID}`, { waitUntil: 'domcontentloaded' })

    // O formulario carrega por get-form-data; espera pelo primeiro campo.
    const nome = page.getByLabel(/Primeiro Nome/i)
    await nome.waitFor({ timeout: 60_000 })

    await nome.fill('Sino')
    await page.getByLabel(/Apelido/i).fill('Teste')
    await page.getByLabel(/Email/i).fill(DEDUP_EMAIL!)
    await page.getByLabel(/Telefone/i).fill(DEDUP_PHONE!)

    await page.screenshot({ path: 'test-results/dedup-01-formulario-preenchido.png', fullPage: true })

    const submit = page.getByRole('button', { name: /Enviar|Submeter|Continuar/i }).first()
    await submit.click()

    // Ecra de sucesso do formulario publico.
    await expect(page.getByText(/Obrigado|submetido com sucesso/i).first())
      .toBeVisible({ timeout: 60_000 })
    await page.screenshot({ path: 'test-results/dedup-02-formulario-submetido.png', fullPage: true })

    expect(errors.join('\n')).not.toContain('Failed to record form submission')
  })
})

// --- 2 e 3. Aplicacao, autenticado como o comercial responsavel ------------
async function entrarNaNike(page: Page) {
  await page.goto('/home', { waitUntil: 'domcontentloaded' })
  await page.evaluate((id) => localStorage.setItem('activeCompanyId', id), NIKE_ORG_ID)
  await page.goto('/leads', { waitUntil: 'domcontentloaded' })
  const active = await page.evaluate(() => localStorage.getItem('activeCompanyId'))
  expect(active, 'a organizacao activa tem de ser a nike').toBe(NIKE_ORG_ID)
}

test('o sino mostra a notificacao da submissao associada', async ({ page }) => {
  await entrarNaNike(page)

  // O sino e o unico botao com o icone Bell no cabecalho.
  const sino = page.locator('header button, [data-sidebar] button').filter({ has: page.locator('svg.lucide-bell') }).first()
  await sino.waitFor({ timeout: 60_000 })
  await sino.click()

  const painel = page.getByText(/Notifica/i).first()
  await painel.waitFor({ timeout: 15_000 })

  const notificacao = page.getByText(/voltou a submeter o formul/i).first()
  await expect(notificacao).toBeVisible({ timeout: 30_000 })

  const textoExacto = await notificacao.evaluate((el) => (el.closest('div[class*="cursor"], div') as HTMLElement)?.innerText ?? el.textContent)
  console.log('=== TEXTO NO SINO ===\n' + textoExacto + '\n=== FIM ===')

  await page.screenshot({ path: 'test-results/dedup-03-sino.png', fullPage: false })

  // A ligacao leva a ficha da lead que ja existia.
  await notificacao.click()
  await page.waitForURL(/\/leads/, { timeout: 30_000 })
  await expect(page).toHaveURL(new RegExp(`open=${LEAD_ID}`))
  // A ficha da lead tem de abrir mesmo, nao basta o URL mudar.
  await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('tab', { name: /Formul/i }).first()).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: 'test-results/dedup-04-ligacao-da-notificacao.png', fullPage: false })
})

test('o separador Formularios da lead mostra a submissao nova', async ({ page }) => {
  await entrarNaNike(page)
  await page.goto(`/leads?open=${LEAD_ID}`, { waitUntil: 'domcontentloaded' })

  const separador = page.getByRole('tab', { name: /Formul/i }).first()
  await separador.waitFor({ timeout: 60_000 })
  const rotulo = (await separador.innerText()).trim()
  console.log('=== SEPARADOR FORMULARIOS ===\n' + rotulo + '\n=== FIM ===')
  await separador.click()

  // O cartao da SUBMISSAO distingue-se do cartao da propria lead por dois
  // sinais que so ele tem: o nome da campanha do formulario publico e o estado
  // de revisao. Procurar so pelo email daria verde com o cartao da lead, que
  // ja mostrava esses valores antes da submissao.
  await page.waitForTimeout(5000)
  await page.screenshot({ path: 'test-results/dedup-05-separador-formularios.png', fullPage: true })

  // Ambito: SO dentro da ficha da lead. Sem isto, o nome da campanha existe
  // tambem no filtro da listagem por tras do dialogo e o teste dava verde sem
  // o cartao da submissao aparecer.
  const ficha = page.getByRole('dialog').first()
  await expect(ficha.getByText(SUBMISSION_CAMPAIGN_NAME, { exact: false }).first())
    .toBeVisible({ timeout: 30_000 })
})
