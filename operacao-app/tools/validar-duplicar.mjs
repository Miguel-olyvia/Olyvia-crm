/**
 * Duplicar não é clonar.
 *
 * O que aqui se prova é sobretudo **o que uma cópia NÃO leva**: respostas,
 * custos, assinaturas, histórico, códigos, números de série e coordenadas.
 * Uma cópia que leve o que aconteceu inventa trabalho que ninguém fez.
 *
 *     npm run validar-duplicar
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
const um = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const todos = async (sql, p = []) => (await db.query(sql, p)).rows;

const falhas = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mau = (m) => { console.log(`  ✗ ${m}`); falhas.push(m); };
const conferir = (c, m) => (c ? ok(m) : mau(m));

const ORG = "11111111-1111-1111-1111-111111111111";
const ENT = "77777777-7777-7777-7777-777777777777";
const CLI = "22222222-2222-2222-2222-222222222222";
const ENT2 = "88888888-8888-8888-8888-888888888888";
const CLI2 = "99999999-9999-9999-9999-999999999999";
const GESTOR = "33333333-3333-3333-3333-333333333333";
const AUTH = "44444444-4444-4444-4444-444444444444";

await db.exec(STUBS_CRM);
await db.exec(`
  CREATE TABLE public.auth_to_business_user_map (auth_user_id uuid, business_user_id uuid);
  CREATE OR REPLACE FUNCTION public.current_business_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT m.business_user_id FROM public.auth_to_business_user_map m
     WHERE m.auth_user_id = auth.uid() LIMIT 1 $fn$;

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}', 'Org');
  INSERT INTO public.anew_entities (id, display_name) VALUES
    ('${ENT}', 'Cliente A'), ('${ENT2}', 'Cliente B');
  INSERT INTO public.anew_clients (id, organization_id, entity_id) VALUES
    ('${CLI}', '${ORG}', '${ENT}'), ('${CLI2}', '${ORG}', '${ENT2}');
  INSERT INTO public.anew_users (id, auth_user_id, name, email)
    VALUES ('${GESTOR}', '${AUTH}', 'Rita', 'rita@x.pt');
  INSERT INTO auth.users (id, email, email_confirmed_at)
    VALUES ('${AUTH}', 'rita@x.pt', now());
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id)
    VALUES ('${AUTH}', '${GESTOR}');
`);

for (const f of [
  "schema.sql", "permissoes.sql", "notificacoes.sql", "rpcs.sql",
  "rpcs-tarefas.sql", "planos.sql", "correcoes-modelo.sql", "config.sql", "mapa.sql",
  "campos-ordem.sql",
]) {
  await db.exec(ler(f));
}
await db.exec(ler("duplicar.sql"));
// Um ficheiro que não se pode voltar a correr não serve para nada.
await db.exec(ler("duplicar.sql"));

await db.exec(`
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao)
  VALUES ('${ORG}', '${GESTOR}', 'gestor');
`);

/**
 * Corre com a sessão da Rita — é assim que a RPC vê o mundo.
 *
 * `auth.uid()` lê `request.jwt.claim.sub`, e o `SET LOCAL` só vale dentro de
 * uma transação. Sem o BEGIN, a definição evapora-se antes da chamada.
 */
const comoRita = async (sql, p = []) => {
  await db.exec(`BEGIN; SET LOCAL request.jwt.claim.sub = '${AUTH}';`);
  try {
    return (await db.query(sql, p)).rows[0];
  } finally {
    await db.exec("COMMIT").catch(() => db.exec("ROLLBACK").catch(() => {}));
  }
};

console.log("\n─── duplicar uma checklist ──────────────");
{
  const ck = (await um(
    `INSERT INTO public.ops_checklist (organization_id, codigo, nome, estado)
     VALUES ($1,'CHK-1','Extintores','publicada') RETURNING id`, [ORG])).id;
  await db.query(
    `INSERT INTO public.ops_checklist_tarefa (checklist_id, posicao, nome, tipo, obrigatoria)
     VALUES ($1,1,'Ver manómetro','inspecao',true),
            ($1,2,'Limpar o bico','limpeza',true),
            ($1,3,'Substituir o selo','substituicao',false)`, [ck]);

  const r = (await comoRita(`SELECT public.rpc_ops_duplicar_checklist($1) AS r`, [ck])).r;
  conferir(r.ok === true, "duplica");
  conferir(r.tarefas === 3, `leva as três tarefas (levou ${r.tarefas})`);

  const nova = await um(`SELECT * FROM public.ops_checklist WHERE id = $1`, [r.id]);
  conferir(nova.estado === "rascunho", "nasce em rascunho, mesmo vindo de uma publicada");
  conferir(nova.codigo !== "CHK-1", "com código novo");
  conferir(nova.nome === "Extintores (cópia)", "e o nome diz que é uma cópia");

  const t = await todos(
    `SELECT nome, obrigatoria FROM public.ops_checklist_tarefa
      WHERE checklist_id = $1 ORDER BY posicao`, [r.id]);
  conferir(t[0].nome === "Ver manómetro" && t[2].obrigatoria === false,
    "as tarefas mantêm ordem e obrigatoriedade");
}

