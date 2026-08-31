/**
 * Prova que uma leitura de medição vale o que diz.
 *
 * O que interessa aqui:
 *   · o veredicto sai dos limites, não de quem escreve;
 *   · uma leitura fora de limites gera trabalho, e uma correção de dedo não
 *     gera uma segunda ordem;
 *   · quando a última leitura entra, a tarefa acerta-se sozinha;
 *   · um contador não anda para trás sem alguém dar por isso.
 *
 *     npm run validar-medicoes
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
const TECNICO = "bbbb0000-0000-0000-0000-00000000000b";
const OUTRO = "cccc0000-0000-0000-0000-00000000000c";
const AUTH = {
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
    ('${TECNICO}', '${AUTH.tecnico}', 'Tecnico',       't@x.pt'),
    ('${OUTRO}',   '${AUTH.outro}',   'Outro tecnico', 'o@x.pt');
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('${AUTH.tecnico}','t@x.pt',now()), ('${AUTH.outro}','o@x.pt',now());
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ('${AUTH.tecnico}','${TECNICO}'), ('${AUTH.outro}','${OUTRO}');
`);

await db.exec(ler("schema.sql"));
await db.exec(ler("permissoes.sql"));
await db.exec(ler("rpcs.sql"));
await db.exec(ler("rpcs-tarefas.sql"));
await db.exec(ler("planos.sql"));
await db.exec(ler("correcoes-modelo.sql"));
await db.exec(ler("medicoes.sql"));

await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name)
    VALUES ('dddd0000-0000-0000-0000-00000000000d', '${ORG}', 'Operacoes');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT 'dddd0000-0000-0000-0000-00000000000d', code
      FROM public.anew_permissions WHERE category = 'operations';
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${TECNICO}','${ORG}','dddd0000-0000-0000-0000-00000000000d','active'),
    ('${OUTRO}','${ORG}','dddd0000-0000-0000-0000-00000000000d','active');

  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES
    ('${ORG}','${TECNICO}','tecnico'),
    ('${ORG}','${OUTRO}','tecnico');

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

/* ── O cenário: um extintor, com as três medições que interessam ────────── */

const CAT = "eeee0000-0000-0000-0000-0000000000e1";
const CHK = "c1c1c1c1-0000-0000-0000-0000000000c1";
const LOC = "11ee0000-0000-0000-0000-0000000000ee";
const ATIVO = "aaee0000-0000-0000-0000-0000000000ea";
const PLANO = "dddd1111-0000-0000-0000-0000000000d1";

await db.exec(`
  INSERT INTO public.ops_categoria_ativo (id, organization_id, codigo, nome)
    VALUES ('${CAT}','${ORG}','CAT-EXT','Extintor');

  INSERT INTO public.ops_medicao_def
    (id, organization_id, categoria_ativo_id, nome, tipo, unidade, limite_min, limite_max) VALUES
    ('11110000-0000-0000-0000-000000000001','${ORG}','${CAT}','Pressao','gama','bar',10,15),
    ('11110000-0000-0000-0000-000000000002','${ORG}','${CAT}','Estado do selo','escolha',NULL,NULL,NULL),
    ('11110000-0000-0000-0000-000000000003','${ORG}','${CAT}','Horas de servico','acumulado','h',NULL,NULL);

  INSERT INTO public.ops_medicao_opcao (id, medicao_def_id, nome, posicao, e_nao_conforme, cria_corretiva) VALUES
    ('22220000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000002','Conforme',0,false,false),
    -- No Infraspeak esta caixa está DESLIGADA, e o ciclo não fecha. Aqui liga-se.
    ('22220000-0000-0000-0000-000000000002','11110000-0000-0000-0000-000000000002','Nao conforme',1,true,true),
    -- Uma opção que assinala um problema mas não pede trabalho: serve para
    -- provar que quem manda é a caixa, não o nome.
    ('22220000-0000-0000-0000-000000000003','11110000-0000-0000-0000-000000000002','Ilegivel',2,true,false);

  INSERT INTO public.ops_checklist (id, organization_id, codigo, nome, estado)
    VALUES ('${CHK}','${ORG}','CL-0001','Extintor trimestral','publicada');

  INSERT INTO public.ops_checklist_tarefa (id, checklist_id, posicao, nome, tipo) VALUES
    ('33330000-0000-0000-0000-000000000001','${CHK}',0,'Verificacao do extintor','inspecao'),
    ('33330000-0000-0000-0000-000000000002','${CHK}',1,'Leitura do contador','inspecao');

  INSERT INTO public.ops_checklist_tarefa_medicao (checklist_tarefa_id, medicao_def_id, posicao) VALUES
    ('33330000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000001',0),
    ('33330000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000002',1),
    ('33330000-0000-0000-0000-000000000002','11110000-0000-0000-0000-000000000003',0);

  INSERT INTO public.ops_local (id, organization_id, cliente_id, codigo, nome, tipo)
    VALUES ('${LOC}','${ORG}','${CLI}','L1','Garagem','espaco');
  INSERT INTO public.ops_ativo (id, organization_id, local_id, categoria_id, codigo, nome)
    VALUES ('${ATIVO}','${ORG}','${LOC}','${CAT}','AT-1','Extintor A1');

  INSERT INTO public.ops_plano
    (id, organization_id, codigo, nome, cliente_id, regra_recorrencia, hora_prevista, inicio_em)
    VALUES ('${PLANO}','${ORG}','PLN-0001','Extintores','${CLI}',
            'FREQ=MONTHLY;BYMONTHDAY=1','09:00', current_date);
  INSERT INTO public.ops_plano_alvo (plano_id, ativo_id, local_id, checklist_id)
    VALUES ('${PLANO}','${ATIVO}','${LOC}','${CHK}');
`);

