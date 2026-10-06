/**
 * Prova db/margem-previsao.sql contra um Postgres limpo (PGlite), sem tocar
 * no Supabase.
 *
 * O que interessa aqui:
 *   · a margem lê o vendido sem IVA e separa a mão de obra orçada (linhas de
 *     serviço / "Mão de Obra") dos materiais — como o CRM real guarda;
 *   · prevista, a esta data e projetada batem com as contas feitas à mão;
 *   · o ritmo da obra (real ÷ previsto das feitas) entra na projeção;
 *   · os extras aprovados somam à receita;
 *   · só quem vê custos (gestor/admin) recebe valores — técnico e supervisor
 *     recebem {ve_custos:false}, e a lista do semáforo vem vazia;
 *   · só o gestor muda o limiar; o aviso no sino nasce abaixo do limiar e
 *     resolve-se sozinho quando a margem recupera;
 *   · a previsão (P50/P80, dias úteis) não grava nada, e o CRM fica intacto;
 *   · o ficheiro corre duas vezes.
 *
 *     npm run validar-margem-previsao
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STUBS_CRM } from "./_stubs-crm.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (f) => readFileSync(join(RAIZ, "db", f), "utf8");

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
const perto = (a, b, tol = 0.6) => a != null && Math.abs(Number(a) - b) <= tol;

const ORG = "11111111-1111-1111-1111-111111111111";
const CLI = "22222222-2222-2222-2222-222222222222";
const U = {
  gestor: "a0000000-0000-0000-0000-00000000000a",
  sup: "a0000000-0000-0000-0000-00000000000b",
  tec: "a0000000-0000-0000-0000-00000000000c",
  op: "a0000000-0000-0000-0000-00000000000d",
};
const AUTH = Object.fromEntries(Object.entries(U).map(([k, v]) => [k, v.replace(/^a/, "e")]));
const ORC = "99990000-0000-0000-0000-000000000001";
const SERV = "5e000000-0000-0000-0000-000000000001";
const OBRA = "0b000000-0000-0000-0000-000000000001";
const FASE = "0f000000-0000-0000-0000-000000000001";
const T = [1, 2, 3, 4].map((i) => `7a000000-0000-0000-0000-00000000000${i}`);

/* ── Um CRM como o real ─────────────────────────────────────────────────── */
await db.exec(STUBS_CRM);
await db.exec(`
  CREATE TABLE public.client_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contract_number text, client_id uuid,
    status text NOT NULL DEFAULT 'draft', total_value numeric DEFAULT 0, currency text DEFAULT 'EUR',
    organization_id uuid NOT NULL, quote_id uuid, notes text, signature_date timestamptz,
    company_signature_date timestamptz, accepted_at timestamptz, created_by uuid NOT NULL, deleted_at timestamptz);
  -- As colunas de dinheiro que o CRM real tem (06/10/2026) e o stub não.
  ALTER TABLE public.quotes ADD COLUMN subtotal numeric, ADD COLUMN desconto_global_percent numeric,
                            ADD COLUMN total_fees numeric;
  ALTER TABLE public.quote_lines ADD COLUMN service_id uuid;

  CREATE TABLE public.auth_to_business_user_map (auth_user_id uuid, business_user_id uuid);
  CREATE OR REPLACE FUNCTION public.current_business_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT m.business_user_id FROM public.auth_to_business_user_map m
     WHERE m.auth_user_id = auth.uid() LIMIT 1 $fn$;
  CREATE OR REPLACE FUNCTION public.has_anew_permission(_auth_uid uuid, _permission_code text)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT EXISTS (
      SELECT 1 FROM public.anew_users au
        JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
        JOIN public.anew_role_permissions arp
          ON arp.role_id = am.role_id AND arp.permission_code = _permission_code
       WHERE au.auth_user_id = _auth_uid) $fn$;
  CREATE OR REPLACE FUNCTION public.get_user_visible_org_ids(_auth_uid uuid)
    RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT am.organization_id FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE au.auth_user_id = _auth_uid AND am.status = 'active' $fn$;

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}','Org');
  INSERT INTO public.anew_entities (id, display_name) VALUES ('77777777-7777-7777-7777-777777777777','Cliente');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('${CLI}','${ORG}','77777777-7777-7777-7777-777777777777');
  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${U.gestor}','${AUTH.gestor}','Gestora','g@x.pt'),
    ('${U.sup}','${AUTH.sup}','Supervisor','s@x.pt'),
    ('${U.tec}','${AUTH.tec}','Tecnico','t@x.pt'),
    ('${U.op}','${AUTH.op}','Operador','o@x.pt');
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('${AUTH.gestor}','g@x.pt',now()),('${AUTH.sup}','s@x.pt',now()),
    ('${AUTH.tec}','t@x.pt',now()),('${AUTH.op}','o@x.pt',now())
    ON CONFLICT DO NOTHING;
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id)
    SELECT v, k FROM (VALUES ('${AUTH.gestor}'::uuid,'${U.gestor}'::uuid),('${AUTH.sup}','${U.sup}'),
                             ('${AUTH.tec}','${U.tec}'),('${AUTH.op}','${U.op}')) x(v, k);
`);

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
    console.error(`✗ ${f} falhou antes de chegar à margem: ${e.message}`);
    process.exit(1);
  }
}

