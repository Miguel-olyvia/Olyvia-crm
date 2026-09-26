/**
 * Prova que um aviso chega — e, mais importante, que chega ao sítio certo.
 *
 * Este é o único ficheiro do módulo que escreve numa tabela do CRM, por isso
 * é o que mais precisa de teste. O que se verifica:
 *
 *   · a linha nasce com `kind = 'notification'`. O default da coluna é
 *     'alert', e o sino do CRM filtra por 'notification' — com o default, o
 *     aviso entra na base, não dá erro, e nunca aparece a ninguém;
 *   · `user_id` é o id de autenticação, não o de `anew_users`;
 *   · `entity_id` leva sempre a ordem, senão a limpeza de duplicados do CRM
 *     mata os avisos uns aos outros;
 *   · `entity_type` NÃO é nenhum dos que `cleanup_orphan_notifications()`
 *     conhece — se fosse, o CRM resolvia-os sozinho;
 *   · atribuir avisa quem recebe, não quem atribui, e só quando muda;
 *   · uma não conformidade avisa quem coordena;
 *   · o mesmo aviso não se repete enquanto estiver por ler;
 *   · e nada disto pode fazer falhar o trabalho que o gerou.
 *
 *     npm run validar-notificacoes
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
const CLI = "22222222-2222-2222-2222-222222222222";
const GESTOR = "aaaa0000-0000-0000-0000-00000000000a";
const TECNICO = "bbbb0000-0000-0000-0000-00000000000b";
const OUTRO = "cccc0000-0000-0000-0000-00000000000c";
/** Existe em Operações, mas nunca fez login. Não tem sino. */
const SEM_LOGIN = "dddd0000-0000-0000-0000-0000000000dd";
const AUTH = {
  gestor: "aaaa1111-0000-0000-0000-00000000000a",
  tecnico: "bbbb1111-0000-0000-0000-00000000000b",
  outro: "cccc1111-0000-0000-0000-00000000000c",
};

await db.exec(STUBS_CRM);
await db.exec(`
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

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}', 'Org');
  INSERT INTO public.anew_entities (id, display_name)
    VALUES ('77777777-7777-7777-7777-777777777777','Cliente');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('${CLI}', '${ORG}', '77777777-7777-7777-7777-777777777777');

  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${GESTOR}',    '${AUTH.gestor}',  'Gestora',   'g@x.pt'),
    ('${TECNICO}',   '${AUTH.tecnico}', 'Tecnico',   't@x.pt'),
    ('${OUTRO}',     '${AUTH.outro}',   'Outro',     'o@x.pt'),
    ('${SEM_LOGIN}', NULL,              'Sem login', 's@x.pt');
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('${AUTH.gestor}','g@x.pt',now()),
    ('${AUTH.tecnico}','t@x.pt',now()),
    ('${AUTH.outro}','o@x.pt',now());
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ('${AUTH.gestor}','${GESTOR}'),
    ('${AUTH.tecnico}','${TECNICO}'),
    ('${AUTH.outro}','${OUTRO}');
`);

await db.exec(ler("schema.sql"));
await db.exec(ler("permissoes.sql"));
await db.exec(ler("notificacoes.sql"));
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
    ('${TECNICO}','${ORG}','eeee0000-0000-0000-0000-00000000000e','active'),
    ('${OUTRO}','${ORG}','eeee0000-0000-0000-0000-00000000000e','active');

  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES
    ('${ORG}','${GESTOR}','gestor'),
    ('${ORG}','${TECNICO}','tecnico'),
    ('${ORG}','${OUTRO}','tecnico'),
    ('${ORG}','${SEM_LOGIN}','tecnico');

  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth, public TO authenticated;
`);

async function como(authUid, sql) {
  await db.exec(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = '${authUid}';
    ${sql}
    COMMIT;
  `);
}

async function deveCorrer(nome, authUid, sql) {
  try { await como(authUid, sql); ok(nome); }
  catch (e) { await db.exec("ROLLBACK").catch(() => {}); mau(`${nome} — ${e.message.split("\n")[0]}`); }
}

