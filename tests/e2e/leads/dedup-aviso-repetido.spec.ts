import { test, expect, type Page, type Locator } from '@playwright/test'

/**
 * Segunda ronda de prova ao vivo, depois de duas correccoes:
 *
 *  A) `form_submissions` passou a ser legivel por quem ve as leads da
 *     organizacao (migration 20261116070000) -> o separador "Formularios" da
 *     ficha da lead tem de mostrar a submissao, e a fila de submissoes
 *     pendentes tem de deixar de estar vazia;
 *  C) a segunda submissao da mesma pessoa deixou de ser engolida pelo indice
 *     unico `notifications_dedup`: a notificacao que ja existia e reposta no
 *     sino, POR LER, com a contagem na mensagem.
 *
 * Escreve SO na organizacao nike.
 */

const NIKE_ORG_ID = process.env.E2E_ORG_ID || 'b6ffce4f-f630-4933-833a-008649757a33'
const FORM_ID = process.env.E2E_DEDUP_FORM_ID || '11111111-2222-4333-8444-555555550001'
const DEDUP_EMAIL = process.env.E2E_DEDUP_EMAIL
const DEDUP_PHONE = process.env.E2E_DEDUP_PHONE
const LEAD_ID = process.env.E2E_DEDUP_LEAD_ID
const SUBMISSION_CAMPAIGN_NAME = process.env.E2E_DEDUP_CAMPAIGN_NAME || 'E2E Tracking Test Campaign'
const SUBMISSION_ID = process.env.E2E_DEDUP_SUBMISSION_ID || '9ca113ad-4aa9-4773-a3b3-ae143ee038ab'
// As tres submissoes pendentes da nike, identificadas pelo email que trazem.
const EMAIL_LEAD = process.env.E2E_DEDUP_EMAIL || ''
const EMAIL_CLIENTE = process.env.E2E_PEND_EMAIL_CLIENTE || 'teste-bug3-verify-unique@example.com'
const EMAIL_CONTACTO = process.env.E2E_PEND_EMAIL_CONTACTO || 'teste.e2e.reschedulefinal.20260730@example.com'

/** Contagem lida do sino, para se poder exigir que SOBE a cada submissao. */
function lerContagem(texto: string): number | null {
  const m = texto.match(/\((\d+)\.ª submiss/i)
  return m ? Number(m[1]) : null
}
let contagemAntes: number | null = null
let contagem2a: number | null = null

test.describe.configure({ timeout: 240_000 })

test.beforeAll(() => {
  if (!DEDUP_EMAIL || !DEDUP_PHONE || !LEAD_ID) {
    throw new Error('Faltam E2E_DEDUP_EMAIL, E2E_DEDUP_PHONE e E2E_DEDUP_LEAD_ID no ambiente.')
  }
})

async function entrarNaNike(page: Page) {
  await page.goto('/home', { waitUntil: 'domcontentloaded' })
  await page.evaluate((id) => localStorage.setItem('activeCompanyId', id), NIKE_ORG_ID)
  await page.goto('/leads', { waitUntil: 'domcontentloaded' })
  const active = await page.evaluate(() => localStorage.getItem('activeCompanyId'))
  expect(active, 'a organizacao activa tem de ser a nike').toBe(NIKE_ORG_ID)
}

/** Abre o sino e devolve o cartao da notificacao de submissao associada. */
async function abrirSino(page: Page): Promise<{ linha: Locator; cartao: Locator }> {
  const sino = page.locator('header button, [data-sidebar] button')
    .filter({ has: page.locator('svg.lucide-bell') }).first()
  await sino.waitFor({ timeout: 60_000 })
  await sino.click()
  await page.getByText(/Notifica/i).first().waitFor({ timeout: 15_000 })
  const linha = page.getByText(/voltou a submeter o formul/i).first()
  await expect(linha).toBeVisible({ timeout: 30_000 })
  const cartao = linha.locator('xpath=ancestor::div[contains(@class,"cursor-pointer")][1]')
  return { linha, cartao }
}

/** Lido = o cartao leva `opacity-60`; por ler = nao leva. */
async function estaPorLer(cartao: Locator): Promise<boolean> {
  const classes = (await cartao.getAttribute('class')) || ''
  return !classes.includes('opacity-60')
}

async function submeterFormularioPublico(page: Page, etiqueta: string) {
  await page.goto('/form?form_id=' + FORM_ID, { waitUntil: 'domcontentloaded' })
  const nome = page.getByLabel(/Primeiro Nome/i)
  await nome.waitFor({ timeout: 60_000 })
  await nome.fill('Sino')
  await page.getByLabel(/Apelido/i).fill('Teste')
  await page.getByLabel(/Email/i).fill(DEDUP_EMAIL!)
  await page.getByLabel(/Telefone/i).fill(DEDUP_PHONE!)
  await page.getByRole('button', { name: /Enviar|Submeter|Continuar/i }).first().click()
  await expect(page.getByText(/Obrigado|submetido com sucesso/i).first())
    .toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: 'test-results/repetido-' + etiqueta + '-submetido.png' })
}