console.log("\n─── instalar margem-previsao.sql ────────");
try {
  await db.exec(ler("margem-previsao.sql"));
  ok("margem-previsao.sql corre");
  await db.exec(ler("margem-previsao.sql"));
  ok("margem-previsao.sql corre outra vez (idempotente)");
} catch (e) {
  mau(`margem-previsao.sql falhou: ${e.message}`);
  process.exit(1);
}

/* ── Papéis, perfis, orçamento, obra ────────────────────────────────────── */
await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name) VALUES
    ('d0000000-0000-0000-0000-00000000000a','${ORG}','Tudo'),
    ('d0000000-0000-0000-0000-00000000000b','${ORG}','Tecnicos');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT 'd0000000-0000-0000-0000-00000000000a', code FROM public.anew_permissions WHERE category = 'operations';
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('d0000000-0000-0000-0000-00000000000b','operations.view'),
    ('d0000000-0000-0000-0000-00000000000b','operations.orders.view'),
    ('d0000000-0000-0000-0000-00000000000b','operations.orders.execute');
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${U.gestor}','${ORG}','d0000000-0000-0000-0000-00000000000a','active'),
    ('${U.sup}','${ORG}','d0000000-0000-0000-0000-00000000000a','active'),
    ('${U.tec}','${ORG}','d0000000-0000-0000-0000-00000000000b','active'),
    ('${U.op}','${ORG}','d0000000-0000-0000-0000-00000000000b','active');
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao, custo_hora) VALUES
    ('${ORG}','${U.gestor}','gestor', 30.00),
    ('${ORG}','${U.sup}','supervisor', 28.00),
    ('${ORG}','${U.tec}','tecnico', NULL),
    ('${ORG}','${U.op}','operador', NULL);

  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  GRANT SELECT ON public.quotes, public.quote_lines, public.client_contracts,
                  public.anew_users, public.anew_clients, public.anew_entities TO authenticated;

  -- Vendido 10 000 € sem IVA. Custo: 3 000 € de mão de obra (linha de
  -- serviço, custo na coluna de material, como no CRM real) + 3 000 € de
  -- materiais. Margem na venda: 40 %.
  INSERT INTO public.quotes (id, organization_id, cliente_id, quote_number, title, estado, accepted_at,
                             total, subtotal, desconto_global_percent, total_fees)
    VALUES ('${ORC}','${ORG}','${CLI}','ORC-1','WC suite','aceite',now(), 12300, 10000, 0, 0);
  INSERT INTO public.quote_lines (quote_id, ordem, categoria, item_description, qt,
                                  custo_material_unit, custo_mao_obra_unit, total_sem_iva, service_id) VALUES
    ('${ORC}',0,'Modelo de Mão de Obra','Trabalho',1,3000,0,5000,'${SERV}'),
    ('${ORC}',1,'Bundles','Louças c/ instalação',2,1500,0,5000,NULL);

  INSERT INTO public.ops_obra (id, organization_id, codigo, titulo, cliente_id, orcamento_id, estado,
                               supervisor_id, gestor_id)
    VALUES ('${OBRA}','${ORG}','OB-T-0001','WC suite','${CLI}','${ORC}','em_curso','${U.sup}','${U.gestor}');
  INSERT INTO public.ops_obra_fase (id, organization_id, obra_id, ordem, nome)
    VALUES ('${FASE}','${ORG}','${OBRA}',1,'Execução');
  -- 4 tarefas × 600 min = 40 h previstas → 75 €/h implícitos no orçamento.
  INSERT INTO public.ops_obra_tarefa (id, organization_id, obra_id, fase_id, ordem, nome, minutos_previstos,
                                      estado, inicio_planeado, fim_planeado)
    VALUES ('${T[0]}','${ORG}','${OBRA}','${FASE}',1,'Demolição',600,'feita','2026-10-05','2026-10-06'),
           ('${T[1]}','${ORG}','${OBRA}','${FASE}',2,'Canalização',600,'em_curso','2026-10-07','2026-10-08'),
           ('${T[2]}','${ORG}','${OBRA}','${FASE}',3,'Revestimento',600,'por_fazer','2026-10-09','2026-10-12'),
           ('${T[3]}','${ORG}','${OBRA}','${FASE}',4,'Louças',600,'por_fazer','2026-10-13','2026-10-13');
  INSERT INTO public.ops_obra_tarefa_pessoa (organization_id, obra_id, tarefa_id, utilizador_id)
    VALUES ('${ORG}','${OBRA}','${T[2]}','${U.tec}');
  -- O operador (sem custo/hora) fez a demolição em 900 min (1,5×) e já leva
  -- 300 min na canalização.
  INSERT INTO public.ops_obra_registo (organization_id, obra_id, tarefa_id, utilizador_id, inicio, fim) VALUES
    ('${ORG}','${OBRA}','${T[0]}','${U.op}', now() - interval '3 days', now() - interval '3 days' + interval '900 minutes'),
    ('${ORG}','${OBRA}','${T[1]}','${U.op}', now() - interval '1 day', now() - interval '1 day' + interval '300 minutes');
