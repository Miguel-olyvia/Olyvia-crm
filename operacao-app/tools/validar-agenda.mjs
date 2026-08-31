/**
 * Prova que o aviso de agenda diz a verdade — e que não diz mais do que deve.
 *
 * O que se verifica:
 *   · férias aprovadas aparecem; um pedido por aprovar não;
 *   · um dia em que a pessoa não trabalha aparece;
 *   · quem NÃO tem horário declarado não gera aviso nenhum — o silêncio quer
 *     dizer "não sabemos", e avisar aí encheria o ecrã de avisos falsos;
 *   · os feriados aparecem mesmo a quem ainda não está na agenda do CRM;
 *   · o motivo da ausência NUNCA sai daqui (pode ser uma baixa médica);
 *   · e não dá para sondar a agenda de outra organização, nem a de alguém
 *     que não é da equipa de Operações.
 *
 *     npm run validar-agenda
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
const GESTOR = "aaaa0000-0000-0000-0000-00000000000a";
const TECNICO = "bbbb0000-0000-0000-0000-00000000000b";
/** Está no CRM e na agenda, mas não é da equipa de Operações. */
const ESTRANHO = "cccc0000-0000-0000-0000-00000000000c";
const AUTH = {
  gestor: "aaaa1111-0000-0000-0000-00000000000a",
  tecnico: "bbbb1111-0000-0000-0000-00000000000b",
};
const REC_TECNICO = "dddd0000-0000-0000-0000-0000000000d1";
const REC_ESTRANHO = "dddd0000-0000-0000-0000-0000000000d2";

await db.exec(STUBS_CRM);
await db.exec(`
  CREATE TABLE public.auth_to_business_user_map (auth_user_id uuid, business_user_id uuid);
  CREATE OR REPLACE FUNCTION public.current_business_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT m.business_user_id FROM public.auth_to_business_user_map m
     WHERE m.auth_user_id = auth.uid() LIMIT 1 $fn$;

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
    ('${ORG}', 'A nossa'), ('${ORG2}', 'Outra');
  INSERT INTO public.anew_entities (id, display_name)
    VALUES ('77777777-7777-7777-7777-777777777777','Cliente');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('${CLI}', '${ORG}', '77777777-7777-7777-7777-777777777777');

  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${GESTOR}',   '${AUTH.gestor}',  'Gestora',  'g@x.pt'),
    ('${TECNICO}',  '${AUTH.tecnico}', 'Tecnico',  't@x.pt'),
    ('${ESTRANHO}', NULL,              'Comercial','c@x.pt');
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('${AUTH.gestor}','g@x.pt',now()), ('${AUTH.tecnico}','t@x.pt',now());
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ('${AUTH.gestor}','${GESTOR}'), ('${AUTH.tecnico}','${TECNICO}');

  INSERT INTO public.schedule_resources (id, name, user_id, organization_id) VALUES
    ('${REC_TECNICO}',  'Tecnico',   '${TECNICO}',  '${ORG}'),
    ('${REC_ESTRANHO}', 'Comercial', '${ESTRANHO}', '${ORG}');
`);

await db.exec(ler("schema.sql"));
await db.exec(ler("permissoes.sql"));
await db.exec(ler("notificacoes.sql"));
await db.exec(ler("agenda.sql"));
await db.exec(ler("rpcs.sql"));
await db.exec(ler("rpcs-tarefas.sql"));
await db.exec(ler("planos.sql"));
await db.exec(ler("correcoes-modelo.sql"));
await db.exec(ler("medicoes.sql"));
await db.exec(ler("despacho.sql"));

await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name)
    VALUES ('eeee0000-0000-0000-0000-00000000000e', '${ORG}', 'Operacoes');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT 'eeee0000-0000-0000-0000-00000000000e', code
      FROM public.anew_permissions WHERE category = 'operations';
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${GESTOR}','${ORG}','eeee0000-0000-0000-0000-00000000000e','active'),
    ('${TECNICO}','${ORG}','eeee0000-0000-0000-0000-00000000000e','active');

  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES
    ('${ORG}','${GESTOR}','gestor'),
    ('${ORG}','${TECNICO}','tecnico');

  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth, public TO authenticated;
