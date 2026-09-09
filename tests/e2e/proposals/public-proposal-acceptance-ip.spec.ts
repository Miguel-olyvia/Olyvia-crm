import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import pg from 'pg'

/**
 * Prova permanente: aceitar uma proposta pelo LINK PUBLICO grava o IP publico
 * REAL do browser em `proposals.acceptance_ip` — nunca a constante `"client"`,
 * nunca `"unknown"`, nunca qualquer outro valor de enchimento.
 *
 * O que estava mal
 * ---------------
 * `src/pages/PublicProposal.tsx` (handleDirectAccept) fazia o UPDATE a partir
 * do browser e escrevia literalmente `acceptance_ip: "client"`. O browser nao
 * consegue saber o seu proprio IP publico, por isso alguem pos la uma
 * constante. Um valor fixo num campo de auditoria e pior do que campo vazio:
 * quem le o registo nao distingue uma deteccao genuina de uma invencao.
 *
 * A escrita passou para a edge function `accept-proposal`, que deriva o IP dos
 * cabecalhos do pedido (ver `supabase/functions/_shared/clientIp.ts`) e chama
 * `accept_proposal_atomic`, autorizada pelo `public_token` da proposta.
 *
 * A asercao central NAO e "acceptance_ip nao e nulo" — isso passaria com um
 * valor inventado. Tal como o spec do portal, este mede independentemente o IP
 * publico real do browser (api.ipify.org) e exige que a coluna seja
 * EXACTAMENTE esse valor. So um IP genuinamente detectado no servidor passa.
 *
 * O cenario que fecha o buraco
 * ----------------------------
 * A fixture usa de proposito um template com `accept_verification_method =
 * 'none'` — o unico caminho que executava o codigo defeituoso. Um template com
 * verificacao desviaria para o fluxo de OTP e nao provaria nada.
 *
 * LIMITE CONHECIDO — o clique na UI nao e exercitado
 * --------------------------------------------------
 * `PublicProposal.tsx` NAO tem rota em `src/App.tsx`: nenhum `<Route>` o
 * monta, apesar de as 643 propostas da base terem `public_link_enabled = true`
 * e um `public_token`. A pagina e, neste build, inalcancavel. Por isso este
 * spec faz, a partir de uma pagina real no browser real, exactamente a mesma
 * chamada que `handleDirectAccept` faz — mesmo endpoint, mesmo corpo, mesmos
 * cabecalhos, logo o mesmo IP visto pelo servidor. O que NAO cobre e o clique
 * no botao; assim que a rota existir, este spec deve passar a navegar para ela.
 *
 * Escreve APENAS na organizacao `nike` — cada escrita e precedida de guarda.
 */

const NIKE_ORG_ID = process.env.E2E_ORG_ID || 'b6ffce4f-f630-4933-833a-008649757a33'
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/
// Valores de enchimento que ja existiram no codigo. Nenhum deles pode voltar.
const FORBIDDEN_IPS = ['client', 'unknown', 'UNVERIFIED_IP', '']

let proposalId: string
let publicToken: string
let db: pg.Client

function readEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
  )
}

async function connect(): Promise<pg.Client> {
  const env = readEnv()
  const poolerUrl = readFileSync('supabase/.temp/pooler-url', 'utf8').trim()
  const client = new pg.Client({
    host: poolerUrl.match(/@([^:]+):/)![1],
    port: 5432,
    user: poolerUrl.match(/\/\/([^@]+)@/)![1],
    password: env.DATABASE_URL.replace(/^postgresql:\/\/postgres:/, '').replace(/@.*$/, ''),
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  // `set_proposal_assigned_to` -> `resolve_proposal_commercial` recusa um INSERT
  // sem identidade ("Autenticacao necessaria"): so confia no `created_by`
  // recebido quando a chamada e servidor-para-servidor. A criacao da fixture E
  // servidor-para-servidor, por isso declara-o explicitamente em vez de
  // contornar o trigger.
  await client.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`)
  return client
}

test.describe.configure({ timeout: 180_000 })

test.beforeAll(async () => {
  db = await connect()

  // Template SEM verificacao — o caminho defeituoso. Se nao houver nenhum, o
  // cenario que interessa nao existe e o teste tem de falhar, nao adaptar-se.
  const { rows: templates } = await db.query(
    `select id, name, accept_verification_method from proposal_templates
      where organization_id = $1 and accept_verification_method = 'none' limit 1`,
    [NIKE_ORG_ID],
  )
  expect(templates[0], 'a nike tem de ter um template sem verificacao').toBeTruthy()
  expect(templates[0].accept_verification_method).toBe('none')

  const { rows: authors } = await db.query(
    `select created_by from proposals where organization_id = $1 and created_by is not null limit 1`,
    [NIKE_ORG_ID],
  )
  expect(authors[0], 'e preciso um autor existente na nike').toBeTruthy()

  const { rows } = await db.query(
    `insert into proposals
       (title, value, created_by, organization_id, root_organization_id, template_id,
        status, public_token, public_link_enabled)
     values ($1, 0, $2, $3, $3, $4, 'sent', $5, true)
     returning id, public_token, organization_id`,
    [
      `E2E acceptance_ip ${Date.now()}`,
      authors[0].created_by,
      NIKE_ORG_ID,
      templates[0].id,
      `e2e-ip-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    ],
  )

  // Guarda: nunca deixar uma escrita escapar para fora da nike.
  expect(rows[0].organization_id, 'a fixture tem de ficar na nike').toBe(NIKE_ORG_ID)
  proposalId = rows[0].id
  publicToken = rows[0].public_token
})

