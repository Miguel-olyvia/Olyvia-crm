/**
 * Prova o módulo de Obras contra um Postgres limpo (PGlite), sem tocar no
 * Supabase.
 *
 * O que interessa aqui:
 *   · isolamento entre organizações — a gestora da B não vê nem mexe na A;
 *   · os três perfis: o técnico executa e não planeia nem valida; o
 *     supervisor valida e não planeia; o gestor planeia;
 *   · justificação OBRIGATÓRIA quando o real passa o previsto + tolerância;
 *   · quem fez não valida (double check);
 *   · a obra nasce de um orçamento aceite, de um contrato assinado, ou em
 *     branco — e nada disto escreve uma linha no CRM;
 *   · escrita só por RPC; custo/hora nunca chega ao técnico;
 *   · obras.sql e a demo correm duas vezes sem erro nem duplicados.
 *
 *     npm run validar-obras
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

/* ── Identidades ────────────────────────────────────────────────────────── */
const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "11111111-2222-2222-2222-222222222222";
const CLI_A = "22222222-2222-2222-2222-222222222222";
const CLI_B = "22222222-3333-3333-3333-333333333333";

const U = {
  gestorA: "a0000000-0000-0000-0000-00000000000a",
  supA: "a0000000-0000-0000-0000-00000000000b",
  tecA: "a0000000-0000-0000-0000-00000000000c",
  tec2A: "a0000000-0000-0000-0000-00000000000d",
  gestorB: "b0000000-0000-0000-0000-00000000000a",
};
const AUTH = Object.fromEntries(
  // O id de autenticação é outro uuid, distinto por pessoa.
  Object.entries(U).map(([k, v]) => [k, v.replace(/^a/, "e").replace(/^b/, "d")])
);

const ORC_A = "99990000-0000-0000-0000-000000000001";
const ORC_RASCUNHO = "99990000-0000-0000-0000-000000000002";
const ORC_B = "99990000-0000-0000-0000-000000000003";
const ORC_CONTRATO = "99990000-0000-0000-0000-000000000004";
const CTR_ASSINADO = "88880000-0000-0000-0000-000000000001";
const CTR_RASCUNHO = "88880000-0000-0000-0000-000000000002";
const CTR_B = "88880000-0000-0000-0000-000000000003";

/* ── Um CRM como o real ─────────────────────────────────────────────────── */
await db.exec(STUBS_CRM);
await db.exec(`
  -- Contratos: só as colunas que db/obras.sql lê. Fica AQUI e não em
  -- _stubs-crm.mjs, para validar-instalacao provar que obras.sql instala
  -- numa base sem a tabela.
  CREATE TABLE public.client_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_number text,
    client_id uuid,
    status text NOT NULL DEFAULT 'draft',
    total_value numeric DEFAULT 0,
    currency text DEFAULT 'EUR',
    organization_id uuid NOT NULL,
    quote_id uuid,
    notes text,
    signature_date timestamptz,
    company_signature_date timestamptz,
    accepted_at timestamptz,
    created_by uuid NOT NULL,
    deleted_at timestamptz);

  CREATE TABLE public.auth_to_business_user_map (auth_user_id uuid, business_user_id uuid);
  CREATE OR REPLACE FUNCTION public.current_business_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT m.business_user_id FROM public.auth_to_business_user_map m
     WHERE m.auth_user_id = auth.uid() LIMIT 1 $fn$;

  -- Como o real: GLOBAL — true se tiver a permissão em QUALQUER organização.
  -- É exatamente por isso que as policies usam ops_pode().
  CREATE OR REPLACE FUNCTION public.has_anew_permission(_auth_uid uuid, _permission_code text)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT EXISTS (
      SELECT 1 FROM public.anew_users au
        JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
        JOIN public.anew_role_permissions arp
          ON arp.role_id = am.role_id AND arp.permission_code = _permission_code
       WHERE au.auth_user_id = _auth_uid) $fn$;

  -- Só as organizações onde é membro (o stub por defeito devolve todas).
  CREATE OR REPLACE FUNCTION public.get_user_visible_org_ids(_auth_uid uuid)
    RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT am.organization_id FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE au.auth_user_id = _auth_uid AND am.status = 'active' $fn$;

  INSERT INTO public.anew_organizations (id, name) VALUES
    ('${ORG_A}','Org A'), ('${ORG_B}','Org B');
  INSERT INTO public.anew_entities (id, display_name) VALUES
    ('77777777-7777-7777-7777-777777777777','Cliente A'),
    ('77777777-8888-8888-8888-888888888888','Cliente B');
  INSERT INTO public.anew_clients (id, organization_id, entity_id) VALUES
    ('${CLI_A}','${ORG_A}','77777777-7777-7777-7777-777777777777'),
    ('${CLI_B}','${ORG_B}','77777777-8888-8888-8888-888888888888');

  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${U.gestorA}','${AUTH.gestorA}','Gestora A','ga@x.pt'),
    ('${U.supA}','${AUTH.supA}','Supervisor A','sa@x.pt'),
    ('${U.tecA}','${AUTH.tecA}','Tecnico A','ta@x.pt'),
    ('${U.tec2A}','${AUTH.tec2A}','Subempreiteiro A','t2a@x.pt'),
    ('${U.gestorB}','${AUTH.gestorB}','Gestor B','gb@x.pt');
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ('${AUTH.gestorA}','${U.gestorA}'),('${AUTH.supA}','${U.supA}'),
    ('${AUTH.tecA}','${U.tecA}'),('${AUTH.tec2A}','${U.tec2A}'),
    ('${AUTH.gestorB}','${U.gestorB}');
`);

/* ── A sequência de instalação, até obras.sql ───────────────────────────── */
const SEQUENCIA = [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
  "seguranca.sql", "tempos.sql",
];
for (const f of SEQUENCIA) {
  try {
    await db.exec(ler(f));
  } catch (e) {
    console.error(`✗ ${f} falhou antes de chegar às obras: ${e.message}`);
    process.exit(1);
  }
}

console.log("\n─── instalar obras.sql ──────────────────");
const contar = async () =>
  um(`SELECT
        (SELECT count(*)::int FROM public.ops_obra_modelo) AS modelos,
        (SELECT count(*)::int FROM public.ops_obra) AS obras,
        (SELECT count(*)::int FROM pg_policies WHERE tablename LIKE 'ops\\_obra%') AS policies`);
