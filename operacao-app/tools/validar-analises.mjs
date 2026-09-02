/**
 * Prova que os números das análises são os certos, e que não mostram o que
 * não devem.
 *
 * Uma vista de análise é o sítio mais fácil de furar uma RLS sem se dar por
 * isso: sem `security_invoker`, uma vista corre com os privilégios de quem a
 * criou e mostra os dados de todas as organizações a toda a gente. Não dá
 * erro nenhum — dá mais linhas. Por isso o primeiro teste aqui é esse.
 *
 * Depois, as definições que se discutem:
 *   · uma ordem cancelada não é manutenção falhada;
 *   · uma ordem sem data prometida não entra no PMP;
 *   · "cumprida" e "cumprida a horas" são números diferentes;
 *   · as não conformidades contam-se por equipamento, não por ordem.
 *
 *     npm run validar-analises
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
const mau = (m) => { console.log(`  ✗ ${m}`); falhas.push(m); };

const ORG = "11111111-1111-1111-1111-111111111111";
const ORG2 = "11111111-1111-1111-1111-111111111112";
const CLI = "22222222-2222-2222-2222-222222222222";
const CLI2 = "22222222-2222-2222-2222-222222222223";
const GESTOR = "aaaa0000-0000-0000-0000-00000000000a";
const AUTH_GESTOR = "aaaa1111-0000-0000-0000-00000000000a";

await db.exec(STUBS_CRM);
await db.exec(`
  CREATE TABLE public.auth_to_business_user_map (auth_user_id uuid, business_user_id uuid);
  CREATE OR REPLACE FUNCTION public.current_business_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT m.business_user_id FROM public.auth_to_business_user_map m
     WHERE m.auth_user_id = auth.uid() LIMIT 1 $fn$;

  -- Só vê a organização onde tem membership. É isto que as vistas têm de
  -- respeitar, e o que uma vista sem security_invoker deitaria fora.
  CREATE OR REPLACE FUNCTION public.get_user_visible_org_ids(_auth_uid uuid)
    RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT am.organization_id FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE au.auth_user_id = _auth_uid AND am.status = 'active' $fn$;

  CREATE OR REPLACE FUNCTION public.has_anew_permission(_auth_uid uuid, _permission_code text)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT EXISTS (
      SELECT 1 FROM public.anew_users au
        JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
        JOIN public.anew_role_permissions arp
          ON arp.role_id = am.role_id AND arp.permission_code = _permission_code
       WHERE au.auth_user_id = _auth_uid) $fn$;

  INSERT INTO public.anew_organizations (id, name) VALUES
    ('${ORG}', 'A nossa'), ('${ORG2}', 'A de outra gente');
  INSERT INTO public.anew_entities (id, display_name) VALUES
    ('77777777-7777-7777-7777-777777777777','Cliente'),
    ('77777777-7777-7777-7777-777777777778','Cliente 2');
  INSERT INTO public.anew_clients (id, organization_id, entity_id) VALUES
    ('${CLI}',  '${ORG}',  '77777777-7777-7777-7777-777777777777'),
    ('${CLI2}', '${ORG2}', '77777777-7777-7777-7777-777777777778');

  INSERT INTO public.anew_users (id, auth_user_id, name, email)
    VALUES ('${GESTOR}', '${AUTH_GESTOR}', 'Gestora', 'g@x.pt');
  INSERT INTO auth.users (id, email, email_confirmed_at)
    VALUES ('${AUTH_GESTOR}', 'g@x.pt', now());
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id)
    VALUES ('${AUTH_GESTOR}', '${GESTOR}');
`);

await db.exec(ler("schema.sql"));
await db.exec(ler("permissoes.sql"));
await db.exec(ler("notificacoes.sql"));
await db.exec(ler("rpcs.sql"));
await db.exec(ler("rpcs-tarefas.sql"));
await db.exec(ler("planos.sql"));
await db.exec(ler("correcoes-modelo.sql"));
await db.exec(ler("medicoes.sql"));
await db.exec(ler("analises.sql"));

await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name)
    VALUES ('eeee0000-0000-0000-0000-00000000000e', '${ORG}', 'Operacoes');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT 'eeee0000-0000-0000-0000-00000000000e', code
      FROM public.anew_permissions WHERE category = 'operations';
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status)
    VALUES ('${GESTOR}','${ORG}','eeee0000-0000-0000-0000-00000000000e','active');

  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao)
    VALUES ('${ORG}','${GESTOR}','gestor');

  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth, public TO authenticated;
`);

/** Lê uma vista COMO a gestora, com a RLS a valer. */
async function comoGestora(sql) {
  await db.exec(`BEGIN; SET LOCAL ROLE authenticated;
                 SET LOCAL request.jwt.claim.sub = '${AUTH_GESTOR}';`);
  try {
    return (await db.query(sql)).rows;
  } finally {
    await db.exec("COMMIT").catch(() => db.exec("ROLLBACK").catch(() => {}));
  }
}

