/**
 * Prova o Financeiro (faturas registadas, pagamentos validados) e a obra que
 * nasce do 1.º pagamento, contra um Postgres limpo (PGlite), sem tocar no
 * Supabase.
 *
 * Corre DOIS ficheiros:
 *   · a migration do CRM supabase/migrations/20261214100000_financeiro_faturas_recibos.sql
 *     (sobre stubs mínimos do CRM — a baseline inteira não carrega no PGlite);
 *   · db/financeiro-obra.sql, depois da sequência de Operações até obras.sql.
 *
 * O que interessa aqui:
 *   · o plano de pagamento sai do texto do contrato ("50% + 50%") e a última
 *     tranche leva o resto;
 *   · registar: número repetido, tranche já faturada, data no futuro, origem
 *     inválida e PDF de outra organização são recusados;
 *   · validar o pagamento cria o recibo e marca a fatura paga; o 1.º pagamento
 *     do contrato avisa Operações e Armazém UMA vez só;
 *   · anular exige motivo e não mexe numa fatura paga;
 *   · isolamento entre organizações e escrita só por RPC;
 *   · Operações veem "obra por criar" e, criada a obra, o aviso resolve-se;
 *   · os dois ficheiros correm duas vezes sem erro nem duplicados.
 *
 *     node tools/validar-financeiro.mjs
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AUTENTICACAO_REAL, PRIVILEGIOS_SUPABASE, STUBS_CRM } from "./_stubs-crm.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (f) => readFileSync(join(RAIZ, "db", f), "utf8");
const MIGRATION = readFileSync(
  join(RAIZ, "..", "supabase", "migrations", "20261214100000_financeiro_faturas_recibos.sql"),
  "utf8"
);

const db = new PGlite();
await db.waitReady;
const q = async (sql) => (await db.query(sql)).rows;
const um = async (sql) => (await q(sql))[0];

const falhas = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mau = (m) => {
  console.log(`  ✗ ${m}`);
  falhas.push(m);
};

/* ── Identidades ────────────────────────────────────────────────────────── */
const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "11111111-2222-2222-2222-222222222222";
const CLI_A = "22222222-2222-2222-2222-222222222222";
const ENT_A = "77777777-7777-7777-7777-777777777777";

const U = {
  fin: "a0000000-0000-0000-0000-0000000000f1",
  dir: "a0000000-0000-0000-0000-0000000000d1",
  gestor: "a0000000-0000-0000-0000-0000000000a1",
  armazem: "a0000000-0000-0000-0000-0000000000b1",
  comercial: "a0000000-0000-0000-0000-0000000000c1",
  finB: "b0000000-0000-0000-0000-0000000000f1",
};
const AUTH = Object.fromEntries(Object.entries(U).map(([k, v]) => [k, v.replace(/^a/, "e").replace(/^b/, "d")]));

const CTR_NOVO = "88880000-0000-0000-0000-000000000001"; // 50% + 50%, assinado hoje
const CTR_UNICO = "88880000-0000-0000-0000-000000000002"; // sem percentagens → 100%
const CTR_ANTIGO = "88880000-0000-0000-0000-000000000003"; // assinado há 1 ano → fora da lista
const CTR_RASCUNHO = "88880000-0000-0000-0000-000000000004";
const CTR_B = "88880000-0000-0000-0000-000000000005";

const R = {
  orgAdminA: "d0000000-0000-0000-0000-00000000000a",
  orgAdminB: "d0000000-0000-0000-0000-00000000000b",
  direcao: "d0000000-0000-0000-0000-00000000000c",
  ops: "d0000000-0000-0000-0000-00000000000d",
  armazem: "d0000000-0000-0000-0000-00000000000e",
  comercial: "d0000000-0000-0000-0000-00000000000f",
};