try {
  await db.exec(ler("obras.sql"));
  ok("obras.sql corre");
} catch (e) {
  mau(`obras.sql falhou: ${e.message}`);
  process.exit(1);
}
const depois1 = await contar();
try {
  await db.exec(ler("obras.sql"));
  ok("obras.sql corre outra vez (idempotente)");
} catch (e) {
  mau(`obras.sql não é idempotente: ${e.message}`);
}
const depois2 = await contar();
JSON.stringify(depois1) === JSON.stringify(depois2)
  ? ok(`a segunda passagem não duplicou nada (${depois2.policies} policies)`)
  : mau(`a segunda passagem mudou contagens: ${JSON.stringify(depois1)} → ${JSON.stringify(depois2)}`);
depois2.modelos === 0 && depois2.obras === 0
  ? ok("o ficheiro de esquema não inventou dados de organização nenhuma")
  : mau(`obras.sql inseriu dados: ${JSON.stringify(depois2)}`);

{
  const v = await um(`SELECT to_regclass('public.ops_v_contrato') IS NOT NULL AS existe`);
  v.existe ? ok("ops_v_contrato criada (client_contracts existe)") : mau("ops_v_contrato não ficou criada");
}

/* ── O supervisor ───────────────────────────────────────────────────────── */
// A função 'supervisor' chega pelo seguranca.sql (outro trabalho em curso).
// Se ainda não chegou, acrescenta-se aqui SÓ para o teste — e diz-se.
{
  const c = await um(`
    SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'ops_utilizador_perfil' AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%funcao%'`);
  if (c && !c.def.includes("supervisor")) {
    console.log("  ! a CHECK de funcao ainda não aceita 'supervisor' — acrescentado só neste teste");
    const nome = await um(`
      SELECT c.conname FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname = 'ops_utilizador_perfil' AND c.contype = 'c'
         AND pg_get_constraintdef(c.oid) LIKE '%funcao%'`);
    await db.exec(`
      ALTER TABLE public.ops_utilizador_perfil DROP CONSTRAINT ${nome.conname};
      ALTER TABLE public.ops_utilizador_perfil ADD CONSTRAINT ${nome.conname}
        CHECK (funcao IN ('admin','gestor','operador','tecnico','supervisor'));`);
  }
}

/* ── Papéis e perfis ────────────────────────────────────────────────────── */
await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name) VALUES
    ('d0000000-0000-0000-0000-00000000000a','${ORG_A}','Tudo A'),
    ('d0000000-0000-0000-0000-00000000000b','${ORG_A}','Tecnicos A'),
    ('d0000000-0000-0000-0000-00000000000c','${ORG_B}','Tudo B');
  -- Gestora, supervisor e gestor B com TODAS as permissões: assim prova-se
  -- que é a FUNÇÃO que trava o supervisor de planear, e não a falta de
  -- permissão.
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT r, code FROM public.anew_permissions,
      unnest(ARRAY['d0000000-0000-0000-0000-00000000000a'::uuid,
                   'd0000000-0000-0000-0000-00000000000c'::uuid]) r
     WHERE category = 'operations';
  -- Técnicos: ver as suas, executar. Sem view_all, sem custos.
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('d0000000-0000-0000-0000-00000000000b','operations.view'),
    ('d0000000-0000-0000-0000-00000000000b','operations.orders.view'),
    ('d0000000-0000-0000-0000-00000000000b','operations.orders.execute'),
    ('d0000000-0000-0000-0000-00000000000b','operations.orders.edit'),
    ('d0000000-0000-0000-0000-00000000000b','operations.orders.confirm');
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${U.gestorA}','${ORG_A}','d0000000-0000-0000-0000-00000000000a','active'),
    ('${U.supA}','${ORG_A}','d0000000-0000-0000-0000-00000000000a','active'),
    ('${U.tecA}','${ORG_A}','d0000000-0000-0000-0000-00000000000b','active'),
    ('${U.tec2A}','${ORG_A}','d0000000-0000-0000-0000-00000000000b','active'),
    ('${U.gestorB}','${ORG_B}','d0000000-0000-0000-0000-00000000000c','active');

  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao, custo_hora) VALUES
    ('${ORG_A}','${U.gestorA}','gestor', 30.00),
    ('${ORG_A}','${U.supA}','supervisor', 28.00),
    ('${ORG_A}','${U.tecA}','tecnico', 20.00),
    ('${ORG_A}','${U.tec2A}','operador', NULL),
    ('${ORG_B}','${U.gestorB}','gestor', 30.00);

  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  -- Como no Supabase: authenticated tem SELECT nas tabelas do CRM (lá, a RLS
  -- do CRM filtra; aqui os stubs não têm RLS).
  GRANT SELECT ON public.quotes, public.quote_lines, public.client_contracts,
                  public.anew_users, public.anew_clients, public.anew_entities
     TO authenticated;
`);

/* ── Orçamentos e contratos no CRM ──────────────────────────────────────── */
await db.exec(`
  INSERT INTO public.quotes (id, organization_id, cliente_id, quote_number, title,
                             obra_endereco, estado, accepted_at, total) VALUES
    ('${ORC_A}','${ORG_A}','${CLI_A}','ORC-A-001','Remodelação WC suite',
     'Rua das Flores 12, Lisboa','aceite',now(),4500),
    ('${ORC_RASCUNHO}','${ORG_A}','${CLI_A}','ORC-A-002','Ainda a pensar',NULL,'rascunho',NULL,0),
    ('${ORC_B}','${ORG_B}','${CLI_B}','ORC-B-001','Obra da B','Porto','aceite',now(),1000),
    ('${ORC_CONTRATO}','${ORG_A}','${CLI_A}','ORC-A-003','WC de serviço','Av. Roma 3, Lisboa','aceite',now(),2500);
  INSERT INTO public.quote_lines (quote_id, ordem, item_description, qt,
                                  custo_material_unit, custo_mao_obra_unit) VALUES
    ('${ORC_A}',0,'Mão de obra remodelação',40,0,20),
    ('${ORC_A}',1,'Louças',1,600,0);
  INSERT INTO public.client_contracts (id, contract_number, client_id, status, organization_id,
                                       quote_id, signature_date, created_by) VALUES
    ('${CTR_ASSINADO}','CT-A-001','${CLI_A}','signed','${ORG_A}','${ORC_CONTRATO}',now(),'${U.gestorA}'),
    ('${CTR_RASCUNHO}','CT-A-002','${CLI_A}','draft','${ORG_A}',NULL,NULL,'${U.gestorA}'),
    ('${CTR_B}','CT-B-001','${CLI_B}','signed','${ORG_B}',NULL,now(),'${U.gestorB}');
