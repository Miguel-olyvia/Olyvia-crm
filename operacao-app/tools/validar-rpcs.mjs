/**
 * Prova que a máquina de estados é imposta NA BASE, e não só no browser.
 *
 * O que interessa aqui não é que as transições legítimas funcionem — isso os
 * testes de domínio já garantem. É que as ilegítimas sejam RECUSADAS mesmo
 * quando quem as tenta fala diretamente com o Postgres, sem passar pela app.
 *
 *     npm run validar-rpcs
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

  -- has_anew_permission A SÉRIO, lendo anew_role_permissions como a do CRM.
  --
  -- O stub devolvia sempre false, e isso tornava este teste inútil sem dar
  -- erro: a RLS bloqueava o UPDATE direto antes de chegar ao trigger, o UPDATE
  -- afetava zero linhas, e o teste concluía que a fechadura funcionava quando
  -- na verdade nunca a tinha experimentado.
  CREATE OR REPLACE FUNCTION public.has_anew_permission(_auth_uid uuid, _permission_code text)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT EXISTS (
      SELECT 1 FROM public.anew_users au
        JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
        JOIN public.anew_role_permissions arp
          ON arp.role_id = am.role_id AND arp.permission_code = _permission_code
       WHERE au.auth_user_id = _auth_uid) $fn$;

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}', 'Org');
  INSERT INTO public.anew_entities (id, display_name) VALUES ('77777777-7777-7777-7777-777777777777','Cliente');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('${CLI}', '${ORG}', '77777777-7777-7777-7777-777777777777');

  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${GESTOR}',  '${AUTH.gestor}',  'Gestora',      'g@x.pt'),
    ('${TECNICO}', '${AUTH.tecnico}', 'Tecnico',      't@x.pt'),
    ('${OUTRO}',   '${AUTH.outro}',   'Outro tecnico','o@x.pt');
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('${AUTH.gestor}','g@x.pt',now()), ('${AUTH.tecnico}','t@x.pt',now()), ('${AUTH.outro}','o@x.pt',now());
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ('${AUTH.gestor}','${GESTOR}'), ('${AUTH.tecnico}','${TECNICO}'), ('${AUTH.outro}','${OUTRO}');
`);

await db.exec(ler("schema.sql"));
await db.exec(ler("permissoes.sql"));
await db.exec(ler("rpcs.sql"));

// Um papel com TODAS as permissões de Operações, e os três utilizadores lá
// dentro. É o cenário mais exigente para a fechadura: quem tenta o UPDATE
// direto tem `operations.orders.edit`, portanto a RLS deixa-o passar e o
// trigger é a única coisa entre ele e o estado da ordem.
await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name)
    VALUES ('dddd0000-0000-0000-0000-00000000000d', '${ORG}', 'Operacoes');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT 'dddd0000-0000-0000-0000-00000000000d', code
      FROM public.anew_permissions WHERE category = 'operations';
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${GESTOR}','${ORG}','dddd0000-0000-0000-0000-00000000000d','active'),
    ('${TECNICO}','${ORG}','dddd0000-0000-0000-0000-00000000000d','active'),
    ('${OUTRO}','${ORG}','dddd0000-0000-0000-0000-00000000000d','active');

  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao, custo_hora) VALUES
    ('${ORG}','${GESTOR}','gestor', 25.00),
    ('${ORG}','${TECNICO}','tecnico', 18.50),
    ('${ORG}','${OUTRO}','tecnico', 15.00);

  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth, public TO authenticated;
`);

// Antes de testar a fechadura, confirmar que a RLS DEIXA passar — senão o
// teste volta a medir a coisa errada.
{
  const p = await um(`SELECT public.has_anew_permission('${AUTH.gestor}','operations.orders.edit') AS pode`);
  p.pode ? ok("o cenário é o certo: a RLS deixa o gestor fazer UPDATE")
         : mau("a RLS bloqueia o UPDATE — o teste da fechadura seria inconclusivo");
}

/** Corre algo como um utilizador autenticado concreto. */
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

