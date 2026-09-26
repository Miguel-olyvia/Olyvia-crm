/**
 * Prova que um pack de configuração se instala, e — mais importante — que se
 * pode instalar duas vezes sem estragar nada.
 *
 * Um pack toca em tudo o que alguém pode ter passado uma tarde a montar:
 * categorias, medições, checklists. Um instalador que sobrepusesse seria pior
 * do que não existir. O que se verifica:
 *
 *   · à segunda vez não duplica nada, e diz quantas saltou;
 *   · nunca reescreve o que já lá estava — nem o nome de uma categoria, nem
 *     os limites de uma medição que alguém ajustou;
 *   · as checklists nascem publicadas, para servirem no mesmo dia;
 *   · as tarefas ficam ligadas às medições certas;
 *   · as opções que assinalam um problema trazem "cria corretiva" ligado —
 *     é a caixa que no Infraspeak está desligada;
 *   · e um técnico não instala packs.
 *
 *     npm run validar-packs
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
const GESTOR = "aaaa0000-0000-0000-0000-00000000000a";
const TECNICO = "bbbb0000-0000-0000-0000-00000000000b";
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

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}', 'Org');
  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${GESTOR}',  '${AUTH.gestor}',  'Gestora', 'g@x.pt'),
    ('${TECNICO}', '${AUTH.tecnico}', 'Tecnico', 't@x.pt');
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('${AUTH.gestor}','g@x.pt',now()), ('${AUTH.tecnico}','t@x.pt',now());
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ('${AUTH.gestor}','${GESTOR}'), ('${AUTH.tecnico}','${TECNICO}');
`);

for (const f of [
  "schema.sql", "permissoes.sql", "notificacoes.sql", "rpcs.sql", "rpcs-tarefas.sql",
  "planos.sql", "correcoes-modelo.sql", "medicoes.sql", "config.sql", "packs.sql",
]) {
  await db.exec(ler(f));
}

await db.exec(`
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES
    ('${ORG}','${GESTOR}','gestor'),
    ('${ORG}','${TECNICO}','tecnico');

  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth, public TO authenticated;
`);

async function como(authUid, sql) {
  await db.exec(`BEGIN; SET LOCAL ROLE authenticated;
                 SET LOCAL request.jwt.claim.sub = '${authUid}';`);
  try {
    return (await db.query(sql)).rows;
  } finally {
    await db.exec("COMMIT").catch(() => db.exec("ROLLBACK").catch(() => {}));
  }
}

const instalar = (authUid, pack) =>
  como(authUid, `SELECT public.rpc_ops_instalar_pack('${ORG}', '${pack}') AS r`);

/* ── A lista ────────────────────────────────────────────────────────────── */

console.log("\n─── os packs que existem ────────────────");
{
  const r = await como(AUTH.gestor, `SELECT pack, nome, categorias, medicoes, checklists
                                       FROM public.rpc_ops_packs() ORDER BY pack`);
  r.length === 3
    ? ok(`três packs: ${r.map((x) => x.pack).join(", ")}`)
    : mau(`${r.length} packs`);

  r.every((x) => x.nome && Number(x.categorias) > 0 && Number(x.checklists) > 0)
    ? ok("todos trazem nome, categorias e checklists")
    : mau(`algum veio vazio: ${JSON.stringify(r)}`);
}

/* ── Instalar ───────────────────────────────────────────────────────────── */

console.log("\n─── instalar o pack de manutenção ───────");
{
  const r = (await instalar(AUTH.gestor, "manutencao"))[0].r;
  Number(r.criadas.categorias) === 6
    ? ok("6 categorias criadas")
    : mau(`criou ${r.criadas.categorias} categorias`);
  Number(r.criadas.medicoes) === 10
    ? ok("10 medições criadas")
    : mau(`criou ${r.criadas.medicoes} medições`);
  Number(r.criadas.checklists) === 5
    ? ok("5 checklists criadas")
    : mau(`criou ${r.criadas.checklists} checklists`);
}

{
  const c = await um(`SELECT count(*)::int AS n FROM public.ops_checklist
                       WHERE organization_id='${ORG}' AND estado='publicada'`);
  c.n === 5
    ? ok("nascem publicadas — servem no mesmo dia, sem mais um passo")
    : mau(`${c.n} publicadas`);
}