// --- Estado do sino ANTES de nova submissao -------------------------------
test('sino: estado da notificacao antes da nova submissao', async ({ page }) => {
  await entrarNaNike(page)
  const { cartao } = await abrirSino(page)
  const porLer = await estaPorLer(cartao)
  console.log('=== SINO ANTES ===\nPor ler: ' + porLer + '\n' + (await cartao.innerText()) + '\n=== FIM ===')
  await page.screenshot({ path: 'test-results/repetido-00-sino-antes.png' })
})

// --- 2.a submissao, como visitante ----------------------------------------
test.describe('2.a submissao', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  test('visitante submete o formulario publico outra vez', async ({ page }) => {
    await submeterFormularioPublico(page, '01-segunda')
  })
})

test('sino: a notificacao voltou, por ler, com a contagem', async ({ page }) => {
  await entrarNaNike(page)
  const { cartao } = await abrirSino(page)
  const texto = await cartao.innerText()
  const porLer = await estaPorLer(cartao)
  console.log('=== SINO DEPOIS DA 2a ===\nPor ler: ' + porLer + '\n' + texto + '\n=== FIM ===')
  await page.screenshot({ path: 'test-results/repetido-02-sino-2a.png' })
  expect(porLer, 'a notificacao tem de voltar a ficar POR LER').toBe(true)
  contagem2a = lerContagem(texto)
  expect(contagem2a, 'a mensagem tem de trazer a contagem de submissoes').not.toBeNull()
  expect(contagem2a!, 'a contagem tem de subir').toBeGreaterThan(contagemAntes ?? 1)
})

// --- 3.a submissao ---------------------------------------------------------
test.describe('3.a submissao', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  test('visitante submete o formulario publico uma terceira vez', async ({ page }) => {
    await submeterFormularioPublico(page, '03-terceira')
  })
})

test('sino: a contagem sobe para a 3.a submissao', async ({ page }) => {
  await entrarNaNike(page)
  const { cartao } = await abrirSino(page)
  const texto = await cartao.innerText()
  const porLer = await estaPorLer(cartao)
  console.log('=== SINO DEPOIS DA 3a ===\nPor ler: ' + porLer + '\n' + texto + '\n=== FIM ===')
  await page.screenshot({ path: 'test-results/repetido-04-sino-3a.png' })
  expect(porLer).toBe(true)
  const contagem3a = lerContagem(texto)
  expect(contagem3a, 'a mensagem tem de trazer a contagem de submissoes').not.toBeNull()
  expect(contagem3a!, 'a contagem tem de voltar a subir').toBeGreaterThan(contagem2a!)
})

// --- A) separador Formularios ---------------------------------------------
test('A: o separador Formularios mostra a submissao', async ({ page }) => {
  await entrarNaNike(page)
  await page.goto('/leads?open=' + LEAD_ID, { waitUntil: 'domcontentloaded' })
  const separador = page.getByRole('tab', { name: /Formul/i }).first()
  await separador.waitFor({ timeout: 60_000 })
  await separador.click()

  const ficha = page.getByRole('dialog').first()
  const cartaoSubmissao = ficha.getByText(SUBMISSION_CAMPAIGN_NAME, { exact: false }).first()
  await expect(cartaoSubmissao).toBeVisible({ timeout: 30_000 })

  console.log('=== SEPARADOR FORMULARIOS ===\n' + (await separador.innerText()).trim())
  console.log(await cartaoSubmissao.locator('xpath=ancestor::div[3]').innerText())
  console.log('=== FIM ===')
  await page.screenshot({ path: 'test-results/repetido-05-separador-formularios.png', fullPage: true })
})