async function novaOrdem(codigo, estado, responsavel = null) {
  await db.exec(`
    INSERT INTO public.ops_ordem (organization_id, codigo, origem, estado, cliente_id, titulo, responsavel_id)
    VALUES ('${ORG}','${codigo}','corretiva','${estado}','${CLI}','Teste',
            ${responsavel ? `'${responsavel}'` : "NULL"});
  `);
  return (await um(`SELECT id FROM public.ops_ordem WHERE codigo = '${codigo}'`)).id;
}

const rpc = (id, t, motivo = null, retoma = null) =>
  `SELECT public.rpc_ops_transitar_ordem('${id}','${t}',` +
  `${motivo ? `'${motivo}'` : "NULL"},${retoma ? `'${retoma}'::timestamptz` : "NULL"});`;

// ── A fechadura ──────────────────────────────────────────────────────────
console.log("\n─── UPDATE direto ao estado ─────────────");
{
  const id = await novaOrdem("OT-1", "agendada", TECNICO);
  await deveSerRecusado(
    "um UPDATE direto que mude o estado é recusado pelo trigger",
    AUTH.gestor,
    `UPDATE public.ops_ordem SET estado='confirmada' WHERE id='${id}';`,
    "só muda através de rpc_ops_transitar_ordem"
  );
  await deveCorrer(
    "editar o título por UPDATE direto continua a funcionar",
    AUTH.gestor,
    `UPDATE public.ops_ordem SET titulo='Outro titulo' WHERE id='${id}';`
  );
  const e = await um(`SELECT estado FROM public.ops_ordem WHERE id='${id}'`);
  e.estado === "agendada" ? ok("o estado ficou intacto") : mau(`o estado passou a ${e.estado}`);
}

// ── As guardas ───────────────────────────────────────────────────────────
console.log("\n─── quem pode fazer o quê ───────────────");
{
  const id = await novaOrdem("OT-2", "agendada", TECNICO);
  await deveSerRecusado("o técnico NÃO atribuído não inicia a ordem de outro", AUTH.outro,
    rpc(id, "iniciar"), "Só quem está na ordem a pode iniciar");
  await deveCorrer("o técnico atribuído inicia", AUTH.tecnico, rpc(id, "iniciar"));

  await deveSerRecusado("pausar sem motivo é recusado", AUTH.tecnico,
    rpc(id, "pausar"), "Pausar exige um motivo");
  await deveSerRecusado("pausar sem retoma prevista é recusado", AUTH.tecnico,
    rpc(id, "pausar", "sem material"), "retoma prevista");
  await deveCorrer("pausar com motivo e retoma", AUTH.tecnico,
    rpc(id, "pausar", "sem material", "2026-09-10T09:00:00Z"));
}

{
  const id = await novaOrdem("OT-3", "por_aprovar");
  await deveSerRecusado("o técnico não aprova", AUTH.tecnico, rpc(id, "aprovar"), "Sem permissão");
  await deveCorrer("o gestor aprova", AUTH.gestor, rpc(id, "aprovar"));
  await deveSerRecusado("não se aprova duas vezes", AUTH.gestor, rpc(id, "aprovar"),
    "Só se aprova uma ordem por aprovar");
}

