/**
 * Prova a Capacidade (db/capacidade.sql) contra um Postgres limpo (PGlite),
 * sem tocar no Supabase. Um cenário com números conhecidos ("hoje" fixo,
 * quarta 4/11/2026; semana 0 = 2–6/11):
 *
 *   · oferta: dias úteis × 480 ÷ n.º de especialidades da pessoa, menos as
 *     ausências aprovadas (resource_time_off) e os feriados;
 *   · procura das obras: as tarefas por fazer espalhadas pelos dias
 *     planeados; o que devia ter acabado cai em "hoje" (atrasado);
 *   · do comercial: contrato assinado sem obra (100 %), orçamento aceite
 *     sem contrato (90 %), orçamento enviado (× probabilidade da proposta),
 *     expandidos pelo motor das obras e com as fases pela ordem;
 *   · ficam de fora: propostas rejeitadas, orçamentos antigos, a versão
 *     anterior do mesmo orçamento, contratos que já têm obra;
 *   · "faltam N pessoas" quando a procura passa a oferta;
 *   · só o gestor/admin; a cache serve o 2.º pedido; corre duas vezes.
 *
 *     npm run validar-capacidade
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
const verifica = (cond, bom, mal) => (cond ? ok(bom) : mau(mal));

const ORG = "11111111-1111-1111-1111-111111111111";
const ORG_B = "11111111-2222-2222-2222-222222222222";
const CLI = "22222222-2222-2222-2222-222222222222";
const U = {
  gestor: "a0000000-0000-0000-0000-00000000000a",
  sup: "a0000000-0000-0000-0000-00000000000b",
  tec: "a0000000-0000-0000-0000-00000000000c",
  tec2: "a0000000-0000-0000-0000-00000000000d",
};
const AUTH = Object.fromEntries(Object.entries(U).map(([k, v]) => [k, v.replace(/^a/, "e")]));
const K = { can: "c1000000-0000-0000-0000-000000000001", pin: "c1000000-0000-0000-0000-000000000002" };
const S = { can: "5e000000-0000-0000-0000-000000000001", pin: "5e000000-0000-0000-0000-000000000002" };
const QT = {
  contrato: "99990000-0000-0000-0000-000000000001",
  aceite: "99990000-0000-0000-0000-000000000002",
  enviado: "99990000-0000-0000-0000-000000000003",
  enviadoVelho: "99990000-0000-0000-0000-000000000004",
  rejeitada: "99990000-0000-0000-0000-000000000005",
  antigo: "99990000-0000-0000-0000-000000000006",
  comObra: "99990000-0000-0000-0000-000000000007",
};
const P = { boa: "7a000000-0000-0000-0000-000000000001", ma: "7a000000-0000-0000-0000-000000000002" };
const D = "7d000000-0000-0000-0000-000000000001";
const CT = { semObra: "88880000-0000-0000-0000-000000000001", comObra: "88880000-0000-0000-0000-000000000002" };
const OB = { a: "0b000000-0000-0000-0000-000000000001", b: "0b000000-0000-0000-0000-000000000002" };
const HOJE = "2026-11-04";

/* ── Um CRM como o real ─────────────────────────────────────────────────── */
await db.exec(STUBS_CRM);
await db.exec(`
  CREATE TABLE public.client_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contract_number text, client_id uuid,
    status text NOT NULL DEFAULT 'draft', total_value numeric DEFAULT 0, currency text DEFAULT 'EUR',
    organization_id uuid NOT NULL, quote_id uuid, proposal_id uuid, start_date date, notes text,
    signature_date timestamptz, company_signature_date timestamptz, accepted_at timestamptz,
    created_by uuid NOT NULL, deleted_at timestamptz);
  CREATE TABLE public.auth_to_business_user_map (auth_user_id uuid, business_user_id uuid);
  CREATE OR REPLACE FUNCTION public.current_business_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT m.business_user_id FROM public.auth_to_business_user_map m WHERE m.auth_user_id = auth.uid() LIMIT 1 $fn$;
  CREATE OR REPLACE FUNCTION public.has_anew_permission(_auth_uid uuid, _permission_code text)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT EXISTS (SELECT 1 FROM public.anew_users au
        JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
        JOIN public.anew_role_permissions arp ON arp.role_id = am.role_id AND arp.permission_code = _permission_code
       WHERE au.auth_user_id = _auth_uid) $fn$;
  CREATE OR REPLACE FUNCTION public.get_user_visible_org_ids(_auth_uid uuid)
    RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT am.organization_id FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE au.auth_user_id = _auth_uid AND am.status = 'active' $fn$;

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}','Org'), ('${ORG_B}','Org B');
  INSERT INTO public.anew_entities (id, display_name) VALUES ('77777777-7777-7777-7777-777777777777','Cliente');
  INSERT INTO public.anew_clients (id, organization_id, entity_id) VALUES ('${CLI}','${ORG}','77777777-7777-7777-7777-777777777777');
  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${U.gestor}','${AUTH.gestor}','Gestora','g@x.pt'), ('${U.sup}','${AUTH.sup}','Supervisor','s@x.pt'),
    ('${U.tec}','${AUTH.tec}','Técnico','t@x.pt'), ('${U.tec2}','${AUTH.tec2}','Técnico 2','t2@x.pt');
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id)
    SELECT auth_user_id, id FROM public.anew_users;

  -- O comercial: serviços, propostas, negócios, agenda (ausências), feriados.
  ALTER TABLE public.quote_lines ADD COLUMN service_id uuid, ADD COLUMN section_name text,
                                 ADD COLUMN source_deal_need_id uuid;
  ALTER TABLE public.quotes ADD COLUMN site_address_id uuid, ADD COLUMN proposal_id uuid,
                            ADD COLUMN deal_id uuid, ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  CREATE TABLE public.service_categories (id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE public.services (
    id uuid PRIMARY KEY, name text NOT NULL, service_category_id uuid,
    technical_sheet_labor_description text, technical_sheet_labor_hours numeric,
    technical_sheet_labor_people_count numeric, organization_id uuid, sku text,
    is_deleted boolean NOT NULL DEFAULT false, deleted_at timestamptz);
  CREATE TABLE public.service_organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_id uuid, organization_id uuid);
  ALTER TABLE public.products ADD COLUMN name text;
  CREATE TABLE public.service_materials (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_id uuid NOT NULL,
    product_id uuid NOT NULL, quantity numeric NOT NULL, sort_order integer, deleted_at timestamptz);
  CREATE TABLE public.proposals (id uuid PRIMARY KEY, status text, probability integer, organization_id uuid);
  CREATE TABLE public.deals (id uuid PRIMARY KEY, probability integer, expected_close_date date,
                             organization_id uuid, deleted_at timestamptz);
  CREATE TABLE public.schedule_resources (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, organization_id uuid);
  CREATE TABLE public.resource_time_off (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resource_id uuid,
    title text, reason text, start_date date, end_date date, approved boolean);
  CREATE TABLE public.schedule_holidays (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), country_code varchar(2) NOT NULL,
    organization_id uuid, name varchar(255) NOT NULL, holiday_date date NOT NULL, is_recurring boolean NOT NULL DEFAULT false);
  INSERT INTO public.schedule_holidays (country_code, organization_id, name, holiday_date, is_recurring)
    VALUES ('PT', NULL, 'Imaculada Conceição', '2000-12-08', true);
`);