/* ── O cenário: seis preventivas, uma cancelada, uma sem data ───────────── */

const LOCAL = "0aaa0000-0000-0000-0000-0000000000a1";
const ATIVO = "0aaa0000-0000-0000-0000-0000000000a2";
const CAT = "0aaa0000-0000-0000-0000-0000000000a3";

await db.exec(`
  INSERT INTO public.ops_categoria_ativo (id, organization_id, codigo, nome)
    VALUES ('${CAT}', '${ORG}', 'CAT-EXT', 'Extintores');
  INSERT INTO public.ops_local (id, organization_id, cliente_id, codigo, nome)
    VALUES ('${LOCAL}', '${ORG}', '${CLI}', 'LOC-1', 'Garagem -2');
  INSERT INTO public.ops_ativo (id, organization_id, local_id, categoria_id, codigo, nome)
    VALUES ('${ATIVO}', '${ORG}', '${LOCAL}', '${CAT}', 'EXT-001', 'Extintor 1');

  INSERT INTO public.ops_ordem
    (id, organization_id, codigo, origem, estado, cliente_id, local_id, titulo,
     agendada_para, fechada_em)
  VALUES
    -- cumprida, e a horas
    ('0b000000-0000-0000-0000-000000000001', '${ORG}', 'OT-P1', 'preventiva', 'fechada',
     '${CLI}', '${LOCAL}', 'Trimestral janeiro',
     '2026-01-10 09:00+00', '2026-01-10 16:00+00'),
    -- cumprida, mas com duas semanas de atraso
    ('0b000000-0000-0000-0000-000000000002', '${ORG}', 'OT-P2', 'preventiva', 'fechada',
     '${CLI}', '${LOCAL}', 'Trimestral abril',
     '2026-04-10 09:00+00', '2026-04-24 16:00+00'),
    -- prometida e por fazer, com o dia já passado
    ('0b000000-0000-0000-0000-000000000003', '${ORG}', 'OT-P3', 'preventiva', 'agendada',
     '${CLI}', '${LOCAL}', 'Trimestral julho', '2026-07-10 09:00+00', NULL),
    -- cancelada pelo cliente: não é manutenção falhada
    ('0b000000-0000-0000-0000-000000000004', '${ORG}', 'OT-P4', 'preventiva', 'cancelada',
     '${CLI}', '${LOCAL}', 'Trimestral outubro', '2026-10-10 09:00+00', NULL),
    -- sem data prometida: não há promessa para cumprir
    ('0b000000-0000-0000-0000-000000000005', '${ORG}', 'OT-P5', 'preventiva', 'agendada',
     '${CLI}', '${LOCAL}', 'Sem data', NULL, NULL),
    -- uma corretiva: nunca conta para o PMP
    ('0b000000-0000-0000-0000-000000000006', '${ORG}', 'OT-C1', 'corretiva', 'fechada',
     '${CLI}', '${LOCAL}', 'Avaria', '2026-02-01 09:00+00', '2026-02-01 12:00+00'),
    -- de OUTRA organização, para o teste da RLS
    ('0b000000-0000-0000-0000-000000000007', '${ORG2}', 'OT-X1', 'preventiva', 'fechada',
     '${CLI2}', NULL, 'De outra gente',
     '2026-01-10 09:00+00', '2026-01-10 16:00+00');
`);

