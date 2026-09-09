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
 * Prova permanente: rpc_update_client_contract_status tem de aplicar o MESMO
 * portao OWNED/TEAM/ORG que a interface ja aplica (canEditContract /
 * canActOnEntity em src/hooks/usePermissionScope.ts, chave client_contracts.edit),
 * e nao apenas "tem a permissao" + "a organizacao e visivel".
 *
 * Falha confirmada ao vivo antes desta migracao: um utilizador com scope
 * OWNED (ve so os proprios contratos na lista) conseguia, chamando a RPC
 * DIRETAMENTE, transitar o estado de um contrato de outra pessoa -- e ficava
 * registado como autor da transicao. E escrita com peso legal (assinatura),
 * nao apenas leitura indevida.
 *
 * Este spec cria os seus proprios utilizadores e fixtures, tudo na
 * organizacao nike, e limpa no fim (ban do auth user + rpc_delete_user +
 * remocao das linhas de equipa/scope/contratos/proposta criadas aqui).
 * Prefixo de fixture: "OLYVIA-1f21dcb7-scope-guard".
 */

const NIKE_ORG_ID = process.env.E2E_ORG_ID || 'b6ffce4f-f630-4933-833a-008649757a33'
const FIXTURE_TAG = 'OLYVIA-1f21dcb7-scope-guard'
const RUN = Date.now().toString().slice(-8)

// Existing nike fixtures reused on purpose (YAGNI — do not create new roles
// when one with the exact permission set already exists):
//   qa_e2e_contract_signer_owned_scope -> client_contracts.edit + .view,
//     no scope override -> defaults to OWNED (role_permissions has the code,
//     it is not a "binary"/supports_scope=false permission).
//   gestor_contratos -> client_contracts.create + .edit + .view + clients.view.
//     Used here for the TEAM-scope actors; a TEAM override is added on top
//     of the leader's own membership for this test only, and removed in
//     afterAll.
const OWNED_ROLE_ID = 'ba0beec3-66f7-4d4b-9b06-fb63e7d06b85'
const TEAM_CAPABLE_ROLE_ID = 'b10c6fb2-ed52-4173-bddb-ac59242f973f'

function readEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
  )
}

let env: Record<string, string>
let adminSb: SupabaseClient
let adminAuthUserId: string
let adminBusinessUserId: string

let ownedSb: SupabaseClient
let ownedAnewUserId: string
let ownedAuthUserId: string

let leaderSb: SupabaseClient
let leaderAnewUserId: string
let leaderAuthUserId: string
let leaderMembershipId: string

let memberAnewUserId: string
let memberAuthUserId: string

let entityId: string
let proposalId: string
let teamId: string
const createdContractIds: string[] = []