async function deveSerRecusado(nome, authUid, sql, trecho) {
  try {
    await como(authUid, sql);
    mau(`${nome} — PASSOU, e devia ter sido recusado`);
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    if (!trecho || e.message.includes(trecho)) ok(nome);
    else mau(`${nome} — recusado com a mensagem errada: ${e.message.split("\n")[0]}`);
  }
}

/** Os avisos por ler de uma pessoa, os que o sino do CRM mostraria. */
const sino = (authUid, tipo = null) => q(`
  SELECT type, title, message, link, kind, entity_type, entity_id, priority
    FROM public.notifications
   WHERE user_id = '${authUid}'
     AND kind = 'notification'
     AND is_read = false AND is_dismissed = false AND is_resolved = false
     ${tipo ? `AND type = '${tipo}'` : ""}
   ORDER BY created_at`);

/* ── O cenário ─────────────────────────────────────────────────────────── */

const ORDEM = "0d0e0000-0000-0000-0000-0000000000e1";
await db.exec(`
  INSERT INTO public.ops_ordem
    (id, organization_id, codigo, origem, estado, prioridade, cliente_id,
     titulo, agendada_para, criada_por)
  VALUES
    ('${ORDEM}', '${ORG}', 'OT-2026-00042', 'corretiva', 'agendada', 'alta',
     '${CLI}', 'Portão a raspar', now() + interval '2 hours', '${GESTOR}');
`);

console.log("\n─── uma ordem atribuída ─────────────────");

await deveCorrer(
  "a gestora atribui a ordem ao técnico",
  AUTH.gestor,
  `SELECT public.rpc_ops_atribuir_ordem('${ORDEM}', '${TECNICO}');`
);

{
  const linhas = await sino(AUTH.tecnico, "operacoes_ordem_atribuida");
  if (linhas.length !== 1) {
    mau(`o técnico devia ter 1 aviso, tem ${linhas.length}`);
  } else {
    const n = linhas[0];
    ok(`o técnico foi avisado: "${n.title}"`);
    n.kind === "notification"
      ? ok("kind = 'notification' — é o que o sino do CRM mostra")
      : mau(`kind = '${n.kind}': entra na base e nunca aparece a ninguém`);
    n.link === "/operacao/ordens/OT-2026-00042"
      ? ok("o link leva à ordem, com o código que se diz ao telefone")
      : mau(`link errado: ${n.link}`);
    n.entity_id === ORDEM
      ? ok("entity_id leva a ordem — a limpeza de duplicados do CRM precisa dele")
      : mau(`entity_id = ${n.entity_id}, devia ser a ordem`);
    n.priority === "high"
      ? ok("prioridade alta na ordem, prioridade alta no sino")
      : mau(`prioridade ${n.priority}, esperava high`);
    ["contact", "client", "proposal", "contract", "quote", "deal"].includes(n.entity_type)
      ? mau(`entity_type '${n.entity_type}' é do CRM — cleanup_orphan_notifications() apagava-o`)
      : ok(`entity_type '${n.entity_type}' não é nenhum dos que o CRM limpa sozinho`);
  }
}

{
  const g = await sino(AUTH.gestor);
  g.length === 0
    ? ok("quem atribuiu não recebe aviso do que acabou de fazer")
    : mau(`a gestora recebeu ${g.length} aviso(s) do seu próprio clique`);
}

await deveCorrer(
  "atribuir à mesma pessoa outra vez",
  AUTH.gestor,
  `SELECT public.rpc_ops_atribuir_ordem('${ORDEM}', '${TECNICO}');`
);
{
  const linhas = await sino(AUTH.tecnico, "operacoes_ordem_atribuida");
  linhas.length === 1
    ? ok("reatribuir à mesma pessoa não toca o sino outra vez")
    : mau(`${linhas.length} avisos — o mesmo trabalho avisou duas vezes`);
}

await deveCorrer(
  "a ordem passa para outro técnico",
  AUTH.gestor,
  `SELECT public.rpc_ops_atribuir_ordem('${ORDEM}', '${OUTRO}');`
);
{
  const linhas = await sino(AUTH.outro, "operacoes_ordem_atribuida");
  linhas.length === 1
    ? ok("quem passou a ser o responsável foi avisado")
    : mau(`o novo responsável tem ${linhas.length} avisos`);
}

/* ── Quem não tem login ─────────────────────────────────────────────────── */