console.log("\n─── o PMP conta o que devia ─────────────");
{
  const linhas = await q(`SELECT codigo, cumprida, a_horas, em_atraso FROM public.ops_v_pmp
                           WHERE organization_id = '${ORG}' ORDER BY codigo`);
  const codigos = linhas.map((l) => l.codigo);
  codigos.join(",") === "OT-P1,OT-P2,OT-P3"
    ? ok("três ordens no PMP: a cancelada, a sem data e a corretiva ficam de fora")
    : mau(`entraram ${codigos.join(", ")}`);

  const p1 = linhas.find((l) => l.codigo === "OT-P1");
  p1?.cumprida === true && p1?.a_horas === true
    ? ok("a fechada no dia conta como cumprida e a horas")
    : mau(`OT-P1: cumprida=${p1?.cumprida} a_horas=${p1?.a_horas}`);

  const p2 = linhas.find((l) => l.codigo === "OT-P2");
  p2?.cumprida === true && p2?.a_horas === false
    ? ok("a fechada com duas semanas de atraso conta como cumprida, mas não a horas")
    : mau(`OT-P2: cumprida=${p2?.cumprida} a_horas=${p2?.a_horas}`);

  const p3 = linhas.find((l) => l.codigo === "OT-P3");
  p3?.cumprida === false && p3?.em_atraso === true
    ? ok("a que passou do dia e não fechou aparece em atraso")
    : mau(`OT-P3: cumprida=${p3?.cumprida} em_atraso=${p3?.em_atraso}`);
}

/* ── O histórico do equipamento ─────────────────────────────────────────── */

console.log("\n─── a vida de um equipamento ────────────");
await db.exec(`
  INSERT INTO public.ops_ordem_alvo (id, ordem_id, ativo_id, local_id) VALUES
    ('0c000000-0000-0000-0000-000000000001','0b000000-0000-0000-0000-000000000001','${ATIVO}','${LOCAL}'),
    ('0c000000-0000-0000-0000-000000000002','0b000000-0000-0000-0000-000000000006','${ATIVO}','${LOCAL}'),
    ('0c000000-0000-0000-0000-000000000004','0b000000-0000-0000-0000-000000000004','${ATIVO}','${LOCAL}');

  INSERT INTO public.ops_ordem_tarefa
    (id, ordem_id, ordem_alvo_id, posicao, nome, tipo, estado, obrigatoria) VALUES
    ('0d000000-0000-0000-0000-000000000001','0b000000-0000-0000-0000-000000000001',
     '0c000000-0000-0000-0000-000000000001',1,'Pressao','inspecao','feita',true),
    ('0d000000-0000-0000-0000-000000000002','0b000000-0000-0000-0000-000000000006',
     '0c000000-0000-0000-0000-000000000002',1,'Mola','correcao','nao_conforme',true);
`);
{
  const linhas = await q(`SELECT codigo, origem, nao_conformidades FROM public.ops_v_ativo_intervencao
                           WHERE ativo_id = '${ATIVO}' ORDER BY codigo`);
  linhas.map((l) => l.codigo).join(",") === "OT-C1,OT-P1"
    ? ok("duas visitas ao extintor, e a ordem cancelada não aparece no histórico")
    : mau(`apareceram ${linhas.map((l) => l.codigo).join(", ")}`);

  const c1 = linhas.find((l) => l.codigo === "OT-C1");
  const p1 = linhas.find((l) => l.codigo === "OT-P1");
  c1?.nao_conformidades === 1 && p1?.nao_conformidades === 0
    ? ok("a não conformidade fica na visita onde apareceu, e não mancha a outra")
    : mau(`OT-C1=${c1?.nao_conformidades} OT-P1=${p1?.nao_conformidades}`);
}

/* ── As leituras ────────────────────────────────────────────────────────── */

