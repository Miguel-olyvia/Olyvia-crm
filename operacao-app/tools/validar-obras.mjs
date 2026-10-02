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
  -- Serviços com ficha técnica (só as colunas que obras.sql lê). Ficam aqui,
  -- como os contratos: validar-instalacao prova que obras.sql instala sem elas.
  ALTER TABLE public.quote_lines ADD COLUMN service_id uuid, ADD COLUMN section_name text;
  CREATE TABLE public.service_categories (id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE public.services (
    id uuid PRIMARY KEY, name text NOT NULL, service_category_id uuid,
    technical_sheet_labor_description text, technical_sheet_labor_hours numeric,
    technical_sheet_labor_people_count numeric,
    organization_id uuid, sku text, is_deleted boolean NOT NULL DEFAULT false, deleted_at timestamptz);
  CREATE TABLE public.service_organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_id uuid NOT NULL, organization_id uuid NOT NULL);
  ALTER TABLE public.products ADD COLUMN name text;
  CREATE TABLE public.service_materials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_id uuid NOT NULL, product_id uuid NOT NULL,
    quantity numeric NOT NULL, sort_order integer, deleted_at timestamptz);
  INSERT INTO public.service_categories VALUES
    ('5c000000-0000-0000-0000-000000000001','Demolições'),
    ('5c000000-0000-0000-0000-000000000002','Canalização'),
    ('5c000000-0000-0000-0000-000000000003','Pinturas');
  INSERT INTO public.services VALUES
    ('5e000000-0000-0000-0000-000000000001','Remoção de azulejo','5c000000-0000-0000-0000-000000000001','Picar e retirar entulho',0.5,2),
    ('5e000000-0000-0000-0000-000000000002','Base de duche','5c000000-0000-0000-0000-000000000002','Assentar e ligar ao esgoto',3,1),
    ('5e000000-0000-0000-0000-000000000003','Pintura de tetos','5c000000-0000-0000-0000-000000000003',NULL,NULL,NULL);
  INSERT INTO public.products (id, name) VALUES ('5f000000-0000-0000-0000-000000000001','Cimento cola'),
                                     ('5f000000-0000-0000-0000-000000000002','Silicone');
  INSERT INTO public.service_materials (service_id, product_id, quantity, sort_order, deleted_at) VALUES
    ('5e000000-0000-0000-0000-000000000002','5f000000-0000-0000-0000-000000000001',2,1,NULL),
    ('5e000000-0000-0000-0000-000000000002','5f000000-0000-0000-0000-000000000002',1,2,now());
  -- Moradas do cliente A: uma antiga (já não vale) e a principal.
  INSERT INTO public.anew_addresses (id, street, number, floor, postal_code, city) VALUES
    ('ad000000-0000-0000-0000-000000000001','Rua Velha','1',NULL,'1000-001','Lisboa'),
    ('ad000000-0000-0000-0000-000000000002','Rua do Cliente','7','2.º Esq','1100-200','Lisboa');
  INSERT INTO public.anew_entity_addresses (entity_id, address_id, address_type, is_primary, valid_to) VALUES
    ('77777777-7777-7777-7777-777777777777','ad000000-0000-0000-0000-000000000001','fiscal',true, now() - interval '1 day'),
    ('77777777-7777-7777-7777-777777777777','ad000000-0000-0000-0000-000000000002','fiscal',true, NULL);
  -- O orçamento do contrato: 3 serviços (um sem ficha) e um produto.
  INSERT INTO public.quote_lines (quote_id, ordem, descricao_snapshot, qt, service_id) VALUES
    ('${ORC_CONTRATO}',0,'Remoção de azulejo',10,'5e000000-0000-0000-0000-000000000001'),
    ('${ORC_CONTRATO}',1,'Base de duche 80x80',1,'5e000000-0000-0000-0000-000000000002'),
    ('${ORC_CONTRATO}',2,'Pintura tetos',20,'5e000000-0000-0000-0000-000000000003'),
    ('${ORC_CONTRATO}',3,'Louças',1,NULL);
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
  // Em paralelo, com 2 técnicos/operadores na organização (2 vagas): em série
  // seriam 7 dias úteis (05/10 → 13/10); assim acaba a 08/10.
  d.ini === "2026-10-05" && d.fim === "2026-10-08"
    ? ok(`${d.minutos} min com 2 pessoas em paralelo: 05/10 → 08/10 (em série seriam 7 dias úteis)`)
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
{
  const p = await devePassar(
    "pré-visualizar as tarefas que o contrato vai gerar",
    AUTH.gestorA,
    `SELECT public.rpc_ops_obra_previsao_orcamento('${ORG_A}', NULL, '${CTR_ASSINADO}');`
  );
  p?.tarefas?.length === 3 && p.minutos === 600 + 180 + 60 && p.sem_ficha === 1
    ? ok("3 serviços → 3 tarefas, 840 min, 1 sem ficha técnica (o produto fica de fora)")
    : mau(`pré-visualização: ${JSON.stringify(p)}`);
}
await deveSerRecusado(
  "o técnico não pré-visualiza",
  AUTH.tecA,
  `SELECT public.rpc_ops_obra_previsao_orcamento('${ORG_A}', NULL, '${CTR_ASSINADO}');`,
  "Só quem planeia"
);
await deveSerRecusado(
  "o gestor da B não pré-visualiza um contrato da A pela B",
  AUTH.gestorB,
  `SELECT public.rpc_ops_obra_previsao_orcamento('${ORG_B}', NULL, '${CTR_ASSINADO}');`,
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
    ? ok("sem modelo, nascem as 4 fases por defeito")
    : mau(`fases: ${o.fases}`);
  const t = await q(`
    SELECT f.ordem AS fase, t.nome, t.minutos_previstos AS min, t.procedimento, t.materiais,
           t.servico_id IS NOT NULL AS tem_servico, t.orcamento_linha_id IS NOT NULL AS tem_linha,
           t.inicio_planeado::text AS ini, t.fim_planeado::text AS fim
      FROM public.ops_obra_tarefa t JOIN public.ops_obra_fase f ON f.id = t.fase_id
     WHERE t.obra_id='${OB2.id}' ORDER BY f.ordem, t.ordem`);
  JSON.stringify(t.map((x) => [x.fase, x.nome, x.min])) ===
  JSON.stringify([[1, "Remoção de azulejo", 600], [2, "Base de duche", 180], [3, "Pintura de tetos", 60]])
    ? ok("tarefas dos serviços do contrato: fase pela categoria, minutos = qt × horas × pessoas")
    : mau(`tarefas do contrato: ${JSON.stringify(t)}`);
  t[0]?.procedimento === "Picar e retirar entulho" && t[1]?.materiais === "Cimento cola × 2"
    ? ok("procedimento e materiais (sem os apagados) vêm da ficha técnica")
    : mau(`ficha: ${JSON.stringify(t.slice(0, 2))}`);
  t.every((x) => x.tem_servico && x.tem_linha) ? ok("cada tarefa guarda a linha e o serviço de onde veio") : mau("sem rasto da linha");
  // Serviços sem relação entre si (outra linha, outra especialidade, sem
  // tipo de obra): não há dependência — em paralelo, tarefa a tarefa. 600 min
  // com 2 pessoas = 300 no calendário (ocupa as 2 vagas); depois as outras
  // duas em paralelo, no mesmo dia.
  t.every((x) => x.ini === "2026-10-12" && x.fim === "2026-10-12")
    ? ok("sem relação entre serviços, não há barreira de fase: as 3 cabem em paralelo no 1.º dia")
    : mau(`datas: ${JSON.stringify(t.map((x) => [x.ini, x.fim]))}`);
  const dep = await um(`SELECT count(*)::int AS n FROM public.ops_obra_tarefa_dependencia WHERE obra_id='${OB2.id}'`);
  dep.n === 0 ? ok("e nenhuma dependência inventada entre serviços sem relação") : mau(`${dep.n} dependência(s) inventada(s)`);
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
{
  const m = await um(`SELECT morada FROM public.ops_obra WHERE id='${OB3?.id}'`);
  m?.morada === "Rua do Cliente 7, 2.º Esq, 1100-200 Lisboa"
    ? ok("sem morada no orçamento, a obra fica com a morada atual do cliente")
    : mau(`morada do cliente: ${m?.morada}`);
  const sc = await chamar(AUTH.gestorA,
    `SELECT public.rpc_ops_obra_morada_sugerida('${ORG_A}', NULL, NULL, '${CTR_ASSINADO}');`);
  const sl = await chamar(AUTH.gestorA,
    `SELECT public.rpc_ops_obra_morada_sugerida('${ORG_A}', '${CLI_A}');`);
  sc === "Av. Roma 3, Lisboa" && sl === "Rua do Cliente 7, 2.º Esq, 1100-200 Lisboa"
    ? ok("o formulário recebe a morada sugerida (do contrato, ou do cliente)")
    : mau(`morada sugerida: ${sc} | ${sl}`);
  const sb = await chamar(AUTH.gestorB,
    `SELECT public.rpc_ops_obra_morada_sugerida('${ORG_B}', '${CLI_A}');`);
  sb === null ? ok("o gestor da B não lê a morada de um cliente da A") : mau(`fuga de morada: ${sb}`);
}
const OBB = await devePassar(
  "o gestor da B abre uma obra na B",
  AUTH.gestorB,
  criar(`p_org => '${ORG_B}', p_titulo => 'Obra B', p_cliente_id => '${CLI_B}'`)
);

/* ── Planeamento automático: supervisor e equipa ────────────────────────── */
console.log("\n─── planeamento automático ──────────────");
{
  const sup = await um(`SELECT supervisor_id FROM public.ops_obra WHERE id='${OB2?.id}'`);
  sup?.supervisor_id === U.supA
    ? ok("sem supervisor escolhido, fica o supervisor da organização")
    : mau(`supervisor automático: ${sup?.supervisor_id}`);

  const eq = await q(`
    SELECT t.nome, t.pessoas_previstas AS n,
           array_agg(tp.utilizador_id::text ORDER BY tp.utilizador_id) AS quem
      FROM public.ops_obra_tarefa t
      LEFT JOIN public.ops_obra_tarefa_pessoa tp ON tp.tarefa_id = t.id
     WHERE t.obra_id='${OB2?.id}' GROUP BY t.id, t.nome, t.pessoas_previstas, t.ordem ORDER BY t.ordem`);
  const tecnicos = new Set([U.tecA, U.tec2A]);
  eq.length === 3 && eq.every((x) => x.quem.filter(Boolean).length === x.n)
    ? ok("ao criar, cada tarefa já tem as pessoas que a ficha pede (2 na remoção, 1 nas outras)")
    : mau(`equipa automática: ${JSON.stringify(eq)}`);
  eq.every((x) => x.quem.every((u) => tecnicos.has(u)))
    ? ok("só técnicos e operadores — o gestor e o supervisor não entram na equipa")
    : mau(`entrou quem não devia: ${JSON.stringify(eq)}`);

  // Do zero, para ver as preferências sem o ruído das outras obras.
  await db.exec(`DELETE FROM public.ops_obra_tarefa_pessoa;
                 UPDATE public.ops_utilizador_perfil SET zona_base = 'Roma' WHERE utilizador_id = '${U.tec2A}';`);
  await deveSerRecusado(
    "o técnico não distribui a equipa",
    AUTH.tecA,
    `SELECT public.rpc_ops_obra_distribuir('${OB2?.id}', true);`,
    "Só quem planeia"
  );
  const d = await devePassar(
    "a gestora carrega em 'Distribuir equipa'",
    AUTH.gestorA,
    `SELECT public.rpc_ops_obra_distribuir('${OB2?.id}', true);`
  );
  const z = await q(`
    SELECT t.ordem, array_agg(tp.utilizador_id::text) AS quem
      FROM public.ops_obra_tarefa t JOIN public.ops_obra_tarefa_pessoa tp ON tp.tarefa_id = t.id
     WHERE t.obra_id='${OB2?.id}' GROUP BY t.ordem ORDER BY t.ordem`);
  d?.tarefas === 3 && z[1]?.quem.join() === U.tec2A && z[2]?.quem.join() === U.tec2A
    ? ok("quem tem a zona na morada da obra (Av. Roma) fica com as tarefas de 1 pessoa")
    : mau(`zona: ${JSON.stringify({ d, z })}`);

  // Choque: o tec2A passa a estar noutra obra nesses dias → vai o tecA.
  await db.exec(`
    INSERT INTO public.ops_obra_tarefa_pessoa (tarefa_id, utilizador_id, organization_id, obra_id)
    SELECT t.id, '${U.tec2A}', t.organization_id, t.obra_id FROM public.ops_obra_tarefa t
     WHERE t.obra_id = '${OB1?.id}' ORDER BY t.ordem LIMIT 1;
    UPDATE public.ops_obra_tarefa SET inicio_planeado = '2026-10-12', fim_planeado = '2026-10-13'
     WHERE obra_id = '${OB1?.id}' AND id IN (SELECT tarefa_id FROM public.ops_obra_tarefa_pessoa WHERE utilizador_id='${U.tec2A}');`);
  await chamar(AUTH.gestorA, `SELECT public.rpc_ops_obra_distribuir('${OB2?.id}', true);`);
  const ch = await q(`
    SELECT t.ordem, array_agg(tp.utilizador_id::text) AS quem
      FROM public.ops_obra_tarefa t JOIN public.ops_obra_tarefa_pessoa tp ON tp.tarefa_id = t.id
     WHERE t.obra_id='${OB2?.id}' AND t.pessoas_previstas = 1 GROUP BY t.ordem ORDER BY t.ordem`);
  ch.length === 2 && ch.every((x) => x.quem.join() === U.tecA)
    ? ok("quem já está noutra obra nesses dias fica de fora, mesmo sendo da zona")
    : mau(`choque: ${JSON.stringify(ch)}`);

  // Os testes seguintes atribuem à mão: começam sem ninguém, como antes.
  await db.exec(`DELETE FROM public.ops_obra_tarefa_pessoa;
                 UPDATE public.ops_utilizador_perfil SET zona_base = NULL;
                 SELECT public.ops_obra_replanear_impl('${OB1?.id}', '2026-10-05');`);
}

/* ── Modelos por serviço ────────────────────────────────────────────────── */
console.log("\n─── modelos por serviço ─────────────────");
{
  const COM = "a0000000-0000-0000-0000-00000000000e";
  const AUTH_COM = "e0000000-0000-0000-0000-00000000000e";
  const S_REM = "5e000000-0000-0000-0000-000000000001";
  const S_DUCHE = "5e000000-0000-0000-0000-000000000002";
  const S_PINT = "5e000000-0000-0000-0000-000000000003";
  const S_B = "5e000000-0000-0000-0000-000000000009";
  const S_PARTILHADO = "5e000000-0000-0000-0000-00000000000a";
  await db.exec(`
    UPDATE public.services SET organization_id = '${ORG_A}';
    INSERT INTO public.services (id, name, technical_sheet_labor_hours, technical_sheet_labor_people_count, organization_id) VALUES
      ('${S_B}','Serviço da B',1,1,'${ORG_B}'),
      ('${S_PARTILHADO}','Limpeza pós-obra',2,2,'${ORG_B}');
    INSERT INTO public.service_organizations (service_id, organization_id) VALUES ('${S_PARTILHADO}','${ORG_A}');
    INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES ('${COM}','${AUTH_COM}','Comercial A','ca@x.pt');
    INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES ('${AUTH_COM}','${COM}');
    INSERT INTO public.anew_roles (id, organization_id, name) VALUES ('d0000000-0000-0000-0000-00000000000d','${ORG_A}','Comercial A');
    INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES ('d0000000-0000-0000-0000-00000000000d','services.edit');
    INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status)
      VALUES ('${COM}','${ORG_A}','d0000000-0000-0000-0000-00000000000d','active');
  `);

  await deveSerRecusado("o técnico não gera modelos", AUTH.tecA,
    `SELECT public.rpc_ops_servico_modelo_sugerir('${ORG_A}');`, "Sem permissão");
  const g = await devePassar("o comercial (services.edit, sem perfil em Operações) gera os modelos que faltam",
    AUTH_COM, `SELECT public.rpc_ops_servico_modelo_sugerir('${ORG_A}');`);
  g?.servicos === 4 && g?.tarefas === 3 + 5 + 5 + 1
    ? ok("4 serviços (3 da A + 1 partilhado com a A) → 14 tarefas pela biblioteca")
    : mau(`sugestão: ${JSON.stringify(g)}`);

  const m = async (servico) => q(`
    SELECT x.ordem, x.nome, x.fase, x.minutos_por_unidade::float AS mpu, x.minutos_fixos AS fix, x.pessoas,
           x.depende_ordem AS dep, k.nome AS skill, x.procedimento, x.materiais, x.origem
      FROM public.ops_obra_servico_tarefa x LEFT JOIN public.ops_skill k ON k.id = x.skill_id
     WHERE x.organization_id='${ORG_A}' AND x.servico_id='${servico}' ORDER BY x.ordem`);
  const rem = await m(S_REM);
  rem.map((x) => x.nome).join(" | ") === "Proteger zona e acessos | Demolir e remover | Retirar entulho" &&
  rem[1].mpu === 48 && rem[1].pessoas === 2 && rem[1].dep === 1 && rem[0].fix === 45 && rem[1].skill === "Demolições"
    ? ok("demolição: 0,5 h × 2 pessoas da ficha = 60 min/un, 80 % em 'Demolir e remover' (48), 2 pessoas, skill Demolições")
    : mau(`modelo da remoção: ${JSON.stringify(rem)}`);
  const duche = await m(S_DUCHE);
  duche.length === 5 && duche[2].mpu === 90 && duche[2].pessoas === 1 &&
  duche[2].materiais === "Cimento cola × 2 /un" && duche[2].procedimento === "Assentar e ligar ao esgoto" &&
  duche.every((x) => x.fase === 2 && x.origem === "sugerida")
    ? ok("canalização: 5 passos na fase 2; o principal leva o procedimento e os materiais da ficha")
    : mau(`modelo do duche: ${JSON.stringify(duche)}`);
  const pint = await m(S_PINT);
  pint.length === 5 && Math.abs(pint.reduce((a, x) => a + x.mpu, 0) - 15) < 0.01
    ? ok("pintura sem horas na ficha: 15 min/un da biblioteca, repartidos por 5 passos")
    : mau(`modelo da pintura: ${JSON.stringify(pint)}`);
  const tipo = await um(`SELECT nome, por_defeito FROM public.ops_obra_modelo WHERE organization_id='${ORG_A}' AND por_defeito`);
  tipo?.nome === "Obra geral" ? ok("e fica criado o tipo 'Obra geral', por defeito") : mau(`tipo por defeito: ${JSON.stringify(tipo)}`);

  await deveSerRecusado("o gestor da B não mexe num serviço da A pela B", AUTH.gestorB,
    `SELECT public.rpc_ops_servico_modelo_sugerir('${ORG_B}', '${S_REM}', true);`, "não encontrado");
  await deveSerRecusado("sem confirmar, não se substitui um modelo que já existe", AUTH.gestorA,
    `SELECT public.rpc_ops_servico_modelo_sugerir('${ORG_A}', '${S_REM}');`, "já tem modelo");

  const grava = (tarefas, who = AUTH_COM) =>
    `SELECT public.rpc_ops_servico_modelo_gravar('${ORG_A}', '${S_DUCHE}', '${JSON.stringify(tarefas)}'::jsonb);`;
  await deveSerRecusado("depender de uma tarefa que não existe é recusado", AUTH_COM,
    grava([{ nome: "Assentar base", fase: 2, minutos_por_unidade: 120, pessoas: 1, depende_ordem: 5 }]), "só pode depender");
  await deveSerRecusado("uma tarefa sem tempo é recusada", AUTH_COM,
    grava([{ nome: "Assentar base", fase: 2 }]), "precisa de tempo");
  const SK_B = (await um(`INSERT INTO public.ops_skill (organization_id, nome) VALUES ('${ORG_B}','Só da B') RETURNING id`)).id;
  await deveSerRecusado("uma especialidade de outra organização é recusada", AUTH_COM,
    grava([{ nome: "Assentar base", fase: 2, minutos_por_unidade: 120, skill_id: SK_B }]), "não é desta organização");
  const canal = (await um(`SELECT id FROM public.ops_skill WHERE organization_id='${ORG_A}' AND nome='Canalização'`)).id;
  await devePassar("o comercial grava o modelo do duche à mão (2 passos, o 2.º depende do 1.º)", AUTH_COM,
    grava([
      { nome: "Assentar base", fase: 2, minutos_fixos: 30, minutos_por_unidade: 120, pessoas: 1, skill_id: canal },
      { nome: "Ligar ao esgoto e vedar", fase: 2, minutos_por_unidade: 60, pessoas: 1, skill_id: canal, depende_ordem: 1 },
    ]));
  const re = await devePassar("refazer as sugestões não apaga o que foi gravado à mão", AUTH.gestorA,
    `SELECT public.rpc_ops_servico_modelo_sugerir('${ORG_A}', NULL, true);`);
  (await m(S_DUCHE)).length === 2 && re?.servicos === 3
    ? ok("o duche (manual) ficou; os 3 sugeridos foram refeitos")
    : mau(`refazer: ${JSON.stringify(re)} / duche ${(await m(S_DUCHE)).length}`);

  const lista = await chamar(AUTH.gestorA, `SELECT public.rpc_ops_servicos_com_modelo('${ORG_A}');`);
  lista?.length === 4 && lista.find((x) => x.servico_id === S_DUCHE)?.editado === true &&
  !lista.some((x) => x.servico_id === S_B)
    ? ok("a lista do ecrã: os 4 serviços da A (com o partilhado), o duche marcado como editado")
    : mau(`lista: ${JSON.stringify(lista?.map((x) => [x.nome, x.tarefas.length, x.editado]))}`);

  // Especialidades e zona: o tec2A é canalizador.
  await deveSerRecusado("o técnico não mexe nas especialidades da equipa", AUTH.tecA,
    `SELECT public.rpc_ops_pessoa_planeamento('${ORG_A}', '${U.tec2A}', 'Lisboa', ARRAY['${canal}']::uuid[]);`, "Só o gestor");
  await devePassar("a gestora diz que o subempreiteiro é canalizador", AUTH.gestorA,
    `SELECT public.rpc_ops_pessoa_planeamento('${ORG_A}', '${U.tec2A}', NULL, ARRAY['${canal}']::uuid[]);`);

  // Uma obra a partir de um orçamento com estes serviços, com o tipo por defeito.
  const ORC_M = "99990000-0000-0000-0000-0000000000aa";
  await db.exec(`
    INSERT INTO public.quotes (id, organization_id, cliente_id, quote_number, title, obra_endereco, estado, accepted_at, total)
      VALUES ('${ORC_M}','${ORG_A}','${CLI_A}','ORC-A-M','WC completo','Rua M 1, Lisboa','aceite',now(),3000);
    INSERT INTO public.quote_lines (quote_id, ordem, descricao_snapshot, qt, service_id) VALUES
      ('${ORC_M}',0,'Remoção',10,'${S_REM}'), ('${ORC_M}',1,'Duche',1,'${S_DUCHE}'), ('${ORC_M}',2,'Pintura',20,'${S_PINT}');`);
  const TIPO = (await um(`SELECT id FROM public.ops_obra_modelo WHERE organization_id='${ORG_A}' AND por_defeito`)).id;
  const OBM = await devePassar("obra do orçamento com o tipo 'Obra geral'", AUTH.gestorA,
    criar(`p_org => '${ORG_A}', p_orcamento_id => '${ORC_M}', p_modelo_id => '${TIPO}', p_data_inicio => '2026-11-02'`));
  const tm = await q(`
    SELECT t.nome, f.ordem AS fase, t.minutos_previstos AS min, t.pessoas_previstas AS k,
           d.nome AS depende, t.inicio_planeado::text AS ini, t.fim_planeado::text AS fim,
           (SELECT array_agg(tp.utilizador_id::text) FROM public.ops_obra_tarefa_pessoa tp WHERE tp.tarefa_id = t.id) AS quem
      FROM public.ops_obra_tarefa t JOIN public.ops_obra_fase f ON f.id = t.fase_id
      LEFT JOIN public.ops_obra_tarefa d ON d.id = t.depende_de
     WHERE t.obra_id='${OBM?.id}' ORDER BY f.ordem, t.ordem`);
  const por = (n) => tm.find((x) => x.nome === n);
  tm.length === 4 + 3 + 2 + 5 && por("Reunião de arranque com o cliente") && por("Vistoria e entrega ao cliente")
    ? ok("14 tarefas: as 4 do tipo (arranque, proteção, limpeza, entrega) + as dos 3 serviços")
    : mau(`tarefas da obra: ${JSON.stringify(tm.map((x) => x.nome))}`);
  const dem = por("Remoção de azulejo: Demolir e remover");
  const ent = por("Remoção de azulejo: Retirar entulho");
  dem?.min === 480 && dem?.k === 2 && ent?.depende === "Remoção de azulejo: Demolir e remover"
    ? ok("tempo × quantidade (48 × 10 = 480 min, 2 pessoas) e a dependência dentro do serviço")
    : mau(`demolição: ${JSON.stringify({ dem, ent })}`);
  ent && dem && ent.ini >= dem.fim
    ? ok("o entulho só começa quando a demolição acaba")
    : mau(`ordem: ${JSON.stringify({ dem, ent })}`);
  const f1 = tm.filter((x) => x.fase === 1);
  const f2 = tm.filter((x) => x.fase === 2);
  const f3 = tm.filter((x) => x.fase === 3);
  const maxFim = (xs) => xs.reduce((a, x) => (x.fim > a ? x.fim : a), "");
  f1.filter((x) => x.ini === "2026-11-02").length >= 2
    ? ok("em paralelo (várias tarefas no 1.º dia)")
    : mau(`paralelo: ${JSON.stringify(tm.map((x) => [x.fase, x.nome, x.ini, x.fim]))}`);
  f2.length === 2 && f2.every((x) => x.quem?.join() === U.tec2A)
    ? ok("as tarefas de canalização vão para quem tem a especialidade")
    : mau(`skill: ${JSON.stringify(f2.map((x) => [x.nome, x.quem]))}`);

  /* ── Dependências tarefa a tarefa (micro), não fase a fase ── */
  console.log("\n─── dependências tarefa a tarefa ────────");
  const ids = Object.fromEntries(
    (await q(`SELECT nome, id FROM public.ops_obra_tarefa WHERE obra_id='${OBM?.id}'`)).map((x) => [x.nome, x.id]));
  const deps = async (nome) =>
    (await q(`SELECT d.nome FROM public.ops_obra_tarefa_dependencia x JOIN public.ops_obra_tarefa d ON d.id = x.depende_de_id
               WHERE x.tarefa_id='${ids[nome]}' ORDER BY d.nome`)).map((x) => x.nome);
  f3.some((a) => f2.some((b) => a.ini < b.fim))
    ? ok("uma tarefa da fase 3 (pintura) começa antes de uma da fase 2 (canalização) acabar — não depende dela")
    : mau(`fase 3 vs 2: ${JSON.stringify([...f2, ...f3].map((x) => [x.nome, x.ini, x.fim]))}`);
  f2.some((a) => a.ini < maxFim(f1))
    ? ok("e a canalização (fase 2) começa antes de a fase 1 acabar toda")
    : mau(`fase 2 vs 1: ${JSON.stringify([...f1, ...f2].map((x) => [x.nome, x.ini, x.fim]))}`);
  const dAssentar = await deps("Base de duche: Assentar base");
  JSON.stringify(dAssentar) === JSON.stringify(["Proteger acessos e zonas comuns", "Reunião de arranque com o cliente"])
    ? ok("por defeito, a canalização depende só das tarefas do tipo de obra da fase 1 (arranque, proteção)")
    : mau(`dependências do duche: ${JSON.stringify(dAssentar)}`);
  const dLimpeza = await deps("Limpeza final");
  const limp = por("Limpeza final");
  dLimpeza.length >= 3 && tm.filter((x) => x.fase < 4).every((x) => x.fim <= limp.ini)
    ? ok(`a limpeza final (tipo de obra) depende das últimas de cada cadeia (${dLimpeza.length}) e fica depois de tudo`)
    : mau(`limpeza: ${JSON.stringify({ dLimpeza, limp })}`);
  const vista = await linhas(AUTH.gestorA,
    `SELECT dependencias FROM public.ops_v_obra_tarefa WHERE id='${ids["Remoção de azulejo: Retirar entulho"]}';`);
  JSON.stringify(vista.at(-1)?.dependencias) === JSON.stringify([ids["Remoção de azulejo: Demolir e remover"]])
    ? ok("ops_v_obra_tarefa.dependencias expõe as dependências (para as setas do Gantt)")
    : mau(`vista: ${JSON.stringify(vista.at(-1))}`);

  const gravarDeps = (tarefa, lista) =>
    `SELECT public.rpc_ops_obra_gravar_dependencias('${ids[tarefa]}', ARRAY[${lista.map((n) => `'${ids[n]}'`).join(",")}]::uuid[]);`;
  await deveSerRecusado("o técnico não muda dependências", AUTH.tecA,
    gravarDeps("Base de duche: Assentar base", ["Remoção de azulejo: Demolir e remover"]), "Só quem planeia");
  await deveSerRecusado("uma dependência que fecha um ciclo é recusada", AUTH.gestorA,
    gravarDeps("Remoção de azulejo: Demolir e remover", ["Remoção de azulejo: Retirar entulho"]), "ciclo");
  await deveSerRecusado("o gestor da B não mexe nas dependências da A", AUTH.gestorB,
    gravarDeps("Base de duche: Assentar base", []), "Sem acesso a esta organização");
  const gd = await devePassar("a gestora põe o duche depois de DUAS tarefas (demolir e entulho)", AUTH.gestorA,
    gravarDeps("Base de duche: Assentar base", ["Remoção de azulejo: Demolir e remover", "Remoção de azulejo: Retirar entulho"]));
  const col = await um(`SELECT depende_de FROM public.ops_obra_tarefa WHERE id='${ids["Base de duche: Assentar base"]}'`);
  gd?.dependencias?.length === 2 && col.depende_de === ids["Remoção de azulejo: Demolir e remover"] &&
  (await deps("Base de duche: Assentar base")).length === 2
    ? ok("2 dependências gravadas; a coluna antiga depende_de fica com a primeira")
    : mau(`gravar dependências: ${JSON.stringify({ gd, col })}`);
  gd?.antes_de_acabar?.length >= 1
    ? ok("e avisa que, com as datas de agora, o entulho ainda não acabou quando o duche começa")
    : mau(`antes_de_acabar: ${JSON.stringify(gd)}`);
  await devePassar("'Replanear' respeita as novas dependências", AUTH.gestorA,
    `SELECT public.rpc_ops_obra_replanear('${OBM?.id}', '2026-11-02');`);
  const rp = await q(`SELECT nome, inicio_planeado::text AS ini, fim_planeado::text AS fim FROM public.ops_obra_tarefa
                       WHERE id IN ('${ids["Base de duche: Assentar base"]}','${ids["Remoção de azulejo: Retirar entulho"]}')`);
  const ent2 = rp.find((x) => x.nome.endsWith("Retirar entulho"));
  const ass2 = rp.find((x) => x.nome.endsWith("Assentar base"));
  ass2 && ent2 && ass2.ini >= ent2.fim
    ? ok(`o duche passa para depois do entulho (${ent2.fim} → ${ass2.ini})`)
    : mau(`replanear: ${JSON.stringify(rp)}`);

  // Iniciar: bloqueado enquanto QUALQUER uma das duas não estiver feita.
  await db.exec(`UPDATE public.ops_obra_tarefa SET estado = 'feita' WHERE id = '${ids["Remoção de azulejo: Demolir e remover"]}';`);
  await deveSerRecusado("com uma de duas dependências feita, ainda não se começa", AUTH.gestorA,
    `SELECT public.rpc_ops_obra_iniciar_tarefa('${ids["Base de duche: Assentar base"]}');`, "Retirar entulho");
  await db.exec(`UPDATE public.ops_obra_tarefa SET estado = 'validada' WHERE id = '${ids["Remoção de azulejo: Retirar entulho"]}';`);
  await devePassar("com as duas feitas, começa", AUTH.gestorA,
    `SELECT public.rpc_ops_obra_iniciar_tarefa('${ids["Base de duche: Assentar base"]}');`);
  await db.exec(`DELETE FROM public.ops_obra_registo WHERE obra_id = '${OBM?.id}';`);

  // A coluna antiga continua a funcionar (Gravar tarefa com p_depende_de).
  const t4 = ids["Pintura de tetos: Proteger e mascarar"];
  await chamar(AUTH.gestorA, `
    SELECT public.rpc_ops_obra_gravar_tarefa(t.obra_id, t.id, t.fase_id, t.nome, t.minutos_previstos,
             t.procedimento, t.materiais, t.ferramentas, t.inicio_planeado, t.fim_planeado,
             '${ids["Base de duche: Ligar ao esgoto e vedar"]}')
      FROM public.ops_obra_tarefa t WHERE t.id='${t4}';`);
  (await deps("Pintura de tetos: Proteger e mascarar")).includes("Base de duche: Ligar ao esgoto e vedar")
    ? ok("'Gravar tarefa' com depende_de também entra na lista de dependências (trigger)")
    : mau(`sync: ${JSON.stringify(await deps("Pintura de tetos: Proteger e mascarar"))}`);
  await deveSerRecusado("e também recusa um ciclo pela coluna antiga", AUTH.gestorA, `
    SELECT public.rpc_ops_obra_gravar_tarefa(t.obra_id, t.id, t.fase_id, t.nome, t.minutos_previstos,
             t.procedimento, t.materiais, t.ferramentas, t.inicio_planeado, t.fim_planeado, '${t4}')
      FROM public.ops_obra_tarefa t WHERE t.id='${ids["Base de duche: Ligar ao esgoto e vedar"]}';`, "ciclo");
  await deveSerRecusado("um modelo de serviço com um ciclo é recusado", AUTH_COM,
    grava([
      { nome: "A", fase: 2, minutos_por_unidade: 10, depende_ordem: 2 },
      { nome: "B", fase: 2, minutos_por_unidade: 10, depende_ordem: 1 },
    ]), "ciclo");

  // Limpar: os testes seguintes contam obras e pessoas como antes.
  await db.exec(`
    DELETE FROM public.ops_obra WHERE id = '${OBM?.id}';
    DELETE FROM public.quote_lines WHERE quote_id = '${ORC_M}';
    DELETE FROM public.quotes WHERE id = '${ORC_M}';
    DELETE FROM public.ops_utilizador_skill;`);
}

/* ── Nova obra, passo 2: "Serviços do contrato" ─────────────────────────── */
console.log("\n─── serviços do contrato (passo 2) ──────");
{
  const S_REM = "5e000000-0000-0000-0000-000000000001";
  const S_TOM = "5e000000-0000-0000-0000-00000000000b";
  const P_TOM = "5f000000-0000-0000-0000-000000000003";
  const P_LOUCA = "5f000000-0000-0000-0000-000000000004";
  const ORC_S = "99990000-0000-0000-0000-0000000000bb";
  const CTR_S = "88880000-0000-0000-0000-0000000000bb";
  const js = (o) => JSON.stringify(o).replace(/'/g, "''");
  await db.exec(`
    ALTER TABLE public.quote_lines ADD COLUMN IF NOT EXISTS product_id uuid;
    INSERT INTO public.services (id, name, technical_sheet_labor_hours, technical_sheet_labor_people_count, organization_id)
      VALUES ('${S_TOM}','Instalação de tomadas',0.5,1,'${ORG_A}');
    INSERT INTO public.products (id, name) VALUES ('${P_TOM}','Tomada schuko'), ('${P_LOUCA}','Sanita suspensa');
    INSERT INTO public.service_materials (service_id, product_id, quantity, sort_order) VALUES ('${S_TOM}','${P_TOM}',1,1);
    INSERT INTO public.quotes (id, organization_id, cliente_id, quote_number, title, obra_endereco, estado, accepted_at, total)
      VALUES ('${ORC_S}','${ORG_A}','${CLI_A}','ORC-A-S','Casa nova','Rua S 1, Lisboa','aceite',now(),5000);
    INSERT INTO public.quote_lines (quote_id, ordem, descricao_snapshot, qt, service_id, product_id) VALUES
      ('${ORC_S}',0,'Remoção',10,'${S_REM}',NULL),
      ('${ORC_S}',1,'Tomadas',6,'${S_TOM}',NULL),
      ('${ORC_S}',2,'Sanita',1,NULL,'${P_LOUCA}');
    INSERT INTO public.client_contracts (id, contract_number, client_id, status, organization_id, quote_id, signature_date, created_by)
      VALUES ('${CTR_S}','CT-A-S','${CLI_A}','signed','${ORG_A}','${ORC_S}',now(),'${U.gestorA}');`);

  const previsao = (org, extra = "") => `SELECT public.rpc_ops_obra_previsao_contrato('${org}', '${CTR_S}'${extra});`;
  await deveSerRecusado("o técnico não abre o passo 2", AUTH.tecA, previsao(ORG_A), "Só quem planeia");
  await deveSerRecusado("o gestor da B não lê um contrato da A pela B", AUTH.gestorB, previsao(ORG_B), "não encontrado");

  const estado = () => um(`
    SELECT (SELECT count(*)::int FROM public.ops_obra) AS obras,
           (SELECT count(*)::int FROM public.ops_obra_tarefa) AS tarefas,
           (SELECT count(*)::int FROM public.ops_obra_servico_tarefa WHERE servico_id='${S_TOM}') AS modelo,
           (SELECT count(*)::int FROM public.ops_skill WHERE organization_id='${ORG_A}' AND nome='Eletricidade') AS skill,
           (SELECT COALESCE(sum(valor), 0)::int FROM public.ops_sequencia) AS seq,
           (SELECT count(*)::int FROM public.ops_evento) AS eventos`);
  const antes = await estado();
  const p = await devePassar("a gestora abre o passo 2: os serviços do contrato, com tudo sugerido", AUTH.gestorA,
    previsao(ORG_A, `, p_data_inicio => '2027-02-01'`));
  const depois = await estado();
  JSON.stringify(antes) === JSON.stringify(depois)
    ? ok("a pré-visualização não grava nada: nem obra, nem código OB-, nem modelo, nem especialidade, nem evento")
    : mau(`a pré-visualização deixou rasto: ${JSON.stringify(antes)} → ${JSON.stringify(depois)}`);

  const rem = p?.servicos?.find((s) => s.servico_id === S_REM);
  const tom = p?.servicos?.find((s) => s.servico_id === S_TOM);
  p?.servicos?.length === 2 && rem?.com_modelo && !rem.sugerido && rem.tarefas.length === 3 && rem.quantidade == 10
    ? ok("2 serviços (o produto fica de fora); a remoção vem do seu modelo: 3 passos, qt 10")
    : mau(`serviços: ${JSON.stringify(p?.servicos?.map((s) => [s.nome, s.sugerido, s.com_modelo, s.tarefas.length]))}`);
  tom?.sugerido && !tom.com_modelo && tom.tarefas.length === 5 &&
  tom.tarefas.every((t) => t.servico_tarefa_id === null && t.skill_id === null && t.skill_nome === "Eletricidade")
    ? ok("as tomadas, SEM modelo, vêm sugeridas pela biblioteca (5 passos de eletricidade) sem o gravar")
    : mau(`tomadas: ${JSON.stringify(tom)}`);
  const cabos = tom?.tarefas.find((t) => t.nome.endsWith("Passar cabos e ligar"));
  const tracado = tom?.tarefas.find((t) => t.nome.endsWith("Marcar traçado"));
  const rocos = tom?.tarefas.find((t) => t.nome.endsWith("Abrir roços e caixas"));
  cabos?.minutos === 90 && cabos?.fase === 2
    ? ok("tempo × quantidade: 0,5 h × 1 pessoa da ficha → 15 min/un no passo principal × 6 = 90 min")
    : mau(`cabos: ${JSON.stringify(cabos)}`);
  rocos?.depende?.includes(tracado?.id)
    ? ok("o 'depois de' dentro do serviço vem na sugestão (abrir roços depois de marcar o traçado)")
    : mau(`depende: ${JSON.stringify({ rocos, tracado })}`);
  [...rem.tarefas, ...tom.tarefas].every((t) => t.pessoas.length >= 1 && t.inicio >= "2027-02-01" && Array.isArray(t.livres))
    ? ok("cada tarefa traz datas, as pessoas sugeridas (distribuição automática) e quem está livre")
    : mau(`pessoas/datas: ${JSON.stringify([...rem.tarefas, ...tom.tarefas].map((t) => [t.nome, t.pessoas, t.inicio]))}`);
  JSON.stringify(tom?.materiais_ficha?.map((m) => [m.produto_id, m.nome, Number(m.quantidade)])) ===
    JSON.stringify([[P_TOM, "Tomada schuko", 6]]) &&
  p?.produtos?.length === 1 && p.produtos[0].produto_id === P_LOUCA && p.produtos[0].nome === "Sanita suspensa"
    ? ok("materiais: os da ficha técnica × qt (6 tomadas) e os produtos vendidos no contrato (a sanita)")
    : mau(`materiais: ${JSON.stringify({ ficha: tom?.materiais_ficha, produtos: p?.produtos })}`);

  // O que o gestor faz no passo 2: tira "Fechar roços", muda minutos, escolhe
  // a pessoa de uma tarefa, liga um material, acrescenta uma tarefa.
  const escolhidas = [...rem.tarefas, ...tom.tarefas].filter((t) => !t.nome.endsWith("Fechar roços"));
  const pos = new Map(escolhidas.map((t, i) => [t.id, i + 1]));
  const enviar = escolhidas.map((t) => ({
    nome: t.nome,
    fase: t.fase,
    minutos: t === cabos ? 120 : t.minutos,
    pessoas_previstas: t.pessoas_previstas,
    pessoas: t === cabos ? [U.tec2A] : [],
    skill_id: t.skill_id,
    skill_nome: t.skill_nome,
    orcamento_linha_id: t.linha_id,
    servico_id: t.servico_id,
    servico_tarefa_id: t.servico_tarefa_id,
    depende: t.depende.filter((d) => pos.has(d)).map((d) => pos.get(d)),
    procedimento: t.procedimento,
    materiais: t.materiais,
    ferramentas: t.ferramentas,
    materiais_crm: t === cabos ? tom.materiais_ficha : [],
  }));
  const ensaio = escolhidas.findIndex((t) => t.nome.endsWith("Ensaio e verificação")) + 1;
  enviar.push({ nome: "Tomadas: testar com o cliente", fase: 4, minutos: 20, pessoas: [U.tecA],
                orcamento_linha_id: tom.linha_id, servico_id: S_TOM, depende: [ensaio] });

  const criarCom = (lista) => criar(`p_org => '${ORG_A}', p_contrato_id => '${CTR_S}', p_data_inicio => '2027-02-01',
                                     p_tarefas => '${js(lista)}'::jsonb`);
  const com = (i, mudar) => enviar.map((t, k) => (k === i ? { ...t, ...mudar } : t));
  await deveSerRecusado("uma pessoa de OUTRA organização numa tarefa é recusada", AUTH.gestorA,
    criarCom(com(0, { pessoas: [U.gestorB] })), "não está ativa");
  await deveSerRecusado("uma fase fora de 1..9 é recusada", AUTH.gestorA, criarCom(com(0, { fase: 10 })), "fase tem de ser de 1 a 9");
  await deveSerRecusado("minutos a 0 são recusados", AUTH.gestorA, criarCom(com(0, { minutos: 0 })), "minutos previstos");
  await deveSerRecusado("dependências em ciclo são recusadas", AUTH.gestorA,
    criarCom(com(0, { depende: [2] }).map((t, k) => (k === 1 ? { ...t, depende: [1] } : t))), "ciclo");
  const linhaAlheia = (await um(`SELECT id FROM public.quote_lines WHERE quote_id='${ORC_A}' LIMIT 1`)).id;
  await deveSerRecusado("uma linha de outro orçamento é recusada", AUTH.gestorA,
    criarCom(com(0, { orcamento_linha_id: linhaAlheia })), "não é do orçamento");
  JSON.stringify(await estado()) === JSON.stringify(antes)
    ? ok("as recusas não deixam meia obra")
    : mau("uma recusa deixou rasto");

  const rp = await devePassar("'Recalcular' no passo 2: a pré-visualização com as tarefas editadas", AUTH.gestorA,
    previsao(ORG_A, `, p_data_inicio => '2027-02-01', p_tarefas => '${js(enviar)}'::jsonb`));
  const tom2 = rp?.servicos?.find((s) => s.servico_id === S_TOM);
  tom2?.tarefas.length === 5 && tom2.tarefas.find((t) => t.nome.endsWith("Passar cabos e ligar"))?.pessoas.join() === U.tec2A
    ? ok("recalculado: 4 passos + o acrescentado, e a pessoa escolhida mantém-se")
    : mau(`recalcular: ${JSON.stringify(tom2?.tarefas.map((t) => [t.nome, t.pessoas]))}`);

  const OS = await devePassar("'Abrir obra' grava tudo de uma vez (p_tarefas)", AUTH.gestorA, criarCom(enviar));
  const ts = await q(`
    SELECT t.nome, f.ordem AS fase, t.minutos_previstos AS min, t.pessoas_previstas AS k, t.materiais_crm,
           t.servico_tarefa_id, k.nome AS skill, t.inicio_planeado::text AS ini, t.fim_planeado::text AS fim,
           (SELECT array_agg(tp.utilizador_id::text) FROM public.ops_obra_tarefa_pessoa tp WHERE tp.tarefa_id = t.id) AS quem,
           (SELECT array_agg(d.nome) FROM public.ops_obra_tarefa_dependencia x JOIN public.ops_obra_tarefa d ON d.id = x.depende_de_id
             WHERE x.tarefa_id = t.id) AS deps
      FROM public.ops_obra_tarefa t JOIN public.ops_obra_fase f ON f.id = t.fase_id
      LEFT JOIN public.ops_skill k ON k.id = t.skill_id
     WHERE t.obra_id = '${OS?.id}' ORDER BY t.ordem`);
  const tn = (n) => ts.find((x) => x.nome.endsWith(n));
  ts.length === enviar.length && JSON.stringify(ts.map((x) => x.nome)) === JSON.stringify(enviar.map((x) => x.nome))
    ? ok(`a obra nasce com EXATAMENTE as ${enviar.length} tarefas do passo 2 (sem 'Fechar roços', com a acrescentada)`)
    : mau(`tarefas: ${JSON.stringify(ts.map((x) => x.nome))}`);
  tn("Passar cabos e ligar")?.min === 120 && tn("Passar cabos e ligar")?.quem?.join() === U.tec2A &&
  tn("Passar cabos e ligar")?.materiais_crm?.[0]?.nome === "Tomada schuko" && Number(tn("Passar cabos e ligar")?.materiais_crm?.[0]?.quantidade) === 6
    ? ok("os minutos editados, a pessoa escolhida e o material ligado (Tomada schuko × 6) ficaram")
    : mau(`cabos: ${JSON.stringify(tn("Passar cabos e ligar"))}`);
  const teste = tn("testar com o cliente");
  const ens = tn("Ensaio e verificação");
  teste?.quem?.join() === U.tecA && teste?.deps?.join() === ens?.nome && teste.ini >= ens.fim && teste.fase === 4
    ? ok("a tarefa acrescentada: fase 4, a pessoa escolhida, depois do ensaio")
    : mau(`acrescentada: ${JSON.stringify({ teste, ens })}`);
  ts.every((x) => x.quem?.length >= 1)
    ? ok("as tarefas sem pessoa escolhida foram distribuídas automaticamente")
    : mau(`sem pessoas: ${JSON.stringify(ts.filter((x) => !x.quem?.length).map((x) => x.nome))}`);
  ts.filter((x) => x.nome.startsWith("Instalação de tomadas")).every((x) => x.skill === "Eletricidade" && x.servico_tarefa_id === null) &&
  (await um(`SELECT count(*)::int AS n FROM public.ops_obra_servico_tarefa WHERE servico_id='${S_TOM}'`)).n === 0
    ? ok("a especialidade 'Eletricidade' foi criada ao abrir; o modelo das tomadas continua por gravar")
    : mau(`skill/modelo: ${JSON.stringify(ts.map((x) => [x.nome, x.skill, x.servico_tarefa_id]))}`);
  ts.some((x) => x.ini === "2027-02-01")
    ? ok("as datas continuam automáticas, a partir do início pedido")
    : mau(`datas: ${JSON.stringify(ts.map((x) => [x.nome, x.ini]))}`);

  // Stock: só leitura do inventário do CRM (stocks/warehouses + reservas FIFO).
  const P_B = "5f000000-0000-0000-0000-000000000009";
  await db.exec(`
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS organization_id uuid, ADD COLUMN IF NOT EXISTS sku text;
    UPDATE public.products SET organization_id = '${ORG_A}';
    UPDATE public.products SET sku = 'TOM-1' WHERE id = '${P_TOM}';
    INSERT INTO public.products (id, name, organization_id) VALUES ('${P_B}', 'Tomada da B', '${ORG_B}');
    CREATE TABLE public.warehouses (id uuid PRIMARY KEY, organization_id uuid, name text,
                                    is_active boolean NOT NULL DEFAULT true, deleted_at timestamptz);
    CREATE TABLE public.stocks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid, warehouse_id uuid,
                                organization_id uuid, quantity integer NOT NULL DEFAULT 0, deleted_at timestamptz);
    INSERT INTO public.warehouses VALUES
      ('a1000000-0000-0000-0000-000000000001','${ORG_A}','Armazém A',true,NULL),
      ('a1000000-0000-0000-0000-000000000002','${ORG_A}','Armazém fechado',false,NULL),
      ('a1000000-0000-0000-0000-000000000003','${ORG_B}','Armazém B',true,NULL);
    INSERT INTO public.stocks (product_id, warehouse_id, organization_id, quantity) VALUES
      ('${P_TOM}','a1000000-0000-0000-0000-000000000001','${ORG_A}',4),
      ('${P_TOM}','a1000000-0000-0000-0000-000000000002','${ORG_A}',10),
      ('${P_TOM}','a1000000-0000-0000-0000-000000000003','${ORG_B}',50),
      ('${P_B}','a1000000-0000-0000-0000-000000000003','${ORG_B}',7);
    -- As reservas das encomendas de cliente (no CRM é uma função derivada).
    CREATE FUNCTION public.fn_client_order_line_reservations(p_organization_id uuid, p_product_ids uuid[] DEFAULT NULL)
      RETURNS TABLE (product_id uuid, qty_reserved numeric) LANGUAGE sql STABLE AS $fn$
      SELECT '${P_TOM}'::uuid, 1::numeric WHERE p_organization_id = '${ORG_A}' $fn$;
    GRANT SELECT ON public.stocks, public.warehouses, public.products TO authenticated;`);
  const stock = (quem, org, args) => chamar(quem, `SELECT public.rpc_ops_obra_stock('${org}', ${args});`);
  await deveSerRecusado("o técnico não vê o stock pela obra", AUTH.tecA,
    `SELECT public.rpc_ops_obra_stock('${ORG_A}', ARRAY['${P_TOM}']::uuid[]);`, "Só quem planeia");
  await deveSerRecusado("o gestor da B não vê o stock da A", AUTH.gestorB,
    `SELECT public.rpc_ops_obra_stock('${ORG_A}', ARRAY['${P_TOM}']::uuid[]);`, "Sem acesso a esta organização");
  const s1 = await stock(AUTH.gestorA, ORG_A, `ARRAY['${P_TOM}','${P_B}']::uuid[]`);
  const tomS = s1?.produtos?.find((x) => x.produto_id === P_TOM);
  s1?.com_inventario && tomS?.stock == 4 && tomS?.reservado == 1 && tomS?.disponivel == 3 && s1.produtos.length === 1
    ? ok("stock das tomadas: 4 no armazém ativo (o fechado e o da B não contam), 1 reservada → 3 disponíveis")
    : mau(`stock: ${JSON.stringify(s1)}`);
  const s2 = await stock(AUTH.gestorA, ORG_A, `p_pesquisa => 'tomada'`);
  s2?.produtos?.length === 1 && s2.produtos[0].produto_id === P_TOM && s2.produtos[0].sku === "TOM-1"
    ? ok("o seletor pesquisa nos produtos da organização (a 'Tomada da B' não aparece)")
    : mau(`pesquisa: ${JSON.stringify(s2)}`);
  JSON.stringify(await estado()) !== "" && (await um(`SELECT sum(quantity)::int AS n FROM public.stocks`)).n === 71
    ? ok("ler o stock não mexe no stock (nem reserva)")
    : mau("o stock mudou");

  await db.exec(`
    DROP FUNCTION public.fn_client_order_line_reservations(uuid, uuid[]);
    DROP TABLE public.stocks; DROP TABLE public.warehouses;
    DELETE FROM public.products WHERE id = '${P_B}';
    DELETE FROM public.ops_obra WHERE id = '${OS?.id}';
    DELETE FROM public.client_contracts WHERE id = '${CTR_S}';
    DELETE FROM public.quote_lines WHERE quote_id = '${ORC_S}';
    DELETE FROM public.quotes WHERE id = '${ORC_S}';
    DELETE FROM public.ops_utilizador_skill;`);
}

/* ── Quem está livre ────────────────────────────────────────────────────── */
console.log("\n─── pessoas livres (agenda cheia fica de fora) ─");
{
  const OL = await chamar(AUTH.gestorA,
    criar(`p_org => '${ORG_A}', p_titulo => 'Agenda', p_cliente_id => '${CLI_A}', p_data_inicio => '2027-03-01'`));
  const fase = (await um(`SELECT id FROM public.ops_obra_fase WHERE obra_id='${OL.id}' AND ordem=1`)).id;
  const cheio = await chamar(AUTH.gestorA,
    `SELECT public.rpc_ops_obra_gravar_tarefa('${OL.id}', NULL, '${fase}', 'Dia cheio', 600,
       p_inicio => '2027-03-01', p_fim => '2027-03-01');`);
  await chamar(AUTH.gestorA, `SELECT public.rpc_ops_obra_atribuir_tarefa('${cheio.id}', ARRAY['${U.tecA}']::uuid[]);`);
  await db.exec(`
    INSERT INTO public.ops_ordem (organization_id, codigo, origem, cliente_id, titulo, responsavel_id, agendada_para)
    VALUES ('${ORG_A}', 'OT-TESTE-LIVRE', 'corretiva', '${CLI_A}', 'Portão', '${U.tec2A}', '2027-03-02 10:00:00+00');`);

  const livres = (quem, args) => linhas(quem, `SELECT * FROM public.rpc_ops_pessoas_livres(${args});`);
  await deveSerRecusado("o técnico não vê a agenda da equipa", AUTH.tecA,
    `SELECT * FROM public.rpc_ops_pessoas_livres('${ORG_A}', '2027-03-01');`, "Só quem planeia");
  await deveSerRecusado("o gestor da B não vê a agenda da A", AUTH.gestorB,
    `SELECT * FROM public.rpc_ops_pessoas_livres('${ORG_A}', '2027-03-01');`, "Sem acesso a esta organização");
  await deveSerRecusado("o gestor da B não exclui uma tarefa da A pela B", AUTH.gestorB,
    `SELECT * FROM public.rpc_ops_pessoas_livres('${ORG_B}', '2027-03-01', NULL, '${cheio.id}');`, "não encontrada");

  const l1 = await livres(AUTH.gestorA, `'${ORG_A}', '2027-03-01'`);
  const p = (l, u) => l.find((x) => x.utilizador_id === u);
  p(l1, U.tecA)?.livre === false && p(l1, U.tecA)?.dias_cheios === 1 && p(l1, U.tecA)?.minutos_ocupados === 600 &&
  p(l1, U.tec2A)?.livre === true && l1.every((x) => x.utilizador_id !== U.gestorB)
    ? ok("com 10 h planeadas nesse dia, o técnico fica de fora; o outro está livre; ninguém da B aparece")
    : mau(`livres 01/03: ${JSON.stringify(l1)}`);
  const l2 = await livres(AUTH.gestorA, `'${ORG_A}', '2027-03-01', NULL, '${cheio.id}'`);
  p(l2, U.tecA)?.livre === true
    ? ok("excluindo a própria tarefa (a que se está a atribuir), volta a estar livre")
    : mau(`excluir: ${JSON.stringify(p(l2, U.tecA))}`);
  const l3 = await livres(AUTH.gestorA, `'${ORG_A}', '2027-03-01', '2027-03-02'`);
  p(l3, U.tec2A)?.livre === false && p(l3, U.tec2A)?.ordens === 1
    ? ok("uma ordem de trabalho agendada nesse dia também ocupa")
    : mau(`ordem: ${JSON.stringify(p(l3, U.tec2A))}`);
  const l4 = await livres(AUTH.gestorA, `'${ORG_A}', '2027-03-03'`);
  p(l4, U.tecA)?.livre && p(l4, U.tec2A)?.livre
    ? ok("no dia seguinte estão os dois livres")
    : mau(`03/03: ${JSON.stringify(l4)}`);

  // A distribuição automática usa a mesma regra: a ordem afasta o tec2A.
  const outra = await chamar(AUTH.gestorA,
    `SELECT public.rpc_ops_obra_gravar_tarefa('${OL.id}', NULL, '${fase}', 'No dia da ordem', 120,
       p_inicio => '2027-03-02', p_fim => '2027-03-02');`);
  await chamar(AUTH.gestorA, `SELECT public.rpc_ops_obra_distribuir('${OL.id}');`);
  const quem = await um(`SELECT array_agg(utilizador_id::text) AS q FROM public.ops_obra_tarefa_pessoa WHERE tarefa_id='${outra.id}'`);
  quem.q?.join() === U.tecA
    ? ok("a distribuição automática não põe ninguém num dia em que tem uma ordem agendada")
    : mau(`distribuição com ordem: ${JSON.stringify(quem)}`);

  p(l1, U.tecA)?.motivo?.startsWith("agenda cheia: OB-") && p(l3, U.tec2A)?.motivo === "ordem OT-TESTE-LIVRE" &&
  p(l1, U.tec2A)?.motivo === null
    ? ok(`o motivo vem escrito: "${p(l1, U.tecA)?.motivo}", "${p(l3, U.tec2A)?.motivo}"`)
    : mau(`motivos: ${JSON.stringify([p(l1, U.tecA), p(l3, U.tec2A)])}`);

  // Ausências e feriados da agenda do Olyvia e do RH (as pessoas são as
  // mesmas — anew_users). Stubs só com as colunas que obras.sql lê.
  await db.exec(`
    CREATE TABLE public.schedule_resources (id uuid PRIMARY KEY, name text, user_id uuid, organization_id uuid);
    CREATE TABLE public.resource_time_off (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resource_id uuid NOT NULL,
      title text NOT NULL, reason text, start_date date NOT NULL, end_date date NOT NULL, approved boolean DEFAULT false);
    CREATE TABLE public.schedule_holidays (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), country_code varchar(2) NOT NULL,
      organization_id uuid, name varchar(255) NOT NULL, holiday_date date NOT NULL, is_recurring boolean NOT NULL DEFAULT false);
    CREATE TABLE public.pessoas_contas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pessoa_id uuid NOT NULL,
      organization_id uuid NOT NULL, anew_user_id uuid NOT NULL, estado text NOT NULL DEFAULT 'activa');
    CREATE TABLE public.hr_ausencias_tipos (id uuid PRIMARY KEY, organization_id uuid NOT NULL, nome text NOT NULL);
    CREATE TABLE public.pessoas_ausencias_dias (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pessoa_id uuid NOT NULL,
      organization_id uuid NOT NULL, tipo_id uuid NOT NULL, data date NOT NULL, estado text NOT NULL);
    INSERT INTO public.schedule_resources VALUES
      ('c1000000-0000-0000-0000-000000000001','Tecnico A','${U.tecA}','${ORG_A}'),
      ('c1000000-0000-0000-0000-000000000002','Sub A','${U.tec2A}','${ORG_A}');
    INSERT INTO public.resource_time_off (resource_id, title, start_date, end_date, approved) VALUES
      ('c1000000-0000-0000-0000-000000000001','Férias','2027-03-03','2027-03-03',true),
      ('c1000000-0000-0000-0000-000000000002','Dentista','2027-03-03','2027-03-03',false);
    INSERT INTO public.schedule_holidays (country_code, organization_id, name, holiday_date) VALUES
      ('PT','${ORG_A}','Feriado municipal','2027-03-04'),
      ('PT','${ORG_B}','Só da B','2027-03-08');
    INSERT INTO public.hr_ausencias_tipos VALUES ('c2000000-0000-0000-0000-000000000001','${ORG_A}','Baixa médica');
    INSERT INTO public.pessoas_contas (pessoa_id, organization_id, anew_user_id) VALUES
      ('c3000000-0000-0000-0000-000000000001','${ORG_A}','${U.tec2A}'),
      ('c3000000-0000-0000-0000-000000000002','${ORG_A}','${U.tecA}');
    INSERT INTO public.pessoas_ausencias_dias (pessoa_id, organization_id, tipo_id, data, estado) VALUES
      ('c3000000-0000-0000-0000-000000000001','${ORG_A}','c2000000-0000-0000-0000-000000000001','2027-03-05','aprovado'),
      ('c3000000-0000-0000-0000-000000000002','${ORG_A}','c2000000-0000-0000-0000-000000000001','2027-03-05','pendente');`);
  const f3 = await livres(AUTH.gestorA, `'${ORG_A}', '2027-03-03'`);
  p(f3, U.tecA)?.livre === false && p(f3, U.tecA)?.motivo === "ausência: Férias" && p(f3, U.tec2A)?.livre === true
    ? ok("férias aprovadas na agenda (resource_time_off) → indisponível: férias; um pedido por aprovar não conta")
    : mau(`férias: ${JSON.stringify(f3)}`);
  const f4 = await livres(AUTH.gestorA, `'${ORG_A}', '2027-03-04'`);
  f4.every((x) => !x.livre && x.motivo === "feriado: Feriado municipal")
    ? ok("feriado da organização (schedule_holidays) → ninguém está livre nesse dia")
    : mau(`feriado: ${JSON.stringify(f4)}`);
  const f5 = await livres(AUTH.gestorA, `'${ORG_A}', '2027-03-05'`);
  p(f5, U.tec2A)?.livre === false && p(f5, U.tec2A)?.motivo === "ausência: Baixa médica" && p(f5, U.tecA)?.livre === true
    ? ok("dia de ausência aprovado no RH (pessoas_ausencias_dias + pessoas_contas) → indisponível; o pendente não conta")
    : mau(`RH: ${JSON.stringify(f5)}`);
  const f8 = await livres(AUTH.gestorA, `'${ORG_A}', '2027-03-08'`);
  f8.every((x) => x.livre)
    ? ok("o feriado de OUTRA organização não conta")
    : mau(`feriado alheio: ${JSON.stringify(f8)}`);
  const ferias = await chamar(AUTH.gestorA,
    `SELECT public.rpc_ops_obra_gravar_tarefa('${OL.id}', NULL, '${fase}', 'No dia das férias', 120,
       p_inicio => '2027-03-03', p_fim => '2027-03-03');`);
  await chamar(AUTH.gestorA, `SELECT public.rpc_ops_obra_distribuir('${OL.id}');`);
  const qf = await um(`SELECT array_agg(utilizador_id::text) AS q FROM public.ops_obra_tarefa_pessoa WHERE tarefa_id='${ferias.id}'`);
  qf.q?.join() === U.tec2A
    ? ok("a distribuição automática não põe ninguém de férias")
    : mau(`distribuição com férias: ${JSON.stringify(qf)}`);

  await db.exec(`
    DROP TABLE public.schedule_resources, public.resource_time_off, public.schedule_holidays,
               public.pessoas_contas, public.hr_ausencias_tipos, public.pessoas_ausencias_dias;
    DELETE FROM public.ops_obra WHERE id = '${OL.id}';
    DELETE FROM public.ops_ordem WHERE codigo = 'OT-TESTE-LIVRE';`);
}

/* ── Data de início automática ──────────────────────────────────────────── */
console.log("\n─── data de início automática ───────────");
{
  const MOD_WC = (await um(`SELECT id FROM public.ops_obra_modelo WHERE organization_id='${ORG_A}' AND nome='Remodelação casa de banho'`)).id;
  const X1 = await devePassar("obra sem data: a primeira com a equipa livre", AUTH.gestorA,
    criar(`p_org => '${ORG_A}', p_titulo => 'Auto 1', p_cliente_id => '${CLI_A}', p_modelo_id => '${MOD_WC}'`));
  const X2 = await devePassar("outra igual, com a mesma equipa", AUTH.gestorA,
    criar(`p_org => '${ORG_A}', p_titulo => 'Auto 2', p_cliente_id => '${CLI_A}', p_modelo_id => '${MOD_WC}'`));
  const amanha = (await um(`SELECT public.ops_obra_somar_dias_uteis(current_date + 1, 0)::text AS d`)).d;
  const choques = async (id) =>
    (await um(`SELECT count(*)::int AS n FROM public.ops_obra_tarefa t
                WHERE t.obra_id='${id}' AND public.ops_obra_conflitos_impl(t.id) <> '[]'::jsonb`)).n;
  const fim1 = (await um(`SELECT max(fim_planeado)::text AS f FROM public.ops_obra_tarefa WHERE obra_id='${X1?.id}'`)).f;
  X1?.inicio === amanha ? ok(`a 1.ª começa no próximo dia útil (${amanha})`) : mau(`início 1: ${X1?.inicio} (esperado ${amanha})`);
  X2?.inicio > X1?.inicio && (await choques(X2?.id)) === 0
    ? ok(`a 2.ª passa para ${X2.inicio} (a 1.ª acaba a ${fim1}) e não choca com ninguém`)
    : mau(`início 2: ${X2?.inicio}, choques ${await choques(X2?.id)}`);
  const r = await devePassar("'Replanear' sem data volta a procurar a primeira data livre", AUTH.gestorA,
    `SELECT public.rpc_ops_obra_replanear('${X2?.id}', NULL);`);
  r?.inicio === X2?.inicio ? ok("e dá a mesma data (nada mudou entretanto)") : mau(`replanear auto: ${JSON.stringify(r)}`);
  await db.exec(`DELETE FROM public.ops_obra WHERE id IN ('${X1?.id}','${X2?.id}');`);
}

/* ── Contrato ligado ao orçamento só pela proposta (como no CRM) ───────── */
console.log("\n─── contrato → orçamento pelos caminhos do CRM ───");
{
  const PROP = "77770000-0000-0000-0000-000000000001";
  const CTR_PROP = "88880000-0000-0000-0000-000000000009";
  const ORC_PROP = "99990000-0000-0000-0000-000000000009";
  await db.exec(`
    ALTER TABLE public.client_contracts ADD COLUMN IF NOT EXISTS proposal_id uuid;
    CREATE TABLE IF NOT EXISTS public.proposal_quote_selections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid, quote_id uuid, selected boolean);
    GRANT SELECT ON public.proposal_quote_selections TO authenticated;
    -- Um orçamento próprio (o do outro contrato já tem obra), com as mesmas linhas.
    INSERT INTO public.quotes (id, organization_id, cliente_id, quote_number, title, obra_endereco, estado, accepted_at, total)
      VALUES ('${ORC_PROP}','${ORG_A}','${CLI_A}','ORC-A-PROP','WC pela proposta','Rua da Proposta 1, Lisboa','aceite',now(),2500);
    INSERT INTO public.quote_lines (quote_id, ordem, descricao_snapshot, qt, service_id)
      SELECT '${ORC_PROP}', ordem, descricao_snapshot, qt, service_id
        FROM public.quote_lines WHERE quote_id = '${ORC_CONTRATO}';
    INSERT INTO public.proposal_quote_selections (proposal_id, quote_id, selected)
      VALUES ('${PROP}','${ORC_PROP}', true);
    INSERT INTO public.client_contracts (id, contract_number, client_id, status, organization_id,
                                         quote_id, proposal_id, signature_date, created_by)
      VALUES ('${CTR_PROP}','CT-A-PROP','${CLI_A}','signed','${ORG_A}',NULL,'${PROP}',now(),'${U.gestorA}');
    -- Recria a vista agora que há proposal_id (como em produção).
    ${ler("obras.sql").match(/DO \$contratos\$[\s\S]*?\$contratos\$;/)[0]}
  `);
  const v = (await linhas(AUTH.gestorA,
    `SELECT orcamento_id::text AS o, n_servicos AS s, n_produtos AS p FROM public.ops_v_contrato WHERE id = '${CTR_PROP}';`))[0];
  v?.o === ORC_PROP
    ? ok("o contrato sem quote_id chega ao orçamento pela seleção da proposta")
    : mau(`orçamento do contrato pela proposta: ${JSON.stringify(v)}`);
  v?.s === 3 ? ok("e mostra os 3 serviços para destacar na Nova obra") : mau(`n_servicos: ${v?.s}`);
  const ass = (await linhas(AUTH.gestorA,
    `SELECT n_servicos AS s FROM public.ops_v_contrato WHERE id = '${CTR_ASSINADO}';`))[0];
  ass?.s === 3 ? ok("o contrato com quote_id continua igual (3 serviços)") : mau(`contrato normal: ${JSON.stringify(ass)}`);
  const prev = await devePassar("a previsão da Nova obra lê os serviços do contrato da proposta", AUTH.gestorA,
    `SELECT public.rpc_ops_obra_previsao_contrato(p_org => '${ORG_A}', p_contrato_id => '${CTR_PROP}')::text;`);
  (prev?.servicos?.length ?? 0) === 3
    ? ok("e devolve os 3 serviços com tarefas")
    : mau(`serviços na previsão: ${prev?.servicos?.length}`);
  await db.exec(`DELETE FROM public.client_contracts WHERE id = '${CTR_PROP}';
                 DELETE FROM public.quote_lines WHERE quote_id = '${ORC_PROP}';
                 DELETE FROM public.quotes WHERE id = '${ORC_PROP}';`);
}

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
  // A vista não é security_invoker (por desempenho): filtra ela própria.
  const vb = await linhas(AUTH.gestorB, `SELECT count(*)::int AS n FROM public.ops_v_obra_conflito;`);
  vb.at(-1).n === 0 ? ok("o gestor da B não vê os choques da A") : mau(`fuga na vista de choques: ${vb.at(-1).n}`);
  const vt = await linhas(AUTH.tec2A, `SELECT count(*)::int AS n FROM public.ops_v_obra_conflito WHERE obra_id='${OB3.id}';`);
  vt.at(-1).n === 0 ? ok("nem um técnico que não está nessa obra") : mau(`técnico vê choques alheios: ${vt.at(-1).n}`);
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