`);

const crmAntes = await um(`
  SELECT (SELECT count(*)::int FROM public.quotes) AS quotes,
         (SELECT count(*)::int FROM public.quote_lines) AS linhas,
         (SELECT count(*)::int FROM public.client_contracts) AS contratos,
         (SELECT string_agg(estado, ',' ORDER BY id) FROM public.quotes) AS estados_q,
         (SELECT string_agg(status, ',' ORDER BY id) FROM public.client_contracts) AS estados_c`);

/* ── Auxiliares ─────────────────────────────────────────────────────────── */
function sessao(authUid, sql) {
  return `
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = '${authUid}';
    ${sql}
    COMMIT;`;
}

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

/* ── Modelos ────────────────────────────────────────────────────────────── */
console.log("\n─── modelos ─────────────────────────────");
await deveSerRecusado(
  "o técnico não semeia modelos",
  AUTH.tecA,
  `SELECT public.rpc_ops_obra_semear_modelo_exemplo('${ORG_A}');`,
  "Só quem planeia"
);
await deveSerRecusado(
  "o supervisor também não",
  AUTH.supA,
  `SELECT public.rpc_ops_obra_semear_modelo_exemplo('${ORG_A}');`,
  "Só quem planeia"
);
const semente = await devePassar(
  "a gestora semeia 'Remodelação casa de banho'",
  AUTH.gestorA,
  `SELECT public.rpc_ops_obra_semear_modelo_exemplo('${ORG_A}');`
);
const MODELO = semente?.id;
{
  const again = await chamar(AUTH.gestorA, `SELECT public.rpc_ops_obra_semear_modelo_exemplo('${ORG_A}');`);
  const m = await um(`
    SELECT (SELECT count(*)::int FROM public.ops_obra_modelo) AS modelos,
           (SELECT count(*)::int FROM public.ops_obra_modelo_fase WHERE modelo_id='${MODELO}') AS fases,
           (SELECT count(*)::int FROM public.ops_obra_modelo_tarefa WHERE modelo_id='${MODELO}') AS tarefas,
           (SELECT string_agg(nome, ' | ' ORDER BY ordem) FROM public.ops_obra_modelo_fase WHERE modelo_id='${MODELO}') AS nomes`);
  again.id === MODELO && m.modelos === 1
    ? ok("semear duas vezes não duplica")
    : mau(`semear duplicou: ${JSON.stringify(m)}`);
  m.fases === 4 && m.tarefas === 17
    ? ok(`4 fases e 17 tarefas: ${m.nomes}`)
    : mau(`modelo com ${m.fases} fases e ${m.tarefas} tarefas`);
}
{
  const vistos = await linhas(AUTH.gestorB, `SELECT count(*)::int AS n FROM public.ops_obra_modelo;`);
  vistos.at(-1).n === 0
    ? ok("o gestor da B não vê os modelos da A")
    : mau(`o gestor da B viu ${vistos.at(-1).n} modelo(s) da A`);
}
{
  // Gravar o modelo mantém os ids das tarefas que vêm com id.
  const t = await um(`
    SELECT mt.id, mt.nome FROM public.ops_obra_modelo_tarefa mt
      JOIN public.ops_obra_modelo_fase f ON f.id = mt.modelo_fase_id
     WHERE mt.modelo_id='${MODELO}' AND f.ordem = 1 ORDER BY mt.ordem LIMIT 1`);
  const fases = JSON.stringify([
    { ordem: 1, nome: "Preparação", tarefas: [{ id: t.id, nome: t.nome, minutos_previstos: 75 }] },
    { ordem: 2, nome: "Instalações", tarefas: [{ nome: "Nova", minutos_previstos: 30 }] },
  ]);
  const r = await devePassar(
    "a gestora grava um modelo novo a partir do outro (com ids)",
    AUTH.gestorA,
    `SELECT public.rpc_ops_obra_gravar_modelo('${ORG_A}', NULL, 'Modelo curto', NULL, NULL, '${fases}'::jsonb);`
  );
  const mesma = await um(`SELECT modelo_id FROM public.ops_obra_modelo_tarefa WHERE id='${t.id}'`);
  mesma.modelo_id === MODELO
    ? ok("um id de OUTRO modelo não é roubado — nasce uma tarefa nova")
    : mau("a gravação mexeu numa tarefa de outro modelo");
  r?.tarefas === 2 ? ok("o modelo curto ficou com 2 tarefas") : mau(`modelo curto: ${JSON.stringify(r)}`);

  const fases2 = JSON.stringify([
    { ordem: 1, nome: "Preparação", tarefas: [{ id: t.id, nome: t.nome, minutos_previstos: 75 }] },
  ]);
  await chamar(AUTH.gestorA,
    `SELECT public.rpc_ops_obra_gravar_modelo('${ORG_A}', '${MODELO}', 'Remodelação casa de banho', NULL, NULL, '${fases2}'::jsonb);`);
  const depois = await um(`SELECT minutos_previstos FROM public.ops_obra_modelo_tarefa WHERE id='${t.id}'`);
  depois?.minutos_previstos === 75
    ? ok("regravar o modelo ATUALIZA a tarefa pelo id (as métricas não perdem o fio)")
    : mau(`a tarefa não foi atualizada: ${JSON.stringify(depois)}`);
  // Repor o exemplo completo para o resto do teste.
  await db.exec(`DELETE FROM public.ops_obra_modelo WHERE id='${MODELO}';`);
}
const MOD = (await chamar(AUTH.gestorA, `SELECT public.rpc_ops_obra_semear_modelo_exemplo('${ORG_A}');`)).id;

/* ── Criar obras ────────────────────────────────────────────────────────── */
console.log("\n─── nascer uma obra ─────────────────────");
const criar = (args) => `SELECT public.rpc_ops_obra_criar(${args});`;

await deveSerRecusado(
  "o técnico não abre obras",
  AUTH.tecA,
  criar(`p_org => '${ORG_A}', p_titulo => 'X', p_cliente_id => '${CLI_A}'`),
  "Só quem planeia"
);
await deveSerRecusado(
  "o supervisor não abre obras",
  AUTH.supA,
  criar(`p_org => '${ORG_A}', p_titulo => 'X', p_cliente_id => '${CLI_A}'`),
  "Só quem planeia"
);
await deveSerRecusado(
  "um orçamento em rascunho não vira obra",
  AUTH.gestorA,
  criar(`p_org => '${ORG_A}', p_orcamento_id => '${ORC_RASCUNHO}'`),
  "orçamento aceite"
);
await deveSerRecusado(
  "o orçamento de OUTRA organização não vira obra aqui",
  AUTH.gestorA,
  criar(`p_org => '${ORG_A}', p_orcamento_id => '${ORC_B}'`),
  "não encontrado nesta organização"
);
await deveSerRecusado(
  "nem a gestora da A abre obras na organização B",
  AUTH.gestorA,
  criar(`p_org => '${ORG_B}', p_titulo => 'Intrusa', p_cliente_id => '${CLI_B}'`),
  "Sem acesso a esta organização"
);

const OB1 = await devePassar(
  "do orçamento aceite, com o modelo, a começar segunda 5/10",
  AUTH.gestorA,
  criar(`p_org => '${ORG_A}', p_orcamento_id => '${ORC_A}', p_modelo_id => '${MOD}',
         p_data_inicio => '2026-10-05', p_supervisor_id => '${U.supA}'`)
);
{
  /^OB-\d{4}-00001$/.test(OB1?.codigo ?? "")
    ? ok(`código ${OB1.codigo}`)
    : mau(`código inesperado: ${OB1?.codigo}`);
  OB1?.tarefas === 17 ? ok("17 tarefas copiadas do modelo") : mau(`tarefas: ${OB1?.tarefas}`);
  const o = await um(`SELECT titulo, morada, cliente_id, gestor_id, estado FROM public.ops_obra WHERE id='${OB1.id}'`);
  o.titulo === "Remodelação WC suite" && o.morada === "Rua das Flores 12, Lisboa" && o.cliente_id === CLI_A
    ? ok("título, morada e cliente vieram do orçamento")
    : mau(`herança do orçamento falhou: ${JSON.stringify(o)}`);
  o.gestor_id === U.gestorA ? ok("quem a abriu fica gestor") : mau(`gestor ${o.gestor_id}`);

  const d = await um(`
    SELECT min(inicio_planeado)::text AS ini, max(fim_planeado)::text AS fim,
           count(*) FILTER (WHERE extract(isodow FROM inicio_planeado) > 5
                              OR extract(isodow FROM fim_planeado) > 5)::int AS fds,
           sum(minutos_previstos)::int AS minutos
      FROM public.ops_obra_tarefa WHERE obra_id='${OB1.id}'`);
  d.ini === "2026-10-05" && d.fim === "2026-10-13"
    ? ok(`${d.minutos} min a 480/dia = 7 dias úteis: 05/10 → 13/10, saltando o fim de semana`)
    : mau(`planeamento ${d.ini} → ${d.fim} (${d.minutos} min)`);
  d.fds === 0 ? ok("nenhuma tarefa cai a um sábado ou domingo") : mau(`${d.fds} tarefa(s) ao fim de semana`);

  const f = await um(`
    SELECT string_agg(f.nome || '=' || x.m, ', ' ORDER BY f.ordem) AS s
      FROM public.ops_obra_fase f
      JOIN (SELECT fase_id, sum(minutos_previstos) m FROM public.ops_obra_tarefa GROUP BY fase_id) x
        ON x.fase_id = f.id
     WHERE f.obra_id='${OB1.id}'`);
  f.s.includes("Preparação e demolições=570") && f.s.includes("Limpeza e entrega=495")
    ? ok(`a duração da fase é a soma das tarefas: ${f.s}`)
    : mau(`somas por fase: ${f.s}`);
}

await deveSerRecusado(
  "carregar duas vezes no botão não abre duas obras",
  AUTH.gestorA,
  criar(`p_org => '${ORG_A}', p_orcamento_id => '${ORC_A}'`),
  "já tem obra"
);

await deveSerRecusado(
  "um contrato por assinar não vira obra",
  AUTH.gestorA,
  criar(`p_org => '${ORG_A}', p_contrato_id => '${CTR_RASCUNHO}'`),
  "contrato assinado"
);
await deveSerRecusado(
  "o contrato de outra organização não aparece",
  AUTH.gestorA,
  criar(`p_org => '${ORG_A}', p_contrato_id => '${CTR_B}'`),
  "não encontrado"
);
const OB2 = await devePassar(
  "do contrato assinado, sem modelo",
  AUTH.gestorA,
  criar(`p_org => '${ORG_A}', p_contrato_id => '${CTR_ASSINADO}', p_data_inicio => '2026-10-10'`)
);
{
  const o = await um(`
    SELECT o.contrato_id, o.orcamento_id, o.cliente_id, o.morada, o.data_inicio_prevista::text AS ini,
           (SELECT string_agg(nome, ' | ' ORDER BY ordem) FROM public.ops_obra_fase WHERE obra_id=o.id) AS fases
      FROM public.ops_obra o WHERE o.id='${OB2.id}'`);
  o.contrato_id === CTR_ASSINADO && o.orcamento_id === ORC_CONTRATO && o.cliente_id === CLI_A
    ? ok("ligada ao contrato, ao orçamento do contrato e ao cliente")
    : mau(`ligações do contrato: ${JSON.stringify(o)}`);
  o.morada === "Av. Roma 3, Lisboa" ? ok("a morada veio do orçamento do contrato") : mau(`morada ${o.morada}`);
  o.ini === "2026-10-12"
    ? ok("começar a um sábado (10/10) passa para segunda (12/10)")
    : mau(`início ${o.ini}`);
  o.fases === "Preparação e demolições | Instalações técnicas | Acabamentos | Limpeza e entrega"
    ? ok("em branco, nascem as 4 fases por defeito")
    : mau(`fases: ${o.fases}`);
  const c = await linhas(AUTH.gestorA,
    `SELECT tem_obra FROM public.ops_v_contrato WHERE id='${CTR_ASSINADO}';`);
  c.at(-1)?.tem_obra === true ? ok("ops_v_contrato já diz que tem obra") : mau("ops_v_contrato não marcou tem_obra");
}
await deveSerRecusado(
  "o contrato também só gera uma obra",
  AUTH.gestorA,
  criar(`p_org => '${ORG_A}', p_contrato_id => '${CTR_ASSINADO}'`),
  "já tem obra"
);
const OB3 = await devePassar(
  "em branco, com título e cliente",
  AUTH.gestorA,
  criar(`p_org => '${ORG_A}', p_titulo => 'Pintura escritório', p_cliente_id => '${CLI_A}',
         p_data_inicio => '2026-10-05'`)
);
const OBB = await devePassar(
  "o gestor da B abre uma obra na B",
  AUTH.gestorB,
  criar(`p_org => '${ORG_B}', p_titulo => 'Obra B', p_cliente_id => '${CLI_B}'`)
);

/* ── Isolamento ─────────────────────────────────────────────────────────── */
console.log("\n─── isolamento entre organizações ───────");
{
  const r = await linhas(AUTH.gestorB, `
    SELECT (SELECT count(*)::int FROM public.ops_obra WHERE organization_id='${ORG_A}') AS obras,
           (SELECT count(*)::int FROM public.ops_obra_tarefa WHERE organization_id='${ORG_A}') AS tarefas,
           (SELECT count(*)::int FROM public.ops_obra_fase WHERE organization_id='${ORG_A}') AS fases,
           (SELECT count(*)::int FROM public.ops_v_obra_resumo WHERE organization_id='${ORG_A}') AS resumo,
           (SELECT count(*)::int FROM public.ops_v_obra_tarefa WHERE organization_id='${ORG_A}') AS vt,
           (SELECT count(*)::int FROM public.ops_obra) AS todas;`);
  const x = r.at(-1);
  x.obras + x.tarefas + x.fases + x.resumo + x.vt === 0 && x.todas === 1
    ? ok("o gestor da B vê a sua obra e ZERO linhas da A (tabelas e vistas)")
    : mau(`fuga entre organizações: ${JSON.stringify(x)}`);

  const a = await linhas(AUTH.gestorA, `SELECT count(*)::int AS n FROM public.ops_obra;`);
  a.at(-1).n === 3 ? ok("a gestora da A vê as suas 3 obras, e não a da B") : mau(`a gestora A viu ${a.at(-1).n}`);
}
const T = Object.fromEntries(
  (await q(`
    SELECT t.ordem, f.ordem AS fo, t.id FROM public.ops_obra_tarefa t
      JOIN public.ops_obra_fase f ON f.id = t.fase_id WHERE t.obra_id='${OB1.id}'`))
    .map((r) => [`${r.fo}.${r.ordem}`, r.id])
);
await deveSerRecusado(
  "o gestor da B não arrasta tarefas da A",
  AUTH.gestorB,
  `SELECT public.rpc_ops_obra_planear_tarefa('${T["1.1"]}', '2026-10-06', '2026-10-06');`,
  "Sem acesso a esta organização"
);
await deveSerRecusado(
  "nem lê os custos da A",
  AUTH.gestorB,
  `SELECT public.rpc_ops_obra_custos('${OB1.id}');`,
  "sem permissão"
);

/* ── Escrita direta ─────────────────────────────────────────────────────── */
console.log("\n─── escrita só por RPC ──────────────────");
await deveSerRecusado(
  "a gestora não faz UPDATE direto numa tarefa",
  AUTH.gestorA,
  `UPDATE public.ops_obra_tarefa SET estado = 'validada' WHERE id='${T["1.1"]}';`,
  "permission denied"
);
await deveSerRecusado(
  "o técnico não se insere numa tarefa por INSERT",
  AUTH.tecA,
  `INSERT INTO public.ops_obra_tarefa_pessoa (tarefa_id, utilizador_id, organization_id, obra_id)
   VALUES ('${T["1.1"]}','${U.tecA}','${ORG_A}','${OB1.id}');`,
  "permission denied"
);
await deveSerRecusado(
  "nem inventa tempo por INSERT",
  AUTH.tecA,
  `INSERT INTO public.ops_obra_registo (organization_id, obra_id, tarefa_id, utilizador_id, inicio, fim)
   VALUES ('${ORG_A}','${OB1.id}','${T["1.1"]}','${U.tecA}', now() - interval '9 hours', now());`,
  "permission denied"
);

/* ── Planear ────────────────────────────────────────────────────────────── */
console.log("\n─── planear: só o gestor ────────────────");
await deveSerRecusado(
  "o técnico não mexe nas datas",
  AUTH.tecA,
  `SELECT public.rpc_ops_obra_planear_tarefa('${T["1.1"]}', '2026-10-06', '2026-10-06');`,
  "Só quem planeia"
);
await deveSerRecusado(
  "o supervisor não mexe nas datas",
  AUTH.supA,
  `SELECT public.rpc_ops_obra_planear_tarefa('${T["1.1"]}', '2026-10-06', '2026-10-06');`,
  "Só quem planeia"
);
await deveSerRecusado(
  "o supervisor não distribui trabalho",
  AUTH.supA,
  `SELECT public.rpc_ops_obra_atribuir_tarefa('${T["1.1"]}', ARRAY['${U.tecA}']::uuid[]);`,
  "Só quem planeia"
);
await deveSerRecusado(
  "o técnico não cria tarefas",
  AUTH.tecA,
  `SELECT public.rpc_ops_obra_gravar_tarefa('${OB1.id}', NULL,
     (SELECT fase_id FROM public.ops_obra_tarefa WHERE id='${T["1.1"]}'), 'Extra', 30);`,
  "Só quem planeia"
);
await deveSerRecusado(
  "datas ao contrário são recusadas",
  AUTH.gestorA,
  `SELECT public.rpc_ops_obra_planear_tarefa('${T["1.1"]}', '2026-10-07', '2026-10-06');`,
  "Datas inválidas"
);
{
  const r = await devePassar(
    "a gestora atribui o técnico e o subempreiteiro à 1.ª tarefa",
    AUTH.gestorA,
    `SELECT public.rpc_ops_obra_atribuir_tarefa('${T["1.1"]}', ARRAY['${U.tecA}','${U.tec2A}']::uuid[]);`
  );
  r?.pessoas === 2 && r?.conflitos?.length === 0
    ? ok("2 pessoas, sem choques de agenda")
    : mau(`atribuição: ${JSON.stringify(r)}`);
}
await deveSerRecusado(
  "não se atribui quem não está em Operações na organização",
  AUTH.gestorA,
  `SELECT public.rpc_ops_obra_atribuir_tarefa('${T["1.1"]}', ARRAY['${U.gestorB}']::uuid[]);`,
  "não está ativo"
);
{
  // Choque: o técnico na obra 3 no mesmo dia 5/10.
  const fase3 = (await um(`SELECT id FROM public.ops_obra_fase WHERE obra_id='${OB3.id}' AND ordem=1`)).id;
  const nova = await devePassar(
    "a gestora cria uma tarefa à mão na obra em branco",
    AUTH.gestorA,
    `SELECT public.rpc_ops_obra_gravar_tarefa('${OB3.id}', NULL, '${fase3}', 'Pintar paredes', 240,
       p_inicio => '2026-10-05', p_fim => '2026-10-05');`
  );
  const r = await chamar(AUTH.gestorA,
    `SELECT public.rpc_ops_obra_atribuir_tarefa('${nova.id}', ARRAY['${U.tecA}']::uuid[]);`);
  r.conflitos.length === 1 && r.conflitos[0].obra_codigo === OB1.codigo
    ? ok(`choque de agenda avisado: ${r.conflitos[0].nome} já está em ${r.conflitos[0].obra_codigo} nesse dia`)
    : mau(`choque não detetado: ${JSON.stringify(r.conflitos)}`);
  const v = await linhas(AUTH.gestorA,
    `SELECT count(*)::int AS n FROM public.ops_v_obra_conflito WHERE tarefa_id='${nova.id}';`);
  v.at(-1).n === 1 ? ok("e a vista do Gantt mostra-o") : mau(`ops_v_obra_conflito: ${v.at(-1).n}`);
  const mv = await chamar(AUTH.gestorA,
    `SELECT public.rpc_ops_obra_planear_tarefa('${nova.id}', '2026-10-20', '2026-10-20');`);
  mv.conflitos.length === 0
    ? ok("arrastar a tarefa para outro dia resolve o choque")
    : mau(`ainda há choque: ${JSON.stringify(mv.conflitos)}`);
}

/* ── Visibilidade do técnico ────────────────────────────────────────────── */
console.log("\n─── o técnico só vê onde está ───────────");
{
  const r = await linhas(AUTH.tecA, `
    SELECT (SELECT count(*)::int FROM public.ops_obra) AS obras,
           (SELECT count(*)::int FROM public.ops_obra_extra) AS extras;`);
  r.at(-1).obras === 2
    ? ok("vê as 2 obras em que tem tarefas, e não a terceira")
    : mau(`o técnico viu ${r.at(-1).obras} obras`);
}

/* ── Executar ───────────────────────────────────────────────────────────── */
console.log("\n─── executar: iniciar e terminar ────────");
await deveSerRecusado(
  "o técnico não inicia uma tarefa em que não está",
  AUTH.tecA,
  `SELECT public.rpc_ops_obra_iniciar_tarefa('${T["1.2"]}');`,
  "Não estás nesta tarefa"
);
{
  const r = await devePassar(
    "o técnico inicia a 1.ª tarefa com 1 toque",
    AUTH.tecA,
    `SELECT public.rpc_ops_obra_iniciar_tarefa('${T["1.1"]}');`
  );
  const o = await um(`SELECT estado FROM public.ops_obra WHERE id='${OB1.id}'`);
  r?.estado === "em_curso" && o.estado === "em_curso"
    ? ok("tarefa em curso, e a obra passou a 'em curso' sozinha")
    : mau(`estado ${r?.estado} / obra ${o.estado}`);
}
await chamar(AUTH.gestorA,
  `SELECT public.rpc_ops_obra_atribuir_tarefa('${T["1.2"]}', ARRAY['${U.tecA}']::uuid[]);`);
await deveSerRecusado(
  "não se correm duas tarefas ao mesmo tempo",
  AUTH.tecA,
  `SELECT public.rpc_ops_obra_iniciar_tarefa('${T["1.2"]}');`,
  "Já tens"
);
await devePassar(
  "o subempreiteiro junta-se à mesma tarefa",
  AUTH.tec2A,
  `SELECT public.rpc_ops_obra_iniciar_tarefa('${T["1.1"]}');`
);
// Previsto 60 min, tolerância 10 % → limite 66. Duas pessoas, 50 min cada = 100.
await db.exec(`UPDATE public.ops_obra_registo SET inicio = now() - interval '50 minutes'
                WHERE tarefa_id='${T["1.1"]}' AND fim IS NULL;`);
{
  const r = await linhas(AUTH.tecA, `
    SELECT nivel, minutos_reais FROM public.ops_v_obra_alerta WHERE tarefa_id='${T["1.1"]}';`);
  r.at(-1)?.nivel === "excedido"
    ? ok(`alerta 'excedido' com ${r.at(-1).minutos_reais} min reais (2 pessoas × 50) para 60 previstos`)
    : mau(`alerta: ${JSON.stringify(r)}`);
}
await devePassar(
  "o subempreiteiro pára só o seu relógio (pausa)",
  AUTH.tec2A,
  `SELECT public.rpc_ops_obra_terminar_tarefa('${T["1.1"]}', false);`
);
{
  const a = await um(`SELECT count(*)::int AS n FROM public.ops_obra_registo WHERE tarefa_id='${T["1.1"]}' AND fim IS NULL`);
  a.n === 1 ? ok("o relógio do técnico continua a correr") : mau(`${a.n} relógios abertos`);
}
await deveSerRecusado(
  "dar por feita acima da tolerância SEM justificação é recusado",
  AUTH.tecA,
  `SELECT public.rpc_ops_obra_terminar_tarefa('${T["1.1"]}', true);`,
  "Justificação obrigatória"
);
await deveSerRecusado(
  "o motivo 'outro' sem nota também",
  AUTH.tecA,
  `SELECT public.rpc_ops_obra_terminar_tarefa('${T["1.1"]}', true, 'outro');`,
  "escreve uma nota"
);
await deveSerRecusado(
  "um motivo fora da lista é recusado",
  AUTH.tecA,
  `SELECT public.rpc_ops_obra_terminar_tarefa('${T["1.1"]}', true, 'preguica');`,
  "desconhecido"
);
{
  const r = await devePassar(
    "com o motivo 'condições do edifício', fica feita",
    AUTH.tecA,
    `SELECT public.rpc_ops_obra_terminar_tarefa('${T["1.1"]}', true, 'condicoes_edificio', 'Prédio sem elevador');`
  );
  r?.excedido === true && r?.estado === "feita"
    ? ok("marcada como excedida, com o motivo gravado")
    : mau(`terminar: ${JSON.stringify(r)}`);
  const t = await um(`SELECT motivo_desvio, nota_desvio FROM public.ops_obra_tarefa WHERE id='${T["1.1"]}'`);
  t.motivo_desvio === "condicoes_edificio" && t.nota_desvio === "Prédio sem elevador"
    ? ok("motivo e nota guardados na tarefa")
    : mau(`desvio: ${JSON.stringify(t)}`);
  const a = await um(`SELECT count(*)::int AS n FROM public.ops_obra_registo WHERE tarefa_id='${T["1.1"]}' AND fim IS NULL`);
  a.n === 0 ? ok("dar por feita fechou todos os relógios") : mau(`${a.n} relógios ainda abertos`);
}
// Dentro da tolerância: 1.2 tem 90 previstos; 95 reais < 99.
await devePassar("o técnico inicia a 2.ª", AUTH.tecA, `SELECT public.rpc_ops_obra_iniciar_tarefa('${T["1.2"]}');`);
await db.exec(`UPDATE public.ops_obra_registo SET inicio = now() - interval '95 minutes'
                WHERE tarefa_id='${T["1.2"]}' AND fim IS NULL;`);
await devePassar(
  "dentro da tolerância (95 de 90, limite 99) termina sem justificação",
  AUTH.tecA,
  `SELECT public.rpc_ops_obra_terminar_tarefa('${T["1.2"]}', true);`
);
{
  // Precedência: 1.4 depende de 1.3, que ainda não está feita.
  await chamar(AUTH.gestorA, `
    SELECT public.rpc_ops_obra_gravar_tarefa(t.obra_id, t.id, t.fase_id, t.nome, t.minutos_previstos,
             t.procedimento, t.materiais, t.ferramentas, t.inicio_planeado, t.fim_planeado, '${T["1.3"]}')
      FROM public.ops_obra_tarefa t WHERE t.id='${T["1.4"]}';`);
  await chamar(AUTH.gestorA,
    `SELECT public.rpc_ops_obra_atribuir_tarefa('${T["1.4"]}', ARRAY['${U.tecA}']::uuid[]);`);
}
await deveSerRecusado(
  "não se começa uma tarefa cuja precedente não está feita",
  AUTH.tecA,
  `SELECT public.rpc_ops_obra_iniciar_tarefa('${T["1.4"]}');`,
  "depende de"
);

/* ── Validar ────────────────────────────────────────────────────────────── */
console.log("\n─── validar: o double check ─────────────");
await deveSerRecusado(
  "o técnico não valida (mesmo com a permissão 'confirm')",
  AUTH.tecA,
  `SELECT public.rpc_ops_obra_validar_tarefa('${T["1.2"]}', true);`,
  "Só o supervisor ou o gestor"
);
await deveSerRecusado(
  "rejeitar sem motivo é recusado",
  AUTH.supA,
  `SELECT public.rpc_ops_obra_validar_tarefa('${T["1.2"]}', false);`,
  "exige motivo"
);
await devePassar(
  "o supervisor valida a 1.ª",
  AUTH.supA,
  `SELECT public.rpc_ops_obra_validar_tarefa('${T["1.1"]}', true);`
);
await devePassar(
  "e rejeita a 2.ª com motivo",
  AUTH.supA,
  `SELECT public.rpc_ops_obra_validar_tarefa('${T["1.2"]}', false, 'Ficou silicone por limpar');`
);
{
  const t = await um(`
    SELECT (SELECT estado FROM public.ops_obra_tarefa WHERE id='${T["1.1"]}') AS a,
           (SELECT estado || ':' || motivo_rejeicao FROM public.ops_obra_tarefa WHERE id='${T["1.2"]}') AS b`);
  t.a === "validada" && t.b === "rejeitada:Ficou silicone por limpar"
    ? ok("validada / rejeitada com o motivo para a equipa ler")
    : mau(`estados: ${JSON.stringify(t)}`);
}
await deveSerRecusado(
  "não se valida o que já está validado",
  AUTH.supA,
  `SELECT public.rpc_ops_obra_validar_tarefa('${T["1.1"]}', true);`,
  "Só se valida uma tarefa feita"
);
await devePassar(
  "a rejeitada volta a ser iniciada pela equipa",
  AUTH.tecA,
  `SELECT public.rpc_ops_obra_iniciar_tarefa('${T["1.2"]}');`
);
await devePassar(
  "e terminada outra vez (o retrabalho soma ao real)",
  AUTH.tecA,
  `SELECT public.rpc_ops_obra_terminar_tarefa('${T["1.2"]}', true, 'trabalho_imprevisto');`
);
{
  // O supervisor deu uma ajuda nesta tarefa → já não a pode validar.
  await chamar(AUTH.gestorA,
    `SELECT public.rpc_ops_obra_atribuir_tarefa('${T["1.3"]}', ARRAY['${U.supA}']::uuid[]);`);
  await chamar(AUTH.supA, `SELECT public.rpc_ops_obra_iniciar_tarefa('${T["1.3"]}');`);
  await chamar(AUTH.supA, `SELECT public.rpc_ops_obra_terminar_tarefa('${T["1.3"]}', true);`);
}
await deveSerRecusado(
  "quem fez a tarefa não a valida",
  AUTH.supA,
  `SELECT public.rpc_ops_obra_validar_tarefa('${T["1.3"]}', true);`,
  "Quem fez a tarefa não a valida"
);
await devePassar(
  "a gestora pode fazer de segundo par de olhos",
  AUTH.gestorA,
  `SELECT public.rpc_ops_obra_validar_tarefa('${T["1.3"]}', true);`
);
await deveSerRecusado(
  "a obra não se conclui com tarefas por validar",
  AUTH.gestorA,
  `SELECT public.rpc_ops_obra_mudar_estado('${OB1.id}', 'concluida');`,
  "por validar"
);
await deveSerRecusado(
  "suspender sem motivo é recusado",
  AUTH.gestorA,
  `SELECT public.rpc_ops_obra_mudar_estado('${OB1.id}', 'suspensa');`,
  "exige motivo"
);

/* ── Custos ─────────────────────────────────────────────────────────────── */
console.log("\n─── previsto contra real ────────────────");
{
  const g = await chamar(AUTH.gestorA, `SELECT public.rpc_ops_obra_custos('${OB1.id}');`);
  g.ve_custos === true && Number(g.custo_real) > 0 && Number(g.custo_previsto) > 0
    ? ok(`gestora: previsto ${g.custo_previsto} € vs real ${g.custo_real} € de mão de obra`)
    : mau(`custos da gestora: ${JSON.stringify(g)}`);
  Number(g.orcado_mao_obra) === 800
    ? ok("e o orçado de mão de obra no orçamento (40 h × 20 €) = 800 €")
    : mau(`orçado ${g.orcado_mao_obra}`);
  g.sem_tarifa === 1
    ? ok("avisa que 1 pessoa não tem custo/hora (em vez de contar zero calado)")
    : mau(`sem_tarifa ${g.sem_tarifa}`);
  g.minutos_previstos === 3045 ? ok("3045 min previstos na obra") : mau(`previstos ${g.minutos_previstos}`);

  const t = await chamar(AUTH.tecA, `SELECT public.rpc_ops_obra_custos('${OB1.id}');`);
  t.ve_custos === false && t.custo_real === null && t.custo_previsto === null &&
  t.por_pessoa.every((p) => p.custo === null)
    ? ok("o técnico vê os tempos e NENHUM valor em euros")
    : mau(`o técnico viu custos: ${JSON.stringify(t)}`);
  JSON.stringify(t).includes("custo_hora")
    ? mau("a resposta ao técnico menciona custo_hora")
    : ok("custo_hora não aparece na resposta");

  const cols = await q(`
    SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name LIKE 'ops\\_v\\_obra%' AND column_name LIKE '%custo%'`);
  cols.length === 0 ? ok("nenhuma vista de obras tem coluna de custo") : mau(`colunas: ${JSON.stringify(cols)}`);
}

/* ── Trabalhos extra ────────────────────────────────────────────────────── */
console.log("\n─── trabalhos extra ─────────────────────");
const EX = await devePassar(
  "o técnico regista um extra a partir da obra",
  AUTH.tecA,
  `SELECT public.rpc_ops_obra_registar_extra('${OB1.id}', 'Tubagem de ferro podre atrás do lavatório', 180, '${T["1.3"]}');`
);
await deveSerRecusado(
  "o técnico não aprova extras",
  AUTH.tecA,
  `SELECT public.rpc_ops_obra_decidir_extra('${EX?.id}', 'aprovar');`,
  "Só o gestor"
);
await deveSerRecusado(
  "não se envia ao comercial sem aprovar primeiro",
  AUTH.gestorA,
  `SELECT public.rpc_ops_obra_decidir_extra('${EX?.id}', 'enviar');`,
  "Não se pode"
);
await devePassar("a gestora aprova", AUTH.gestorA, `SELECT public.rpc_ops_obra_decidir_extra('${EX?.id}', 'aprovar');`);
await devePassar("e envia ao comercial", AUTH.gestorA, `SELECT public.rpc_ops_obra_decidir_extra('${EX?.id}', 'enviar');`);
{
  const e = await um(`SELECT estado, enviado_em IS NOT NULL AS env FROM public.ops_obra_extra WHERE id='${EX?.id}'`);
  e.estado === "enviado" && e.env ? ok("extra 'enviado', com data") : mau(`extra: ${JSON.stringify(e)}`);
}
{
  const e2 = await chamar(AUTH.tecA,
    `SELECT public.rpc_ops_obra_registar_extra('${OB1.id}', 'Parede oca', NULL);`);
  await deveSerRecusado(
    "recusar exige motivo",
    AUTH.gestorA,
    `SELECT public.rpc_ops_obra_decidir_extra('${e2.id}', 'recusar');`,
    "exige motivo"
  );
}
await deveSerRecusado(
  "o técnico não regista extras numa obra que não vê",
  AUTH.tecA,
  `SELECT public.rpc_ops_obra_registar_extra('${OBB.id}', 'Nada', 1);`,
  "Sem acesso a esta organização"
);

/* ── O CRM ficou intacto ────────────────────────────────────────────────── */
console.log("\n─── o CRM ficou intacto ─────────────────");
{
  const depois = await um(`
    SELECT (SELECT count(*)::int FROM public.quotes) AS quotes,
           (SELECT count(*)::int FROM public.quote_lines) AS linhas,
           (SELECT count(*)::int FROM public.client_contracts) AS contratos,
           (SELECT string_agg(estado, ',' ORDER BY id) FROM public.quotes) AS estados_q,
           (SELECT string_agg(status, ',' ORDER BY id) FROM public.client_contracts) AS estados_c`);
  JSON.stringify(depois) === JSON.stringify(crmAntes)
    ? ok("quotes, quote_lines e client_contracts exatamente como estavam")
    : mau(`o CRM mudou: ${JSON.stringify(crmAntes)} → ${JSON.stringify(depois)}`);

  const fk = await um(`
    SELECT count(*)::int AS n FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid JOIN pg_class f ON f.oid = c.confrelid
     WHERE c.contype='f' AND t.relname LIKE 'ops\\_%' AND f.relname NOT LIKE 'ops\\_%'`);
  fk.n === 0 ? ok("zero chaves estrangeiras de ops_* para o CRM") : mau(`${fk.n} FK para o CRM`);

  const tr = await um(`
    SELECT count(*)::int AS n FROM pg_trigger g JOIN pg_class t ON t.oid = g.tgrelid
     WHERE NOT g.tgisinternal AND t.relname IN ('quotes','quote_lines','client_contracts')`);
  tr.n === 0 ? ok("nenhum trigger nosso nas tabelas do CRM") : mau(`${tr.n} trigger(s) no CRM`);

  const pub = await um(`
    SELECT count(*)::int AS n FROM pg_proc p
     WHERE p.pronamespace='public'::regnamespace
       AND (p.proname LIKE 'rpc\\_ops\\_obra%' OR p.proname LIKE 'ops\\_obra%')
       AND has_function_privilege('anon', p.oid, 'EXECUTE')`);
  pub.n === 0 ? ok("anon não executa nenhuma função de obras") : mau(`${pub.n} função(ões) abertas a anon`);

  const internas = await um(`
    SELECT count(*)::int AS n FROM pg_proc p
     WHERE p.pronamespace='public'::regnamespace
       AND p.proname IN ('ops_obra_exigir','ops_obra_criar_impl','ops_obra_replanear_impl',
                         'ops_obra_conflitos_impl','ops_obra_semear_exemplo_impl','ops_obra_evento')
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')`);
  internas.n === 0
    ? ok("as funções internas (sem verificação) não estão dadas a authenticated")
    : mau(`${internas.n} função(ões) interna(s) abertas a authenticated`);
}