// --- B) fila de submissoes pendentes --------------------------------------
//
// Duas coisas distintas, e sao mesmo distintas: (1) o utilizador consegue LER
// as submissoes da organizacao (a politica nova), e (2) a PAGINA deixa-o
// entrar (a permissao de rota). Testar so a pagina confunde as duas.
test('B: submissoes pendentes - ambito e leitura', async ({ page }) => {
  // Os cabecalhos (apikey publica e Bearer da sessao) vao em qualquer pedido
  // REST que a aplicacao faz; leem-se de la, em vez de os escrever no ficheiro
  // ou de adivinhar onde e que a biblioteca guarda a sessao.
  let apikey: string | null = null
  let auth: string | null = null
  page.on('request', (r) => {
    if (auth) return
    if (!r.url().includes('/rest/v1/')) return
    const h = r.headers()
    if (h['authorization']) { apikey = h['apikey'] ?? null; auth = h['authorization'] }
  })

  await entrarNaNike(page)
  await page.waitForTimeout(6000)
  expect(auth, 'nao se apanharam os cabecalhos dos pedidos da aplicacao').toBeTruthy()

  const chamar = async (url: string, init: Record<string, unknown> = {}) =>
    page.evaluate(async ([u, key, tok, extra]) => {
      const opcoes = JSON.parse(extra as string) as { method?: string; body?: string }
      const r = await fetch(u as string, {
        method: opcoes.method || 'GET',
        headers: { apikey: key as string, Authorization: tok as string, 'Content-Type': 'application/json' },
        body: opcoes.body,
      })
      return { status: r.status, body: (await r.text()).slice(0, 2000) }
    }, [url, apikey as unknown as string, auth as unknown as string, JSON.stringify(init)])

  const REST = 'https://tzbfgwpckrfbqcolqxtm.supabase.co/rest/v1'

  // 1. Que ambito tem este utilizador nas leads desta organizacao?
  const ambito = await chamar(REST + '/rpc/resolve_contact_access_context', {
    method: 'POST',
    body: JSON.stringify({ p_org_id: NIKE_ORG_ID, p_requested_scope: 'ORG', p_permission_code: 'leads.view' }),
  })
  console.log('=== AMBITO (leads.view na nike) === ' + JSON.stringify(ambito) + ' === FIM ===')

  // 2. Consegue LER as submissoes pendentes da organizacao?
  const leitura = await chamar(
    REST + '/form_submissions?select=id,target_type,target_id,entity_id,created_at'
    + '&organization_id=eq.' + NIKE_ORG_ID + '&resolved_at=is.null&order=created_at.desc',
  )
  console.log('=== LEITURA DAS SUBMISSOES PENDENTES DA NIKE === ' + JSON.stringify(leitura) + ' === FIM ===')
  expect(leitura.status).toBe(200)
  expect(leitura.body, 'a submissao da Sino Teste tem de ser legivel').toContain(SUBMISSION_ID)
  // O ramo 'contact' saiu da politica de proposito (migration 20261116090000):
  // o modulo de Contactos nao existe no produto.
  expect(leitura.body, 'submissoes de contacto nao devem ser visiveis').not.toContain('contact')

  await page.screenshot({ path: 'test-results/repetido-06-leitura-pendentes.png' })
})