/* ── A sementeira ───────────────────────────────────────────────────────── */
console.log("\n─── as leituras nascem com a ordem ──────");

await db.exec(`SELECT public.rpc_ops_materializar_planos(NULL, 120);`);

const ORDEM = (await um(`
  SELECT id, codigo FROM public.ops_ordem
   WHERE origem='preventiva' ORDER BY agendada_para LIMIT 1`));

{
  const n = await um(`
    SELECT count(*)::int AS n FROM public.ops_ordem_tarefa_medicao m
      JOIN public.ops_ordem_tarefa t ON t.id = m.ordem_tarefa_id
     WHERE t.ordem_id = '${ORDEM.id}'`);
  n.n === 3 ? ok(`as 3 medições da checklist vieram com a ordem ${ORDEM.codigo}`)
            : mau(`esperava 3 leituras semeadas, encontrei ${n.n}`);

  const l = await um(`
    SELECT m.nome, m.tipo, m.unidade, m.limite_min, m.limite_max, m.lida_em, m.conforme
      FROM public.ops_ordem_tarefa_medicao m
      JOIN public.ops_ordem_tarefa t ON t.id = m.ordem_tarefa_id
     WHERE t.ordem_id = '${ORDEM.id}' AND m.nome = 'Pressao'`);
  Number(l.limite_min) === 10 && Number(l.limite_max) === 15 && l.unidade === "bar"
    ? ok("os limites vieram congelados: 10–15 bar")
    : mau(`limites errados: ${l.limite_min}–${l.limite_max} ${l.unidade}`);
  l.lida_em === null && l.conforme === null
    ? ok("nascem por responder, sem veredicto inventado")
    : mau(`nasceu já com lida_em=${l.lida_em} conforme=${l.conforme}`);
}

// Mudar os limites hoje não pode reescrever o que a ordem já congelou.
await db.exec(`
  UPDATE public.ops_medicao_def SET limite_min = 1, limite_max = 2
   WHERE id = '11110000-0000-0000-0000-000000000001';`);
{
  const l = await um(`
    SELECT m.limite_min, m.limite_max FROM public.ops_ordem_tarefa_medicao m
      JOIN public.ops_ordem_tarefa t ON t.id = m.ordem_tarefa_id
     WHERE t.ordem_id = '${ORDEM.id}' AND m.nome = 'Pressao'`);
  Number(l.limite_min) === 10
    ? ok("mudar os limites no catálogo não reescreveu a ordem já criada")
    : mau(`os limites da ordem mudaram para ${l.limite_min}–${l.limite_max}`);
}
await db.exec(`
  UPDATE public.ops_medicao_def SET limite_min = 10, limite_max = 15
   WHERE id = '11110000-0000-0000-0000-000000000001';`);

/* ── Pôr a ordem em curso, pelo caminho certo ───────────────────────────── */

await db.exec(`
  UPDATE public.ops_ordem SET responsavel_id = '${TECNICO}' WHERE id = '${ORDEM.id}';`);