/* ── Demo ───────────────────────────────────────────────────────────────── */
console.log("\n─── demo ────────────────────────────────");
try {
  await db.exec(ler("demo-obras.sql"));
  await db.exec(ler("demo-obras.sql"));
  const d = await um(`
    SELECT (SELECT count(*)::int FROM public.ops_obra WHERE codigo LIKE 'OB-DEMO-%') AS obras,
           (SELECT count(*)::int FROM public.ops_obra_tarefa t JOIN public.ops_obra o ON o.id=t.obra_id
             WHERE o.codigo LIKE 'OB-DEMO-%') AS tarefas,
           (SELECT count(*)::int FROM public.ops_obra_registo r JOIN public.ops_obra o ON o.id=r.obra_id
             WHERE o.codigo LIKE 'OB-DEMO-%') AS registos`);
  d.obras === 1 && d.tarefas === 17 && d.registos > 0
    ? ok(`demo-obras.sql corre duas vezes: 1 obra, ${d.tarefas} tarefas, ${d.registos} registos`)
    : mau(`demo: ${JSON.stringify(d)}`);
  await db.exec(ler("demo-obras-remover.sql"));
  const r = await um(`SELECT count(*)::int AS n FROM public.ops_obra WHERE codigo LIKE 'OB-DEMO-%'`);
  const resto = await um(`SELECT count(*)::int AS n FROM public.ops_obra`);
  r.n === 0 && resto.n === 4
    ? ok("demo-obras-remover.sql tira só a demo")
    : mau(`depois de remover: demo=${r.n}, total=${resto.n}`);
} catch (e) {
  await db.exec("ROLLBACK").catch(() => {});
  mau(`demo falhou: ${e.message}`);
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ obras: três perfis, justificação obrigatória, isolamento e o CRM sem uma escrita");