// A PAGINA e uma segunda porta, independente da politica de leitura: a rota
// exige `platform.pending_submissions.view`. Este teste fica separado de
// proposito -- se ficasse junto, um vermelho da rota passaria por vermelho da
// politica, que e outra coisa.
test('B2: a pagina de submissoes pendentes abre e mostra o que deve', async ({ page }) => {
  await entrarNaNike(page)
  await page.goto('/leads/pending-submissions', { waitUntil: 'domcontentloaded' })

  // 1. A porta abriu?
  await expect(page.getByRole('heading', { name: /Submiss.es de formul.rio pendentes/i }))
    .toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/Access Denied/i)).toHaveCount(0)

  // A lista carrega depois do primeiro pintar: esperar por ela antes de ler o
  // ecra, senao fotografa-se o estado a meio ("Pendentes 0") e nao o resultado.
  await expect(page.getByText(EMAIL_LEAD, { exact: false }).first()).toBeVisible({ timeout: 60_000 })

  const corpo = await page.locator('body').first().innerText()
  console.log('=== PAGINA /leads/pending-submissions ===')
  console.log(corpo.slice(0, 3000))
  console.log('=== FIM ===')
  await page.screenshot({ path: 'test-results/repetido-07-pagina-pendentes.png', fullPage: true })

  // 2. A submissao ligada a uma LEAD aparece.
  await expect(page.getByText(EMAIL_LEAD, { exact: false }).first()).toBeVisible({ timeout: 30_000 })
  // 3. A ligada a um CLIENTE tambem.
  await expect(page.getByText(EMAIL_CLIENTE, { exact: false }).first()).toBeVisible({ timeout: 30_000 })
  // 4. A ligada a um CONTACTO nao aparece - o ramo saiu da politica de proposito.
  await expect(page.getByText(EMAIL_CONTACTO, { exact: false })).toHaveCount(0)
})

// A troca de papel na nike nao pode ter partido mais nada para este utilizador.
test('B3: nada regrediu na nike depois da mexida no papel', async ({ page }) => {
  await entrarNaNike(page)

  // 1. As Leads abrem COM dados. Primeiro isto: so depois de a pagina montar
  // e que faz sentido ler o menu lateral (senao apanha-se o spinner).
  await expect(page.getByRole('heading', { name: /^Leads$/i }).first()).toBeVisible({ timeout: 60_000 })
  const total = page.getByText(/Total:\s*[1-9]\d*/).first()
  await expect(total).toBeVisible({ timeout: 90_000 })
  console.log('=== LEADS === ' + (await total.innerText()).replace(/\s+/g, ' ') + ' === FIM ===')
  await page.screenshot({ path: 'test-results/repetido-08-leads.png', fullPage: true })

  // 2. Seletor de organizacao: o papel mostrado nao mudou.
  const papel = await page.getByText(/super_admin/i).first().innerText()
  console.log('=== SELETOR DE ORGANIZACAO === ' + papel + ' === FIM ===')
  expect(papel.toLowerCase()).toContain('super_admin')

  // 3. Menu lateral: o painel do modulo abre e traz as entradas. A barra e so
  // de icones (botoes, nao <a>); o painel com os nomes so aparece ao clique.
  const rail = page.locator('aside[data-app-sidebar]').first()
  await expect(rail).toBeVisible({ timeout: 30_000 })
  const entradaMenu = page.getByText('Pending Submissions', { exact: true }).first()
  const botoes = rail.locator('button')
  const n = await botoes.count()
  for (let k = 0; k < n && !(await entradaMenu.isVisible().catch(() => false)); k++) {
    await botoes.nth(k).click({ timeout: 5_000 }).catch(() => {})
    await page.waitForTimeout(500)
  }
  await expect(entradaMenu, 'o painel do modulo CRM tem de abrir').toBeVisible({ timeout: 15_000 })
  const painel = entradaMenu.locator('xpath=ancestor::div[3]')
  const menu = (await painel.innerText()).replace(/\s+/g, ' ').trim()
  console.log('=== MENU LATERAL === ' + menu + ' === FIM ===')
  expect(menu).toMatch(/Leads/i)
  expect(menu).toMatch(/Clients|Clientes/i)
  await page.screenshot({ path: 'test-results/repetido-10-menu.png' })

  // 4. Clientes abre COM dados.
  await page.goto('/clients', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText(/Access Denied/i)).toHaveCount(0)
  const totalClientes = page.getByText(/Total:\s*[1-9]\d*/).first()
  await expect(totalClientes).toBeVisible({ timeout: 90_000 })
  // A lista carrega por partes; esperar que o total assente antes de o ler.
  let anterior = ''
  for (let k = 0; k < 10; k++) {
    await page.waitForTimeout(1500)
    const agora = (await totalClientes.innerText()).replace(/\s+/g, ' ')
    if (agora === anterior) break
    anterior = agora
  }
  console.log('=== CLIENTES === ' + anterior + ' === FIM ===')
  await page.screenshot({ path: 'test-results/repetido-09-clientes.png', fullPage: true })
})