for (const f of [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
  "seguranca.sql", "tempos.sql", "obras.sql",
]) {
  try {
    await db.exec(ler(f));
  } catch (e) {
    console.error(`✗ ${f} falhou: ${e.message}`);
    process.exit(1);
  }
}

console.log("\n─── instalar capacidade.sql ─────────────");
try {
  await db.exec(ler("capacidade.sql"));
  await db.exec(ler("capacidade.sql"));
  ok("capacidade.sql corre duas vezes");
} catch (e) {
  mau(`capacidade.sql falhou: ${e.message}`);
  process.exit(1);
}

/* ── Perfis, especialidades, modelos dos serviços ───────────────────────── */
{
  const c = await um(`SELECT c.conname, pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
                        JOIN pg_class t ON t.oid = c.conrelid
                       WHERE t.relname = 'ops_utilizador_perfil' AND c.contype = 'c'
                         AND pg_get_constraintdef(c.oid) LIKE '%funcao%'`);
  if (c && !c.def.includes("supervisor")) {
    await db.exec(`ALTER TABLE public.ops_utilizador_perfil DROP CONSTRAINT ${c.conname};
      ALTER TABLE public.ops_utilizador_perfil ADD CONSTRAINT ${c.conname}
        CHECK (funcao IN ('admin','gestor','operador','tecnico','supervisor'));`);
  }
}
await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name) VALUES ('d0000000-0000-0000-0000-00000000000a','${ORG}','Tudo');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT 'd0000000-0000-0000-0000-00000000000a', code FROM public.anew_permissions WHERE category = 'operations';
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status)
    SELECT id, '${ORG}', 'd0000000-0000-0000-0000-00000000000a', 'active' FROM public.anew_users;
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES
    ('${ORG}','${U.gestor}','gestor'), ('${ORG}','${U.sup}','supervisor'),
    ('${ORG}','${U.tec}','tecnico'), ('${ORG}','${U.tec2}','tecnico');
  INSERT INTO public.ops_skill (id, organization_id, nome) VALUES
    ('${K.can}','${ORG}','Canalização'), ('${K.pin}','${ORG}','Pintura');
  -- O técnico só canaliza; o técnico 2 canaliza E pinta (conta metade em cada).
  INSERT INTO public.ops_utilizador_skill (utilizador_id, skill_id) VALUES
    ('${U.tec}','${K.can}'), ('${U.tec2}','${K.can}'), ('${U.tec2}','${K.pin}');
  -- O técnico 2 está de férias na terça 10/11 (aprovado); um pedido NÃO aprovado não conta.
  INSERT INTO public.schedule_resources (id, user_id, organization_id) VALUES
    ('5c000000-0000-0000-0000-000000000001','${U.tec2}','${ORG}'),
    ('5c000000-0000-0000-0000-000000000002','${U.tec}','${ORG}');
  INSERT INTO public.resource_time_off (resource_id, title, start_date, end_date, approved) VALUES
    ('5c000000-0000-0000-0000-000000000001','Férias','2026-11-10','2026-11-10', true),
    ('5c000000-0000-0000-0000-000000000002','Pedido','2026-11-10','2026-11-13', false);

  INSERT INTO public.services (id, name, organization_id) VALUES
    ('${S.can}','Instalação de canalização','${ORG}'), ('${S.pin}','Pintura de paredes','${ORG}');
  -- Modelos: canalização 960 min fixos (fase 2), pintura 480 min fixos (fase 3).
  INSERT INTO public.ops_obra_servico_tarefa (organization_id, servico_id, ordem, nome, fase, minutos_fixos, pessoas, skill_id) VALUES
    ('${ORG}','${S.can}',1,'Instalar',2,960,1,'${K.can}'),
    ('${ORG}','${S.pin}',1,'Pintar',3,480,1,'${K.pin}');

  -- Orçamentos (as datas contam a partir de HOJE = ${HOJE}).
  INSERT INTO public.proposals (id, status, probability, organization_id) VALUES
    ('${P.boa}','sent',40,'${ORG}'), ('${P.ma}','rejected',90,'${ORG}');
  INSERT INTO public.deals (id, probability, expected_close_date, organization_id) VALUES
    ('${D}', 70, '2026-11-30', '${ORG}');
  INSERT INTO public.quotes (id, organization_id, cliente_id, quote_number, title, estado, accepted_at, created_at, proposal_id, deal_id) VALUES
    ('${QT.contrato}','${ORG}','${CLI}','Q-CT','Do contrato','aceite','2026-10-01','2026-09-20',NULL,NULL),
    ('${QT.aceite}','${ORG}','${CLI}','Q-AC','Aceite sem contrato','aceite','2026-10-20','2026-10-10',NULL,NULL),
    ('${QT.enviadoVelho}','${ORG}','${CLI}','Q-EN1','Enviado v1','enviado',NULL,'2026-10-20','${P.boa}','${D}'),
    ('${QT.enviado}','${ORG}','${CLI}','Q-EN2','Enviado v2','enviado',NULL,'2026-10-25','${P.boa}','${D}'),
    ('${QT.rejeitada}','${ORG}','${CLI}','Q-REJ','Proposta rejeitada','enviado',NULL,'2026-10-25','${P.ma}',NULL),
    ('${QT.antigo}','${ORG}','${CLI}','Q-OLD','Antigo','enviado',NULL,'2026-07-01',NULL,NULL),
    ('${QT.comObra}','${ORG}','${CLI}','Q-OB','Já com obra','aceite','2026-10-15','2026-10-01',NULL,NULL);
  INSERT INTO public.quote_lines (quote_id, ordem, descricao_snapshot, qt, service_id)
  SELECT q, 0, 'Canalização', 1, '${S.can}'::uuid FROM unnest(ARRAY['${QT.contrato}','${QT.aceite}','${QT.enviado}',
         '${QT.enviadoVelho}','${QT.rejeitada}','${QT.antigo}','${QT.comObra}']::uuid[]) q
  UNION ALL
  SELECT q, 1, 'Pintura', 1, '${S.pin}'::uuid FROM unnest(ARRAY['${QT.contrato}','${QT.aceite}','${QT.enviado}',
         '${QT.enviadoVelho}','${QT.rejeitada}','${QT.antigo}','${QT.comObra}']::uuid[]) q;
  INSERT INTO public.client_contracts (id, contract_number, client_id, status, organization_id, quote_id, start_date, created_by) VALUES
    ('${CT.semObra}','CT-1','${CLI}','signed','${ORG}','${QT.contrato}','2026-11-16','${U.gestor}'),
    ('${CT.comObra}','CT-2','${CLI}','signed','${ORG}','${QT.comObra}','2026-11-09','${U.gestor}');

  -- Obras: uma ligada ao contrato CT-2 (não conta como comercial), com uma
  -- tarefa de canalização na semana 1 (seg 9 e ter 10, 960 min), uma pintura
  -- grande na semana 1 (3000 min, seg 9 → sex 13) e uma pintura ATRASADA
  -- (devia ter acabado a 30/10; 240 min → cai hoje).
  INSERT INTO public.ops_obra (id, organization_id, codigo, titulo, estado, contrato_id) VALUES
    ('${OB.a}','${ORG}','OB-1','Obra 1','planeada','${CT.comObra}'),
    ('${OB.b}','${ORG_B}','OB-B','Obra da B','planeada',NULL);
  INSERT INTO public.ops_obra_fase (id, organization_id, obra_id, ordem, nome) VALUES
    ('0f000000-0000-0000-0000-000000000001','${ORG}','${OB.a}',2,'Instalações'),
    ('0f000000-0000-0000-0000-000000000002','${ORG_B}','${OB.b}',2,'Instalações');
  INSERT INTO public.ops_obra_tarefa (organization_id, obra_id, fase_id, nome, minutos_previstos, inicio_planeado, fim_planeado, skill_id, estado) VALUES
    ('${ORG}','${OB.a}','0f000000-0000-0000-0000-000000000001','Canalizar',960,'2026-11-09','2026-11-10','${K.can}','por_fazer'),
    ('${ORG}','${OB.a}','0f000000-0000-0000-0000-000000000001','Pintar tudo',3000,'2026-11-09','2026-11-13','${K.pin}','por_fazer'),
    ('${ORG}','${OB.a}','0f000000-0000-0000-0000-000000000001','Pintura atrasada',240,'2026-10-28','2026-10-30','${K.pin}','por_fazer'),
    ('${ORG}','${OB.a}','0f000000-0000-0000-0000-000000000001','Já feita',600,'2026-11-09','2026-11-09','${K.can}','feita'),
    ('${ORG_B}','${OB.b}','0f000000-0000-0000-0000-000000000002','Da outra org',5000,'2026-11-09','2026-11-09',NULL,'por_fazer');

  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