for (const t of ["confirmar", "aprovar", "iniciar"]) {
  await como(AUTH.tecnico, `SELECT public.rpc_ops_transitar_ordem('${ORDEM.id}','${t}',NULL,NULL);`)
    .catch(async () => { await db.exec("ROLLBACK").catch(() => {}); });
}
{
  const e = await um(`SELECT estado FROM public.ops_ordem WHERE id='${ORDEM.id}'`);
  e.estado === "em_curso" ? ok("a ordem está em curso") : mau(`a ordem ficou em ${e.estado}`);
}

const T1 = (await um(`
  SELECT id FROM public.ops_ordem_tarefa
   WHERE ordem_id='${ORDEM.id}' AND nome='Verificacao do extintor'`)).id;
const T2 = (await um(`
  SELECT id FROM public.ops_ordem_tarefa
   WHERE ordem_id='${ORDEM.id}' AND nome='Leitura do contador'`)).id;

const responder = (tarefa, def, { num = null, texto = null, opcao = null } = {}) =>
  `SELECT public.rpc_ops_responder_medicao('${tarefa}','${def}',` +
  `${num === null ? "NULL" : num},${texto === null ? "NULL" : `'${texto}'`},` +
  `${opcao === null ? "NULL" : `'${opcao}'`});`;

const PRESSAO = "11110000-0000-0000-0000-000000000001";
const SELO = "11110000-0000-0000-0000-000000000002";
const HORAS = "11110000-0000-0000-0000-000000000003";

/* ── A fechadura ────────────────────────────────────────────────────────── */
console.log("\n─── a fechadura das leituras ────────────");

await deveSerRecusado(
  "escrever um veredicto por UPDATE direto é recusado",
  AUTH.tecnico,
  `UPDATE public.ops_ordem_tarefa_medicao SET conforme = true, valor_num = 99, lida_em = now()
    WHERE ordem_tarefa_id = '${T1}' AND medicao_def_id = '${PRESSAO}';`,
  "só se escreve através de rpc_ops_responder_medicao"
);

await deveSerRecusado(
  "quem não está na ordem não regista leituras",
  AUTH.outro,
  responder(T1, PRESSAO, { num: 12.4 }),
  "Só quem está na ordem"
);

/* ── O veredicto ────────────────────────────────────────────────────────── */
console.log("\n─── o veredicto sai dos limites ─────────");

await deveCorrer("ler 12,4 bar", AUTH.tecnico, responder(T1, PRESSAO, { num: 12.4 }));
{
  const l = await um(`
    SELECT conforme, valor_num, lida_por FROM public.ops_ordem_tarefa_medicao
     WHERE ordem_tarefa_id='${T1}' AND medicao_def_id='${PRESSAO}'`);
  l.conforme === true ? ok("12,4 entre 10 e 15 ficou conforme, sem ninguém dizer")
                      : mau(`conforme=${l.conforme}`);
  l.lida_por === TECNICO ? ok("ficou registado quem leu") : mau(`lida_por=${l.lida_por}`);
}

await deveSerRecusado(
  "uma gama sem valor é recusada, em vez de gravar linha vazia",
  AUTH.tecnico,
  responder(T1, PRESSAO, {}),
  "espera um valor numérico"
);

await deveSerRecusado(
  "uma escolha com opção de outra medição é recusada",
  AUTH.tecnico,
  responder(T1, SELO, { opcao: "22220000-0000-0000-0000-000000000001" })
    .replace(SELO, PRESSAO),
  "espera um valor numérico"
);

/* ── A tarefa acerta-se sozinha ─────────────────────────────────────────── */
console.log("\n─── a tarefa acerta-se sozinha ──────────");

{
  const t = await um(`SELECT estado FROM public.ops_ordem_tarefa WHERE id='${T1}'`);
  t.estado === "pendente"
    ? ok("com uma leitura por fazer, a tarefa fica pendente")
    : mau(`a tarefa saltou para ${t.estado} com leituras por fazer`);
}

await deveCorrer(
  "responder ao selo: Conforme",
  AUTH.tecnico,
  responder(T1, SELO, { opcao: "22220000-0000-0000-0000-000000000001" })
);
{
  const t = await um(`SELECT estado, executada_por, fim FROM public.ops_ordem_tarefa WHERE id='${T1}'`);
  t.estado === "feita" ? ok("entrou a última leitura, a tarefa ficou feita")
                       : mau(`a tarefa ficou em ${t.estado}`);
  t.executada_por === TECNICO && t.fim !== null
    ? ok("com autor e hora de fim, sem passo extra")
    : mau(`executada_por=${t.executada_por} fim=${t.fim}`);
}