/* ── Um CRM mínimo, como o real ─────────────────────────────────────────── */
await db.exec(STUBS_CRM);
await db.exec(PRIVILEGIOS_SUPABASE);
await db.exec(AUTENTICACAO_REAL);
await db.exec(`
  -- Colunas do anew_roles / anew_role_permissions reais que a migration usa.
  ALTER TABLE public.anew_roles
    ADD COLUMN code text, ADD COLUMN description text,
    ADD COLUMN is_default boolean DEFAULT false,
    ADD COLUMN can_sign_contracts boolean NOT NULL DEFAULT false,
    ADD COLUMN created_by uuid;
  ALTER TABLE public.anew_role_permissions ADD COLUMN created_by uuid;

  -- Contratos: só as colunas que a migration e obras.sql leem.
  CREATE TABLE public.client_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_number text,
    client_id uuid,
    entity_id uuid,
    status text NOT NULL DEFAULT 'draft',
    total_value numeric DEFAULT 0,
    currency text DEFAULT 'EUR',
    payment_terms text,
    organization_id uuid NOT NULL,
    quote_id uuid,
    notes text,
    signature_date timestamptz,
    company_signature_date timestamptz,
    accepted_at timestamptz,
    status_changed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    deleted_at timestamptz);
  GRANT ALL ON public.client_contracts TO anon, authenticated, service_role;

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG_A}','Org A'), ('${ORG_B}','Org B');
  INSERT INTO public.anew_entities (id, display_name) VALUES ('${ENT_A}','Maria Silva');
  INSERT INTO public.anew_clients (id, organization_id, entity_id) VALUES ('${CLI_A}','${ORG_A}','${ENT_A}');

  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${U.fin}','${AUTH.fin}','Financeira','f@x.pt'),
    ('${U.dir}','${AUTH.dir}','Diretora','d@x.pt'),
    ('${U.gestor}','${AUTH.gestor}','Gestor de obra','g@x.pt'),
    ('${U.armazem}','${AUTH.armazem}','Armazém','a@x.pt'),
    ('${U.comercial}','${AUTH.comercial}','Comercial','c@x.pt'),
    ('${U.finB}','${AUTH.finB}','Financeira B','fb@x.pt');

  -- Antes da migration: o Administrador de cada organização (é por ele que
  -- a migration sabe onde criar a função "Financeiro") e uma "Direção".
  INSERT INTO public.anew_roles (id, organization_id, name, code) VALUES
    ('${R.orgAdminA}','${ORG_A}','Administrador','org_admin'),
    ('${R.orgAdminB}','${ORG_B}','Administrador','org_admin'),
    ('${R.direcao}','${ORG_A}','Direção','direcao'),
    ('${R.ops}','${ORG_A}','Operações','operacoes'),
    ('${R.armazem}','${ORG_A}','Armazém','armazem'),
    ('${R.comercial}','${ORG_A}','Comercial','comercial');
  INSERT INTO public.anew_permissions (code, name, category) VALUES
    ('client_contracts.view','Ver contratos','client_contracts'),
    ('clients.view','Ver clientes','clients'),
    ('purchase_orders.create','Criar encomendas','purchase_orders');
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('${R.armazem}','purchase_orders.create'),
    ('${R.comercial}','client_contracts.view');

  INSERT INTO public.client_contracts
    (id, contract_number, client_id, status, total_value, payment_terms, organization_id, signature_date, created_by) VALUES
    ('${CTR_NOVO}','CT-001','${CLI_A}','signed',10000.01,'50% na adjudicação, 50% na conclusão','${ORG_A}',now(),'${U.dir}'),
    ('${CTR_UNICO}','CT-002','${CLI_A}','assinado',2500,'Pagamento a pronto','${ORG_A}',now(),'${U.dir}'),
    ('${CTR_ANTIGO}','CT-000','${CLI_A}','signed',900,NULL,'${ORG_A}',now() - interval '1 year','${U.dir}'),
    ('${CTR_RASCUNHO}','CT-003','${CLI_A}','draft',100,NULL,'${ORG_A}',NULL,'${U.dir}'),
    ('${CTR_B}','CT-B-1',NULL,'signed',700,NULL,'${ORG_B}',now(),'${U.finB}');
`);

/* ── A migration do CRM, duas vezes ─────────────────────────────────────── */
console.log("\n─── migration do CRM (financeiro) ───────");
const contarCrm = async () =>
  um(`SELECT (SELECT count(*)::int FROM public.anew_permissions WHERE category = 'finance') AS perms,
             (SELECT count(*)::int FROM public.anew_roles WHERE code = 'financeiro') AS funcoes,
             (SELECT count(*)::int FROM public.anew_role_permissions) AS atribuicoes,
             (SELECT count(*)::int FROM public.client_finance_settings) AS settings,
             (SELECT count(*)::int FROM pg_policies WHERE tablename LIKE 'client\\_%') AS policies`);