async function createDraftContract(notesSuffix: string): Promise<string> {
  const { data, error } = await adminSb.rpc('rpc_create_client_contract', {
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

async function createFixtureUser(opts: { emailLocalPart: string; name: string; roleId: string }) {
  const email = `${opts.emailLocalPart}+${RUN}@example.invalid`
  const password = `Olyvia-${RUN}-Aa1!`

  const { data: session } = await adminSb.auth.getSession()
  const { data, error } = await adminSb.functions.invoke('create-user', {
    body: {
      email,
      password,
      name: `${FIXTURE_TAG} ${opts.name}`,
      memberships: [{ organization_id: NIKE_ORG_ID, role_id: opts.roleId }],
    },
    headers: { Authorization: `Bearer ${session.session!.access_token}` },
  })
  expect(error, `criar utilizador de fixture (${opts.name})`).toBeNull()
  const anewUserId = (data as { anew_user_id: string }).anew_user_id
  const authUserId = (data as { user: { id: string } }).user.id

  const clientSb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
  const { error: loginErr } = await clientSb.auth.signInWithPassword({ email, password })
  expect(loginErr, `login do utilizador de fixture (${opts.name})`).toBeNull()

  return { sb: clientSb, anewUserId, authUserId, email }
}

test.beforeAll(async () => {
  env = readEnv()
  adminSb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
  const { data: auth, error: loginError } = await adminSb.auth.signInWithPassword({
    email: credenciaisDosTestes().email,
    password: credenciaisDosTestes().password,
  })
  expect(loginError, 'login do administrador').toBeNull()
  adminAuthUserId = auth.user!.id

  const { data: adminAnew } = await adminSb
    .from('anew_users')
    .select('id')
    .eq('auth_user_id', adminAuthUserId)
    .maybeSingle()
  expect(adminAnew?.id, 'administrador tem de ter anew_users associado').toBeTruthy()
  adminBusinessUserId = adminAnew!.id as string

  // ── Fixture entity + proposal (reutilizavel por nome, como no spec irmao) ──
  const fixtureDisplayName = `${FIXTURE_TAG} Entidade`
  const { data: existingEntity } = await adminSb
    .from('anew_entities')
    .select('id')
    .eq('display_name', fixtureDisplayName)
    .eq('organization_id', NIKE_ORG_ID)
    .maybeSingle()

  if (existingEntity?.id) {
    entityId = existingEntity.id as string
  } else {
    const { data: newEntityId, error: entityError } = await adminSb.rpc('create_lead_entity_for_org', {
      p_organization_id: NIKE_ORG_ID,
      p_display_name: fixtureDisplayName,
      p_first_name: FIXTURE_TAG,
      p_last_name: 'Entidade',
    })
    expect(entityError, 'criar a entidade de fixture').toBeNull()
    entityId = newEntityId as string
  }

  const { data: proposal, error: proposalError } = await adminSb.rpc('rpc_create_proposal', {
    p_proposal_data: {
      title: `${FIXTURE_TAG} proposta ${RUN}`,
      description: 'Fixture automatica do teste de ambito de estado de contratos.',
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

  // ── Utilizador de scope OWNED (client_contracts.edit + .view, sem override) ──
  const owned = await createFixtureUser({
    emailLocalPart: 'olyvia-scope-guard-owned',
    name: 'Owned Scope User',
    roleId: OWNED_ROLE_ID,
  })
  ownedSb = owned.sb
  ownedAnewUserId = owned.anewUserId
  ownedAuthUserId = owned.authUserId

  // ── Lider de equipa (scope override TEAM) + membro da equipa ────────────
  const leader = await createFixtureUser({
    emailLocalPart: 'olyvia-scope-guard-leader',
    name: 'Team Leader',
    roleId: TEAM_CAPABLE_ROLE_ID,
  })
  leaderSb = leader.sb
  leaderAnewUserId = leader.anewUserId
  leaderAuthUserId = leader.authUserId

  const member = await createFixtureUser({
    emailLocalPart: 'olyvia-scope-guard-member',
    name: 'Team Member',
    roleId: TEAM_CAPABLE_ROLE_ID,
  })
  memberAnewUserId = member.anewUserId
  memberAuthUserId = member.authUserId

  const { data: leaderMembership, error: leaderMembershipErr } = await adminSb
    .from('anew_memberships')
    .select('id')
    .eq('user_id', leaderAnewUserId)
    .eq('organization_id', NIKE_ORG_ID)
    .eq('status', 'active')
    .maybeSingle()
  expect(leaderMembershipErr, 'ler membership do lider').toBeNull()
  leaderMembershipId = leaderMembership!.id as string

  const { error: scopeOverrideErr } = await adminSb.from('anew_membership_permission_scopes').insert({
    membership_id: leaderMembershipId,
    permission_code: 'client_contracts.edit',
    scope_level: 'TEAM',
  })
  expect(scopeOverrideErr, 'definir scope TEAM para o lider').toBeNull()

  const { data: team, error: teamErr } = await adminSb
    .from('organization_teams')
    .insert({
      organization_id: NIKE_ORG_ID,
      name: `${FIXTURE_TAG} Team ${RUN}`,
      leader_id: leaderAnewUserId,
    })
    .select('id')
    .single()
  expect(teamErr, 'criar equipa de fixture').toBeNull()
  teamId = team!.id as string

  const { error: teamMemberErr } = await adminSb.from('organization_team_members').insert({
    team_id: teamId,
    user_id: memberAnewUserId,
  })
  expect(teamMemberErr, 'adicionar membro a equipa de fixture').toBeNull()
})

test.afterAll(async () => {
  for (const id of createdContractIds) {
    await adminSb.from('client_contracts').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq(
      'organization_id',
      NIKE_ORG_ID,
    )
  }
  if (proposalId) {
    await adminSb
      .from('proposals')
      .update({ deleted_at: new Date().toISOString(), is_deleted: true })
      .eq('id', proposalId)
      .eq('organization_id', NIKE_ORG_ID)
  }

  if (teamId) {
    await adminSb.from('organization_team_members').delete().eq('team_id', teamId)
    await adminSb.from('organization_teams').delete().eq('id', teamId)
  }
  if (leaderMembershipId) {
    await adminSb
      .from('anew_membership_permission_scopes')
      .delete()
      .eq('membership_id', leaderMembershipId)
      .eq('permission_code', 'client_contracts.edit')
  }

  for (const anewUserId of [ownedAnewUserId, leaderAnewUserId, memberAnewUserId]) {
    if (!anewUserId) continue
    const { error } = await adminSb.rpc('rpc_delete_user', { p_user_id: anewUserId })
    if (error) console.error('rpc_delete_user falhou para', anewUserId, error)
  }

  const { data: session } = await adminSb.auth.getSession()
  for (const authUserId of [ownedAuthUserId, leaderAuthUserId, memberAuthUserId]) {
    if (!authUserId) continue
    const { error } = await adminSb.functions.invoke('delete-user', {
      body: { userId: authUserId },
      headers: { Authorization: `Bearer ${session.session!.access_token}` },
    })
    if (error) console.error('delete-user falhou para', authUserId, error)
  }
})

test('ORG scope (administrador): continua a poder transitar o estado de um contrato de outra pessoa', async () => {
  const contractId = await createDraftContract('org-scope-admin')
  // created_by is the admin itself by default (rpc_create_client_contract).

  const { error } = await adminSb.rpc('rpc_update_client_contract_status', {
    p_id: contractId,
    p_status: 'cancelled',
  })
  expect(error, 'ORG scope deve conseguir transitar qualquer contrato da organizacao').toBeNull()

  const { data: row } = await adminSb.from('client_contracts').select('status').eq('id', contractId).single()
  expect(row!.status).toBe('cancelled')
})

test('OWNED scope: consegue transitar o proprio contrato', async () => {
  const contractId = await createDraftContract('owned-scope-self')
  const { error: reassignErr } = await adminSb.rpc('rpc_reassign_client_contract', {
    p_id: contractId,
    p_new_owner_id: ownedAnewUserId,
  })
  expect(reassignErr, 'atribuir o contrato ao utilizador OWNED').toBeNull()

  const { error } = await ownedSb.rpc('rpc_update_client_contract_status', {
    p_id: contractId,
    p_status: 'signed',
  })
  expect(error, 'OWNED scope deve conseguir transitar o proprio contrato').toBeNull()

  const { data: row } = await adminSb.from('client_contracts').select('status').eq('id', contractId).single()
  expect(row!.status).toBe('signed')
})

test('OWNED scope: NAO consegue transitar o contrato de outra pessoa via RPC direta', async () => {
  const contractId = await createDraftContract('owned-scope-other')
  // created_by continues to be the admin — someone else, from ownedSb's point of view.

  const { error } = await ownedSb.rpc('rpc_update_client_contract_status', {
    p_id: contractId,
    p_status: 'signed',
  })
  expect(error, 'OWNED scope NAO deve conseguir transitar o contrato de outra pessoa').not.toBeNull()
  expect(error?.message || '').toContain('âmbito')

  const { data: row } = await adminSb.from('client_contracts').select('status').eq('id', contractId).single()
  expect(row!.status, 'o estado nao pode ter mudado').toBe('draft')
})

test('TEAM scope: o lider consegue transitar o contrato de um membro da equipa', async () => {
  const contractId = await createDraftContract('team-scope-member')
  const { error: reassignErr } = await adminSb.rpc('rpc_reassign_client_contract', {
    p_id: contractId,
    p_new_owner_id: memberAnewUserId,
  })
  expect(reassignErr, 'atribuir o contrato ao membro da equipa').toBeNull()

  const { error } = await leaderSb.rpc('rpc_update_client_contract_status', {
    p_id: contractId,
    p_status: 'cancelled',
  })
  expect(error, 'TEAM scope deve conseguir transitar o contrato de um membro da equipa').toBeNull()

  const { data: row } = await adminSb.from('client_contracts').select('status').eq('id', contractId).single()
  expect(row!.status).toBe('cancelled')
})

test('TEAM scope: NAO consegue transitar o contrato de alguem fora da equipa', async () => {
  const contractId = await createDraftContract('team-scope-outsider')
  // created_by continues to be the admin — not a member of the leader's team.

  const { error } = await leaderSb.rpc('rpc_update_client_contract_status', {
    p_id: contractId,
    p_status: 'cancelled',
  })
  expect(error, 'TEAM scope NAO deve conseguir transitar o contrato de alguem fora da equipa').not.toBeNull()
  expect(error?.message || '').toContain('âmbito')

  const { data: row } = await adminSb.from('client_contracts').select('status').eq('id', contractId).single()
  expect(row!.status, 'o estado nao pode ter mudado').toBe('draft')
})

// ── O caso que da sentido a decisao do dono do produto (2026-08-29) ──────────
// Um contrato CRIADO por A e ATRIBUIDO a B: hoje B ve-o na lista (o filtro de
// visibilidade ja une created_by OU assigned_to -- resolveContractsScopeUserIds,
// src/lib/contracts/scope.ts) mas, antes desta migracao, nao o conseguia
// assinar -- a RPC so aceitava created_by. Esta migracao alinha a edicao com
// a visibilidade: B, com scope OWNED, passa a poder agir.
test('OWNED scope: consegue transitar um contrato CRIADO por outra pessoa mas ATRIBUIDO a si (assigned_to)', async () => {
  const contractId = await createDraftContract('owned-scope-assigned-to')
  // created_by continues to be the admin. Assign directly (assigned_to), NOT
  // via rpc_reassign_client_contract (which moves created_by, not assigned_to).
  const { error: assignErr } = await adminSb
    .from('client_contracts')
    .update({ assigned_to: ownedAnewUserId })
    .eq('id', contractId)
    .eq('organization_id', NIKE_ORG_ID)
  expect(assignErr, 'atribuir assigned_to ao utilizador OWNED (preparacao)').toBeNull()

  const { data: before } = await adminSb
    .from('client_contracts')
    .select('created_by, assigned_to')
    .eq('id', contractId)
    .single()
  expect(before!.created_by, 'created_by permanece o admin').toBe(adminBusinessUserId)
  expect(before!.assigned_to, 'assigned_to e o utilizador OWNED').toBe(ownedAnewUserId)

  const { error } = await ownedSb.rpc('rpc_update_client_contract_status', {
    p_id: contractId,
    p_status: 'signed',
  })
  expect(
    error,
    'OWNED scope deve conseguir transitar um contrato que lhe esta ATRIBUIDO, mesmo criado por outra pessoa',
  ).toBeNull()

  const { data: row } = await adminSb.from('client_contracts').select('status').eq('id', contractId).single()
  expect(row!.status).toBe('signed')
})