console.log("\n─── quem não entra na aplicação ─────────");
{
  const r = await um(`
    SELECT public.ops_notificar(
      '${ORG}', '${SEM_LOGIN}', 'operacoes_teste', 'Olá', 'Mensagem') AS enviou`);
  r.enviou === false
    ? ok("uma pessoa sem login não gera linha — e não rebenta")
    : mau("escreveu um aviso para quem não tem onde o ler");
}

/* ── Não repetir ────────────────────────────────────────────────────────── */

console.log("\n─── o mesmo aviso duas vezes ────────────");
{
  const a = await um(`SELECT public.ops_notificar('${ORG}','${TECNICO}',
    'operacoes_repetido','Título','Mensagem',NULL,'${ORDEM}') AS enviou`);
  const b = await um(`SELECT public.ops_notificar('${ORG}','${TECNICO}',
    'operacoes_repetido','Título','Mensagem',NULL,'${ORDEM}') AS enviou`);
  a.enviou === true && b.enviou === false
    ? ok("o segundo aviso igual não se escreve enquanto o primeiro estiver por ler")
    : mau(`primeiro=${a.enviou}, segundo=${b.enviou}`);

  await db.exec(`UPDATE public.notifications SET is_read = true
                  WHERE type = 'operacoes_repetido'`);
  const c = await um(`SELECT public.ops_notificar('${ORG}','${TECNICO}',
    'operacoes_repetido','Título','Mensagem',NULL,'${ORDEM}') AS enviou`);
  c.enviou === true
    ? ok("depois de lido, o mesmo aviso pode voltar")
    : mau("um aviso já lido nunca mais volta a ser enviado");
}

/* ── Atrasos ────────────────────────────────────────────────────────────── */

console.log("\n─── o que se perde em silêncio ──────────");
await db.exec(`
  UPDATE public.ops_ordem SET agendada_para = now() - interval '3 hours'
   WHERE id = '${ORDEM}';
`);
{
  const n = await um(`SELECT public.ops_avisar_atrasos() AS n`);
  const linhas = await sino(AUTH.outro, "operacoes_ordem_atrasada");
  linhas.length === 1
    ? ok(`a ordem passou da hora e o responsável soube (${n.n} aviso(s) no total)`)
    : mau(`o responsável tem ${linhas.length} avisos de atraso`);

  await um(`SELECT public.ops_avisar_atrasos() AS n`);
  const outra = await sino(AUTH.outro, "operacoes_ordem_atrasada");
  outra.length === 1
    ? ok("correr a verificação outra vez não enche o sino")
    : mau(`${outra.length} avisos depois de duas passagens`);
}

const PAUSADA = "0d0e0000-0000-0000-0000-0000000000e2";
await db.exec(`
  INSERT INTO public.ops_ordem
    (id, organization_id, codigo, origem, estado, cliente_id, titulo,
     responsavel_id, pausa_motivo, pausa_retoma_prevista)
  VALUES
    ('${PAUSADA}', '${ORG}', 'OT-2026-00043', 'corretiva', 'pausada', '${CLI}',
     'À espera da peça', '${TECNICO}', 'falta material',
     now() - interval '2 days');
`);
{
  await um(`SELECT public.ops_avisar_atrasos() AS n`);
  const t = await sino(AUTH.tecnico, "operacoes_pausa_expirada");
  const g = await sino(AUTH.gestor, "operacoes_pausa_expirada");
  t.length === 1
    ? ok("a pausa que expirou avisou quem tem a ordem")
    : mau(`o responsável tem ${t.length} avisos de pausa expirada`);
  g.length === 1
    ? ok("e avisou também quem coordena")
    : mau(`a gestora tem ${g.length} avisos de pausa expirada`);
}

/* ── Uma não conformidade ───────────────────────────────────────────────── */