console.log("\n─── duplicar um plano ───────────────────");
{
  const loc = (await um(
    `INSERT INTO public.ops_local (organization_id, cliente_id, codigo, nome, tipo)
     VALUES ($1,$2,'L-1','Torre','morada') RETURNING id`, [ORG, CLI])).id;
  const pl = (await um(
    `INSERT INTO public.ops_plano
       (organization_id, codigo, nome, cliente_id, estado, regra_recorrencia,
        materializado_ate)
     VALUES ($1,'PLN-1','Mensal AVAC',$2,'ativo','FREQ=MONTHLY',current_date + 120)
     RETURNING id`, [ORG, CLI])).id;
  await db.query(
    `INSERT INTO public.ops_plano_alvo (plano_id, local_id) VALUES ($1,$2)`, [pl, loc]);

  const r = (await comoRita(`SELECT public.rpc_ops_duplicar_plano($1) AS r`, [pl])).r;
  conferir(r.ok === true && r.alvos === 1, "duplica com os alvos");

  const novo = await um(`SELECT * FROM public.ops_plano WHERE id = $1`, [r.id]);
  // Um plano copiado ainda não tem alvos revistos. Ativo, começava a gerar
  // ordens na próxima passagem do relógio, sem ninguém ter olhado para ele.
  conferir(novo.estado === "suspenso", "nasce SUSPENSO, e não a gerar ordens");
  conferir(novo.materializado_ate === null,
    "e sem nada materializado — as ordens dele são as que ele vier a gerar");
  conferir(novo.regra_recorrencia === "FREQ=MONTHLY", "a recorrência vai igual");

  // Um local do cliente A não faz sentido num plano do cliente B.
  const outro = (await comoRita(
    `SELECT public.rpc_ops_duplicar_plano($1, 'Para o B', $2) AS r`, [pl, CLI2])).r;
  conferir(outro.alvos === 0, "para outro cliente, os alvos NÃO se copiam");
  const doB = await um(`SELECT cliente_id FROM public.ops_plano WHERE id = $1`, [outro.id]);
  conferir(doB.cliente_id === CLI2, "e a cópia fica no cliente pedido");
}

console.log("\n─── duplicar um local ───────────────────");
{
  const loc = (await um(
    `INSERT INTO public.ops_local
       (organization_id, cliente_id, codigo, nome, tipo, morada, latitude, longitude)
     VALUES ($1,$2,'L-9','Apartamento 3A','espaco','Rua X 3',38.7223,-9.1393)
     RETURNING id`, [ORG, CLI])).id;
  await db.query(
    `INSERT INTO public.ops_ativo (organization_id, local_id, codigo, nome, num_serie, criticidade)
     VALUES ($1,$2,'A-1','Esquentador','SN-12345','alta'),
            ($1,$2,'A-2','Extintor','SN-67890','normal')`, [ORG, loc]);

  const r = (await comoRita(
    `SELECT public.rpc_ops_duplicar_local($1,'Apartamento 3B') AS r`, [loc])).r;
  conferir(r.equipamentos === 2, "leva os equipamentos");

  const nova = await um(`SELECT * FROM public.ops_local WHERE id = $1`, [r.id]);
  conferir(nova.nome === "Apartamento 3B", "com o nome pedido");
  conferir(nova.morada === "Rua X 3", "a morada vai — é o mesmo prédio");
  // Dois apartamentos na mesma torre não são o mesmo ponto. Um ponto errado é
  // pior do que ponto nenhum: manda o técnico com confiança para o sítio errado.
  conferir(nova.latitude === null && nova.longitude === null,
    "mas as COORDENADAS não vão — não são o mesmo sítio");

  const as = await todos(
    `SELECT codigo, nome, num_serie, criticidade FROM public.ops_ativo
      WHERE local_id = $1 ORDER BY nome`, [r.id]);
  conferir(as.length === 2, "os dois equipamentos ficaram lá");
  conferir(as.every((a) => a.num_serie === null),
    "sem número de série — é único de cada máquina");
  conferir(as.every((a) => !["A-1", "A-2"].includes(a.codigo)),
    "e com códigos novos");
  conferir(as.find((a) => a.nome === "Esquentador").criticidade === "alta",
    "a criticidade vai");

  const semAtivos = (await comoRita(
    `SELECT public.rpc_ops_duplicar_local($1,'Apartamento 3C',false) AS r`, [loc])).r;
  conferir(semAtivos.equipamentos === 0, "e dá para copiar só o sítio, sem nada dentro");

  let recusou = false;
  try {
    await comoRita(`SELECT public.rpc_ops_duplicar_local($1,'   ') AS r`, [loc]);
  } catch { recusou = true; }
  conferir(recusou, "sem nome, recusa — senão ficavam dois sítios iguais na árvore");
}

