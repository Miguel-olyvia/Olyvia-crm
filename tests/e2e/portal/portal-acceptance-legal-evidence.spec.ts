import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import pg from 'pg'

/**
 * Prova permanente: aceitar uma proposta PELO PORTAL DO CLIENTE grava a
 * evidencia legal completa — IP real detectado do lado do servidor, data,
 * user agent — e, na cadeia seguinte, `signature_ip`/`signature_date`/
 * `signed_by_name` no contrato.
 *
 * Porque e que este spec existe
 * -----------------------------
 * Uma auditoria de produto afirmou que "a aceitacao de propostas grava sempre
 * um IP falso". E falso para o caminho do portal: `client-portal-action`
 * (~linha 239) ignora qualquer IP enviado pelo cliente ("do not trust
 * client-provided IP") e deriva-o de `x-forwarded-for`. Este teste fixa esse
 * comportamento para que deixe de depender de alguem se lembrar de verificar.
 *
 * A asercao central nao e "acceptance_ip nao e nulo" — isso passaria com um
 * valor inventado. O teste mede independentemente o IP publico real do browser
 * (api.ipify.org) e exige que `proposals.acceptance_ip` seja EXACTAMENTE esse
 * valor. So um IP genuinamente detectado no servidor consegue passar.
 *
 * Sobre o degrau do SMS
 * ---------------------
 * `sign_proposal`/`sign_contract` exigem um OTP verificado. O clique em
 * "Enviar codigo SMS" e feito na UI real e chama o `sms-otp` real, mas a
 * entrega do SMS a um telemovel nao pode ser automatizada. O numero da fixture
 * e propositadamente nao entregavel para que nenhum humano receba SMS; o
 * codigo e depois lido da base (o equivalente a "abrir a caixa de mensagens").
 * Verificacao do OTP e assinatura sao feitas por `fetch` a partir da propria
 * pagina autenticada do portal, para que os headers — e portanto o IP que o
 * servidor deteta — sejam os do browser real.
 *
 * Contas: o email da fixture e FIXO de proposito. A primeira execucao cria uma
 * conta de portal; todas as seguintes reutilizam-na (is_new_account: false).
 * O spec nunca acumula contas orfas.
 *
 * Escreve APENAS na organizacao `nike` — cada escrita e precedida de guarda.
 */

const NIKE_ORG_ID = process.env.E2E_ORG_ID || 'b6ffce4f-f630-4933-833a-008649757a33'

// Fixo: garante exactamente UMA conta de portal, para sempre.
const FIXTURE_FIRST = 'Portal'
const FIXTURE_LAST = 'EvidenciaLegal'
const FIXTURE_DISPLAY = `${FIXTURE_FIRST} ${FIXTURE_LAST}`
const FIXTURE_EMAIL = 'portal.evidencia.legal@example.test'
// Sem digitos significativos apos o prefixo -> SMSAPI rejeita, nenhum humano recebe SMS.
const UNDELIVERABLE_PHONE = '000000000'

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/
const RUN = Date.now().toString().slice(-8)
// Password que o modal de primeiro login passa a usar, distinta da temporaria.
const PORTAL_SET_PASSWORD = `PortalEvid${RUN}#Aa`

/**
 * OPT-IN OBRIGATORIO: correr com `E2E_PORTAL_ACCESS=1`.
 *
 * Este spec chama `create-client-portal-access`, que CRIA/REPOE uma conta de
 * portal e ENVIA as credenciais por email. Isso e destrutivo se apontado a uma
 * entidade com um endereco real — um reset de password nao e reversivel. Por
 * isso nunca corre por acidente numa execucao normal da suite.
 *
 * Salvaguardas quando corre:
 *  - O email da fixture e FIXO e esta em `@example.test`, um TLD reservado e
 *    nao encaminhavel (RFC 2606/6761): nenhuma caixa de correio real o recebe.
 *  - Sendo fixo, reutiliza sempre a mesma conta em vez de acumular orfas.
 *  - Nunca toca em acessos de portal pre-existentes de outras entidades.
 */
const PORTAL_ACCESS_ALLOWED = process.env.E2E_PORTAL_ACCESS === '1'

test.skip(
  !PORTAL_ACCESS_ALLOWED,
  'Requer E2E_PORTAL_ACCESS=1: cria uma conta de portal e envia credenciais por email.',
)

test.describe.configure({ timeout: 300_000 })

// Sessao limpa: o projecto `chromium` injecta a sessao do utilizador do CRM,
// mas aqui quem tem de estar autenticado e o CLIENTE do portal. Sem isto o
// guard do /auth redirecciona para /home e o login nunca acontece.
test.use({ storageState: { cookies: [], origins: [] } })

let sb: SupabaseClient
let entityId: string
let proposalId: string
let contractId: string | null = null
let portalPassword: string

function readEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
  )
}

/**
 * Le o codigo OTP directamente da base. `sms_otp_codes` e service-role-only
 * (e bem), por isso nem o utilizador do CRM nem o do portal o conseguem ler
 * via PostgREST — a ligacao directa e a unica via. Substitui a caixa de SMS.
 */
async function readOtpCode(referenceId: string, purpose: string): Promise<string> {
  const env = readEnv()
  const poolerUrl = readFileSync('supabase/.temp/pooler-url', 'utf8').trim()
  const host = poolerUrl.match(/@([^:]+):/)![1]
  const user = poolerUrl.match(/\/\/([^@]+)@/)![1]
  const password = env.DATABASE_URL.replace(/^postgresql:\/\/postgres:/, '').replace(/@.*$/, '')

  const client = new pg.Client({
    host,
    port: 5432,
    user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    const { rows } = await client.query(
      `select code from sms_otp_codes
        where reference_id = $1 and purpose = $2 and verified_at is null
        order by created_at desc limit 1`,
      [referenceId, purpose],
    )
    expect(rows[0]?.code, `o clique na UI tem de ter criado um OTP (${purpose})`).toBeTruthy()
    return rows[0].code as string
  } finally {
    await client.end()
  }
}

/**
 * Autentica no portal como o cliente e trata o modal de primeiro login.
 *
 * O modal tem de definir uma password DIFERENTE da temporaria (o Supabase
 * recusa "a nova password tem de ser diferente da anterior"), por isso troca
 * para `PORTAL_SET_PASSWORD` e actualiza `portalPassword` — sem isso o segundo
 * teste voltaria a tentar a temporaria, que ja nao e valida.
 */
async function loginAsPortalClient(page: Page) {
  await page.goto('/auth', { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').waitFor({ timeout: 60_000 })
  await page.locator('input[type="email"]').fill(FIXTURE_EMAIL)
  await page.locator('input[type="password"]').fill(portalPassword)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.toString().includes('/auth'), { timeout: 30_000 })

  // O modal e montado depois da navegacao, por isso tem de ser esperado — um
  // `count()` imediato devolve 0 e deixaria o modal aberto por cima da pagina,
  // escondendo todos os botoes do portal.
  const modal = page.locator('[role="dialog"]').filter({ hasText: 'Bem-vindo ao Portal' })
  const appeared = await modal
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false)

  if (appeared) {
    await modal.getByPlaceholder(/Mínimo 8 caracteres/i).fill(PORTAL_SET_PASSWORD)
    await modal.getByPlaceholder(/Repita a password/i).fill(PORTAL_SET_PASSWORD)
    await modal.getByRole('button', { name: /Alterar password/i }).click()
    await modal.waitFor({ state: 'hidden', timeout: 30_000 })
    portalPassword = PORTAL_SET_PASSWORD
  }
}

/**
 * Captura o JWT do portal a partir de um pedido real que a propria UI faz.
 * O cliente usa @supabase/ssr (sessao em cookie), por isso o token nao esta
 * acessivel em localStorage.
 */
function captureJwt(page: Page): () => string | null {
  let jwt: string | null = null
  page.on('request', (r) => {
    if (r.url().includes('/functions/v1/')) {
      const auth = r.headers()['authorization']
      if (auth) jwt = auth.replace('Bearer ', '')
    }
  })
  return () => jwt
}

/** Verifica o OTP e assina, por fetch a partir da pagina autenticada. */
async function verifyOtpAndSign(
  page: Page,
  jwt: string,
  otpCode: string,
  otp: { referenceId: string; referenceType: 'proposal' | 'contract'; purpose: string },
  sign: Record<string, unknown>,
) {
  const env = readEnv()
  return page.evaluate(
    async ({ code, otp, sign, url, anon, jwt }) => {
      const call = async (fn: string, body: unknown) => {
        const res = await fetch(`${url}/functions/v1/${fn}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${jwt}` },
          body: JSON.stringify(body),
        })
        return { status: res.status, body: (await res.text()).slice(0, 500) }
      }
      const verified = await call('sms-otp', {
        action: 'verify_otp',
        reference_id: otp.referenceId,
        reference_type: otp.referenceType,
        code,
        purpose: otp.purpose,
      })
      if (verified.status !== 200) return { verified, signed: null, userAgent: navigator.userAgent }
      const signed = await call('client-portal-action', sign)
      return { verified, signed, userAgent: navigator.userAgent }
    },
    {
      code: otpCode,
      otp,
      sign,
      url: env.VITE_SUPABASE_URL,
      anon: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      jwt,
    },
  )
}