console.log("\n─── a evolução das leituras ─────────────");
const DEF = "0e000000-0000-0000-0000-000000000001";
await db.exec(`
  INSERT INTO public.ops_medicao_def (id, organization_id, nome, tipo, unidade, limite_min, limite_max)
    VALUES ('${DEF}', '${ORG}', 'Pressao', 'gama', 'bar', 10, 15);

  SELECT set_config('ops.medicao', 'autorizada', false);
  INSERT INTO public.ops_ordem_tarefa_medicao
    (ordem_tarefa_id, medicao_def_id, nome, tipo, unidade, limite_min, limite_max,
     valor_num, conforme, lida_em)
  VALUES
    ('0d000000-0000-0000-0000-000000000001','${DEF}','Pressao','gama','bar',10,15,
     12, true, '2026-01-10 10:00+00');
  -- uma leitura POR FAZER: não é um ponto no gráfico
  INSERT INTO public.ops_ordem_tarefa_medicao
    (ordem_tarefa_id, medicao_def_id, nome, tipo, unidade, limite_min, limite_max)
  VALUES
    ('0d000000-0000-0000-0000-000000000002','${DEF}','Pressao','gama','bar',10,15);
  SELECT set_config('ops.medicao', '', false);
`);
{
  const linhas = await q(`SELECT nome, valor_num, codigo FROM public.ops_v_ativo_leitura
                           WHERE ativo_id = '${ATIVO}'`);
  linhas.length === 1 && Number(linhas[0].valor_num) === 12
    ? ok("só a leitura feita aparece — uma linha em branco não é um ponto")
    : mau(`${linhas.length} leituras: ${JSON.stringify(linhas)}`);
  linhas[0]?.codigo === "OT-P1"
    ? ok("e traz a ordem onde foi lida, para se poder lá ir")
    : mau(`veio com o código ${linhas[0]?.codigo}`);
}

/* ── A RLS ──────────────────────────────────────────────────────────────── */

console.log("\n─── o que a gestora NÃO pode ver ────────");
{
  const opcoes = await q(`
    SELECT relname, reloptions FROM pg_class
     WHERE relname IN ('ops_v_ativo_intervencao','ops_v_ativo_leitura','ops_v_pmp')`);
  const semInvoker = opcoes.filter(
    (r) => !(r.reloptions ?? []).some((o) => String(o) === "security_invoker=true")
  );
  semInvoker.length === 0
    ? ok("as três vistas têm security_invoker")
    : mau(`sem security_invoker: ${semInvoker.map((r) => r.relname).join(", ")}`);

  const linhas = await comoGestora(`SELECT codigo FROM public.ops_v_pmp ORDER BY codigo`);
  const codigos = linhas.map((l) => l.codigo);
  codigos.includes("OT-X1")
    ? mau("a gestora vê a ordem de outra organização — a vista está a furar a RLS")
    : ok("a ordem da outra organização não aparece, mesmo sem filtro nenhum");
  codigos.length === 3
    ? ok(`vê as três da sua organização (${codigos.join(", ")})`)
    : mau(`viu ${codigos.length} linhas: ${codigos.join(", ")}`);
}

/* ── Nada foi acrescentado ao módulo ────────────────────────────────────── */

console.log("\n─── o que NÃO se tocou ──────────────────");
{
  const fk = await q(`
    SELECT c.conname FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class f ON f.oid = c.confrelid
     WHERE c.contype = 'f' AND t.relname LIKE 'ops\\_%' AND f.relname NOT LIKE 'ops\\_%'`);
  fk.length === 0
    ? ok("nenhuma chave estrangeira para fora do módulo")
    : mau(`${fk.length} FK para fora`);

  const n = await um(`
    SELECT count(*)::int AS n FROM pg_class
     WHERE relkind = 'v' AND relname LIKE 'ops\\_v\\_%'`);
  n.n >= 3 ? ok(`${n.n} vistas ops_v_* no total`) : mau(`só ${n.n} vistas`);
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ os números são os certos, e só os vê quem os pode ver");