`);

function sessao(authUid, sql) {
  return `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${authUid}'; ${sql} COMMIT;`;
}
async function chamar(authUid, sql) {
  try {
    const r = await db.exec(sessao(authUid, sql));
    const linhas = r.flatMap((x) => x.rows ?? []);
    const bruto = Object.values(linhas.at(-1) ?? {})[0];
    return typeof bruto === "string" && bruto.startsWith("{") ? JSON.parse(bruto) : bruto;
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    throw e;
  }
}

/* ── O cálculo, com hoje fixo ───────────────────────────────────────────── */
console.log("\n─── o cálculo ───────────────────────────");
let r;
try {
  r = (await um(`SELECT public.ops_capacidade_calcular('${ORG}', '${HOJE}', 6) AS r`)).r;
} catch (e) {
  console.error(`✗ o cálculo falhou: ${e.message}`);
  process.exit(1);
}
const esp = (id) => r.especialidades.find((e) => e.id === id);
const cel = (id, w) => esp(id)?.celulas.find((c) => c.w === w);
const fonte = (id) => r.fontes.find((f) => f.id === id);
const somaFonte = (id, skill) =>
  (fonte(id)?.celulas ?? []).filter((c) => c.s === skill).reduce((a, c) => a + c.m, 0);

verifica(r.inicio === "2026-11-02" && r.semanas.length === 6, "começa na segunda desta semana, 6 semanas",
  `início ${r.inicio}, ${r.semanas.length} semanas`);