`);

/** Corre um SELECT com a sessão de alguém, e devolve as linhas. */
async function como(authUid, sql) {
  await db.exec(`BEGIN; SET LOCAL ROLE authenticated;
                 SET LOCAL request.jwt.claim.sub = '${authUid}';`);
  try {
    return (await db.query(sql)).rows;
  } finally {
    await db.exec("COMMIT").catch(() => db.exec("ROLLBACK").catch(() => {}));
  }
}

const disponibilidade = (utilizador, inicio, fim) =>
  `SELECT tipo, detalhe, desde, ate FROM public.ops_disponibilidade(
     '${utilizador}','${ORG}','${inicio}'::timestamptz,'${fim}'::timestamptz) ORDER BY tipo`;

/* ── Livre ─────────────────────────────────────────────────────────────── */

console.log("\n─── quando não há nada a impedir ────────");
{
  // Quarta-feira, 2026-09-16, às 10h. Sem férias, sem horário, sem feriado.
  const r = await como(AUTH.gestor,
    disponibilidade(TECNICO, "2026-09-16 10:00+00", "2026-09-16 11:00+00"));
  r.length === 0
    ? ok("sem impedimento nenhum, não vem aviso nenhum")
    : mau(`vieram ${r.length} avisos: ${JSON.stringify(r)}`);
}

/* ── Férias ────────────────────────────────────────────────────────────── */

console.log("\n─── férias ──────────────────────────────");
await db.exec(`
  INSERT INTO public.resource_time_off
    (resource_id, title, reason, start_date, end_date, approved, notes)
  VALUES
    ('${REC_TECNICO}', 'Baixa medica', 'operacao ao joelho',
     '2026-09-14', '2026-09-25', true, 'notas confidenciais'),
    ('${REC_TECNICO}', 'Ferias de Natal', 'ferias',
     '2026-12-20', '2026-12-31', false, NULL);
`);
{
  const r = await como(AUTH.gestor,
    disponibilidade(TECNICO, "2026-09-16 10:00+00", "2026-09-16 11:00+00"));
  const ausencia = r.filter((x) => x.tipo === "ausente");
  ausencia.length === 1
    ? ok("a ausência aprovada aparece")
    : mau(`${ausencia.length} ausências, esperava 1`);

  const texto = JSON.stringify(r).toLowerCase();
  ["baixa", "medica", "joelho", "confidenciais"].some((p) => texto.includes(p))
    ? mau(`o motivo da ausência saiu daqui: ${texto}`)
    : ok("o motivo NÃO sai — quem marca a visita só precisa de saber que a pessoa não está");

  ausencia[0]?.desde && ausencia[0]?.ate
    ? ok(`e traz as datas (${ausencia[0].desde} a ${ausencia[0].ate})`)
    : mau("veio sem datas");
}
{
  const r = await como(AUTH.gestor,
    disponibilidade(TECNICO, "2026-12-22 10:00+00", "2026-12-22 11:00+00"));
  r.filter((x) => x.tipo === "ausente").length === 0
    ? ok("um pedido de férias por aprovar não impede nada — ainda pode ser recusado")
    : mau("uma ausência por aprovar apareceu como impedimento");
}

/* ── Horário ───────────────────────────────────────────────────────────── */

console.log("\n─── o horário de quem trabalha ──────────");
{
  // Sem regras nenhumas, ainda não se sabe nada sobre o horário.
  const r = await como(AUTH.gestor,
    disponibilidade(TECNICO, "2026-10-03 10:00+00", "2026-10-03 11:00+00"));
  r.filter((x) => x.tipo === "fora_de_horario").length === 0
    ? ok("sem horário declarado não há aviso — o silêncio não quer dizer 'não trabalha'")
    : mau("avisou 'fora de horário' a quem não tem horário nenhum declarado");
}

await db.exec(`
  -- Segunda a quinta, 9h às 18h. Não trabalha à sexta nem ao fim de semana.
  INSERT INTO public.resource_availability_rules
    (resource_id, day_of_week, start_time, end_time, is_available)
  VALUES
    ('${REC_TECNICO}', 1, '09:00', '18:00', true),
    ('${REC_TECNICO}', 2, '09:00', '18:00', true),
    ('${REC_TECNICO}', 3, '09:00', '18:00', true),
    ('${REC_TECNICO}', 4, '09:00', '18:00', true);