test.afterAll(async () => {
  if (db && proposalId) {
    await db.query(`delete from proposals where id = $1 and organization_id = $2`, [
      proposalId,
      NIKE_ORG_ID,
    ])
    await db.end()
  }
})

test('aceitar pelo link publico grava o IP publico real, nunca "client"', async ({ page }) => {
  const env = readEnv()

  // ── ANTES ────────────────────────────────────────────────────────────────
  const { rows: before } = await db.query(
    `select organization_id, status, accepted_at, acceptance_ip, acceptance_user_agent
       from proposals where id = $1`,
    [proposalId],
  )
  console.log('LINHA ANTES:', JSON.stringify(before[0], null, 2))
  expect(before[0].organization_id).toBe(NIKE_ORG_ID)
  expect(before[0].status).toBe('sent')
  expect(before[0].acceptance_ip, 'ainda nao houve aceitacao').toBeNull()

  await page.goto('/', { waitUntil: 'domcontentloaded' })

  // Medicao independente do IP publico real deste browser — o valor que a base
  // tera de conter para o teste passar. Feita a partir da propria pagina.
  const realPublicIp: string = await page.evaluate(
    async () => (await (await fetch('https://api.ipify.org?format=json')).json()).ip,
  )
  expect(realPublicIp, 'IP publico real do browser').toMatch(IPV4)

  // Exactamente a chamada que `handleDirectAccept` faz, a partir do browser
  // real, para que os cabecalhos — e portanto o IP que o servidor deteta —
  // sejam os do browser e nao os do runner.
  const result = await page.evaluate(
    async ({ url, key, id, token }) => {
      const res = await fetch(`${url}/functions/v1/accept-proposal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ proposal_id: id, public_token: token }),
      })
      return { status: res.status, body: await res.text() }
    },
    {
      url: env.VITE_SUPABASE_URL,
      key: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      id: proposalId,
      token: publicToken,
    },
  )

  expect(result.status, `aceitacao: ${result.body}`).toBe(200)

  // ── DEPOIS ───────────────────────────────────────────────────────────────
  const { rows: after } = await db.query(
    `select organization_id, status, accepted_at, acceptance_ip, acceptance_user_agent, stage_id
       from proposals where id = $1`,
    [proposalId],
  )
  console.log('LINHA DEPOIS:', JSON.stringify(after[0], null, 2))

  expect(after[0].organization_id, 'a prova tem de vir da nike').toBe(NIKE_ORG_ID)
  expect(after[0].status).toBe('accepted')
  expect(after[0].accepted_at, 'data de aceitacao').toBeTruthy()

  // O nucleo da prova.
  expect(after[0].acceptance_ip, 'acceptance_ip tem de estar preenchido').toBeTruthy()
  expect(after[0].acceptance_ip).toMatch(IPV4)
  for (const forbidden of FORBIDDEN_IPS) {
    expect(after[0].acceptance_ip).not.toBe(forbidden)
  }
  expect(
    after[0].acceptance_ip,
    'acceptance_ip tem de ser o IP publico real do browser — logo detectado no servidor',
  ).toBe(realPublicIp)

  expect(after[0].acceptance_user_agent, 'user agent do cliente').toContain('Mozilla/5.0')
})

test('um public_token errado nao aceita a proposta', async ({ page }) => {
  const env = readEnv()

  const { rows } = await db.query(
    `insert into proposals
       (title, value, created_by, organization_id, root_organization_id, status,
        public_token, public_link_enabled)
     select $1, 0, created_by, $2, $2, 'sent', $3, true
       from proposals where id = $4
     returning id, organization_id`,
    [`E2E token errado ${Date.now()}`, NIKE_ORG_ID, `e2e-bad-${Date.now()}`, proposalId],
  )
  expect(rows[0].organization_id, 'a fixture tem de ficar na nike').toBe(NIKE_ORG_ID)
  const victimId = rows[0].id

  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const result = await page.evaluate(
      async ({ url, key, id }) => {
        const res = await fetch(`${url}/functions/v1/accept-proposal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: key,
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({ proposal_id: id, public_token: 'token-que-nao-e-o-desta' }),
        })
        return { status: res.status, body: await res.text() }
      },
      { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_PUBLISHABLE_KEY, id: victimId },
    )

    expect(result.status, 'um token errado tem de ser recusado').toBe(400)

    const { rows: unchanged } = await db.query(
      `select status, acceptance_ip from proposals where id = $1`,
      [victimId],
    )
    expect(unchanged[0].status, 'a proposta nao pode ter sido aceite').toBe('sent')
    expect(unchanged[0].acceptance_ip).toBeNull()
  } finally {
    await db.query(`delete from proposals where id = $1 and organization_id = $2`, [
      victimId,
      NIKE_ORG_ID,
    ])
  }
})
