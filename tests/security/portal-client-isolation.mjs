// tests/security/portal-client-isolation.mjs
//
// Testes de integracao do isolamento do portal de clientes contra a base
// REMOTA (pooler aws-1-eu-central-2), simulando um cliente real e um membro de
// equipa (staff) da organizacao de teste nike.
//
// COMO CORRE (a partir da raiz do worktree ou do projecto; o pg vem dos
// node_modules do projecto principal, resolvido por NODE_PATH)
//   PowerShell:
//     $env:NODE_PATH = "C:/my-crm-dream-main/projeto/node_modules"
//     node tests/security/portal-client-isolation.mjs
//   Git Bash:
//     NODE_PATH=C:/my-crm-dream-main/projeto/node_modules node tests/security/portal-client-isolation.mjs
//   (le DATABASE_URL do primeiro .env encontrado a subir a partir deste ficheiro)
//   Sem NODE_PATH, tenta esse mesmo caminho como recurso.
//
// ORDEM OBRIGATORIA (regra do projecto)
//   1. Correr ESTE script ANTES do `supabase db push --linked`, contra o remoto
//      ainda por corrigir: e ai que se documenta o estado vermelho.
//   2. Aplicar a migration 20261206120000 com `db push`.
//   3. Correr de novo: exige o verde. Nunca se reverte a base para repetir 1.
//
// REGRAS QUE CUMPRE
//   - Leituras como cliente/staff simulados: SET LOCAL ROLE authenticated +
//     request.jwt.claims com sub=auth_user_id, dentro de BEGIN READ ONLY ...
//     ROLLBACK. Contam linhas; nao copiam dados.
//   - Escritas: so duas, ambas na linha de client_portal_users do cliente nike,
//     filtradas por organization_id da nike, dentro de BEGIN ... ROLLBACK.
//   - O resto das escritas verifica-se por catalogo (pg_policies, pg_proc,
//     has_function_privilege), sem executar.
//   - Toda a consulta de verdade-terreno (como dono) leva o organization_id da
//     nike. Nunca toca na Mudelar. Nunca usa service_role.
//
// DETECCAO: a correccao conta como aplicada quando existe a funcao auxiliar
// public.portal_linked_org_ids (criada pela migration). Antes disso o script e
// descritivo (estado vermelho) e nao falha o processo; depois exige o verde e
// termina com codigo 1 se algum isolamento falhar.

import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// createRequire respeita NODE_PATH; se o pg nao estiver ao alcance, recorre aos
// node_modules do projecto principal.
const PROJECT_NODE_MODULES = "C:/my-crm-dream-main/projeto/node_modules/";
function loadPg() {
  try {
    return createRequire(import.meta.url)("pg");
  } catch {
    return createRequire(PROJECT_NODE_MODULES)("pg");
  }
}
const pg = loadPg();

// ── Localizar e ler o .env na raiz do projeto ────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function findEnv(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Nao encontrei .env a partir de " + start);
}
const envPath = findEnv(__dirname);
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);

const dbUrl = new URL(env.DATABASE_URL);

// ── Dados fixos da nike (organizacao de teste) e do cliente simulado ─────────
const NIKE_ORG = "b6ffce4f-f630-4933-833a-008649757a33";
// Cliente nike: 1 membership (role 'client'), documentos concedidos,
// proposta 77bcb89c e contrato 9b5f6c99 proprios.
const CLIENT_AUTH = "83858795-6fda-4ae8-9a98-340e03b7c4b2";
const OWN_CONTRACT = "9b5f6c99-6db8-4af0-8bd4-a3671dc4da99";
const OWN_PROPOSAL = "77bcb89c-7547-4458-8b9a-7a5f1c6c681e";
// O "outro alvo" (contrato da nike NAO concedido ao cliente, de uma entidade
// que o cliente nao ve por direito) e escolhido por consulta em main(); serve a
// G3 (NIF) e a D1 (escalacao de contract_id).
// Staff de referencia (so documentacao; o teste procura-o por consulta, filtrada
// pela nike): ad2e59bf-...

const claimsFor = (sub) => JSON.stringify({ sub, role: "authenticated" });
const CLIENT_CLAIMS = claimsFor(CLIENT_AUTH);

const client = new pg.Client({
  host: "aws-1-eu-central-2.pooler.supabase.com",
  port: 5432,
  user: "postgres.tzbfgwpckrfbqcolqxtm",
  password: decodeURIComponent(dbUrl.password),
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

// Corre `sql` como o utilizador simulado (claims), dentro de BEGIN READ ONLY ...
// ROLLBACK. Devolve a primeira linha.
async function asUserRead(claims, sql, params = []) {
  await client.query("BEGIN READ ONLY");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [claims]);
    const r = await client.query(sql, params);
    return r.rows[0] || {};
  } finally {
    await client.query("ROLLBACK");
  }
}
const asClientRead = (sql, params) => asUserRead(CLIENT_CLAIMS, sql, params);

// Consulta como dono (catalogo, ou verdade-terreno SEMPRE filtrada pela nike),
// so leitura.
async function catalog(sql, params = []) {
  await client.query("BEGIN READ ONLY");
  try {
    const r = await client.query(sql, params);
    return r.rows;
  } finally {
    await client.query("ROLLBACK");
  }
}