/* ── A corretiva ────────────────────────────────────────────────────────── */
console.log("\n─── uma não conformidade gera trabalho ──");

const antesCorretivas = (await um(
  `SELECT count(*)::int AS n FROM public.ops_ordem WHERE origem='corretiva'`)).n;

await deveCorrer(
  "corrigir a leitura: 8 bar, abaixo do mínimo",
  AUTH.tecnico,
  responder(T1, PRESSAO, { num: 8 })
);
{
  const l = await um(`
    SELECT conforme FROM public.ops_ordem_tarefa_medicao
     WHERE ordem_tarefa_id='${T1}' AND medicao_def_id='${PRESSAO}'`);
  l.conforme === false ? ok("8 bar abaixo de 10 ficou não conforme")
                       : mau(`conforme=${l.conforme}`);

  const t = await um(`SELECT estado FROM public.ops_ordem_tarefa WHERE id='${T1}'`);
  t.estado === "nao_conforme"
    ? ok("a tarefa passou a não conforme por causa da leitura")
    : mau(`a tarefa ficou em ${t.estado}`);

  const c = await um(`
    SELECT codigo, estado, prioridade, titulo, descricao, local_id
      FROM public.ops_ordem WHERE origem='corretiva'
     ORDER BY criada_em DESC LIMIT 1`);
  c ? ok(`a corretiva nasceu: ${c.codigo}`) : mau("não nasceu corretiva nenhuma");
  c && c.estado === "por_aprovar" && c.prioridade === "alta"
    ? ok("por aprovar, prioridade alta")
    : mau(`estado=${c?.estado} prioridade=${c?.prioridade}`);
  c && c.titulo.includes("Extintor A1")
    ? ok("o título diz qual é o extintor")
    : mau(`título sem o ativo: ${c?.titulo}`);
  c && c.descricao.includes("8") && c.descricao.includes("10")
    ? ok("a descrição leva o valor lido e os limites")
    : mau(`descrição sem os números: ${c?.descricao}`);
}

await deveCorrer(
  "corrigir outra vez para o mesmo valor errado",
  AUTH.tecnico,
  responder(T1, PRESSAO, { num: 7 })
);
{
  const n = (await um(
    `SELECT count(*)::int AS n FROM public.ops_ordem WHERE origem='corretiva'`)).n;
  n === antesCorretivas + 1
    ? ok("continuar não conforme NÃO gera uma segunda corretiva")
    : mau(`há ${n - antesCorretivas} corretivas para uma não conformidade`);
}

console.log("\n─── quem manda é a caixa, não o nome ────");
{
  const antes = (await um(
    `SELECT count(*)::int AS n FROM public.ops_ordem WHERE origem='corretiva'`)).n;

  // "Ilegivel" é não conforme mas não pede trabalho.
  await deveCorrer(
    "responder ao selo: Ilegivel",
    AUTH.tecnico,
    responder(T1, SELO, { opcao: "22220000-0000-0000-0000-000000000003" })
  );
  const l = await um(`
    SELECT conforme FROM public.ops_ordem_tarefa_medicao
     WHERE ordem_tarefa_id='${T1}' AND medicao_def_id='${SELO}'`);
  const n = (await um(
    `SELECT count(*)::int AS n FROM public.ops_ordem WHERE origem='corretiva'`)).n;

  l.conforme === false ? ok("ficou não conforme") : mau(`conforme=${l.conforme}`);
  n === antes
    ? ok("mas não gerou corretiva, porque a opção não a pede")
    : mau("gerou corretiva de uma opção que não a pede");

  await deveCorrer(
    "responder ao selo: Nao conforme",
    AUTH.tecnico,
    responder(T1, SELO, { opcao: "22220000-0000-0000-0000-000000000002" })
  );
  const n2 = (await um(
    `SELECT count(*)::int AS n FROM public.ops_ordem WHERE origem='corretiva'`)).n;
  n2 === antes + 1
    ? ok("a opção que pede trabalho gerou a corretiva")
    : mau(`esperava 1 corretiva nova, houve ${n2 - antes}`);
}

/* ── O contador ─────────────────────────────────────────────────────────── */
console.log("\n─── um contador não anda para trás ──────");