console.log("\n─── duplicar uma ordem ──────────────────");
{
  const o = (await um(
    `INSERT INTO public.ops_ordem
       (organization_id, codigo, origem, estado, cliente_id, titulo, descricao,
        agendada_para, iniciada_em, fechada_em)
     VALUES ($1,'OT-9','corretiva','confirmada',$2,'Reparar porta','Ficou presa',
             now(), now(), now())
     RETURNING id`, [ORG, CLI])).id;
  await db.query(
    `INSERT INTO public.ops_ordem_tarefa
       (ordem_id, posicao, nome, tipo, estado, valor_num, obrigatoria, executada_por, fim)
     VALUES ($1,1,'Verificar mola','inspecao','feita',null,true,$2,now()),
            ($1,2,'Medir folga','correcao','nao_conforme',3.5,true,$2,now())`,
    [o, GESTOR]);
  await db.query(
    `INSERT INTO public.ops_custo (ordem_id, tipo, descricao, quantidade, valor_unit, total)
     VALUES ($1,'material','Mola nova',1,25,25)`, [o]);

  const r = (await comoRita(`SELECT public.rpc_ops_duplicar_ordem($1) AS r`, [o])).r;
  conferir(r.tarefas === 2, "leva as tarefas");

  const nova = await um(`SELECT * FROM public.ops_ordem WHERE id = $1`, [r.id]);
  conferir(nova.estado === "agendada", "nasce agendada, e não confirmada");
  conferir(nova.agendada_para === null, "sem data — a da original é do dia dela");
  conferir(nova.iniciada_em === null && nova.fechada_em === null,
    "sem datas de início nem de fecho");
  conferir(nova.titulo === "Reparar porta" && nova.descricao === "Ficou presa",
    "o título e a descrição vão");

  // Levar as respostas seria inventar trabalho que ninguém fez.
  const ts = await todos(
    `SELECT estado, valor_num, executada_por, fim FROM public.ops_ordem_tarefa
      WHERE ordem_id = $1 ORDER BY posicao`, [r.id]);
  conferir(ts.every((t) => t.estado === "pendente"), "as tarefas vão POR RESPONDER");
  conferir(ts.every((t) => t.valor_num === null), "sem os valores medidos");
  conferir(ts.every((t) => t.executada_por === null && t.fim === null),
    "e sem quem as fez nem quando");

  const custos = await um(
    `SELECT count(*)::int AS n FROM public.ops_custo WHERE ordem_id = $1`, [r.id]);
  conferir(custos.n === 0, "os custos NÃO vão — são o que se gastou naquele dia");
}

console.log("\n─── fica tudo no histórico ──────────────");
{
  const ev = await todos(
    `SELECT entidade, tipo, antes, depois FROM public.ops_evento
      WHERE tipo IN ('duplicada','duplicado') OR (depois->>'duplicada') = 'true'
      ORDER BY criado_em`);
  conferir(ev.length >= 5, `cada cópia deixa rasto (${ev.length})`);
  conferir(
    ev.every((e) => e.antes?.codigo && e.depois?.codigo),
    "e diz de qual veio, e qual ficou"
  );
  conferir(
    (await um(`SELECT count(*)::int AS n FROM public.ops_evento
                WHERE autor_id = $1 AND (tipo IN ('duplicada','duplicado')
                   OR (depois->>'duplicada') = 'true')`, [GESTOR])).n >= 5,
    "com o nome de quem copiou"
  );
}

console.log("\n─── quem pode duplicar ──────────────────");
{
  for (const f of [
    "public.rpc_ops_duplicar_checklist(uuid,text)",
    "public.rpc_ops_duplicar_plano(uuid,text,uuid)",
    "public.rpc_ops_duplicar_local(uuid,text,boolean)",
    "public.rpc_ops_duplicar_ordem(uuid,text)",
  ]) {
    const p = await um(`SELECT has_function_privilege('anon',$1,'EXECUTE') AS p`, [f]);
    conferir(p.p === false, `quem não tem sessão não chama ${f.split("(")[0].split(".")[1]}`);
  }

  // Um técnico executa; não monta a operação.
  await db.query(
    `UPDATE public.ops_utilizador_perfil SET funcao='tecnico' WHERE utilizador_id=$1`,
    [GESTOR]);
  let recusou = false;
  try {
    const ck = (await um(`SELECT id FROM public.ops_checklist LIMIT 1`)).id;
    await comoRita(`SELECT public.rpc_ops_duplicar_checklist($1) AS r`, [ck]);
  } catch { recusou = true; }
  conferir(recusou, "um técnico não duplica — duplicar é criar");
}

console.log("\n─── o módulo continua contido ───────────");
{
  const fk = await um(`
    SELECT count(*)::int AS n
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class f ON f.oid = c.confrelid
     WHERE c.contype = 'f' AND t.relname LIKE 'ops\\_%' AND f.relname NOT LIKE 'ops\\_%'`);
  conferir(fk.n === 0, "zero chaves estrangeiras de ops_* para fora");
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ duplicar copia o molde, e nunca o que aconteceu");