const results = [];
function record(section, name, ok, detail) {
  results.push({ section, name, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${name} — ${detail}`);
}

// Politicas criadas/recriadas pela migration (tabela, nome). Usada em B1.
const NEW_POLICIES = [
  ["anew_memberships", "portal_client_reads_own_membership"],
  ["anew_organizations", "portal_client_reads_linked_org"],
  ["anew_org_addresses", "portal_client_reads_linked_org_addresses"],
  ["organization_document_settings", "portal_client_reads_org_doc_settings"],
  ["custom_contract_variables", "portal_client_reads_org_custom_vars"],
  ["proposal_templates", "portal_client_reads_org_proposal_templates"],
  ["client_contract_templates", "portal_client_reads_org_contract_templates"],
  ["anew_entities", "portal_client_reads_portal_entities"],
  ["anew_entity_emails", "portal_client_reads_portal_entity_emails"],
  ["anew_entity_phones", "portal_client_reads_portal_entity_phones"],
  ["anew_entity_addresses", "portal_client_reads_portal_entity_addresses"],
  ["anew_entity_fiscal_entities", "portal_client_reads_portal_fiscal_links"],
  ["fiscal_entities", "portal_client_reads_portal_fiscal_entities"],
  ["fiscal_entities", "authenticated_update_fiscal_entities"],
  ["proposal_rejection_reasons", "portal_client_reads_org_rejection_reasons"],
  ["anew_addresses", "portal_client_reads_portal_addresses"],
  ["anew_users", "portal_client_reads_doc_commercials"],
  ["anew_roles", "portal_client_reads_signatory_roles"],
  ["proposal_quote_selections", "portal_client_reads_doc_pq_selections"],
  ["client_portal_users", "Org members can insert client portal users"],
  ["client_portal_users", "Org members can update client portal users"],
  ["client_portal_documents", "Org members manage portal documents"],
  ["contract_sends", "Authenticated users can view contract sends"],
  ["contract_sends", "Authenticated users can insert contract sends"],
  ["anew_organizations", "authenticated_insert_anew_organizations"],
  ["anew_org_associations", "Admins can manage associations"],
  ["anew_hierarchy", "authenticated_insert_anew_hierarchy"],
  ["anew_hierarchy", "authenticated_update_anew_hierarchy"],
  ["anew_hierarchy", "authenticated_delete_anew_hierarchy"],
  ["anew_roles", "anew_roles_select"],
  ["anew_role_permissions", "anew_role_permissions_select"],
  ["client_contract_templates", "client_templates_select"],
];
// Leitura DIRECTA (FROM/JOIN) de uma das tres tabelas que fecham ciclo de RLS.
// pg_policies devolve a expressao deparsed; o esquema pode aparecer ou nao.
const DIRECT_READ_RE = /\b(from|join)\s+(public\.)?(anew_users|anew_memberships|client_contract_templates)\b/i;

const HELPERS = [
  "portal_linked_org_ids",
  "portal_granted_document_ids",
  "portal_contact_entity_ids",
  "portal_visible_entity_ids",
  "portal_visible_user_ids",
  "portal_signatory_role_ids",
  "portal_visible_address_ids",
  "get_user_own_role_ids",
  "current_user_has_permission_in_org",
  "user_can_self_register_first_org",
  "org_is_own_unparented",
  "portal_document_in_org",
  "portal_user_in_org",
  "portal_visible_fiscal_entity_ids",
];
// Nucleos com uid explicito: nunca executaveis por anon nem authenticated.
const CORE_HELPERS = [
  "portal_linked_org_ids_for",
  "portal_granted_document_ids_for",
  "portal_contact_entity_ids_for",
  "portal_visible_entity_ids_for",
  "portal_entity_visible_to",
];

async function main() {
  await client.connect();

  const fixApplied =
    (
      await catalog(
        "SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='portal_linked_org_ids'",
      )
    ).length === 1;
  console.log(`\n== Isolamento do portal de clientes (nike) ==`);
  console.log(`Correccao aplicada na base: ${fixApplied ? "SIM" : "NAO (estado vermelho esperado)"}\n`);

  // Staff de referencia: primeiro super_admin activo, nao-cliente, da nike.
  const staffRows = await catalog(
    `SELECT u.auth_user_id::text a
       FROM public.anew_memberships m
       JOIN public.anew_users u ON u.id = m.user_id
       JOIN public.anew_roles r ON r.id = m.role_id
      WHERE m.organization_id = $1
        AND m.status = 'active'
        AND m.role_is_client IS NOT TRUE
        AND r.code = 'super_admin'
        AND u.auth_user_id IS NOT NULL
        AND u.deleted_at IS NULL
      ORDER BY m.created_at NULLS LAST, u.id
      LIMIT 1`,
    [NIKE_ORG],
  );
  const STAFF_AUTH = staffRows[0] ? staffRows[0].a : null;
  const STAFF_CLAIMS = STAFF_AUTH ? claimsFor(STAFF_AUTH) : null;
  console.log(`Staff nike de referencia: ${STAFF_AUTH ? STAFF_AUTH.slice(0, 8) + "..." : "NAO ENCONTRADO"}`);

  // Hibrido (equipa E cliente na nike): membership activa de cliente e outra
  // nao-cliente, ambas na nike, e linha de portal na nike. Pode nao existir.
  const hybridRows = await catalog(
    `SELECT u.auth_user_id::text a
       FROM public.anew_users u
      WHERE u.auth_user_id IS NOT NULL
        AND u.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM public.anew_memberships m
                     WHERE m.user_id=u.id AND m.organization_id=$1 AND m.status='active' AND m.role_is_client IS TRUE)
        AND EXISTS (SELECT 1 FROM public.anew_memberships m
                     WHERE m.user_id=u.id AND m.organization_id=$1 AND m.status='active' AND m.role_is_client IS NOT TRUE)
        AND EXISTS (SELECT 1 FROM public.client_portal_users cpu
                     WHERE cpu.auth_user_id=u.auth_user_id AND cpu.organization_id=$1)
      ORDER BY u.id
      LIMIT 1`,
    [NIKE_ORG],
  );
  const HYBRID_AUTH = hybridRows[0] ? hybridRows[0].a : null;
  const HYBRID_CLAIMS = HYBRID_AUTH ? claimsFor(HYBRID_AUTH) : null;
  console.log(`Hibrido nike: ${HYBRID_AUTH ? HYBRID_AUTH.slice(0, 8) + "..." : "nenhum"}`);

  // anew_users.id do cliente (como dono, fora da simulacao): as fichas que ele
  // proprio criou sao-lhe visiveis por direito (ramo do criador) e nao contam
  // como fuga em A3.
  const clientBizRows = await catalog(
    "SELECT u.id::text id FROM public.anew_users u WHERE u.auth_user_id = $1 LIMIT 1",
    [CLIENT_AUTH],
  );
  const CLIENT_BUSINESS_ID = clientBizRows[0] ? clientBizRows[0].id : null;

  // Outro alvo dinamico (como dono, so nike): um contrato da nike, nao apagado,
  // NAO concedido ao cliente, cuja entidade nao e a do cliente nem a da nike,
  // nao tem contrato/proposta concedidos ao cliente e nao foi criada por ele.
  const otherRows = await catalog(
    `SELECT c.id::text contract_id, c.entity_id::text entity_id
       FROM public.client_contracts c
       JOIN public.anew_entities e ON e.id = c.entity_id
      WHERE c.organization_id = $1
        AND c.deleted_at IS NULL
        AND c.entity_id IS NOT NULL
        AND e.created_by IS DISTINCT FROM $3::uuid
        AND c.entity_id NOT IN (
          SELECT cpu.entity_id FROM public.client_portal_users cpu
           WHERE cpu.auth_user_id = $2 AND cpu.organization_id = $1 AND cpu.entity_id IS NOT NULL)
        AND c.entity_id IS DISTINCT FROM (SELECT o.entity_id FROM public.anew_organizations o WHERE o.id = $1)
        AND NOT EXISTS (
          SELECT 1 FROM public.client_portal_documents d
            JOIN public.client_portal_users pu ON pu.id = d.portal_user_id
           WHERE pu.auth_user_id = $2
             AND pu.organization_id = $1
             AND (
               (d.document_type = 'contract' AND (d.document_id = c.id OR EXISTS (
                  SELECT 1 FROM public.client_contracts c2 WHERE c2.id = d.document_id AND c2.entity_id = c.entity_id)))
               OR (d.document_type = 'proposal' AND EXISTS (
                  SELECT 1 FROM public.proposals p WHERE p.id = d.document_id AND p.entity_id = c.entity_id))
             ))
      ORDER BY c.id
      LIMIT 1`,
    [NIKE_ORG, CLIENT_AUTH, CLIENT_BUSINESS_ID],
  );
  const OTHER_CONTRACT = otherRows[0] ? otherRows[0].contract_id : null;
  const OTHER_ENTITY = otherRows[0] ? otherRows[0].entity_id : null;
  console.log(`Outro alvo nike: ${OTHER_CONTRACT ? "contrato " + OTHER_CONTRACT.slice(0, 8) + "..." : "nenhum"}\n`);

  // ────────────────────────────────────────────────────────────────────────
  // A. ATAQUES DE LEITURA (como o cliente). Cada um conta linhas que NAO sao
  //    do proprio cliente. Esperado: antes da correccao >0; depois 0.
  // ────────────────────────────────────────────────────────────────────────
  console.log("A. Ataques de leitura (contagem de linhas de OUTROS):");

  const leakChecks = [
    {
      name: "A1 memberships de outros utilizadores",
      sql: `SELECT count(*)::int n FROM public.anew_memberships m
            WHERE m.user_id IS DISTINCT FROM public.current_business_user_id()`,
    },
    {
      name: "A2 organizacoes para alem das ligadas ao cliente",
      sql: `SELECT count(*)::int n FROM public.anew_organizations o
            WHERE o.id NOT IN (SELECT cpu.organization_id FROM public.client_portal_users cpu WHERE cpu.auth_user_id=auth.uid())`,
    },
    {
      // Exclui as fichas criadas pelo proprio cliente ($1 = o seu anew_users.id,
      // lido fora da simulacao): sao-lhe visiveis pelo ramo do criador.
      name: "A3 entidades (fichas) de outros",
      params: [CLIENT_BUSINESS_ID],
      sql: `SELECT count(*)::int n FROM public.anew_entities e
            WHERE e.created_by IS DISTINCT FROM $1::uuid
              AND e.id NOT IN (SELECT cpu.entity_id FROM public.client_portal_users cpu WHERE cpu.auth_user_id=auth.uid() AND cpu.entity_id IS NOT NULL)
              AND NOT EXISTS (SELECT 1 FROM public.client_contracts c WHERE c.entity_id=e.id AND public.portal_user_can_see_document('contract'::portal_document_type,c.id))
              AND NOT EXISTS (SELECT 1 FROM public.proposals p WHERE p.entity_id=e.id AND public.portal_user_can_see_document('proposal'::portal_document_type,p.id))
              AND NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.entity_id=e.id AND o.id IN (SELECT cpu.organization_id FROM public.client_portal_users cpu WHERE cpu.auth_user_id=auth.uid()))`,
    },
    {
      // O ambito M3 (comerciais/assinantes dos documentos concedidos) e o da
      // funcao portal_visible_user_ids; antes da correccao ela nao existe, por
      // isso o vermelho usa a aproximacao antiga (propostas/contratos).
      name: "A4 utilizadores (anew_users) para alem do proprio/comerciais",
      sqlFixed: `SELECT count(*)::int n FROM public.anew_users u
            WHERE u.auth_user_id IS DISTINCT FROM auth.uid()
              AND u.id NOT IN (SELECT public.portal_visible_user_ids())`,
      sql: `SELECT count(*)::int n FROM public.anew_users u
            WHERE u.auth_user_id IS DISTINCT FROM auth.uid()
              AND NOT EXISTS (SELECT 1 FROM public.proposals p WHERE (p.created_by=u.id OR p.assigned_to=u.id) AND public.portal_user_can_see_document('proposal'::portal_document_type,p.id))
              AND NOT EXISTS (SELECT 1 FROM public.client_contracts c WHERE (c.created_by=u.id OR c.assigned_to=u.id) AND public.portal_user_can_see_document('contract'::portal_document_type,c.id))`,
    },
    {
      name: "A5 contratos para alem dos concedidos",
      sql: `SELECT count(*)::int n FROM public.client_contracts c
            WHERE NOT public.portal_user_can_see_document('contract'::portal_document_type, c.id)`,
    },
    {
      name: "A6 propostas para alem das concedidas",
      sql: `SELECT count(*)::int n FROM public.proposals p
            WHERE NOT public.portal_user_can_see_document('proposal'::portal_document_type, p.id)`,
    },
    {
      name: "A7 orcamentos para alem dos concedidos",
      sql: `SELECT count(*)::int n FROM public.quotes q
            WHERE NOT public.portal_user_can_see_document('quote'::portal_document_type, q.id)`,
    },
    {
      name: "A8 contract_sends (SELECT true) de qualquer organizacao",
      sql: `SELECT count(*)::int n FROM public.contract_sends`,
    },
    {
      // M5: nao conta (a) os roles das PROPRIAS memberships (useClientRole le o
      // codigo do proprio role) nem (b) os roles signatarios das minutas que o
      // cliente pode ver. Sobram os que vinham pelos ramos de organizacao.
      name: "A9 roles de organizacao de outros (sem os proprios nem os signatarios)",
      sql: `SELECT count(*)::int n FROM public.anew_roles r
            WHERE r.is_system IS NOT TRUE
              AND r.id NOT IN (SELECT m.role_id FROM public.anew_memberships m
                                WHERE m.user_id = public.current_business_user_id() AND m.role_id IS NOT NULL)
              AND r.id::text NOT IN (SELECT t.signatory_role_id FROM public.client_contract_templates t
                                      WHERE t.signatory_role_id IS NOT NULL)`,
    },
    {
      name: "A10 role_permissions de roles nao-sistema (sem os proprios)",
      sql: `SELECT count(*)::int n FROM public.anew_role_permissions rp
            WHERE EXISTS (SELECT 1 FROM public.anew_roles r WHERE r.id=rp.role_id AND r.is_system IS NOT TRUE)
              AND rp.role_id NOT IN (SELECT m.role_id FROM public.anew_memberships m
                                      WHERE m.user_id = public.current_business_user_id() AND m.role_id IS NOT NULL)`,
    },
    {
      name: "A11 minutas de contrato de organizacoes nao ligadas",
      sql: `SELECT count(*)::int n FROM public.client_contract_templates t
            WHERE t.organization_id IS NOT NULL
              AND t.organization_id NOT IN (SELECT cpu.organization_id FROM public.client_portal_users cpu WHERE cpu.auth_user_id=auth.uid())`,
    },
    {
      name: "A12 fluxos (flow_builder_flows) via get_flow_user_org_ids",
      sql: `SELECT count(*)::int n FROM public.flow_builder_flows`,
    },
    {
      // Entidades fiscais nao ligadas a nenhuma entidade do portal (propria,
      // da organizacao ligada, ou de contrato/proposta concedidos).
      name: "A13 fiscal_entities de outros",
      sql: `SELECT count(*)::int n FROM public.fiscal_entities fe
            WHERE NOT EXISTS (
              SELECT 1 FROM public.anew_entity_fiscal_entities aef
              WHERE aef.fiscal_entity_id = fe.id
                AND (
                  aef.entity_id IN (SELECT cpu.entity_id FROM public.client_portal_users cpu
                                     WHERE cpu.auth_user_id=auth.uid() AND cpu.entity_id IS NOT NULL)
                  OR aef.entity_id IN (SELECT o.entity_id FROM public.anew_organizations o
                                        WHERE o.id IN (SELECT cpu.organization_id FROM public.client_portal_users cpu WHERE cpu.auth_user_id=auth.uid()))
                  OR EXISTS (SELECT 1 FROM public.client_contracts c WHERE c.entity_id=aef.entity_id
                              AND public.portal_user_can_see_document('contract'::portal_document_type,c.id))
                  OR EXISTS (SELECT 1 FROM public.proposals p WHERE p.entity_id=aef.entity_id
                              AND public.portal_user_can_see_document('proposal'::portal_document_type,p.id))
                ))`,
    },
  ];

  for (const chk of leakChecks) {
    let n;
    try {
      n = (await asClientRead(fixApplied && chk.sqlFixed ? chk.sqlFixed : chk.sql, chk.params || [])).n;
    } catch (e) {
      record("leak", chk.name, false, "erro: " + e.message);
      continue;
    }
    if (fixApplied) {
      record("leak", chk.name, n === 0, `linhas de outros visiveis = ${n} (esperado 0)`);
    } else {
      record("leak(red)", chk.name, true, `fuga observada = ${n} linhas (vai a 0 apos a correccao)`);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // B. O PORTAL CONTINUA A VER OS SEUS DADOS.
  // ────────────────────────────────────────────────────────────────────────
  console.log("\nB. Dados do proprio cliente (tem de continuar visiveis):");

  const ownChecks = [
    {
      name: "B1 a propria linha de anew_users (useClientRole)",
      sql: `SELECT count(*)::int n FROM public.anew_users u WHERE u.auth_user_id=auth.uid()`,
      expect: (n) => n >= 1,
    },
    {
      name: "B2 a propria linha de membership",
      sql: `SELECT count(*)::int n FROM public.anew_memberships m
            WHERE m.user_id = (SELECT u.id FROM public.anew_users u WHERE u.auth_user_id=auth.uid() LIMIT 1)`,
      expect: (n) => n >= 1,
    },
    {
      name: "B3 o role da propria membership (codigo 'client' visivel)",
      sql: `SELECT count(*)::int n FROM public.anew_roles r
            WHERE r.code = 'client'
              AND r.id IN (SELECT m.role_id FROM public.anew_memberships m
                            WHERE m.user_id = (SELECT u.id FROM public.anew_users u WHERE u.auth_user_id=auth.uid() LIMIT 1)
                              AND m.status='active')`,
      expect: (n) => n >= 1,
    },
    {
      name: "B4 a propria linha de client_portal_users",
      sql: `SELECT count(*)::int n FROM public.client_portal_users cpu WHERE cpu.auth_user_id=auth.uid()`,
      expect: (n) => n >= 1,
    },
    {
      name: "B5 a organizacao ligada (nike)",
      sql: `SELECT count(*)::int n FROM public.anew_organizations o WHERE o.id='${NIKE_ORG}'`,
      expect: (n) => n === 1,
    },
    {
      name: "B6 o contrato proprio concedido",
      sql: `SELECT count(*)::int n FROM public.client_contracts c WHERE c.id='${OWN_CONTRACT}'`,
      expect: (n) => n === 1,
    },
    {
      name: "B7 a proposta propria concedida",
      sql: `SELECT count(*)::int n FROM public.proposals p WHERE p.id='${OWN_PROPOSAL}'`,
      expect: (n) => n === 1,
    },
    {
      name: "B8 os documentos concedidos (client_portal_documents proprios)",
      sql: `SELECT count(*)::int n FROM public.client_portal_documents d
            JOIN public.client_portal_users cpu ON cpu.id=d.portal_user_id WHERE cpu.auth_user_id=auth.uid()`,
      expect: (n) => n >= 1,
    },
    {
      name: "B9 o comercial do documento resolve (get_commercial_info)",
      sql: `SELECT (public.get_commercial_info((SELECT created_by FROM public.proposals WHERE id='${OWN_PROPOSAL}')) IS NOT NULL) ok`,
      expect: (ok) => ok === true,
      field: "ok",
    },
    {
      name: "B10 get_portal_commercial da nike corre sem erro",
      sql: `SELECT (public.get_portal_commercial('${NIKE_ORG}') IS NOT NULL OR true) ok`,
      expect: (ok) => ok === true,
      field: "ok",
    },
  ];

  for (const chk of ownChecks) {
    let v;
    try {
      const row = await asClientRead(chk.sql);
      v = chk.field ? row[chk.field] : row.n;
    } catch (e) {
      record("own", chk.name, false, "erro: " + e.message);
      continue;
    }
    record("own", chk.name, chk.expect(v), `valor = ${JSON.stringify(v)}`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // E. A EQUIPA DA NIKE CONTINUA A VER O QUE VIA (M5). Compara a contagem do
  //    staff simulado com a verdade-terreno lida como dono, tudo na nike.
  // ────────────────────────────────────────────────────────────────────────
  console.log("\nE. Equipa nike (nao pode ver menos na sua organizacao):");
  if (!STAFF_CLAIMS) {
    record("staff", "E0 staff super_admin da nike encontrado", false, "nenhum super_admin activo na nike");
  } else {
    const staffChecks = [
      {
        name: "E1 anew_users com membership activa na nike",
        sql: `SELECT count(*)::int n FROM public.anew_users u
              WHERE EXISTS (SELECT 1 FROM public.anew_memberships m
                             WHERE m.user_id=u.id AND m.organization_id=$1 AND m.status='active')`,
      },
      {
        name: "E2 anew_memberships da nike",
        sql: `SELECT count(*)::int n FROM public.anew_memberships m WHERE m.organization_id=$1`,
      },
      {
        name: "E3 client_contract_templates da nike",
        sql: `SELECT count(*)::int n FROM public.client_contract_templates t WHERE t.organization_id=$1`,
      },
      {
        name: "E4 anew_roles da nike",
        sql: `SELECT count(*)::int n FROM public.anew_roles r WHERE r.organization_id=$1`,
      },
      {
        name: "E5 client_portal_users da nike",
        sql: `SELECT count(*)::int n FROM public.client_portal_users c WHERE c.organization_id=$1`,
      },
      {
        name: "E6 client_portal_documents da nike",
        sql: `SELECT count(*)::int n FROM public.client_portal_documents d WHERE d.organization_id=$1`,
      },
    ];
    for (const chk of staffChecks) {
      try {
        const truth = (await catalog(chk.sql, [NIKE_ORG]))[0].n;
        const seen = (await asUserRead(STAFF_CLAIMS, chk.sql, [NIKE_ORG])).n;
        record("staff", chk.name, seen === truth, `staff ve ${seen} de ${truth}`);
      } catch (e) {
        record("staff", chk.name, false, "erro: " + e.message);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // G. NIF, NOME COMERCIAL E MOTIVOS DE REJEICAO NO PORTAL (cliente simulado).
  // ────────────────────────────────────────────────────────────────────────
  console.log("\nG. Dados fiscais e motivos de rejeicao do proprio cliente:");

  // G1 fiscal_entities das entidades do cliente (propria + da nike): o cliente
  //    ve tantas quantas existem (verdade-terreno como dono, filtrada pela nike).
  {
    const sql = `SELECT count(DISTINCT fe.id)::int n
                   FROM public.fiscal_entities fe
                   JOIN public.anew_entity_fiscal_entities aef ON aef.fiscal_entity_id = fe.id
                  WHERE aef.entity_id IN (
                    SELECT cpu.entity_id FROM public.client_portal_users cpu
                     WHERE cpu.auth_user_id = $1 AND cpu.organization_id = $2 AND cpu.entity_id IS NOT NULL
                    UNION
                    SELECT o.entity_id FROM public.anew_organizations o
                     WHERE o.id = $2 AND o.entity_id IS NOT NULL)`;
    try {
      const truth = (await catalog(sql, [CLIENT_AUTH, NIKE_ORG]))[0].n;
      const seen = (await asClientRead(sql, [CLIENT_AUTH, NIKE_ORG])).n;
      // Sem ligacao fiscal (caso medido na nike para este cliente) nao ha nada a
      // provar: PASS informativo, sem falhar o processo.
      record("own", "G1 fiscal_entities das proprias entidades", truth === 0 || seen === truth,
        truth > 0
          ? `cliente ve ${seen} de ${truth}`
          : "sem dados para provar a politica portal_client_reads_portal_fiscal_entities (0 ligacoes fiscais)");
    } catch (e) {
      record("own", "G1 fiscal_entities das proprias entidades", false, "erro: " + e.message);
    }
  }

  // G2 proposal_rejection_reasons da nike: o cliente ve todos.
  {
    const sql = `SELECT count(*)::int n FROM public.proposal_rejection_reasons r WHERE r.organization_id = $1`;
    try {
      const truth = (await catalog(sql, [NIKE_ORG]))[0].n;
      const seen = (await asClientRead(sql, [NIKE_ORG])).n;
      record("own", "G2 proposal_rejection_reasons da nike", seen === truth,
        `cliente ve ${seen} de ${truth}${truth === 0 ? " (nike sem motivos proprios: nada a provar)" : ""}`);
    } catch (e) {
      record("own", "G2 proposal_rejection_reasons da nike", false, "erro: " + e.message);
    }
  }

  // G3 revelacao do NIF: filter_visible_entity_ids (o que a nif-reveal chama com
  //    service_role) devolve a entidade do cliente e NAO a de outro cliente.
  //    Chamada como dono, so com entidades da nike. can_see_entity e mostrado
  //    a titulo informativo: de proposito nao ganhou ramo de cliente (decide
  //    tambem escritas e PII), por isso depois da correccao da false ao cliente.
  {
    try {
      const ents = await catalog(
        `SELECT cpu.entity_id::text AS own FROM public.client_portal_users cpu
          WHERE cpu.auth_user_id = $1 AND cpu.organization_id = $2 AND cpu.entity_id IS NOT NULL
          ORDER BY cpu.updated_at DESC NULLS LAST LIMIT 1`,
        [CLIENT_AUTH, NIKE_ORG],
      );
      const own = ents[0] ? ents[0].own : null;
      // Outro alvo dinamico (ver inicio de main); sem alvo, so se prova a propria.
      const other = OTHER_ENTITY && OTHER_ENTITY !== own ? OTHER_ENTITY : null;
      if (!own) {
        record("nif", "G3 filter_visible_entity_ids", false, "cliente sem entity_id na nike");
      } else {
        const ids = other ? [own, other] : [own];
        const vis = (
          await catalog(
            "SELECT entity_id::text e FROM public.filter_visible_entity_ids($1::uuid[], $2::uuid)",
            [ids, CLIENT_AUTH],
          )
        ).map((r) => r.e);
        const cse = (
          await catalog(
            "SELECT public.can_see_entity($1::uuid, $3::uuid) a, CASE WHEN $2::uuid IS NULL THEN NULL ELSE public.can_see_entity($2::uuid, $3::uuid) END b",
            [own, other, CLIENT_AUTH],
          )
        )[0];
        const ownOk = vis.includes(own);
        const otherOk = other ? !vis.includes(other) : true;
        const detail = `propria=${ownOk ? "visivel" : "NAO visivel"}, outra=${other ? (vis.includes(other) ? "VISIVEL" : "oculta") : "sem alvo"}; can_see_entity propria=${cse.a} outra=${cse.b}`;
        if (fixApplied) {
          record("nif", "G3 filter_visible_entity_ids: propria sim, de outro cliente nao", ownOk && otherOk, detail);
        } else {
          record("nif(red)", "G3 filter_visible_entity_ids (estado vermelho)", true, detail);
        }
      }
    } catch (e) {
      record("nif", "G3 filter_visible_entity_ids", false, "erro: " + e.message);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // H. UTILIZADOR HIBRIDO (equipa e cliente na nike), se existir.
  // ────────────────────────────────────────────────────────────────────────
  console.log("\nH. Utilizador hibrido (equipa e cliente na nike):");
  if (!HYBRID_CLAIMS) {
    record("hybrid", "H0 hibrido na nike", true, "nenhum hibrido na nike: cenario nao coberto");
  } else {
    const hybridChecks = [
      {
        name: "H1 hibrido ve todas as memberships da nike (lado de equipa intacto)",
        sql: `SELECT count(*)::int n FROM public.anew_memberships m WHERE m.organization_id=$1`,
        truth: true,
      },
      {
        name: "H2 hibrido ve as suas linhas de portal na nike",
        sql: `SELECT count(*)::int n FROM public.client_portal_users c
              WHERE c.organization_id=$1 AND c.auth_user_id = auth.uid()`,
        min: 1,
      },
      {
        name: "H3 hibrido ve o role de cliente e o de equipa (useClientRole: hybrid)",
        sql: `SELECT count(DISTINCT (r.code = 'client'))::int n FROM public.anew_roles r
              WHERE r.id IN (SELECT m.role_id FROM public.anew_memberships m
                              WHERE m.organization_id=$1 AND m.status='active'
                                AND m.user_id = (SELECT u.id FROM public.anew_users u WHERE u.auth_user_id = auth.uid() LIMIT 1))`,
        min: 2,
      },
    ];
    for (const chk of hybridChecks) {
      try {
        const seen = (await asUserRead(HYBRID_CLAIMS, chk.sql, [NIKE_ORG])).n;
        if (chk.truth) {
          const truth = (await catalog(chk.sql, [NIKE_ORG]))[0].n;
          record("hybrid", chk.name, seen === truth, `ve ${seen} de ${truth}`);
        } else {
          record("hybrid", chk.name, seen >= chk.min, `valor = ${seen} (minimo ${chk.min})`);
        }
      } catch (e) {
        record("hybrid", chk.name, false, "erro: " + e.message);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // F. SEM RECURSAO DE RLS (B1). A recursao rebenta ao reescrever a consulta,
  //    antes de ler dados: basta tocar na tabela (LIMIT 1, so conta).
  // ────────────────────────────────────────────────────────────────────────
  console.log("\nF. Sem 'infinite recursion' ao ler como cliente e como staff:");
  const recursionTables = [
    "anew_users",
    "anew_memberships",
    "client_contract_templates",
    "anew_roles",
    "anew_role_permissions",
    "anew_organizations",
    "anew_entities",
    "anew_addresses",
    "client_portal_users",
    "client_portal_documents",
    "fiscal_entities",
    "anew_entity_fiscal_entities",
    "proposal_rejection_reasons",
  ];
  const actors = [["cliente", CLIENT_CLAIMS]];
  if (STAFF_CLAIMS) actors.push(["staff", STAFF_CLAIMS]);
  if (HYBRID_CLAIMS) actors.push(["hibrido", HYBRID_CLAIMS]);
  for (const [who, claims] of actors) {
    for (const t of recursionTables) {
      const name = `F ${who} le ${t}`;
      try {
        await asUserRead(claims, `SELECT count(*)::int n FROM (SELECT 1 FROM public.${t} LIMIT 1) x`);
        record("recursion", name, true, "sem erro");
      } catch (e) {
        const isRec = /infinite recursion/i.test(e.message);
        record("recursion", name, false, (isRec ? "RECURSAO: " : "erro: ") + e.message);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // C. ESCRITAS E ESTRUTURA — verificacao por CATALOGO (nao executadas).
  // ────────────────────────────────────────────────────────────────────────
  console.log("\nC. Verificacao por catalogo (sem executar):");

  async function fnDef(name) {
    const r = await catalog(
      "SELECT pg_get_functiondef(p.oid) d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1 LIMIT 1",
      [name],
    );
    return r[0] ? r[0].d : null;
  }
  async function policyRow(table, name) {
    const r = await catalog(
      "SELECT qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename=$1 AND policyname=$2",
      [table, name],
    );
    return r[0] || null;
  }
  // Antes da correccao estas verificacoes so documentam; depois exigem ok.
  function expectFixed(name, ok, okMsg, redMsg) {
    if (fixApplied) record("catalog", name, ok, ok ? okMsg : "FALHOU: " + okMsg);
    else record("catalog(red)", name, true, ok ? "ja presente: " + okMsg : redMsg);
  }

  // C1 (A3) client_portal_documents: ALL por organizacao CRM + documento da org.
  {
    const p = await policyRow("client_portal_documents", "Org members manage portal documents");
    const q = (p && p.qual) || "";
    const w = (p && p.with_check) || "";
    const ok =
      /get_user_crm_org_ids/i.test(q) && /portal_document_in_org/i.test(q) &&
      /portal_document_in_org/i.test(w) && /portal_user_in_org/i.test(w);
    expectFixed("C1 client_portal_documents ALL por org e documento da org", ok,
      "exige membro CRM e documento/portal user da organizacao da linha",
      "aceita qualquer membership e qualquer documento (vulneravel)");
  }

  // C2 (A2) trigger em lista branca, com excepcao de equipa por organizacao.
  {
    const trg = await catalog(
      "SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='client_portal_users' AND t.tgname='tg_client_portal_users_guard_self_update' AND NOT t.tgisinternal",
    );
    const d = (await fnDef("tg_client_portal_users_guard_self_update")) || "";
    const ok =
      trg.length === 1 && /to_jsonb\(NEW\)/.test(d) &&
      /current_user_has_permission_in_org/.test(d) && !/NEW\.contract_id/.test(d);
    expectFixed("C2 client_portal_users trigger em lista branca", ok,
      "trigger presente; compara to_jsonb(NEW)/to_jsonb(OLD) sem os campos de login; equipa por organizacao",
      "sem trigger (update livre de colunas)");
  }

  // C3 bootstrap_org_creator sem EXECUTE a anon/authenticated.
  {
    const r = await catalog(
      "SELECT has_function_privilege('anon','public.bootstrap_org_creator(uuid,text)','EXECUTE') a, has_function_privilege('authenticated','public.bootstrap_org_creator(uuid,text)','EXECUTE') au",
    );
    const revoked = !r[0].a && !r[0].au;
    expectFixed("C3 bootstrap_org_creator REVOKE anon/authenticated", revoked,
      "sem EXECUTE para anon/authenticated", "ainda executavel (auto-promocao a super_admin)");
  }

  // C4 move/unlink exigem permissao.
  {
    const m = (await fnDef("move_organization_node")) || "";
    const u = (await fnDef("unlink_organization_node")) || "";
    const ok = /has_anew_permission/i.test(m) && /has_anew_permission/i.test(u);
    expectFixed("C4 move/unlink_organization_node exigem permissao", ok,
      "verificam has_anew_permission", "so verificam visibilidade");
  }

  // C5 anew_org_associations + anew_hierarchy por ambito (M1 incluido).
  {
    const assoc = await policyRow("anew_org_associations", "Admins can manage associations");
    const hIns = await policyRow("anew_hierarchy", "authenticated_insert_anew_hierarchy");
    const ok =
      !!assoc && /get_user_visible_org_ids/i.test(assoc.qual || "") &&
      !!hIns && /child_org_id/i.test(hIns.with_check || "") &&
      /org_is_own_unparented/i.test(hIns.with_check || "");
    expectFixed("C5 anew_org_associations/anew_hierarchy por ambito", ok,
      "org/associada e parent/child no ambito; filha nova sem pai criada pelo proprio aceite",
      "sem filtro de org / child");
  }

  // C6 anew_organizations self_registration exige ausencia de membership.
  {
    const p = await policyRow("anew_organizations", "authenticated_insert_anew_organizations");
    const ok = !!p && /user_can_self_register_first_org/i.test(p.with_check || "");
    expectFixed("C6 anew_organizations self_registration so sem membership", ok,
      "self_registration so cria a primeira organizacao", "cria orgs sem limite (escalacao via bootstrap)");
  }

  // C7 (M2) get_commercial_info: guarda por sessao; anon mantem EXECUTE.
  {
    const d = (await fnDef("get_commercial_info")) || "";
    const r = await catalog(
      "SELECT has_function_privilege('anon','public.get_commercial_info(uuid)','EXECUTE') a, EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_commercial_info_internal') i",
    );
    const ok = /get_commercial_info_internal/i.test(d) && /v_uid IS NULL/.test(d) && r[0].a === true && r[0].i === true;
    expectFixed("C7 get_commercial_info com guarda (ramo anonimo mantido)", ok,
      "anon so via link publico; autenticado so por ambito ou documento concedido",
      "devolve PII de qualquer utilizador por id");
  }

  // C8 roles/role_permissions/client_templates sem ramo de clientes.
  {
    const r = await policyRow("anew_roles", "anew_roles_select");
    const rp = await policyRow("anew_role_permissions", "anew_role_permissions_select");
    const t = await policyRow("client_contract_templates", "client_templates_select");
    const ok =
      !!r && /get_user_own_role_ids/i.test(r.qual || "") &&
      !!rp && /get_user_own_role_ids/i.test(rp.qual || "") &&
      !!t && /get_user_crm_org_ids/i.test(t.qual || "");
    expectFixed("C8 roles/role_permissions/client_templates sem clientes", ok,
      "ramos de membership via funcoes definer sem ligacoes de cliente",
      "ramo ancestors/membership em bruto");
  }

  // C9 (A1) INSERT/UPDATE de client_portal_users por organizacao.
  {
    const ins = await policyRow("client_portal_users", "Org members can insert client portal users");
    const upd = await policyRow("client_portal_users", "Org members can update client portal users");
    const ok =
      !!ins && /get_user_crm_org_ids/i.test(ins.with_check || "") &&
      !!upd && /get_user_crm_org_ids/i.test(upd.qual || "") && /get_user_crm_org_ids/i.test(upd.with_check || "");
    expectFixed("C9 client_portal_users INSERT/UPDATE por organizacao", ok,
      "exigem organizacao CRM do utilizador e proposals.edit nessa organizacao",
      "dependem so de has_anew_permission global");
  }

  // C10 (B1) nenhuma politica desta migration le directamente as tres tabelas
  //     que fecham ciclo (anew_users, anew_memberships, client_contract_templates).
  //     Percorre pg_policies para a lista NEW_POLICIES e aplica DIRECT_READ_RE a
  //     qual e with_check (FROM/JOIN dessas tabelas; referencias de coluna da
  //     propria tabela nao contam).
  {
    const rows = await catalog(
      "SELECT tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname='public'",
    );
    const byKey = new Map(rows.map((r) => [`${r.tablename}|${r.policyname}`, r]));
    const missing = [];
    const offenders = [];
    for (const [t, n] of NEW_POLICIES) {
      const r = byKey.get(`${t}|${n}`);
      if (!r) {
        missing.push(`${t}.${n}`);
        continue;
      }
      if (DIRECT_READ_RE.test(r.qual || "") || DIRECT_READ_RE.test(r.with_check || "")) offenders.push(`${t}.${n}`);
    }
    const ok = missing.length === 0 && offenders.length === 0;
    expectFixed("C10 nenhuma politica nova le anew_users/anew_memberships/client_contract_templates", ok,
      `${NEW_POLICIES.length} politicas presentes, nenhuma com FROM/JOIN dessas tabelas`,
      `por aplicar (em falta: ${missing.length}; com leitura directa: ${offenders.join(", ") || "nenhuma"})`);
    if (fixApplied && !ok) {
      console.log(`    em falta: ${missing.join(", ") || "-"}; leitura directa: ${offenders.join(", ") || "-"}`);
    }
  }

  // C11 funcoes auxiliares: SECURITY DEFINER, search_path fixo, sem anon.
  {
    const r = await catalog(
      `SELECT p.proname,
              p.prosecdef,
              coalesce(array_to_string(p.proconfig, ','), '') AS cfg,
              has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_x,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_x
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname::text = ANY($1::text[])`,
      [HELPERS],
    );
    const bad = HELPERS.filter((h) => {
      const row = r.find((x) => x.proname === h);
      return !row || !row.prosecdef || !/search_path=public/.test(row.cfg) || row.anon_x || !row.auth_x;
    });
    expectFixed("C11 funcoes auxiliares definer, search_path, sem anon", bad.length === 0,
      `${HELPERS.length} funcoes conformes`, `por criar (${bad.length} em falta)`);
  }

  // C12 nucleos com uid explicito e filter_visible_entity_ids: nem anon nem
  //     authenticated os executam (seriam oraculos por uid arbitrario).
  {
    const r = await catalog(
      `SELECT p.proname,
              has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_x,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_x
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname::text = ANY($1::text[])`,
      [[...CORE_HELPERS, "filter_visible_entity_ids"]],
    );
    const names = [...CORE_HELPERS, "filter_visible_entity_ids"];
    const bad = names.filter((h) => {
      const row = r.find((x) => x.proname === h);
      return !row || row.anon_x || row.auth_x;
    });
    const fdef = (await fnDef("filter_visible_entity_ids")) || "";
    const ok = bad.length === 0 && /portal_entity_visible_to/.test(fdef) && /can_see_entity/.test(fdef);
    expectFixed("C12 nucleos por uid e filter_visible_entity_ids so para service_role", ok,
      "sem EXECUTE para anon/authenticated; filter_visible_entity_ids com ramo do portal",
      `por aplicar (${bad.length} nucleos em falta ou expostos)`);
  }

  // C13 portal_document_in_org / portal_user_in_org so respondem sobre as orgs
  //     CRM do chamador (nao sao oraculos de existencia).
  {
    const a = (await fnDef("portal_document_in_org")) || "";
    const b = (await fnDef("portal_user_in_org")) || "";
    const ok = /get_user_crm_org_ids/.test(a) && /get_user_crm_org_ids/.test(b);
    expectFixed("C13 portal_document_in_org/portal_user_in_org limitadas as orgs do chamador", ok,
      "ambas exigem _org_id nas organizacoes CRM do chamador", "por criar");
  }

  // C14 fiscal_entities e proposal_rejection_reasons com politica de portal.
  {
    const fe = await policyRow("fiscal_entities", "portal_client_reads_portal_fiscal_entities");
    const rr = await policyRow("proposal_rejection_reasons", "portal_client_reads_org_rejection_reasons");
    const ok =
      !!fe && /portal_visible_fiscal_entity_ids/.test(fe.qual || "") &&
      !!rr && /portal_linked_org_ids/.test(rr.qual || "");
    expectFixed("C14 politicas de portal em fiscal_entities e proposal_rejection_reasons", ok,
      "ambas presentes e por funcao definer", "por criar");
  }

  // C15 fiscal_entities UPDATE por ambito de entidade (sem executar a escrita):
  //     USING e WITH CHECK usam is_entity_in_user_scope e nenhum dos dois le
  //     anew_memberships/anew_users. A INSERT e so mostrada (nao alterada).
  {
    const up = await policyRow("fiscal_entities", "authenticated_update_fiscal_entities");
    const ins = await policyRow("fiscal_entities", "authenticated_insert_fiscal_entities");
    const q = (up && up.qual) || "";
    const w = (up && up.with_check) || "";
    const ok =
      !!up && /is_entity_in_user_scope/.test(q) && /is_entity_in_user_scope/.test(w) &&
      !DIRECT_READ_RE.test(q) && !DIRECT_READ_RE.test(w);
    expectFixed("C15 fiscal_entities UPDATE espelha a leitura por entidade", ok,
      "USING e WITH CHECK por is_entity_in_user_scope, sem membership em bruto",
      "UPDATE aceita qualquer membership activa (cliente incluido) — vulneravel");
    console.log(`    (info) INSERT fiscal_entities WITH CHECK actual: ${ins ? (ins.with_check || "null") : "politica ausente"}`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // D. ESCRITAS EXECUTADAS (BEGIN ... ROLLBACK), so na linha do cliente nike.
  //    D1: mudar contract_id — antes passa (vulneravel), depois recusado.
  //    D2: mudar last_login_at (o que o portal faz) — tem de passar sempre.
  // ────────────────────────────────────────────────────────────────────────
  console.log("\nD. Escritas executadas (BEGIN...ROLLBACK, so na linha do cliente nike):");
  async function clientWrite(sql, params) {
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL ROLE authenticated");
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [CLIENT_CLAIMS]);
      const r = await client.query(sql, params);
      return { rows: r.rowCount, err: null };
    } catch (e) {
      return { rows: 0, err: e.message };
    } finally {
      await client.query("ROLLBACK");
    }
  }

  if (!OTHER_CONTRACT) {
    record("write-exec", "D1 cliente nao consegue mudar contract_id", true,
      "sem alvo: nenhum contrato da nike fora do alcance do cliente");
  } else {
    // Alvo: contrato da nike NAO concedido ao cliente (escolhido no inicio).
    const r = await clientWrite(
      `UPDATE public.client_portal_users SET contract_id = $1
        WHERE auth_user_id = $2 AND organization_id = $3 RETURNING id`,
      [OTHER_CONTRACT, CLIENT_AUTH, NIKE_ORG],
    );
    if (fixApplied) {
      record("write-exec", "D1 cliente nao consegue mudar contract_id", !!r.err && r.rows === 0,
        r.err ? `recusado: ${r.err}` : "ESCRITA PASSOU — isolamento falhou");
    } else {
      record("write-exec(red)", "D1 cliente consegue mudar contract_id (vulneravel)", true,
        r.rows > 0 ? "a escrita passou (sera bloqueada apos a correccao)" : `nao passou: ${r.err || "0 linhas"}`);
    }
  }
  {
    const r = await clientWrite(
      `UPDATE public.client_portal_users SET last_login_at = now(), first_login = first_login
        WHERE auth_user_id = $1 AND organization_id = $2 RETURNING id`,
      [CLIENT_AUTH, NIKE_ORG],
    );
    record("write-exec", "D2 cliente continua a gravar last_login_at", !r.err && r.rows >= 1,
      r.err ? `erro: ${r.err}` : `${r.rows} linha(s) actualizada(s) e revertida(s)`);
  }

  // ── Resumo ────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log(`\n== Resumo: ${results.length - failed.length}/${results.length} OK ==`);
  if (failed.length > 0) {
    console.log("Falhas:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  }
  await client.end();
  // So falha o processo quando a correccao esta aplicada e algo nao se confirma
  // (verde exigido), ou quando algo que tem de valer SEMPRE falha (B, E, F, G1,
  // G2, H, D2).
  const alwaysSections = new Set(["own", "staff", "recursion", "write-exec", "hybrid"]);
  const hardFail = failed.some((f) => fixApplied || alwaysSections.has(f.section));
  process.exit(hardFail ? 1 : 0);
}

main().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(2);
});