{
  // A checklist do extintor: seis tarefas, e três delas com medição.
  const t = await q(`
    SELECT ct.nome, ct.tipo, ct.obrigatoria,
           (SELECT count(*)::int FROM public.ops_checklist_tarefa_medicao m
             WHERE m.checklist_tarefa_id = ct.id) AS medicoes
      FROM public.ops_checklist_tarefa ct
      JOIN public.ops_checklist c ON c.id = ct.checklist_id
     WHERE c.codigo = 'CHK-EXT-TRI' ORDER BY ct.posicao`);

  t.length === 6 ? ok("a checklist do extintor tem 6 tarefas, pela ordem certa")
                 : mau(`${t.length} tarefas`);
  t[1]?.nome === "Manómetro na zona verde" && Number(t[1]?.medicoes) === 1
    ? ok("a tarefa do manómetro está ligada à medição da pressão")
    : mau(`segunda tarefa: ${JSON.stringify(t[1])}`);
  t.find((x) => x.nome === "Limpeza do aparelho")?.obrigatoria === false
    ? ok("a limpeza fica opcional, como estava no pack")
    : mau("a limpeza ficou obrigatória");
  t.every((x) => ["inspecao", "correcao", "limpeza", "proacao", "substituicao"].includes(x.tipo))
    ? ok("os tipos de tarefa são os do modelo corrigido")
    : mau(`tipo fora do vocabulário: ${t.map((x) => x.tipo).join(", ")}`);
}

{
  const o = await q(`
    SELECT mo.nome, mo.e_nao_conforme, mo.cria_corretiva
      FROM public.ops_medicao_opcao mo
      JOIN public.ops_medicao_def md ON md.id = mo.medicao_def_id
     WHERE md.nome = 'Estado do selo' ORDER BY mo.posicao`);

  o.length === 3 ? ok("o estado do selo tem três opções") : mau(`${o.length} opções`);
  o[0]?.nome === "Intacto" && o[0]?.cria_corretiva === false
    ? ok("a opção boa não abre trabalho nenhum")
    : mau(`primeira opção: ${JSON.stringify(o[0])}`);
  o.filter((x) => x.cria_corretiva).length === 2
    ? ok("as duas más abrem reparação — é a caixa que no Infraspeak está desligada")
    : mau(`${o.filter((x) => x.cria_corretiva).length} opções abrem reparação`);
}

{
  const m = await um(`SELECT limite_min, limite_max, unidade FROM public.ops_medicao_def
                       WHERE organization_id='${ORG}' AND nome='Pressão do extintor'`);
  Number(m.limite_min) === 10 && Number(m.limite_max) === 15 && m.unidade === "bar"
    ? ok("os limites e a unidade vieram certos")
    : mau(`pressão: ${JSON.stringify(m)}`);
}

{
  const cat = await um(`
    SELECT c.nome AS categoria FROM public.ops_medicao_def m
      JOIN public.ops_categoria_ativo c ON c.id = m.categoria_ativo_id
     WHERE m.organization_id='${ORG}' AND m.nome='Pressão do extintor'`);
  cat?.categoria === "Extintores"
    ? ok("a medição ficou presa à categoria certa")
    : mau(`categoria: ${cat?.categoria}`);
}

/* ── Segunda vez ────────────────────────────────────────────────────────── */

console.log("\n─── instalar outra vez ──────────────────");
{
  const r = (await instalar(AUTH.gestor, "manutencao"))[0].r;
  Number(r.criadas.categorias) === 0 &&
  Number(r.criadas.medicoes) === 0 &&
  Number(r.criadas.checklists) === 0
    ? ok("não cria nada de novo")
    : mau(`criou outra vez: ${JSON.stringify(r.criadas)}`);

  Number(r.saltadas.checklists) === 5
    ? ok("e diz quantas saltou — sem isso, “instalado” não distingue nada")
    : mau(`saltou ${r.saltadas.checklists} checklists`);
}