verifica(r.semanas[0].dias === 3, "a semana atual só conta os dias úteis que faltam (qua a sex)",
  `semana 0 com ${r.semanas[0].dias} dias`);

// Oferta da semana 1 (9–13/11): técnico 5 × 480 em Canalização; técnico 2
// 4 dias (férias na terça) × 480 ÷ 2 em cada. O pedido não aprovado não conta.
verifica(cel(K.can, 1)?.oferta === 2400 + 960, "oferta: quem tem 2 ofícios conta metade, menos as férias aprovadas",
  `oferta Canalização semana 1 = ${cel(K.can, 1)?.oferta} (esperado 3360)`);
verifica(cel(K.pin, 1)?.oferta === 960, "oferta de Pintura na semana 1 = 960 (meio técnico, 4 dias)",
  `oferta Pintura semana 1 = ${cel(K.pin, 1)?.oferta}`);
{
  // Semana 5 (7–11/12): 8/12 é feriado nacional → 4 dias.
  verifica(r.semanas[5].dias === 4 && cel(K.can, 5)?.oferta === 4 * 480 + 4 * 240,
    "o feriado de 8 de dezembro tira um dia à oferta",
    `semana 5: ${r.semanas[5].dias} dias, oferta ${cel(K.can, 5)?.oferta}`);
}