`);

const crmAntes = await um(`SELECT (SELECT count(*)::int FROM public.quotes) q, (SELECT count(*)::int FROM public.quote_lines) l`);

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
  return typeof bruto === "string" && bruto.startsWith("{") ? JSON.parse(bruto) : bruto;
}
async function linhas(authUid, sql) {
  const r = await db.exec(sessao(authUid, sql));
  return r.flatMap((x) => x.rows ?? []);
}
async function recusado(nome, authUid, sql, trecho) {
  try {
    await db.exec(sessao(authUid, sql));
    mau(`${nome} — PASSOU, e devia ter sido recusado`);
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    !trecho || e.message.includes(trecho) ? ok(nome) : mau(`${nome} — mensagem errada: ${e.message.split("\n")[0]}`);
  }
}

/* ── A margem, para quem vê custos ──────────────────────────────────────── */
console.log("\n─── margem da obra ──────────────────────");
{
  const m = await chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_margem('${OBRA}');`);
  m?.ve_custos === true ? ok("a gestora vê os custos") : mau(`ve_custos: ${JSON.stringify(m)}`);
  perto(m.receita, 10000) && m.receita_fonte === "orcamento"
    ? ok("receita = subtotal sem IVA do orçamento (10 000 €)")
    : mau(`receita ${m.receita} (${m.receita_fonte})`);
  perto(m.mo_orcada, 3000) && perto(m.custo_materiais, 3000)
    ? ok("a linha de serviço conta como mão de obra; o resto como materiais (3 000 + 3 000)")
    : mau(`mo ${m.mo_orcada} / materiais ${m.custo_materiais}`);
  perto(m.margem_prevista_pct, 40)
    ? ok("margem prevista 40 %")
    : mau(`margem prevista ${m.margem_prevista_pct}`);
  perto(m.custo_hora, 75) && m.custo_hora_fonte === "orcamento"
    ? ok("custo/hora implícito no orçamento: 3 000 € ÷ 40 h = 75 €/h")
    : mau(`custo/hora ${m.custo_hora} (${m.custo_hora_fonte})`);
  perto(m.ritmo, 1.5) && m.ritmo_fonte === "obra"
    ? ok("ritmo da obra 1,5× (900 min reais para 600 previstos)")
    : mau(`ritmo ${m.ritmo} (${m.ritmo_fonte})`);
  perto(m.mo_real, 1500) && m.sem_tarifa === 1
    ? ok("mão de obra real 1 500 € (20 h × 75 €/h; 1 pessoa sem tarifa)")
    : mau(`mo real ${m.mo_real}, sem tarifa ${m.sem_tarifa}`);
  perto(m.progresso, 0.25) && perto(m.margem_a_data_pct, 10, 0.2)
    ? ok("a esta data: 25 % feito, margem 10 % (2 500 − 1 500 − 750)")
    : mau(`progresso ${m.progresso}, margem a data ${m.margem_a_data_pct}`);
  perto(m.mo_projetada, 4500, 1) && perto(m.margem_projetada_pct, 25, 0.2)
    ? ok("projetada: 1 500 + 40 h × 75 € = 4 500 € → margem 25 %")
    : mau(`mo projetada ${m.mo_projetada}, margem projetada ${m.margem_projetada_pct}`);
  m.semaforo === "verde" ? ok("semáforo verde com o limiar por defeito (20 %)") : mau(`semáforo ${m.semaforo}`);
}

for (const [quem, auth] of [["técnico", AUTH.tec], ["supervisor", AUTH.sup]]) {
  const m = await chamar(auth, `SELECT public.rpc_ops_obra_margem('${OBRA}');`);
  m && m.ve_custos === false && Object.keys(m).length === 1
    ? ok(`o ${quem} recebe só {ve_custos:false}`)
    : mau(`o ${quem} viu: ${JSON.stringify(m)}`);
  const l = await linhas(auth, `SELECT * FROM public.rpc_ops_obras_margem('${ORG}');`);
  l.length === 0 ? ok(`a lista do semáforo vem vazia para o ${quem}`) : mau(`${quem}: ${l.length} linhas`);
}
{
  const l = await linhas(AUTH.gestor, `SELECT * FROM public.rpc_ops_obras_margem('${ORG}');`);
  l.length === 1 && l[0].semaforo === "verde"
    ? ok("a lista das obras traz o semáforo numa chamada")
    : mau(`lista: ${JSON.stringify(l)}`);
}