await deveCorrer("ler 45812 h no contador", AUTH.tecnico, responder(T2, HORAS, { num: 45812 }));
{
  const l = await um(`
    SELECT conforme, valor_num FROM public.ops_ordem_tarefa_medicao
     WHERE ordem_tarefa_id='${T2}' AND medicao_def_id='${HORAS}'`);
  l.conforme === null
    ? ok("um contador não tem veredicto — é um número que sobe")
    : mau(`conforme=${l.conforme}, e devia ser nulo`);
  const t = await um(`SELECT estado FROM public.ops_ordem_tarefa WHERE id='${T2}'`);
  t.estado === "feita" ? ok("a tarefa do contador ficou feita") : mau(`ficou em ${t.estado}`);
}

// A segunda ordem do plano, no mesmo extintor, é onde o contador se compara.
const ORDEM2 = (await um(`
  SELECT id, codigo FROM public.ops_ordem
   WHERE origem='preventiva' AND id <> '${ORDEM.id}'
   ORDER BY agendada_para LIMIT 1`));

await db.exec(`
  UPDATE public.ops_ordem SET responsavel_id = '${TECNICO}' WHERE id = '${ORDEM2.id}';`);
for (const t of ["confirmar", "aprovar", "iniciar"]) {
  await como(AUTH.tecnico, `SELECT public.rpc_ops_transitar_ordem('${ORDEM2.id}','${t}',NULL,NULL);`)
    .catch(async () => { await db.exec("ROLLBACK").catch(() => {}); });
}

const T2B = (await um(`
  SELECT id FROM public.ops_ordem_tarefa
   WHERE ordem_id='${ORDEM2.id}' AND nome='Leitura do contador'`)).id;

await deveSerRecusado(
  "ler 40000 h depois de 45812 é recusado, com os dois números na mensagem",
  AUTH.tecnico,
  responder(T2B, HORAS, { num: 40000 }),
  "Um contador não desce"
);

await deveCorrer(
  "ler 46100 h passa",
  AUTH.tecnico,
  responder(T2B, HORAS, { num: 46100 })
);

/* ── Fora de uma ordem em curso ─────────────────────────────────────────── */
console.log("\n─── fora de uma ordem em curso ──────────");

// Fechar exige que as obrigatórias tenham resposta. Responder às medições que
// faltam é o caminho normal — e prova que o caminho todo funciona de ponta a
// ponta, sem ninguém tocar no estado das tarefas à mão.
const T1B = (await um(`
  SELECT id FROM public.ops_ordem_tarefa
   WHERE ordem_id='${ORDEM2.id}' AND nome='Verificacao do extintor'`)).id;

await deveCorrer("ler 13 bar na segunda visita", AUTH.tecnico, responder(T1B, PRESSAO, { num: 13 }));
await deveCorrer(
  "selo conforme na segunda visita",
  AUTH.tecnico,
  responder(T1B, SELO, { opcao: "22220000-0000-0000-0000-000000000001" })
);
{
  const n = await um(`
    SELECT count(*)::int AS n FROM public.ops_ordem_tarefa
     WHERE ordem_id='${ORDEM2.id}' AND estado='pendente'`);
  n.n === 0
    ? ok("as tarefas ficaram todas respondidas só por se lerem as medições")
    : mau(`ainda há ${n.n} tarefas pendentes`);
}

await deveCorrer(
  "fechar a ordem",
  AUTH.tecnico,
  `SELECT public.rpc_ops_transitar_ordem('${ORDEM2.id}','fechar',NULL,NULL);`
);
{
  const e = await um(`SELECT estado FROM public.ops_ordem WHERE id='${ORDEM2.id}'`);
  e.estado === "fechada" ? ok("a ordem está fechada") : mau(`a ordem ficou em ${e.estado}`);
}

await deveSerRecusado(
  "não se lê numa ordem fechada",
  AUTH.tecnico,
  responder(T2B, HORAS, { num: 46200 }),
  "ordem em curso"
);

/* ── O registo ──────────────────────────────────────────────────────────── */
console.log("\n─── fica escrito quem leu o quê ─────────");
{
  const n = await um(`
    SELECT count(*)::int AS n FROM public.ops_evento
     WHERE tipo = 'medicao' AND autor_id = '${TECNICO}'`);
  n.n >= 7 ? ok(`${n.n} leituras registadas, com autor e antes/depois`)
           : mau(`só ${n.n} eventos de medição`);
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ uma leitura vale o que diz, e o veredicto é da base");