{
  const n = await um(`SELECT
    (SELECT count(*)::int FROM public.ops_categoria_ativo WHERE organization_id='${ORG}') AS cat,
    (SELECT count(*)::int FROM public.ops_medicao_def WHERE organization_id='${ORG}') AS med,
    (SELECT count(*)::int FROM public.ops_checklist WHERE organization_id='${ORG}') AS chk`);
  n.cat === 6 && n.med === 10 && n.chk === 5
    ? ok("as contagens ficaram iguais: 6 categorias, 10 medições, 5 checklists")
    : mau(`duplicou: ${JSON.stringify(n)}`);
}

/* ── Não sobrepõe o que alguém editou ───────────────────────────────────── */

console.log("\n─── o que alguém já tinha editado ───────");
await db.exec(`
  UPDATE public.ops_categoria_ativo SET nome = 'Extintores e mantas'
   WHERE organization_id='${ORG}' AND codigo='EXT';
  UPDATE public.ops_medicao_def SET limite_min = 12, limite_max = 14
   WHERE organization_id='${ORG}' AND nome='Pressão do extintor';
`);
{
  await instalar(AUTH.gestor, "manutencao");
  const c = await um(`SELECT nome FROM public.ops_categoria_ativo
                       WHERE organization_id='${ORG}' AND codigo='EXT'`);
  const m = await um(`SELECT limite_min, limite_max FROM public.ops_medicao_def
                       WHERE organization_id='${ORG}' AND nome='Pressão do extintor'`);

  c.nome === "Extintores e mantas"
    ? ok("o nome da categoria que alguém mudou ficou como estava")
    : mau(`o nome foi reescrito para "${c.nome}"`);
  Number(m.limite_min) === 12 && Number(m.limite_max) === 14
    ? ok("os limites que alguém apertou não foram repostos")
    : mau(`limites repostos: ${JSON.stringify(m)}`);
}

/* ── Os outros packs ────────────────────────────────────────────────────── */

console.log("\n─── os outros dois packs ────────────────");
for (const pack of ["obras", "limpeza"]) {
  const r = (await instalar(AUTH.gestor, pack))[0].r;
  Number(r.criadas.checklists) > 0
    ? ok(`${pack}: ${r.criadas.categorias} categorias, ${r.criadas.medicoes} medições, ${r.criadas.checklists} checklists`)
    : mau(`${pack} não criou checklists`);
}

{
  // O pack de obras traz uma tarefa com foto obrigatória — é o ponto todo de
  // uma vistoria inicial.
  const f = await um(`
    SELECT ct.foto_obrigatoria FROM public.ops_checklist_tarefa ct
      JOIN public.ops_checklist c ON c.id = ct.checklist_id
     WHERE c.codigo='CHK-OBRA-INI' AND ct.posicao = 0`);
  f?.foto_obrigatoria === true
    ? ok("a vistoria inicial exige a foto do estado à chegada")
    : mau("a foto da vistoria inicial não ficou obrigatória");
}

/* ── Quem pode ──────────────────────────────────────────────────────────── */

console.log("\n─── quem instala ───────────────────────");
{
  let recusou = false;
  try {
    await instalar(AUTH.tecnico, "manutencao");
  } catch (e) {
    recusou = e.message.includes("Só quem coordena");
    await db.exec("ROLLBACK").catch(() => {});
  }
  recusou ? ok("um técnico não instala packs")
          : mau("um técnico conseguiu instalar um pack");
}

{
  let recusou = false;
  try {
    await instalar(AUTH.gestor, "pack-que-nao-existe");
  } catch (e) {
    recusou = e.message.includes("Não existe nenhum pack");
    await db.exec("ROLLBACK").catch(() => {});
  }
  recusou ? ok("um pack inventado é recusado, com mensagem")
          : mau("aceitou um pack que não existe");
}

/* ── Fica escrito ───────────────────────────────────────────────────────── */

console.log("\n─── o que ficou no histórico ────────────");
{
  const n = await um(`SELECT count(*)::int AS n FROM public.ops_evento
                       WHERE tipo='pack_instalado' AND organization_id='${ORG}'`);
  n.n >= 3
    ? ok(`${n.n} instalações registadas, com quem e o quê`)
    : mau(`só ${n.n} eventos`);
}

{
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
console.log("✓ um pack instala-se, repete-se, e nunca reescreve o que já lá estava");