/* ── Limiar e aviso no sino ─────────────────────────────────────────────── */
console.log("\n─── limiar e aviso ──────────────────────");
await recusado(
  "o supervisor não muda o limiar",
  AUTH.sup,
  `SELECT public.rpc_ops_obra_margem_config('${ORG}', 30);`,
  "Só o gestor"
);
await chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_margem_config('${ORG}', 30);`);
{
  const m = await chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_margem('${OBRA}');`);
  m.semaforo === "amarelo" && perto(m.limiar, 30)
    ? ok("limiar 30 % → amarelo (25 % projetado)")
    : mau(`depois do limiar: ${m.semaforo} / ${m.limiar}`);
}
{
  const r = JSON.parse((await um(`SELECT public.ops_obra_margem_avisar('${ORG}')::text AS r`)).r);
  const n = await q(`SELECT user_id, title, priority, is_resolved FROM public.notifications
                      WHERE type = 'operacoes_obra_margem' ORDER BY created_at`);
  r.avisos === 1 && n.length === 1 && n[0].user_id === AUTH.gestor && n[0].title.includes("25")
    ? ok(`aviso no sino só para a gestora: "${n[0].title}"`)
    : mau(`avisos ${JSON.stringify(r)} / ${JSON.stringify(n)}`);
  const r2 = JSON.parse((await um(`SELECT public.ops_obra_margem_avisar('${ORG}')::text AS r`)).r);
  r2.avisos === 0 ? ok("correr outra vez não repete o aviso") : mau(`repetiu: ${JSON.stringify(r2)}`);
}
await db.exec(`INSERT INTO public.ops_obra_extra (organization_id, obra_id, descricao, valor_estimado, estado)
               VALUES ('${ORG}','${OBRA}','Nicho extra',1000,'aprovado'),
                      ('${ORG}','${OBRA}','Ainda por decidir',5000,'registado');`);
{
  const m = await chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_margem('${OBRA}');`);
  perto(m.extras, 1000) && perto(m.margem_projetada_pct, 31.8, 0.2) && m.semaforo === "verde"
    ? ok("o extra aprovado soma à receita (o registado não): 31,8 % → verde")
    : mau(`extras ${m.extras}, margem ${m.margem_projetada_pct}, ${m.semaforo}`);
  await um(`SELECT public.ops_obra_margem_avisar('${ORG}')`);
  const n = await um(`SELECT bool_and(is_resolved) AS r FROM public.notifications WHERE type = 'operacoes_obra_margem'`);
  n.r ? ok("a margem recuperou: o aviso resolveu-se sozinho") : mau("o aviso ficou aberto");
}

/* ── Previsão ───────────────────────────────────────────────────────────── */
console.log("\n─── fim provável ────────────────────────");
{
  const p = await chamar(AUTH.tec, `SELECT public.rpc_ops_obra_previsao('${OBRA}');`);
  perto(p?.p50, 1.5, 0.01) && perto(p?.p80, 1.8, 0.01) && p?.fonte === "obra"
    ? ok("P50 = ritmo da obra (1,5×); P80 = +20 % sem histórico (1,8×)")
    : mau(`previsão ${JSON.stringify({ p50: p?.p50, p80: p?.p80, fonte: p?.fonte })}`);
  const dias = p?.dias_uteis ?? [];
  const fds = dias.filter((d) => [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()));
  dias.length === 400 && fds.length === 0
    ? ok("400 dias úteis, sem sábados nem domingos")
    : mau(`dias úteis: ${dias.length}, ao fim de semana: ${fds.length}`);
  p?.n_historico === 1 ? ok("histórico da organização: 1 tarefa feita") : mau(`n_historico ${p?.n_historico}`);
}
await recusado(
  "quem não vê a obra não tem previsão",
  AUTH.op,
  `SELECT public.rpc_ops_obra_previsao('${OBRA}');`,
  "Obra não encontrada"
);

/* ── O CRM ficou como estava ────────────────────────────────────────────── */
{
  const depois = await um(`SELECT (SELECT count(*)::int FROM public.quotes) q, (SELECT count(*)::int FROM public.quote_lines) l`);
  JSON.stringify(depois) === JSON.stringify(crmAntes)
    ? ok("o CRM não levou uma escrita")
    : mau(`o CRM mudou: ${JSON.stringify(crmAntes)} → ${JSON.stringify(depois)}`);
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ margem e previsão: contas certas, custos só para quem os vê, aviso que se resolve sozinho");