try {
  await db.exec(MIGRATION);
  ok("a migration corre");
} catch (e) {
  mau(`a migration falhou: ${e.message}`);
  process.exit(1);
}
const crm1 = await contarCrm();
try {
  await db.exec(MIGRATION);
  ok("a migration corre outra vez (idempotente)");
} catch (e) {
  mau(`a migration não é idempotente: ${e.message}`);
}
const crm2 = await contarCrm();
JSON.stringify(crm1) === JSON.stringify(crm2)
  ? ok(`a segunda passagem não duplicou nada (${JSON.stringify(crm2)})`)
  : mau(`a segunda passagem mudou contagens: ${JSON.stringify(crm1)} → ${JSON.stringify(crm2)}`);
crm2.perms === 3 && crm2.funcoes === 2 && crm2.settings === 2
  ? ok("3 permissões finance.*, a função Financeiro nas 2 organizações com Administrador, faturar_desde semeado")
  : mau(`contagens inesperadas: ${JSON.stringify(crm2)}`);
{
  const r = await um(`
    SELECT
      (SELECT count(*)::int FROM public.anew_role_permissions WHERE role_id = '${R.orgAdminA}' AND permission_code LIKE 'finance.%') AS admin,
      (SELECT count(*)::int FROM public.anew_role_permissions WHERE role_id = '${R.direcao}' AND permission_code LIKE 'finance.%') AS direcao,
      (SELECT count(*)::int FROM public.anew_role_permissions WHERE role_id = '${R.comercial}' AND permission_code LIKE 'finance.%') AS comercial,
      (SELECT count(*)::int FROM public.anew_role_permissions rp JOIN public.anew_roles r ON r.id = rp.role_id
        WHERE r.code = 'financeiro' AND r.organization_id = '${ORG_A}') AS financeiro`);
  r.admin === 3 && r.direcao === 3 && r.comercial === 0 && r.financeiro === 5
    ? ok("Administrador e Direção com finance.*, Financeiro com finance.* + ver contratos e clientes, Comercial sem nada")
    : mau(`atribuições: ${JSON.stringify(r)}`);
}