test.beforeAll(async () => {
  // Segunda barreira: o `beforeAll` corre antes do skip dos testes, e e ele
  // que criaria a conta de portal. Sem este retorno o opt-in nao valia nada.
  if (!PORTAL_ACCESS_ALLOWED) return

  const env = readEnv()
  sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
  const { data: auth, error: loginError } = await sb.auth.signInWithPassword({
    email: process.env.TEST_EMAIL || 'carvalhomiguel319@gmail.com',
    password: process.env.TEST_PASSWORD || 'Migasdela007#',
  })
  expect(loginError, 'login do utilizador do CRM').toBeNull()

  const { data: me } = await sb.from('anew_users').select('id').eq('auth_user_id', auth.user!.id).maybeSingle()
  const createdBy = me?.id ?? null

  // Entidade reutilizavel: procurada pelo email fixo para nao duplicar contas.
  const { data: existingEmail } = await sb
    .from('anew_entity_emails')
    .select('entity_id')
    .eq('email', FIXTURE_EMAIL)
    .maybeSingle()

  if (existingEmail?.entity_id) {
    entityId = existingEmail.entity_id as string
  } else {
    const { data: newEntityId, error: entityError } = await sb.rpc('create_lead_entity_for_org', {
      p_organization_id: NIKE_ORG_ID,
      p_display_name: FIXTURE_DISPLAY,
      p_first_name: FIXTURE_FIRST,
      p_last_name: FIXTURE_LAST,
    })
    expect(entityError, 'criar a entidade da fixture').toBeNull()
    entityId = newEntityId as string
    await sb.from('anew_entity_emails').insert({
      entity_id: entityId, email: FIXTURE_EMAIL, email_type: 'work', is_primary: true, created_by: createdBy,
    })
    await sb.from('anew_entity_phones').insert({
      entity_id: entityId, phone_number: UNDELIVERABLE_PHONE, country_code: '+351',
      phone_type: 'work', is_primary: true, created_by: createdBy,
    })
  }

  // Uma proposta nova por execucao: uma proposta ja assinada nao volta a ser assinada.
  const { data: proposal, error: proposalError } = await sb.rpc('rpc_create_proposal', {
    p_proposal_data: {
      title: `E2E evidencia legal do portal ${RUN}`,
      description: 'Fixture automatica: prova de que a aceitacao pelo portal grava IP/data/nome.',
      value: 1230,
      probability: 50,
      deal_id: null,
      entity_id: entityId,
      valid_until: null,
      notes: null,
      stage_id: null,
      status: 'draft',
      organization_id: NIKE_ORG_ID,
      root_organization_id: NIKE_ORG_ID,
      template_id: null,
    },
    p_selected_quote_ids: [],
    p_inline_quotes: [],
    p_proposal_items: [],
    p_quote_entity_id: null,
  })
  expect(proposalError, 'criar a proposta da fixture').toBeNull()
  proposalId = (proposal as { id: string }).id

  // GUARDA: so a nike.
  expect(
    (proposal as { organization_id: string }).organization_id,
    'a fixture tem de nascer na organizacao nike',
  ).toBe(NIKE_ORG_ID)

  const { data: access, error: accessError } = await sb.functions.invoke('create-client-portal-access', {
    body: {
      document_type: 'proposal',
      document_id: proposalId,
      organization_id: NIKE_ORG_ID,
      login_url: 'http://localhost:8080/auth',
      force_new_password: true,
    },
  })
  expect(accessError, 'gerar o acesso ao portal').toBeNull()
  portalPassword = access.temp_password
  expect(portalPassword, 'o backend tem de devolver a password temporaria').toBeTruthy()
})

test.afterAll(async () => {
  // A entidade e a conta de portal sobrevivem de proposito (email fixo -> uma
  // unica conta). So os documentos desta execucao sao removidos.
  if (!PORTAL_ACCESS_ALLOWED) return
  if (contractId) {
    await sb
      .from('client_contracts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', contractId)
      .eq('organization_id', NIKE_ORG_ID)
  }
  if (proposalId) {
    await sb
      .from('proposals')
      .update({ deleted_at: new Date().toISOString(), is_deleted: true })
      .eq('id', proposalId)
      .eq('organization_id', NIKE_ORG_ID)
  }
})