console.log("\n─── trabalho que nasce de uma avaria ────");
const ALVO = "0a0a0000-0000-0000-0000-0000000000a1";
const TAREFA = "0a0a0000-0000-0000-0000-0000000000a2";
const LOCAL = "0a0a0000-0000-0000-0000-0000000000a3";
await db.exec(`
  INSERT INTO public.ops_local (id, organization_id, cliente_id, codigo, nome)
    VALUES ('${LOCAL}', '${ORG}', '${CLI}', 'LOC-1', 'Garagem');
  INSERT INTO public.ops_ordem_alvo (id, ordem_id, local_id)
    VALUES ('${ALVO}', '${ORDEM}', '${LOCAL}');
  INSERT INTO public.ops_ordem_tarefa
    (id, ordem_id, ordem_alvo_id, posicao, nome, tipo, obrigatoria)
  VALUES
    ('${TAREFA}', '${ORDEM}', '${ALVO}', 1, 'Verificar a mola', 'inspecao', true);
`);
{
  const antes = (await sino(AUTH.gestor, "operacoes_corretiva_gerada")).length;
  const cod = await um(`
    SELECT public.ops_criar_corretiva('${TAREFA}', 'A mola está partida.', '${TECNICO}') AS c`);
  const g = await sino(AUTH.gestor, "operacoes_corretiva_gerada");
  g.length === antes + 1
    ? ok(`quem coordena soube da corretiva ${cod.c}: "${g[g.length - 1].title}"`)
    : mau(`a gestora tem ${g.length} avisos de corretiva, esperava ${antes + 1}`);

  const t = await sino(AUTH.tecnico, "operacoes_corretiva_gerada");
  t.length === 0
    ? ok("quem encontrou a avaria não recebe um sino a contar-lhe o que viu")
    : mau(`o técnico recebeu ${t.length} avisos do que ele próprio fez`);
}

/* ── O aviso é acessório, o trabalho não ────────────────────────────────── */

console.log("\n─── se o sino estiver avariado ──────────");
await db.exec(`ALTER TABLE public.notifications RENAME TO notifications_escondida;`);
{
  const ORDEM2 = "0d0e0000-0000-0000-0000-0000000000e3";
  await db.exec(`
    INSERT INTO public.ops_ordem
      (id, organization_id, codigo, origem, estado, cliente_id, titulo, criada_por)
    VALUES ('${ORDEM2}', '${ORG}', 'OT-2026-00044', 'corretiva', 'agendada',
            '${CLI}', 'Sem sino', '${GESTOR}');
  `);
  await deveCorrer(
    "atribuir continua a funcionar sem a tabela de notificações",
    AUTH.gestor,
    `SELECT public.rpc_ops_atribuir_ordem('${ORDEM2}', '${TECNICO}');`
  );
  const r = await um(`SELECT responsavel_id FROM public.ops_ordem WHERE id = '${ORDEM2}'`);
  r.responsavel_id === TECNICO
    ? ok("e a atribuição ficou mesmo feita")
    : mau("a ordem não ficou atribuída");
}
await db.exec(`ALTER TABLE public.notifications_escondida RENAME TO notifications;`);

/* ── Quem pode mandar verificar ─────────────────────────────────────────── */

console.log("\n─── quem manda varrer as ordens ─────────");
await deveCorrer(
  "quem coordena pode pedir a verificação de atrasos",
  AUTH.gestor,
  `SELECT public.rpc_ops_avisar_atrasos();`
);
await deveSerRecusado(
  "um técnico não manda varrer as ordens de toda a gente",
  AUTH.tecnico,
  `SELECT public.rpc_ops_avisar_atrasos();`,
  "Só quem coordena"
);

/* ── Nada foi alterado no CRM ───────────────────────────────────────────── */

console.log("\n─── o que NÃO se tocou ──────────────────");
{
  const n = await um(`
    SELECT count(*)::int AS n FROM public.notifications
     WHERE kind <> 'notification' OR data->>'modulo' IS DISTINCT FROM 'operacoes'`);
  n.n === 0
    ? ok("todas as linhas escritas são nossas, marcadas com modulo=operacoes")
    : mau(`${n.n} linhas sem a marca do módulo`);

  const fk = await q(`
    SELECT c.conname FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class f ON f.oid = c.confrelid
     WHERE c.contype = 'f' AND t.relname LIKE 'ops\\_%' AND f.relname NOT LIKE 'ops\\_%'`);
  fk.length === 0
    ? ok("continua a não haver uma única chave estrangeira para fora do módulo")
    : mau(`${fk.length} FK para fora: ${fk.map((r) => r.conname).join(", ")}`);
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ o aviso chega ao sino certo, uma vez, e nunca trava o trabalho");