`);
{
  // 2026-10-07 é uma quarta-feira.
  const r = await como(AUTH.gestor,
    disponibilidade(TECNICO, "2026-10-07 10:00+00", "2026-10-07 11:00+00"));
  r.filter((x) => x.tipo === "fora_de_horario").length === 0
    ? ok("uma quarta às 10h está dentro do horário")
    : mau("avisou fora de horário num dia e hora que estão no horário");
}
{
  // 2026-10-09 é uma sexta-feira, e ele não trabalha às sextas.
  const r = await como(AUTH.gestor,
    disponibilidade(TECNICO, "2026-10-09 10:00+00", "2026-10-09 11:00+00"));
  r.filter((x) => x.tipo === "fora_de_horario").length === 1
    ? ok("uma sexta avisa — ele não trabalha às sextas")
    : mau(`sexta-feira: ${JSON.stringify(r)}`);
}
{
  // Quarta, mas às 20h.
  const r = await como(AUTH.gestor,
    disponibilidade(TECNICO, "2026-10-07 20:00+00", "2026-10-07 21:00+00"));
  r.filter((x) => x.tipo === "fora_de_horario").length === 1
    ? ok("uma quarta às 20h avisa — está fora das horas dele")
    : mau(`quarta às 20h: ${JSON.stringify(r)}`);
}

/* ── Feriados ──────────────────────────────────────────────────────────── */

console.log("\n─── feriados ────────────────────────────");
await db.exec(`
  INSERT INTO public.schedule_holidays (country_code, organization_id, name, holiday_date)
    VALUES ('PT', NULL, 'Natal', '2026-12-25');
`);
{
  const r = await como(AUTH.gestor,
    disponibilidade(TECNICO, "2026-12-25 10:00+00", "2026-12-25 11:00+00"));
  const f = r.filter((x) => x.tipo === "feriado");
  f.length === 1 && f[0].detalhe === "Natal"
    ? ok("o feriado aparece, com o nome")
    : mau(`feriados: ${JSON.stringify(r)}`);
}
{
  // O gestor não está na agenda do CRM — mas um feriado é feriado para todos.
  const r = await como(AUTH.gestor,
    disponibilidade(GESTOR, "2026-12-25 10:00+00", "2026-12-25 11:00+00"));
  r.filter((x) => x.tipo === "feriado").length === 1
    ? ok("e aparece mesmo a quem ainda não está na agenda do CRM")
    : mau("quem não tem recurso de agenda deixou de ver os feriados");
}

/* ── O que não se pode sondar ──────────────────────────────────────────── */

console.log("\n─── o que não se pode sondar ────────────");
{
  const r = await como(AUTH.gestor,
    `SELECT tipo FROM public.ops_disponibilidade(
       '${ESTRANHO}','${ORG}','2026-09-16 10:00+00'::timestamptz,
       '2026-09-16 11:00+00'::timestamptz)`);
  r.length === 0
    ? ok("a agenda de quem não é da equipa de Operações não se lê por aqui")
    : mau(`leu ${r.length} linhas de alguém de fora da equipa`);
}
{
  let recusou = false;
  try {
    await como(AUTH.gestor,
      `SELECT tipo FROM public.ops_disponibilidade(
         '${TECNICO}','${ORG2}','2026-09-16 10:00+00'::timestamptz,
         '2026-09-16 11:00+00'::timestamptz)`);
  } catch (e) {
    recusou = e.message.includes("Sem acesso");
    await db.exec("ROLLBACK").catch(() => {});
  }
  recusou
    ? ok("e a de outra organização é recusada, com mensagem")
    : mau("deu para perguntar pela agenda de outra organização");
}

/* ── O agendamento traz os avisos ──────────────────────────────────────── */

console.log("\n─── ao marcar a visita ──────────────────");
const ORDEM = "0f000000-0000-0000-0000-000000000001";
await db.exec(`
  INSERT INTO public.ops_ordem
    (id, organization_id, codigo, origem, estado, cliente_id, titulo, responsavel_id)
  VALUES ('${ORDEM}', '${ORG}', 'OT-A1', 'corretiva', 'agendada', '${CLI}',
          'Portao', '${TECNICO}');