// ── Tarefas obrigatórias ─────────────────────────────────────────────────
console.log("\n─── fechar com tarefas por responder ────");
{
  const id = await novaOrdem("OT-4", "agendada", TECNICO);
  await db.exec(`
    INSERT INTO public.ops_ordem_tarefa (ordem_id, nome, obrigatoria, estado) VALUES
      ('${id}','Verificar pressao', true, 'pendente'),
      ('${id}','Verificar selo',    true, 'pendente'),
      ('${id}','Foto',              false,'pendente');
  `);
  await deveCorrer("iniciar", AUTH.tecnico, rpc(id, "iniciar"));
  await deveSerRecusado("não fecha com 2 obrigatórias pendentes", AUTH.tecnico,
    rpc(id, "fechar"), "Faltam responder a 2 tarefas obrigatórias");

  await db.exec(`UPDATE public.ops_ordem_tarefa SET estado='feita' WHERE ordem_id='${id}' AND nome='Verificar pressao';`);
  await deveSerRecusado("nem com 1", AUTH.tecnico, rpc(id, "fechar"),
    "Falta responder a 1 tarefa obrigatória");

  await db.exec(`UPDATE public.ops_ordem_tarefa SET estado='nao_aplicavel' WHERE ordem_id='${id}' AND nome='Verificar selo';`);
  await deveCorrer("fecha quando as obrigatórias têm resposta (a opcional pode ficar)",
    AUTH.tecnico, rpc(id, "fechar"));
}

// ── Sessões e custo ──────────────────────────────────────────────────────
console.log("\n─── sessões e custo de mão de obra ──────");
{
  const id = await novaOrdem("OT-5", "agendada", TECNICO);
  await deveCorrer("iniciar abre sessão", AUTH.tecnico, rpc(id, "iniciar"));
  const abertas = await um(`SELECT count(*)::int n FROM public.ops_sessao_trabalho WHERE ordem_id='${id}' AND fim IS NULL`);
  abertas.n === 1 ? ok("ficou 1 sessão aberta") : mau(`esperava 1 sessão aberta, há ${abertas.n}`);

  // duas horas de trabalho, para o custo dar um número verificável
  await db.exec(`UPDATE public.ops_sessao_trabalho SET inicio = now() - interval '2 hours' WHERE ordem_id='${id}';`);
  await deveCorrer("fechar", AUTH.tecnico, rpc(id, "fechar"));

  const semAbertas = await um(`SELECT count(*)::int n FROM public.ops_sessao_trabalho WHERE ordem_id='${id}' AND fim IS NULL`);
  semAbertas.n === 0 ? ok("fechar encerrou a sessão") : mau("ficou uma sessão aberta depois de fechar");

  const c = await um(`SELECT total FROM public.ops_custo WHERE ordem_id='${id}' AND tipo='mao_obra'`);
  Number(c?.total) === 37 ? ok("2h a 18,50 €/h dá 37,00 € de mão de obra")
                          : mau(`esperava 37,00 €, deu ${c?.total}`);

  // reabrir e voltar a fechar não pode duplicar a linha de custo
  await deveCorrer("reabrir", AUTH.gestor, rpc(id, "reabrir"));
  await deveCorrer("fechar outra vez", AUTH.gestor, rpc(id, "fechar"));
  const linhas = await um(`SELECT count(*)::int n FROM public.ops_custo WHERE ordem_id='${id}' AND tipo='mao_obra'`);
  linhas.n === 1 ? ok("reabrir e fechar NÃO duplica a linha de custo")
                 : mau(`ficaram ${linhas.n} linhas de custo`);
}

// ── Histórico ────────────────────────────────────────────────────────────
console.log("\n─── histórico ───────────────────────────");
{
  const n = await um(`SELECT count(*)::int n FROM public.ops_evento WHERE entidade='ordem'`);
  n.n > 0 ? ok(`${n.n} eventos registados, com autor e antes/depois`)
          : mau("nenhum evento foi registado");

  const rejeitadas = await um(`
    SELECT count(*)::int n FROM public.ops_evento
     WHERE tipo = 'aprovar' AND entidade_id = (SELECT id FROM public.ops_ordem WHERE codigo='OT-3')`);
  rejeitadas.n === 1
    ? ok("a segunda tentativa de aprovar não deixou evento — a transação reverteu")
    : mau(`esperava 1 evento de aprovação, há ${rejeitadas.n}`);
}

console.log("");
if (falhas.length) {
  console.error(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ a máquina de estados é imposta na base, não só no browser");
