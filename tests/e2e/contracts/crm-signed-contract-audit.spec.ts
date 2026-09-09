import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'


/**
 * Credenciais dos testes, vindas do ambiente.
 *
 * Antes estavam escritas aqui em texto simples -- um email e uma palavra-passe
 * REAIS, em oito ficheiros versionados, ja no main. Uma credencial commitada
 * deixa de ser um segredo nesse instante: fica no historico mesmo depois de
 * apagada, e le-a quem tiver acesso ao repositorio.
 *
 * Falha alto se faltarem, em vez de tentar entrar com algo por omissao.
 */
function credenciaisDosTestes(): { email: string; password: string } {
  const email = process.env.TEST_EMAIL
  const password = process.env.TEST_PASSWORD
  if (!email || !password) {
    throw new Error(
      'Faltam as credenciais dos testes. Define TEST_EMAIL e TEST_PASSWORD no ' +
      'ambiente antes de correr a suite -- por exemplo num .env.local, ignorado pelo git.',
    )
  }
  return { email, password }
}
/**
 * Prova permanente: marcar um contrato como "assinado" PELO BOTAO DO CRM tem
 * de registar QUEM o fez e QUANDO, nas mesmas tres colunas ja usadas pela
 * assinatura via SMS OTP do representante (ContractBodyTab.tsx:307-311):
 * company_signature_date, company_signed_by_name, company_signed_by_id.
 *
 * O que estava mal
 * -----------------
 * `rpc_update_client_contract_status` (chamada por handleStatusChange em
 * ClientContracts.tsx:1296) mudava so `status` + `status_changed_by` +
 * `status_changed_at`. Nao escrevia nada nas colunas de prova de assinatura.
 * Resultado medido contra a base: 10 contratos "assinados" sem IP, sem nome,
 * sem data, sem imagem (todos na Mudelar, 29/05-24/07) — auditavelmente
 * inexistentes.
 *
 * O que este spec fixa
 * ---------------------
 * 1. Transitar para 'signed' (ou 'active') SEM assinatura previa do cliente
 *    escreve company_signature_date/company_signed_by_name/company_signed_by_id
 *    com o UTILIZADOR AUTENTICADO (nunca um parametro vindo do cliente) e NAO
 *    toca nas colunas do cliente (signature_ip/signature_date/signature_image/
 *    signed_by_name) — ficam vazias porque o cliente nao assinou de facto.
 * 2. Transitar para qualquer outro estado (draft/pending_signature/cancelled)
 *    nao escreve nada disto.
 * 3. Um contrato que ja tenha assinatura do cliente NAO e sobrescrito quando
 *    o CRM tambem transita para 'signed'.
 *
 * Escreve APENAS na organizacao `nike` — cada escrita e precedida de guarda.
 * Todas as fixtures desta suite estao marcadas com o prefixo
 * "OLYVIA-1f21dcb7-crm-sign" para nao colidir com outros agentes a correr
 * smoke tests na mesma org.
 */

const NIKE_ORG_ID = process.env.E2E_ORG_ID || 'b6ffce4f-f630-4933-833a-008649757a33'
const FIXTURE_TAG = 'OLYVIA-1f21dcb7-crm-sign'
const RUN = Date.now().toString().slice(-8)

function readEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
  )
}

let sb: SupabaseClient
let businessUserId: string
let businessUserName: string
let entityId: string
let proposalId: string
const createdContractIds: string[] = []

async function createDraftContract(notesSuffix: string): Promise<string> {
  const { data, error } = await sb.rpc('rpc_create_client_contract', {
    p_client_id: null,
    p_entity_id: entityId,
    p_organization_id: NIKE_ORG_ID,
    p_root_organization_id: NIKE_ORG_ID,
    p_proposal_id: proposalId,
    p_contract_template_id: null,
    p_total_value: 100,
    p_currency: 'EUR',
    p_start_date: null,
    p_end_date: null,
    p_notes: `${FIXTURE_TAG} ${RUN} ${notesSuffix}`,
    p_payment_terms: null,
    p_contract_body_html: null,
    p_final_body_html: null,
    p_prompt_values: null,
  })
  expect(error, `criar contrato de fixture (${notesSuffix})`).toBeNull()
  const id = data as string
  createdContractIds.push(id)
  return id
}