// Procura das obras.
verifica(cel(K.pin, 0)?.atrasado === 240 && cel(K.pin, 0)?.procura >= 240,
  "a tarefa que devia ter acabado cai hoje, marcada como atrasada",
  `Pintura semana 0: ${JSON.stringify(cel(K.pin, 0))}`);
verifica(somaFonte(OB.a, K.can) === 960, "a tarefa feita não conta; a por fazer conta inteira",
  `obra 1 em Canalização = ${somaFonte(OB.a, K.can)}`);
verifica(!fonte(OB.b), "as obras de outra organização não entram", "entrou uma obra da outra organização");

// Falta gente: Pintura semana 1 = 3000 (obra) + o comercial que lá caia; oferta 960.
{
  const c = cel(K.pin, 1);
  verifica(c && c.procura > c.oferta && c.faltam === Math.ceil((c.procura - c.oferta) / (5 * 480)),
    `Pintura na semana 1: procura ${c?.procura} contra ${c?.oferta} → faltam ${c?.faltam} pessoa(s)`,
    `faltam mal calculado: ${JSON.stringify(c)}`);
}

// O comercial.
verifica(fonte(CT.semObra)?.tipo === "contrato" && somaFonte(CT.semObra, K.can) === 960 && somaFonte(CT.semObra, K.pin) === 480,
  "contrato assinado sem obra: o tempo inteiro dos modelos (960 + 480), a 100 %",
  `contrato: ${JSON.stringify(fonte(CT.semObra))}`);
{
  // Fases pela ordem: canalização (fase 2) antes da pintura (fase 3). 1440 min
  // com equipa de 2 → 5 dias (mínimo), a partir de 16/11 (semana 2).
  const c = fonte(CT.semObra)?.celulas ?? [];
  verifica(c.every((x) => x.w === 2), "o contrato começa na sua data (16/11) e dura uma semana",
    `semanas do contrato: ${c.map((x) => x.w)}`);
}
verifica(!r.fontes.some((f) => f.id === CT.comObra) && !r.fontes.some((f) => f.id === QT.comObra),
  "o contrato que já tem obra não conta duas vezes", "o contrato com obra entrou no comercial");
{
  const f = fonte(QT.aceite);
  const total = f ? f.celulas.reduce((a, c) => a + c.m, 0) : 0;
  verifica(f?.tipo === "aceite" && Math.abs(total - 0.9 * 1440) <= 2,
    "orçamento aceite sem contrato: × 90 %", `aceite: ${JSON.stringify(f)}`);
}
{
  const f = fonte(QT.enviado);
  const total = f ? f.celulas.reduce((a, c) => a + c.m, 0) : 0;
  // Fecho previsto 30/11 + 21 dias = 21/12 → fora das 6 semanas; com 8 semanas entra.
  verifica(!f, "a proposta que fecha a 30/11 começa a 21/12 — fora de 6 semanas", `entrou: ${JSON.stringify(f)}`);
  const r8 = (await um(`SELECT public.ops_capacidade_calcular('${ORG}', '${HOJE}', 8) AS r`)).r;
  const f8 = r8.fontes.find((x) => x.id === QT.enviado);
  const t8 = f8 ? f8.celulas.reduce((a, c) => a + c.m, 0) : 0;
  verifica(f8?.tipo === "proposta" && Math.abs(t8 - 0.4 * 1440) <= 2 && f8.celulas.every((c) => c.w === 7),
    "orçamento enviado: × probabilidade da proposta (40 %), a começar 3 semanas depois do fecho previsto",
    `proposta em 8 semanas: ${JSON.stringify(f8)} (total ${t8}; antes ${total})`);
  verifica(!r8.fontes.some((x) => x.id === QT.enviadoVelho), "da mesma proposta só conta o orçamento mais recente",
    "a versão antiga do orçamento também contou");
  verifica(!r8.fontes.some((x) => x.id === QT.rejeitada), "proposta rejeitada não conta", "a proposta rejeitada contou");
  verifica(!r8.fontes.some((x) => x.id === QT.antigo), "orçamento enviado há mais de 60 dias não conta",
    "o orçamento antigo contou");
  verifica(r8.resumo.contratos === 1 && r8.resumo.aceites === 1 && r8.resumo.propostas === 1 && r8.resumo.erros === 0,
    "o resumo conta 1 contrato, 1 aceite, 1 proposta, 0 erros", `resumo: ${JSON.stringify(r8.resumo)}`);
}