test('aceitar a proposta pelo portal grava IP real, data e user agent', async ({ page }) => {
  const jwtOf = captureJwt(page)
  await loginAsPortalClient(page)

  await page.goto(`/client-portal/proposals/${proposalId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: /Enviar código SMS/i })).toBeVisible()

  // Medicao independente do IP publico real deste browser — o valor que a
  // base tera de conter para o teste passar.
  const realPublicIp = await page.evaluate(
    async () => (await (await fetch('https://api.ipify.org?format=json')).json()).ip,
  )
  expect(realPublicIp, 'IP publico real do browser').toMatch(IPV4)

  // Clique real na UI real: dispara o `sms-otp` de producao.
  await page.getByRole('button', { name: /Enviar código SMS/i }).click()
  await expect
    .poll(() => jwtOf(), { timeout: 30_000, message: 'a UI tem de fazer um pedido autenticado' })
    .toBeTruthy()

  const code = await readOtpCode(proposalId, 'proposal_signature')
  const result = await verifyOtpAndSign(
    page,
    jwtOf()!,
    code,
    { referenceId: proposalId, referenceType: 'proposal', purpose: 'proposal_signature' },
    { action: 'sign_proposal', proposal_id: proposalId, signature_image: 'OTP_SMS_VERIFIED', selected_quote_ids: [] },
  )

  expect(result.verified.status, `verificacao do OTP: ${result.verified.body}`).toBe(200)
  expect(result.signed?.status, `assinatura da proposta: ${result.signed?.body}`).toBe(200)

  const { data: row } = await sb
    .from('proposals')
    .select('organization_id, status, accepted_at, acceptance_ip, acceptance_user_agent')
    .eq('id', proposalId)
    .single()

  expect(row!.organization_id, 'a prova tem de vir da nike').toBe(NIKE_ORG_ID)
  expect(row!.status).toBe('accepted')
  expect(row!.accepted_at, 'data de aceitacao').toBeTruthy()

  // O nucleo da prova: o IP nao e nulo, nao e um placeholder, e e exactamente
  // o IP publico real do browser — logo foi detectado no servidor.
  expect(row!.acceptance_ip, 'acceptance_ip tem de estar preenchido').toBeTruthy()
  expect(row!.acceptance_ip).toMatch(IPV4)
  expect(row!.acceptance_ip).not.toBe('unknown')
  expect(row!.acceptance_ip, 'acceptance_ip tem de ser o IP publico real do browser').toBe(realPublicIp)
  expect(row!.acceptance_user_agent, 'user agent do cliente').toContain('Mozilla/5.0')

  const { data: contract } = await sb
    .from('client_contracts')
    .select('id, organization_id')
    .eq('proposal_id', proposalId)
    .is('deleted_at', null)
    .maybeSingle()
  if (contract) {
    expect(contract.organization_id, 'o contrato gerado tem de ficar na nike').toBe(NIKE_ORG_ID)
    contractId = contract.id as string
  }
})

test('assinar o contrato gerado pelo portal grava signature_ip, data e nome', async ({ page }) => {
  test.skip(!contractId, 'a aceitacao da proposta nao gerou contrato')

  // A UI do contrato so o mostra depois de o acesso ser gerado — o mesmo passo
  // que o comercial faz no CRM. Reutiliza a conta existente.
  const { error: accessError } = await sb.functions.invoke('create-client-portal-access', {
    body: {
      document_type: 'contract',
      document_id: contractId,
      organization_id: NIKE_ORG_ID,
      login_url: 'http://localhost:8080/auth',
      force_new_password: false,
    },
  })
  expect(accessError, 'gerar o acesso do contrato').toBeNull()

  const jwtOf = captureJwt(page)
  await loginAsPortalClient(page)

  await page.goto(`/client-portal/contracts/${contractId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: /Enviar código SMS/i })).toBeVisible()

  const realPublicIp = await page.evaluate(
    async () => (await (await fetch('https://api.ipify.org?format=json')).json()).ip,
  )

  await page.getByRole('button', { name: /Enviar código SMS/i }).click()
  await expect.poll(() => jwtOf(), { timeout: 30_000 }).toBeTruthy()

  const code = await readOtpCode(contractId!, 'contract_signature')
  const result = await verifyOtpAndSign(
    page,
    jwtOf()!,
    code,
    { referenceId: contractId!, referenceType: 'contract', purpose: 'contract_signature' },
    { action: 'sign_contract', contract_id: contractId, signature_image: 'OTP_SMS_VERIFIED' },
  )

  expect(result.verified.status, `verificacao do OTP: ${result.verified.body}`).toBe(200)
  expect(result.signed?.status, `assinatura do contrato: ${result.signed?.body}`).toBe(200)

  const { data: row } = await sb
    .from('client_contracts')
    .select('organization_id, status, signature_ip, signature_date, signed_by_name')
    .eq('id', contractId!)
    .single()

  expect(row!.organization_id, 'a prova tem de vir da nike').toBe(NIKE_ORG_ID)
  expect(row!.status).toBe('signed')
  expect(row!.signature_ip, 'signature_ip tem de ser o IP publico real do browser').toBe(realPublicIp)
  expect(row!.signature_date, 'data da assinatura').toBeTruthy()
  expect(row!.signed_by_name, 'nome de quem assinou').toBe(FIXTURE_DISPLAY)
})