test.beforeAll(async () => {
  const env = readEnv()
  sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
  const { data: auth, error: loginError } = await sb.auth.signInWithPassword({
    email: credenciaisDosTestes().email,
    password: credenciaisDosTestes().password,
  })
  expect(loginError, 'login do utilizador do CRM').toBeNull()

  const { data: me } = await sb
    .from('anew_users')
    .select('id, name')
    .eq('auth_user_id', auth.user!.id)
    .maybeSingle()
  expect(me?.id, 'utilizador de teste tem de ter anew_users associado').toBeTruthy()
  businessUserId = me!.id as string
  businessUserName = me!.name as string

  // Entidade de fixture reutilizavel, identificada pelo nome fixo com o prefixo.
  const fixtureDisplayName = `${FIXTURE_TAG} Entidade`
  const { data: existing } = await sb
    .from('anew_entities')
    .select('id')
    .eq('display_name', fixtureDisplayName)
    .eq('organization_id', NIKE_ORG_ID)
    .maybeSingle()

  if (existing?.id) {
    entityId = existing.id as string
  } else {
    const { data: newEntityId, error: entityError } = await sb.rpc('create_lead_entity_for_org', {
      p_organization_id: NIKE_ORG_ID,
      p_display_name: fixtureDisplayName,
      p_first_name: FIXTURE_TAG,
      p_last_name: 'Entidade',
    })
    expect(entityError, 'criar a entidade de fixture').toBeNull()
    entityId = newEntityId as string
  }

  const { data: proposal, error: proposalError } = await sb.rpc('rpc_create_proposal', {
    p_proposal_data: {
      title: `${FIXTURE_TAG} proposta ${RUN}`,
      description: 'Fixture automatica do teste de assinatura interna do CRM.',
      value: 100,
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
  expect(proposalError, 'criar a proposta de fixture').toBeNull()
  proposalId = (proposal as { id: string }).id
  expect((proposal as { organization_id: string }).organization_id, 'a fixture tem de nascer na nike').toBe(
    NIKE_ORG_ID,
  )
})

test.afterAll(async () => {
  for (const id of createdContractIds) {
    await sb.from('client_contracts').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq(
      'organization_id',
      NIKE_ORG_ID,
    )
  }
  if (proposalId) {
    await sb
      .from('proposals')
      .update({ deleted_at: new Date().toISOString(), is_deleted: true })
      .eq('id', proposalId)
      .eq('organization_id', NIKE_ORG_ID)
  }
})

test('transitar para "signed" pelo CRM grava company_* com o utilizador autenticado e nao toca nas colunas do cliente', async () => {
  const contractId = await createDraftContract('signed-path')

  const { error } = await sb.rpc('rpc_update_client_contract_status', {
    p_id: contractId,
    p_status: 'signed',
  })
  expect(error, 'transicao para signed').toBeNull()

  const { data: row, error: readError } = await sb
    .from('client_contracts')
    .select(
      'organization_id, status, company_signature_date, company_signed_by_name, company_signed_by_id, ' +
        'signature_ip, signature_date, signature_image, signed_by_name',
    )
    .eq('id', contractId)
    .single()
  expect(readError).toBeNull()

  expect(row!.organization_id, 'a prova tem de vir da nike').toBe(NIKE_ORG_ID)
  expect(row!.status).toBe('signed')

  expect(row!.company_signature_date, 'company_signature_date tem de ficar preenchida').toBeTruthy()
  expect(row!.company_signed_by_id, 'company_signed_by_id tem de ser o utilizador autenticado').toBe(businessUserId)
  expect(row!.company_signed_by_name, 'company_signed_by_name tem de corresponder ao utilizador autenticado').toBe(
    businessUserName,
  )

  // As colunas do cliente tem de continuar vazias: o cliente nao assinou.
  expect(row!.signature_ip, 'signature_ip do cliente tem de ficar vazia').toBeNull()
  expect(row!.signature_date, 'signature_date do cliente tem de ficar vazia').toBeNull()
  expect(row!.signature_image, 'signature_image do cliente tem de ficar vazia').toBeNull()
  expect(row!.signed_by_name, 'signed_by_name do cliente tem de ficar vazio').toBeNull()
})

for (const otherStatus of ['draft', 'pending_signature', 'cancelled']) {
  test(`transitar para "${otherStatus}" pelo CRM NAO grava nada de assinatura`, async () => {
    const contractId = await createDraftContract(`other-status-${otherStatus}`)

    const { error } = await sb.rpc('rpc_update_client_contract_status', {
      p_id: contractId,
      p_status: otherStatus,
    })
    expect(error, `transicao para ${otherStatus}`).toBeNull()

    const { data: row } = await sb
      .from('client_contracts')
      .select('organization_id, status, company_signature_date, company_signed_by_name, company_signed_by_id')
      .eq('id', contractId)
      .single()

    expect(row!.organization_id).toBe(NIKE_ORG_ID)
    expect(row!.status).toBe(otherStatus)
    expect(row!.company_signature_date, `${otherStatus} nao deve preencher company_signature_date`).toBeNull()
    expect(row!.company_signed_by_name, `${otherStatus} nao deve preencher company_signed_by_name`).toBeNull()
    expect(row!.company_signed_by_id, `${otherStatus} nao deve preencher company_signed_by_id`).toBeNull()
  })
}

test('um contrato ja assinado pelo cliente NAO e sobrescrito quando o CRM tambem transita para "signed"', async () => {
  const contractId = await createDraftContract('already-client-signed')

  // Simula prova de assinatura do cliente ja existente (equivalente ao que o
  // portal grava). Escrita direta apenas para preparar o cenario do teste —
  // ainda dentro da fixture desta suite, na nike.
  const preexistingSignature = {
    signature_ip: '203.0.113.7',
    signature_date: new Date(Date.UTC(2026, 5, 1, 12, 0, 0)).toISOString(),
    signature_image: 'data:image/png;base64,FAKE_FOR_TEST_ONLY',
    signed_by_name: `${FIXTURE_TAG} Cliente Assinante`,
  }
  const { error: seedError } = await sb
    .from('client_contracts')
    .update(preexistingSignature)
    .eq('id', contractId)
    .eq('organization_id', NIKE_ORG_ID)
  expect(seedError, 'preparar assinatura do cliente pre-existente').toBeNull()

  const { error } = await sb.rpc('rpc_update_client_contract_status', {
    p_id: contractId,
    p_status: 'signed',
  })
  expect(error, 'transicao para signed sobre contrato ja assinado pelo cliente').toBeNull()

  const { data: row } = await sb
    .from('client_contracts')
    .select(
      'organization_id, status, company_signature_date, company_signed_by_name, company_signed_by_id, ' +
        'signature_ip, signature_date, signature_image, signed_by_name',
    )
    .eq('id', contractId)
    .single()

  expect(row!.organization_id).toBe(NIKE_ORG_ID)
  expect(row!.status).toBe('signed')

  // O CRM nao deve reivindicar autoria de uma assinatura que ja e do cliente.
  expect(row!.company_signature_date, 'nao deve preencher company_signature_date quando o cliente ja assinou').toBeNull()
  expect(row!.company_signed_by_name, 'nao deve preencher company_signed_by_name quando o cliente ja assinou').toBeNull()
  expect(row!.company_signed_by_id, 'nao deve preencher company_signed_by_id quando o cliente ja assinou').toBeNull()

  // As colunas do cliente continuam exatamente como estavam.
  expect(row!.signature_ip).toBe(preexistingSignature.signature_ip)
  expect(new Date(row!.signature_date as string).getTime()).toBe(
    new Date(preexistingSignature.signature_date).getTime(),
  )
  expect(row!.signature_image).toBe(preexistingSignature.signature_image)
  expect(row!.signed_by_name).toBe(preexistingSignature.signed_by_name)
})