{
  // Sem tempo para expandir: o comercial fica por expandir (e diz-se), as obras contam na mesma.
  const r0 = (await um(`SELECT public.ops_capacidade_calcular('${ORG}', '${HOJE}', 8, 0) AS r`)).r;
  verifica(r0.resumo.por_expandir === 3 && !r0.fontes.some((f) => f.tipo !== "obra") && r0.fontes.some((f) => f.tipo === "obra"),
    "sem tempo para expandir (8 s no ecrã), os orçamentos ficam 'por expandir' e as obras contam na mesma",
    `resumo sem tempo: ${JSON.stringify(r0.resumo)}`);
}

/* ── A RPC: quem pode, e a cache ────────────────────────────────────────── */
console.log("\n─── quem vê, e a cache ──────────────────");
try {
  await chamar(AUTH.tec, `SELECT public.rpc_ops_capacidade('${ORG}', 6, false);`);
  mau("o técnico conseguiu ver a capacidade");
} catch {
  ok("o técnico não vê a capacidade");
}
try {
  await chamar(AUTH.sup, `SELECT public.rpc_ops_capacidade('${ORG}', 6, false);`);
  mau("o supervisor conseguiu ver a capacidade");
} catch {
  ok("o supervisor não vê a capacidade (é do gestor)");
}
try {
  const a = await chamar(AUTH.gestor, `SELECT public.rpc_ops_capacidade('${ORG}', 6, false);`);
  const b = await chamar(AUTH.gestor, `SELECT public.rpc_ops_capacidade('${ORG}', 6, false);`);
  const c = await chamar(AUTH.gestor, `SELECT public.rpc_ops_capacidade('${ORG}', 6, true);`);
  verifica(a.em_cache === false && b.em_cache === true && c.em_cache === false && Array.isArray(b.especialidades),
    "o gestor vê; o 2.º pedido vem da cache; Recalcular calcula de novo",
    `em_cache: ${a.em_cache}, ${b.em_cache}, ${c.em_cache}`);
  const n = await um(`SELECT public.ops_capacidade_atualizar_todas() AS n`);
  verifica(Number(n.n) === 1, "o cron atualiza a cache de quem já a abriu", `atualizou ${n.n}`);
} catch (e) {
  mau(`a RPC falhou para o gestor: ${e.message.split("\n")[0]}`);
}
try {
  await chamar(AUTH.gestor, `SELECT * FROM public.ops_capacidade_cache;`);
  mau("a tabela da cache lê-se diretamente");
} catch {
  ok("a cache não se lê diretamente (só pela RPC)");
}

console.log(falhas.length ? `\n✗ capacidade: ${falhas.length} falha(s)` : "\n✓ capacidade: oferta, procura, comercial, quem vê e cache");
process.exit(falhas.length ? 1 : 0);
