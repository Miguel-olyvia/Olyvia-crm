/**
 * Prova que se consegue montar uma operação do zero, sem escrever SQL.
 *
 * Este é o teste do caminho completo: um gestor entra numa organização vazia
 * e deixa-a a funcionar — local, equipamento, medição, checklist, plano — e
 * no fim uma ordem preventiva nasce com as tarefas e as leituras certas.
 *
 * Corre TUDO como utilizador autenticado, pelas mesmas políticas que a app
 * usa. É a única maneira de apanhar uma tabela com RLS ligada e sem política:
 * como superutilizador, essa tabela funciona na mesma.
 *
 *     npm run validar-config
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
const um = async (sql) => (await db.query(sql)).rows[0];

const falhas = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mau = (m) => { console.log(`  ✗ ${m}`); falhas.push(m); };

const ORG = "11111111-1111-1111-1111-111111111111";
const CLI = "22222222-2222-2222-2222-222222222222";
const GESTOR = "aaaa0000-0000-0000-0000-00000000000a";
const TECNICO = "bbbb0000-0000-0000-0000-00000000000b";
const FORA = "dddd0000-0000-0000-0000-00000000000f";
const AUTH = {
  gestor: "aaaa1111-0000-0000-0000-00000000000a",
  tecnico: "bbbb1111-0000-0000-0000-00000000000b",
};

await db.exec(STUBS_CRM);
await db.exec(`
  CREATE TABLE public.auth_to_business_user_map (auth_user_id uuid, business_user_id uuid);
  CREATE OR REPLACE FUNCTION public.current_business_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT m.business_user_id FROM public.auth_to_business_user_map m
     WHERE m.auth_user_id = auth.uid() LIMIT 1 $fn$;

  CREATE OR REPLACE FUNCTION public.get_user_visible_org_ids(_auth_uid uuid)
    RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT am.organization_id FROM public.anew_users au
      JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
     WHERE au.auth_user_id = _auth_uid $fn$;

  CREATE OR REPLACE FUNCTION public.has_anew_permission(_auth_uid uuid, _permission_code text)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT EXISTS (
      SELECT 1 FROM public.anew_users au
        JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
        JOIN public.anew_role_permissions arp
          ON arp.role_id = am.role_id AND arp.permission_code = _permission_code
       WHERE au.auth_user_id = _auth_uid) $fn$;

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}','Org');
  INSERT INTO public.anew_entities (id, display_name)
    VALUES ('77777777-7777-7777-7777-777777777777','Cliente');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('${CLI}','${ORG}','77777777-7777-7777-7777-777777777777');

  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${GESTOR}','${AUTH.gestor}','Gestora','g@x.pt'),
    ('${TECNICO}','${AUTH.tecnico}','Tecnico','t@x.pt'),
    ('${FORA}',NULL,'Alguem de fora','f@x.pt');
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('${AUTH.gestor}','g@x.pt',now()),('${AUTH.tecnico}','t@x.pt',now());
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ('${AUTH.gestor}','${GESTOR}'),('${AUTH.tecnico}','${TECNICO}');
`);

for (const f of ["schema.sql","permissoes.sql","rpcs.sql","rpcs-tarefas.sql","planos.sql",
                 "correcoes-modelo.sql","medicoes.sql","despacho.sql","orcamentos.sql",
                 "anexos.sql","planos-crud.sql","config.sql"]) {
  await db.exec(ler(f));
}

await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name) VALUES
    ('dddd0000-0000-0000-0000-00000000000d','${ORG}','Operacoes'),
    ('dddd0000-0000-0000-0000-00000000000e','${ORG}','Tecnicos');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT 'dddd0000-0000-0000-0000-00000000000d', code
      FROM public.anew_permissions WHERE category = 'operations';
  -- O técnico executa e vê; não configura nada.
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('dddd0000-0000-0000-0000-00000000000e','operations.view'),
    ('dddd0000-0000-0000-0000-00000000000e','operations.orders.view'),
    ('dddd0000-0000-0000-0000-00000000000e','operations.orders.execute'),
    ('dddd0000-0000-0000-0000-00000000000e','operations.locations.view');

  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${GESTOR}','${ORG}','dddd0000-0000-0000-0000-00000000000d','active'),
    ('${TECNICO}','${ORG}','dddd0000-0000-0000-0000-00000000000e','active');

  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES
    ('${ORG}','${GESTOR}','gestor');

  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth, public TO authenticated;
  REVOKE INSERT, UPDATE, DELETE ON public.ops_anexo FROM authenticated;
`);

/** Corre como um utilizador autenticado e devolve a última linha. */
async function como(authUid, sql) {
  const r = await db.exec(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = '${authUid}';
    ${sql}
    COMMIT;
  `);
  const linhas = r.flatMap((x) => x.rows ?? []);
  return linhas.at(-1);
}

async function json(authUid, sql) {
  const linha = await como(authUid, sql);
  const bruto = Object.values(linha ?? {})[0];
  return typeof bruto === "string" ? JSON.parse(bruto) : bruto;
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
    else mau(`${nome} — mensagem errada: ${e.message.split("\n")[0]}`);
  }
}

/* ── 1. Locais e equipamentos ───────────────────────────────────────────── */
console.log("\n─── montar o sítio ──────────────────────");

let LOC, CAT, ATIVO;
{
  // Esta devolve texto, não jsonb — por isso não passa pelo `json()`.
  const cod = Object.values(
    (await como(AUTH.gestor, `SELECT public.rpc_ops_proximo_codigo('${ORG}','LOC');`)) ?? {}
  )[0];
  typeof cod === "string" && cod.includes("LOC")
    ? ok(`o código sai automático: ${cod}`)
    : mau(`código estranho: ${JSON.stringify(cod)}`);

  await deveCorrer(
    "o gestor cria um local",
    AUTH.gestor,
    `INSERT INTO public.ops_local (organization_id, cliente_id, codigo, nome, tipo)
       VALUES ('${ORG}','${CLI}','${cod}','Torre A — Garagem','espaco');`
  );
  LOC = (await um(`SELECT id FROM public.ops_local WHERE codigo='${cod}'`)).id;

  await deveCorrer(
    "e uma categoria de equipamento",
    AUTH.gestor,
    `INSERT INTO public.ops_categoria_ativo (organization_id, codigo, nome)
       VALUES ('${ORG}','CAT-EXT','Extintor');`
  );
  CAT = (await um(`SELECT id FROM public.ops_categoria_ativo WHERE codigo='CAT-EXT'`)).id;

  await deveCorrer(
    "e um extintor lá dentro",
    AUTH.gestor,
    `INSERT INTO public.ops_ativo (organization_id, local_id, categoria_id, codigo, nome)
       VALUES ('${ORG}','${LOC}','${CAT}','AT-0001','Extintor A1');`
  );
  ATIVO = (await um(`SELECT id FROM public.ops_ativo WHERE codigo='AT-0001'`)).id;

  await deveSerRecusado(
    "um técnico não cria locais — só os vê",
    AUTH.tecnico,
    `INSERT INTO public.ops_local (organization_id, cliente_id, codigo, nome, tipo)
       VALUES ('${ORG}','${CLI}','LOC-PIRATA','Sitio do tecnico','espaco');`,
    "row-level security"
  );

  const n = await um(`SELECT count(*)::int AS n FROM public.ops_local`);
  n.n === 1 ? ok("ficou um local, não dois") : mau(`${n.n} locais`);
}

/* ── 2. Medições ────────────────────────────────────────────────────────── */
console.log("\n─── as medições ─────────────────────────");

let MED_GAMA, MED_ESCOLHA;
{
  const r = await json(AUTH.gestor, `
    SELECT public.rpc_ops_gravar_medicao(
      NULL, '${ORG}', 'Pressao do manometro', 'gama', '${CAT}', 'bar', 10, 15);`);
  r?.ok ? ok("gravou a gama 10–15 bar") : mau(`não gravou: ${JSON.stringify(r)}`);
  MED_GAMA = r.id;

  const e = await json(AUTH.gestor, `
    SELECT public.rpc_ops_gravar_medicao(
      NULL, '${ORG}', 'Estado do selo', 'escolha', '${CAT}', NULL, NULL, NULL,
      '[{"nome":"Conforme"},
        {"nome":"Nao conforme","e_nao_conforme":true,"cria_corretiva":true},
        {"nome":"Ilegivel","e_nao_conforme":true}]'::jsonb);`);
  e?.opcoes === 3 ? ok("e a escolha com 3 opções") : mau(`opções: ${e?.opcoes}`);
  MED_ESCOLHA = e.id;
}

await deveSerRecusado(
  "uma gama sem limites é recusada — nunca daria veredicto",
  AUTH.gestor,
  `SELECT public.rpc_ops_gravar_medicao(NULL,'${ORG}','Sem limites','gama');`,
  "nunca dá veredicto"
);

await deveSerRecusado(
  "uma escolha sem opções é recusada — é uma pergunta sem respostas",
  AUTH.gestor,
  `SELECT public.rpc_ops_gravar_medicao(NULL,'${ORG}','Sem opcoes','escolha');`,
  "pelo menos uma opção"
);

await deveSerRecusado(
  "um mínimo maior do que o máximo é recusado",
  AUTH.gestor,
  `SELECT public.rpc_ops_gravar_medicao(NULL,'${ORG}','Ao contrario','gama',NULL,'bar',20,10);`,
  "maior do que o máximo"
);

/* ── 3. Checklists ──────────────────────────────────────────────────────── */
console.log("\n─── a checklist ─────────────────────────");

let CHK;
{
  const r = await json(AUTH.gestor, `
    SELECT public.rpc_ops_gravar_checklist(
      NULL, 'Extintor trimestral', '${ORG}',
      '[{"nome":"Verificacao do extintor","tipo":"inspecao",
         "medicoes":["${MED_GAMA}","${MED_ESCOLHA}"]},
        {"nome":"Limpeza da sinaletica","tipo":"limpeza","obrigatoria":false},
        {"nome":"Nota interna","tipo":"inspecao","privada":true}]'::jsonb,
      true);`);
  r?.ok && r.tarefas === 3
    ? ok(`gravou a ${r.codigo} v${r.versao} com 3 tarefas, publicada`)
    : mau(`não gravou bem: ${JSON.stringify(r)}`);
  CHK = r.id;

  const m = await um(`
    SELECT count(*)::int AS n FROM public.ops_checklist_tarefa_medicao ctm
      JOIN public.ops_checklist_tarefa ct ON ct.id = ctm.checklist_tarefa_id
     WHERE ct.checklist_id = '${CHK}'`);
  m.n === 2 ? ok("com as 2 medições atadas à primeira tarefa") : mau(`${m.n} medições atadas`);

  const p = await um(`
    SELECT count(*)::int AS n FROM public.ops_checklist_tarefa
     WHERE checklist_id = '${CHK}' AND privada`);
  p.n === 1 ? ok("e uma tarefa privada, que não sai no relatório") : mau(`${p.n} privadas`);
}

await deveSerRecusado(
  "uma tarefa sem nome é recusada, dizendo qual",
  AUTH.gestor,
  `SELECT public.rpc_ops_gravar_checklist(NULL,'Ma','${ORG}','[{"nome":"Boa"},{"nome":"  "}]'::jsonb);`,
  "posição 2"
);

await deveSerRecusado(
  "um tipo de tarefa inventado é recusado",
  AUTH.gestor,
  `SELECT public.rpc_ops_gravar_checklist(NULL,'Ma','${ORG}','[{"nome":"X","tipo":"foto"}]'::jsonb);`,
  "Tipo de tarefa inválido"
);

// Editar uma checklist publicada versiona, não reescreve.
console.log("\n─── publicada é imutável ────────────────");
{
  const r = await json(AUTH.gestor, `
    SELECT public.rpc_ops_gravar_checklist(
      '${CHK}', 'Extintor trimestral', '${ORG}',
      '[{"nome":"Verificacao do extintor","tipo":"inspecao",
         "medicoes":["${MED_GAMA}","${MED_ESCOLHA}"]},
        {"nome":"Limpeza da sinaletica","tipo":"limpeza","obrigatoria":false}]'::jsonb, true);`);
  r?.versao === 2 ? ok("editar uma publicada criou a versão 2") : mau(`versão ${r?.versao}`);
  r?.id !== CHK ? ok("noutra linha, com id próprio") : mau("reescreveu a mesma linha");

  const velha = await um(`SELECT estado FROM public.ops_checklist WHERE id='${CHK}'`);
  velha.estado === "arquivada"
    ? ok("e a v1 ficou arquivada — as ordens antigas continuam a apontar para ela")
    : mau(`a v1 ficou em ${velha.estado}`);

  const t = await um(`SELECT count(*)::int AS n FROM public.ops_checklist_tarefa WHERE checklist_id='${CHK}'`);
  t.n === 3 ? ok("com as 3 tarefas originais intactas") : mau(`a v1 ficou com ${t.n} tarefas`);

  CHK = r.id;
}

/* ── 4. A equipa ────────────────────────────────────────────────────────── */
console.log("\n─── a equipa ────────────────────────────");

{
  const r = await json(AUTH.gestor, `
    SELECT public.rpc_ops_gravar_perfil('${ORG}','${TECNICO}','tecnico', 18.50, true);`);
  r?.ok ? ok("o gestor pôs o técnico em Operações, a 18,50 €/h") : mau(`falhou: ${JSON.stringify(r)}`);

  const p = await um(`
    SELECT funcao, custo_hora FROM public.ops_utilizador_perfil
     WHERE utilizador_id='${TECNICO}' AND organization_id='${ORG}'`);
  Number(p.custo_hora) === 18.5 ? ok("o custo/hora ficou gravado") : mau(`custo_hora=${p.custo_hora}`);

  const ev = await um(`
    SELECT antes, depois FROM public.ops_evento
     WHERE tipo='perfil_alterado' ORDER BY criado_em DESC LIMIT 1`);
  ev ? ok("e a mudança ficou no histórico, com antes e depois") : mau("sem evento de perfil");
}

await deveSerRecusado(
  "não se dá perfil a quem não tem acesso à organização",
  AUTH.gestor,
  `SELECT public.rpc_ops_gravar_perfil('${ORG}','${FORA}','tecnico');`,
  "não tem acesso ativo"
);

await deveSerRecusado(
  "um gestor não se despromove a si próprio",
  AUTH.gestor,
  `SELECT public.rpc_ops_gravar_perfil('${ORG}','${GESTOR}','tecnico');`,
  "a ti próprio"
);

await deveSerRecusado(
  "nem se desliga a si próprio",
  AUTH.gestor,
  `SELECT public.rpc_ops_gravar_perfil('${ORG}','${GESTOR}','gestor', NULL, false);`,
  "a ti próprio"
);

await deveSerRecusado(
  "um técnico não mexe na equipa",
  AUTH.tecnico,
  `SELECT public.rpc_ops_gravar_perfil('${ORG}','${TECNICO}','gestor');`,
  "Sem permissão"
);

// Agora que o técnico TEM perfil, esta recusa é pela permissão e não por
// falta de função — que é o que se quer provar.
await deveSerRecusado(
  "um técnico com perfil na mesma não define medições",
  AUTH.tecnico,
  `SELECT public.rpc_ops_gravar_medicao(NULL,'${ORG}','Do tecnico','gama',NULL,'bar',1,2);`,
  "Sem permissão"
);

await deveSerRecusado(
  "nem grava checklists",
  AUTH.tecnico,
  `SELECT public.rpc_ops_gravar_checklist(NULL,'Do tecnico','${ORG}','[{"nome":"X"}]'::jsonb);`,
  "Sem permissão"
);

{
  const n = await como(AUTH.gestor,
    `SELECT count(*)::int AS n FROM public.ops_v_pessoas WHERE organization_id='${ORG}';`);
  n.n === 2
    ? ok("a lista de pessoas mostra os 2 com acesso, e não o que está fora")
    : mau(`a lista trouxe ${n.n} pessoas`);
}

/* ── 5. O caminho completo ──────────────────────────────────────────────── */
console.log("\n─── e agora funciona tudo junto ─────────");

{
  const p = await json(AUTH.gestor, `
    SELECT public.rpc_ops_gravar_plano(
      NULL, 'Extintores — trimestral', '${CLI}', 'calendario',
      'FREQ=MONTHLY;BYMONTHDAY=1', NULL, '09:00', NULL, NULL, NULL, 'ativo', 0,
      '[{"local_id":"${LOC}","ativo_id":"${ATIVO}","checklist_id":"${CHK}"}]'::jsonb);`);
  p?.ok && p.alvos === 1 ? ok(`o plano ${p.codigo} aponta ao extintor`) : mau(`plano: ${JSON.stringify(p)}`);

  const m = await json(AUTH.gestor, `SELECT public.rpc_ops_materializar_planos(NULL, 120);`);
  m.ordens_criadas >= 3
    ? ok(`nasceram ${m.ordens_criadas} ordens preventivas`)
    : mau(`só ${m.ordens_criadas} ordens`);

  const t = await um(`
    SELECT count(*)::int AS n FROM public.ops_ordem_tarefa t
      JOIN public.ops_ordem o ON o.id = t.ordem_id WHERE o.origem='preventiva'`);
  t.n >= 3 ? ok(`com ${t.n} tarefas copiadas da checklist`) : mau(`${t.n} tarefas`);

  // Duas medições × três ordens: seis leituras à espera de quem lá chegar.
  const l = await um(`
    SELECT count(*)::int AS n FROM public.ops_ordem_tarefa_medicao WHERE lida_em IS NULL`);
  l.n === 6
    ? ok(`e ${l.n} leituras por fazer, semeadas com a ordem`)
    : mau(`esperava 6 leituras por fazer, encontrei ${l.n}`);

  const v = await um(`
    SELECT DISTINCT checklist_versao FROM public.ops_ordem_alvo WHERE checklist_versao IS NOT NULL`);
  v?.checklist_versao === 2
    ? ok("congeladas na versão 2, que é a publicada")
    : mau(`versão congelada: ${v?.checklist_versao}`);
}

/* ── 6. Nada disto tocou no CRM ─────────────────────────────────────────── */
console.log("\n─── continua contido ────────────────────");
{
  const fk = await um(`
    SELECT count(*)::int AS n
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class f ON f.oid = c.confrelid
     WHERE c.contype='f' AND t.relname LIKE 'ops\\_%' AND f.relname NOT LIKE 'ops\\_%'`);
  fk.n === 0 ? ok("zero chaves estrangeiras para fora") : mau(`${fk.n} para fora`);

  const p = await um(`SELECT count(*)::int AS n FROM public.anew_permissions WHERE category='operations'`);
  p.n === 15 ? ok("as 15 permissões continuam as mesmas") : mau(`${p.n} permissões`);

  const u = await um(`SELECT count(*)::int AS n FROM public.anew_users`);
  u.n === 3 ? ok("e ninguém foi criado nem apagado no CRM") : mau(`${u.n} utilizadores`);
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ monta-se uma operação do zero sem escrever uma linha de SQL");