`);
{
  const r = await como(AUTH.gestor,
    `SELECT public.rpc_ops_agendar_ordem(
       '${ORDEM}', '2026-09-16 10:00+00'::timestamptz, NULL, NULL) AS r`);
  const avisos = r[0]?.r?.avisos ?? [];
  Array.isArray(avisos) && avisos.some((a) => a.tipo === "ausente")
    ? ok("marcar durante as férias dele avisa quem coordena")
    : mau(`o agendamento não trouxe o aviso: ${JSON.stringify(r[0]?.r)}`);

  const e = await um(`SELECT agendada_para FROM public.ops_ordem WHERE id = '${ORDEM}'`);
  e.agendada_para
    ? ok("e a data fica marcada na mesma — o aviso informa, não impede")
    : mau("o aviso impediu a marcação, e não devia");
}
{
  const ev = await um(`
    SELECT depois FROM public.ops_evento
     WHERE entidade_id = '${ORDEM}' AND tipo = 'agendada'
     ORDER BY criado_em DESC LIMIT 1`);
  Number(ev?.depois?.avisos ?? 0) >= 1
    ? ok("fica escrito no histórico que houve avisos ao marcar")
    : mau(`o evento não registou os avisos: ${JSON.stringify(ev?.depois)}`);
}

/* ── A equipa toda, num pedido só ──────────────────────────────── */

console.log("\n─── a agenda do dia, para o ecrã ───────");
{
  // 25 de dezembro: feriado para todos, e o técnico não trabalha às sextas
  // (2026-12-25 é uma sexta-feira).
  const r = await como(AUTH.gestor,
    `SELECT utilizador_id, tipo FROM public.rpc_ops_agenda_do_dia('${ORG}', '2026-12-25')`);

  const doTecnico = r.filter((x) => x.utilizador_id === TECNICO).map((x) => x.tipo).sort();
  const daGestora = r.filter((x) => x.utilizador_id === GESTOR).map((x) => x.tipo);

  doTecnico.join(",") === "feriado,fora_de_horario"
    ? ok("num pedido só vem o feriado E o fora de horário do técnico")
    : mau(`o técnico veio com: ${doTecnico.join(", ") || "(nada)"}`);

  daGestora.includes("feriado")
    ? ok("e o feriado da gestora, que nem está na agenda do CRM")
    : mau("a gestora não veio no resultado");

  r.every((x) => x.utilizador_id)
    ? ok("cada linha diz de quem é — sem isso não dá para desenhar colunas")
    : mau("veio uma linha sem utilizador_id");
}

{
  let recusou = false;
  try {
    await como(AUTH.tecnico, `SELECT * FROM public.rpc_ops_agenda_do_dia('${ORG}', '2026-12-25')`);
  } catch (e) {
    recusou = e.message.includes("Só quem coordena");
    await db.exec("ROLLBACK").catch(() => {});
  }
  recusou
    ? ok("um técnico não vê a agenda da equipa toda")
    : mau("um técnico conseguiu ler a agenda de toda a gente");
}

/* ── Nada foi acrescentado ao CRM ──────────────────────────────────────── */

console.log("\n─── o que NÃO se tocou ──────────────────");
{
  const n = await um(`
    SELECT (SELECT count(*) FROM public.resource_time_off)
         + (SELECT count(*) FROM public.resource_availability_rules)
         + (SELECT count(*) FROM public.schedule_holidays)
         + (SELECT count(*) FROM public.schedule_resources) AS n`);
  Number(n.n) === 2 + 4 + 1 + 2
    ? ok("as tabelas de agenda do CRM ficaram exatamente como estavam")
    : mau(`${n.n} linhas nas tabelas do CRM, esperava 9`);

  const fk = await q(`
    SELECT c.conname FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class f ON f.oid = c.confrelid
     WHERE c.contype = 'f' AND t.relname LIKE 'ops\\_%' AND f.relname NOT LIKE 'ops\\_%'`);
  fk.length === 0
    ? ok("nenhuma chave estrangeira para fora do módulo")
    : mau(`${fk.length} FK para fora`);
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ a agenda diz a verdade, e não diz mais do que deve");