/* ── Operações até obras.sql, e financeiro-obra.sql duas vezes ──────────── */
console.log("\n─── Operações: financeiro-obra.sql ──────");
const SEQUENCIA = [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
  "seguranca.sql", "tempos.sql", "obras.sql",
];
for (const f of SEQUENCIA) {
  try {
    await db.exec(ler(f));
  } catch (e) {
    console.error(`✗ ${f} falhou antes de chegar ao financeiro-obra.sql: ${e.message}`);
    process.exit(1);
  }
}
try {
  await db.exec(ler("financeiro-obra.sql"));
  await db.exec(ler("financeiro-obra.sql"));
  ok("financeiro-obra.sql corre duas vezes");
} catch (e) {
  mau(`financeiro-obra.sql falhou: ${e.message}`);
  process.exit(1);
}
{
  const t = await um(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'ops_obra_fin_resolver_aviso'`);
  t.n === 1 ? ok("um só gatilho ops_obra_fin_resolver_aviso") : mau(`gatilhos: ${t.n}`);
}

/* ── Pessoas nas funções ────────────────────────────────────────────────── */
await db.exec(`
  -- A CHECK de funcao pode ainda não aceitar 'supervisor' (outro trabalho);
  -- aqui só se usa 'gestor'.
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT '${R.ops}', code FROM public.anew_permissions WHERE category = 'operations'
  ON CONFLICT DO NOTHING;
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${U.fin}','${ORG_A}',(SELECT id FROM public.anew_roles WHERE code = 'financeiro' AND organization_id = '${ORG_A}'),'active'),
    ('${U.dir}','${ORG_A}','${R.direcao}','active'),
    ('${U.gestor}','${ORG_A}','${R.ops}','active'),
    ('${U.armazem}','${ORG_A}','${R.armazem}','active'),
    ('${U.comercial}','${ORG_A}','${R.comercial}','active'),
    ('${U.finB}','${ORG_B}',(SELECT id FROM public.anew_roles WHERE code = 'financeiro' AND organization_id = '${ORG_B}'),'active');
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao, custo_hora) VALUES
    ('${ORG_A}','${U.gestor}','gestor', 30.00);
  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
`);

/* ── Auxiliares ─────────────────────────────────────────────────────────── */
const sessao = (authUid, sql) => `
  BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '${authUid}';
  ${sql}
  COMMIT;`;

async function chamar(authUid, sql) {
  const r = await db.exec(sessao(authUid, sql));
  const linhas = r.flatMap((x) => x.rows ?? []);
  const bruto = Object.values(linhas.at(-1) ?? {})[0];
  return typeof bruto === "string" && (bruto.startsWith("{") || bruto.startsWith("[")) ? JSON.parse(bruto) : bruto;
}

async function deveSerRecusado(nome, authUid, sql, trecho) {
  try {
    await db.exec(sessao(authUid, sql));
    mau(`${nome} — PASSOU, e devia ter sido recusado`);
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    if (!trecho || e.message.includes(trecho)) ok(nome);
    else mau(`${nome} — recusado com a mensagem errada: ${e.message.split("\n")[0]}`);
  }
}

async function devePassar(nome, authUid, sql) {
  try {
    const r = await chamar(authUid, sql);
    ok(nome);
    return r;
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    mau(`${nome} — falhou: ${e.message.split("\n")[0]}`);
    return null;
  }
}

const fila = (auth, org = ORG_A) => chamar(auth, `SELECT public.rpc_fin_fila('${org}');`);
const registar = (ctr, ordem, numero, valor, extra = "") =>
  `SELECT public.rpc_fin_registar_fatura('${ctr}', ${ordem}, '${numero}', current_date, ${valor}, 'PHC'${extra});`;
const avisos = () =>
  q(`SELECT n.type, n.kind, n.user_id, n.title, n.link, n.is_resolved, n.entity_id
       FROM public.notifications n WHERE n.type LIKE 'financeiro_%' ORDER BY n.type`);

/* ── O plano sugerido ───────────────────────────────────────────────────── */
console.log("\n─── plano de pagamento ──────────────────");
{
  const r = await q(`SELECT * FROM public.fin_tranches_sugeridas('30% + 30% + 40%', 1000)`);
  r.length === 3 && r[0].descricao === "Adiantamento 30%" && r[1].descricao === "A meio 30%" && r[2].descricao === "Final 40%"
    ? ok("30% + 30% + 40% → Adiantamento, A meio, Final")
    : mau(`3 tranches: ${JSON.stringify(r)}`);
  const u = await q(`SELECT * FROM public.fin_tranches_sugeridas('IVA a 23%', 500)`);
  u.length === 1 && u[0].descricao === "Única 100%" && Number(u[0].valor) === 500
    ? ok("uma só percentagem (ou que não soma 100) → Única 100%")
    : mau(`única: ${JSON.stringify(u)}`);
  const s = await q(`SELECT * FROM public.fin_tranches_sugeridas('40% e 40%', 500)`);
  s.length === 1 ? ok("40% + 40% não soma 100 → Única 100%") : mau(`não soma 100: ${JSON.stringify(s)}`);
}

/* ── A fila ─────────────────────────────────────────────────────────────── */
console.log("\n─── a fila ──────────────────────────────");
{
  const f = await fila(AUTH.fin);
  const novo = f.por_faturar.filter((x) => x.contract_id === CTR_NOVO);
  const unico = f.por_faturar.filter((x) => x.contract_id === CTR_UNICO);
  novo.length === 2 && Number(novo[0].valor_sugerido) === 5000 && Number(novo[1].valor_sugerido) === 5000.01
    && novo[0].tranche_descricao === "Adiantamento 50%" && novo[0].cliente_nome === "Maria Silva" && novo[0].dispara_obra
    ? ok("contrato 50% + 50%: duas tranches, 5000 e 5000,01 (a última leva o resto), cliente pelo nome")
    : mau(`tranches do contrato novo: ${JSON.stringify(novo)}`);
  unico.length === 1 && unico[0].tranche_descricao === "Única 100%"
    ? ok("contrato sem percentagens: Única 100%")
    : mau(`contrato único: ${JSON.stringify(unico)}`);
  !f.por_faturar.some((x) => x.contract_id === CTR_ANTIGO)
    ? ok("contrato assinado antes de faturar_desde fica fora")
    : mau("o contrato antigo aparece por faturar");
  !f.por_faturar.some((x) => x.contract_id === CTR_RASCUNHO || x.contract_id === CTR_B)
    ? ok("rascunhos e contratos de outra organização ficam fora")
    : mau("aparece um rascunho ou um contrato da B");
  f.por_validar.length === 0 ? ok("nada por validar ainda") : mau(`por validar: ${f.por_validar.length}`);
}
await deveSerRecusado("o comercial não abre o Financeiro", AUTH.comercial, `SELECT public.rpc_fin_fila('${ORG_A}');`, "Sem permissão");
await deveSerRecusado("a financeira da B não vê a fila da A", AUTH.finB, `SELECT public.rpc_fin_fila('${ORG_A}');`, "Sem permissão");

/* ── Registar ───────────────────────────────────────────────────────────── */
console.log("\n─── registar fatura ─────────────────────");
const fat1 = await devePassar("a financeira regista a FT 2026/1 na tranche 1", AUTH.fin, registar(CTR_NOVO, 1, "FT 2026/1", 5000));
{
  const t = await um(`SELECT count(*)::int AS n FROM public.client_payment_tranches WHERE contract_id = '${CTR_NOVO}'`);
  t.n === 2 ? ok("o plano ficou gravado (2 tranches) na 1.ª fatura") : mau(`tranches gravadas: ${t.n}`);
}
await deveSerRecusado("o mesmo número outra vez (maiúsculas e espaços não enganam)", AUTH.fin,
  registar(CTR_NOVO, 2, " ft 2026/1 ", 5000.01), "já está registada");
await deveSerRecusado("a mesma tranche outra vez", AUTH.fin, registar(CTR_NOVO, 1, "FT 2026/9", 5000), "já tem a fatura");
await deveSerRecusado("tranche fora do plano", AUTH.fin, registar(CTR_NOVO, 3, "FT 2026/8", 10), "não está no plano");
await deveSerRecusado("data no futuro", AUTH.fin,
  `SELECT public.rpc_fin_registar_fatura('${CTR_NOVO}', 2, 'FT 2026/7', current_date + 2, 10, 'PHC');`, "futuro");
await deveSerRecusado("origem fora da lista", AUTH.fin,
  `SELECT public.rpc_fin_registar_fatura('${CTR_NOVO}', 2, 'FT 2026/7', current_date, 10, 'Excel');`, "programa");
await deveSerRecusado("valor zero", AUTH.fin, registar(CTR_NOVO, 2, "FT 2026/7", 0), "maior do que zero");
await deveSerRecusado("PDF na pasta de outra organização", AUTH.fin,
  registar(CTR_NOVO, 2, "FT 2026/7", 10, `, NULL, '${ORG_B}/client_invoice/x.pdf'`), "PDF");
await deveSerRecusado("contrato em rascunho", AUTH.fin, registar(CTR_RASCUNHO, 1, "FT 2026/6", 10), "assinado");
await deveSerRecusado("o comercial não regista", AUTH.comercial, registar(CTR_UNICO, 1, "FT 2026/5", 10), "Sem permissão");
await deveSerRecusado("a financeira da B não regista num contrato da A", AUTH.finB, registar(CTR_UNICO, 1, "FT 2026/5", 10), "Sem permissão");
await deveSerRecusado("escrever direto na tabela é recusado", AUTH.fin,
  `INSERT INTO public.client_invoices (organization_id, contract_id, tranche_id, numero, data, valor, invoice_source)
   SELECT '${ORG_A}', '${CTR_NOVO}', id, 'X', current_date, 1, 'PHC' FROM public.client_payment_tranches LIMIT 1;`,
  "permission denied");
{
  const f = await fila(AUTH.fin);
  const novo = f.por_faturar.filter((x) => x.contract_id === CTR_NOVO);
  novo.length === 1 && novo[0].tranche_ordem === 2 && f.por_validar.length === 1 && f.por_validar[0].numero === "FT 2026/1"
    && f.por_validar[0].dispara_obra === true
    ? ok("na fila: só a tranche 2 por faturar; a FT 2026/1 por validar, e é a que põe a obra a andar")
    : mau(`fila depois de registar: ${JSON.stringify({ novo, pv: f.por_validar })}`);
}
{
  const n = await um(`SELECT count(*)::int AS n FROM public.client_invoices`);
  n.n === 1 ? ok("nenhuma recusa deixou fatura escrita") : mau(`faturas: ${n.n}`);
}

/* ── Validar o pagamento ────────────────────────────────────────────────── */
console.log("\n─── validar pagamento ───────────────────");
await deveSerRecusado("o comercial não valida", AUTH.comercial,
  `SELECT public.rpc_fin_validar_pagamento('${fat1?.id}', current_date);`, "Sem permissão");
await deveSerRecusado("data do pagamento no futuro", AUTH.fin,
  `SELECT public.rpc_fin_validar_pagamento('${fat1?.id}', current_date + 1);`, "futuro");
const v1 = await devePassar("a financeira valida o pagamento da FT 2026/1", AUTH.fin,
  `SELECT public.rpc_fin_validar_pagamento('${fat1?.id}', current_date);`);
v1?.primeiro_pagamento === true && v1?.avisos === 2
  ? ok("é o 1.º pagamento do contrato: 2 avisos (Operações e Armazém)")
  : mau(`resposta da validação: ${JSON.stringify(v1)}`);
{
  const inv = await um(`SELECT estado FROM public.client_invoices WHERE id = '${fat1?.id}'`);
  const rec = await um(`SELECT count(*)::int AS n, max(valor) AS valor FROM public.client_receipts WHERE invoice_id = '${fat1?.id}'`);
  inv?.estado === "paga" && rec.n === 1 && Number(rec.valor) === 5000
    ? ok("a fatura ficou paga e há um recibo de 5000 €")
    : mau(`fatura ${inv?.estado}, recibos ${JSON.stringify(rec)}`);
  const a = await avisos();
  const obra = a.find((x) => x.type === "financeiro_criar_obra");
  const mat = a.find((x) => x.type === "financeiro_materiais_obra");
  a.length === 2 && obra?.user_id === AUTH.gestor && mat?.user_id === AUTH.armazem
    && obra.kind === "notification" && obra.title === "Criar obra: Maria Silva"
    && obra.link === `/operacao/obras?criar=${CTR_NOVO}` && obra.entity_id === CTR_NOVO
    ? ok("sino: \"Criar obra: Maria Silva\" ao gestor e \"Materiais da obra\" ao armazém (kind notification, id de AUTH)")
    : mau(`avisos: ${JSON.stringify(a)}`);
  const ev = await um(`SELECT count(*)::int AS n FROM public.client_finance_events WHERE contract_id = '${CTR_NOVO}'`);
  ev.n === 1 ? ok("um evento primeiro_pagamento para Operações") : mau(`eventos: ${ev.n}`);
}
await deveSerRecusado("validar a mesma fatura outra vez", AUTH.fin,
  `SELECT public.rpc_fin_validar_pagamento('${fat1?.id}', current_date);`, "já foi validado");

const fat2 = await devePassar("a Direção regista a tranche final", AUTH.dir, registar(CTR_NOVO, 2, "FT 2026/2", 5000.01));
const v2 = await devePassar("a Direção valida o pagamento final", AUTH.dir,
  `SELECT public.rpc_fin_validar_pagamento('${fat2?.id}', current_date);`);
{
  const a = await avisos();
  const ev = await um(`SELECT count(*)::int AS n FROM public.client_finance_events`);
  v2?.primeiro_pagamento === false && v2?.avisos === 0 && a.length === 2 && ev.n === 1
    ? ok("o 2.º pagamento não volta a avisar nem cria outro evento")
    : mau(`2.º pagamento: ${JSON.stringify(v2)}, avisos ${a.length}, eventos ${ev.n}`);
  const f = await fila(AUTH.fin);
  !f.por_faturar.some((x) => x.contract_id === CTR_NOVO) && f.por_validar.length === 0
    ? ok("contrato todo faturado e pago: sai das duas listas")
    : mau(`fila no fim: ${JSON.stringify(f)}`);
}

/* ── Anular ─────────────────────────────────────────────────────────────── */
console.log("\n─── anular ──────────────────────────────");
const fat3 = await devePassar("regista a FT 2026/3 no contrato único", AUTH.fin, registar(CTR_UNICO, 1, "FT 2026/3", 2500));
await deveSerRecusado("anular sem motivo", AUTH.fin, `SELECT public.rpc_fin_anular_fatura('${fat3?.id}', '  ');`, "motivo");
await deveSerRecusado("o comercial não anula", AUTH.comercial,
  `SELECT public.rpc_fin_anular_fatura('${fat3?.id}', 'Engano');`, "Sem permissão");
await devePassar("anular com motivo", AUTH.fin, `SELECT public.rpc_fin_anular_fatura('${fat3?.id}', 'Valor errado');`);
{
  const f = await fila(AUTH.fin);
  f.por_faturar.some((x) => x.contract_id === CTR_UNICO) && f.por_validar.length === 0
    ? ok("a tranche voltou a ficar por faturar")
    : mau(`fila depois de anular: ${JSON.stringify(f)}`);
}
await devePassar("o mesmo número pode registar-se de novo depois de anulado", AUTH.fin, registar(CTR_UNICO, 1, "FT 2026/3", 2400));
await deveSerRecusado("uma fatura paga não se anula", AUTH.fin,
  `SELECT public.rpc_fin_anular_fatura('${fat1?.id}', 'Engano');`, "nota de crédito");

/* ── Operações: a obra por criar ────────────────────────────────────────── */
console.log("\n─── Operações: obra por criar ───────────");
{
  const l = await devePassar("o gestor lê as obras por criar", AUTH.gestor, `SELECT public.rpc_ops_obras_por_criar('${ORG_A}');`);
  Array.isArray(l) && l.length === 1 && l[0].contrato_id === CTR_NOVO && l[0].cliente_nome === "Maria Silva"
    ? ok("aparece \"Maria Silva\" (CT-001) — pagamento recebido, sem obra")
    : mau(`obras por criar: ${JSON.stringify(l)}`);
}
await deveSerRecusado("a financeira (sem Operações) não lê a lista de Operações", AUTH.fin,
  `SELECT public.rpc_ops_obras_por_criar('${ORG_A}');`, "Sem permissão");
await devePassar("o gestor cria a obra a partir do contrato (caminho de sempre)", AUTH.gestor,
  `SELECT public.rpc_ops_obra_criar(p_org => '${ORG_A}', p_contrato_id => '${CTR_NOVO}');`);
{
  const o = await um(`SELECT estado FROM public.ops_obra WHERE contrato_id = '${CTR_NOVO}'`);
  o?.estado === "planeada" ? ok("a obra nasce 'planeada' (plano por aprovar)") : mau(`obra: ${JSON.stringify(o)}`);
  const a = await avisos();
  const obra = a.find((x) => x.type === "financeiro_criar_obra");
  const mat = a.find((x) => x.type === "financeiro_materiais_obra");
  obra?.is_resolved === true && mat?.is_resolved === false
    ? ok("o aviso \"Criar obra\" ficou resolvido; o dos materiais continua (é do Armazém)")
    : mau(`avisos depois da obra: ${JSON.stringify(a)}`);
  const l = await chamar(AUTH.gestor, `SELECT public.rpc_ops_obras_por_criar('${ORG_A}');`);
  Array.isArray(l) && l.length === 0 ? ok("o contrato sai da lista de obras por criar") : mau(`ainda na lista: ${JSON.stringify(l)}`);
}
{
  const c = await um(`SELECT count(*)::int AS n, string_agg(status, ',' ORDER BY id) AS s FROM public.client_contracts`);
  c.n === 5 && c.s === "signed,assinado,signed,draft,signed"
    ? ok("client_contracts exatamente como estava (nada lhe escreve)")
    : mau(`client_contracts mudou: ${JSON.stringify(c)}`);
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ financeiro: registar, validar, 1.º pagamento avisa uma vez, anular, isolamento e a obra por criar");
