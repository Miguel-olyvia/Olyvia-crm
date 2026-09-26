/**
 * Tipo de trabalho, centro de custo, fornecedor e o fecho automático.
 *
 * O que aqui se prova, sobretudo, é **quando NÃO fecha**: uma ordem que se
 * fecha sozinha antes de tempo é trabalho dado por feito sem estar.
 *
 *     npm run validar-campos
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
const GESTOR = "33333333-3333-3333-3333-333333333333";

await db.exec(STUBS_CRM);
await db.exec(`
  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}', 'Org');
  INSERT INTO public.anew_entities (id, display_name) VALUES ('${ENT}', 'Cliente');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('${CLI}', '${ORG}', '${ENT}');
  INSERT INTO public.anew_users (id, name, email)
    VALUES ('${GESTOR}', 'Rita', 'rita@x.pt');
`);

for (const f of ["schema.sql", "permissoes.sql", "notificacoes.sql", "rpcs.sql"]) {
  await db.exec(ler(f));
}
await db.exec(ler("campos-ordem.sql"));
// Um ficheiro que não se pode voltar a correr não serve para nada.
await db.exec(ler("campos-ordem.sql"));

await db.exec(`
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao)
  VALUES ('${ORG}', '${GESTOR}', 'gestor');
`);

console.log("\n─── os tipos de trabalho ────────────────");
{
  const n = await um(`SELECT public.ops_semear_tipos_trabalho($1) AS n`, [ORG]);
  conferir(n.n === 9, `semeia os nove tipos do Infraspeak (semeou ${n.n})`);

  const outra = await um(`SELECT public.ops_semear_tipos_trabalho($1) AS n`, [ORG]);
  conferir(outra.n === 0, "semear outra vez não duplica nada");

  const nomes = (await todos(
    `SELECT nome FROM public.ops_tipo_trabalho WHERE organization_id = $1 ORDER BY posicao`,
    [ORG]
  )).map((r) => r.nome);
  conferir(
    ["Preventiva", "Rotina", "Ponto zero", "Auditoria", "Melhoria",
     "Instalação", "Obra", "Remodelação", "Acompanhamento Externo"]
      .every((x) => nomes.includes(x)),
    "com os nomes certos, incluindo Auditoria e Acompanhamento Externo"
  );
  conferir(!nomes.includes("Pedido"), "e sem 'Pedido' — aqui isso é uma origem, não um tipo");

  // PMP é o código de três tipos na instância observada. Se o código fosse
  // chave, isto rebentava — e é por isso que não é.
  const pmp = await um(
    `SELECT count(*)::int AS n FROM public.ops_tipo_trabalho
      WHERE organization_id = $1 AND codigo = 'PMP'`, [ORG]);
  conferir(pmp.n === 3, "o código PMP repete-se em três tipos, como na realidade");

  // Nenhum fecha sozinho à nascença. Um palpite meu a fechar ordens de onze
  // empresas seria pior do que um interruptor por ligar.
  const auto = await um(
    `SELECT count(*)::int AS n FROM public.ops_tipo_trabalho
      WHERE organization_id = $1 AND fecha_automatico`, [ORG]);
  conferir(auto.n === 0, "nenhum tipo fecha ordens sozinho sem alguém o ter decidido");
}

console.log("\n─── os campos na ordem ──────────────────");
{
  const cols = await todos(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ops_ordem'
        AND column_name IN ('tipo_trabalho_id','centro_custo_id','fornecedor_id','fecha_automatico')`);
  conferir(cols.length === 4, `os quatro campos existem (${cols.length})`);

  // O fornecedor é do CRM: guarda-se o id, sem amarrar nada.
  const fk = await um(`
    SELECT count(*)::int AS n FROM pg_constraint c
     WHERE c.contype = 'f' AND c.conname LIKE '%fornecedor%'`);
  conferir(fk.n === 0, "o fornecedor não tem chave estrangeira para fora");
}

console.log("\n─── o centro de custo herda-se ──────────");
{
  const cc = (await um(
    `SELECT public.rpc_ops_gravar_centro_custo($1,'CC1','Torre S. Gabriel') AS r`, [ORG]
  )).r.id;
  conferir(!!cc, "cria-se um centro de custo");

  const loc = (await um(
    `INSERT INTO public.ops_local (organization_id, cliente_id, codigo, nome, tipo)
     VALUES ($1,$2,'L1','Piso 22','espaco') RETURNING id`, [ORG, CLI])).id;
  const at = (await um(
    `INSERT INTO public.ops_ativo (organization_id, local_id, codigo, nome, centro_custo_id)
     VALUES ($1,$2,'A1','Extintor',$3) RETURNING id`, [ORG, loc, cc])).id;

  const o = (await um(
    `INSERT INTO public.ops_ordem (organization_id, codigo, origem, estado, cliente_id, titulo)
     VALUES ($1,'OT-1','preventiva','agendada',$2,'Inspeção') RETURNING id`, [ORG, CLI])).id;
  await db.query(
    `INSERT INTO public.ops_ordem_alvo (ordem_id, ativo_id) VALUES ($1,$2)`, [o, at]);

  const depois = await um(`SELECT centro_custo_id FROM public.ops_ordem WHERE id = $1`, [o]);
  conferir(depois.centro_custo_id === cc, "a ordem herda o centro de custo do equipamento");

  // Quem escolheu, escolheu: a herança não sobrepõe uma decisão feita à mão.
  const cc2 = (await um(
    `SELECT public.rpc_ops_gravar_centro_custo($1,'CC2','Outro') AS r`, [ORG])).r.id;
  const o2 = (await um(
    `INSERT INTO public.ops_ordem (organization_id, codigo, origem, estado, cliente_id, titulo, centro_custo_id)
     VALUES ($1,'OT-2','preventiva','agendada',$2,'Com escolha',$3) RETURNING id`,
    [ORG, CLI, cc2])).id;
  await db.query(`INSERT INTO public.ops_ordem_alvo (ordem_id, ativo_id) VALUES ($1,$2)`, [o2, at]);
  const d2 = await um(`SELECT centro_custo_id FROM public.ops_ordem WHERE id = $1`, [o2]);
  conferir(d2.centro_custo_id === cc2, "e não sobrepõe uma escolha já feita");
}

console.log("\n─── fechar sozinha: quando NÃO ─────────");
let ordemAuto;
{
  ordemAuto = (await um(
    `INSERT INTO public.ops_ordem
       (organization_id, codigo, origem, estado, cliente_id, titulo, fecha_automatico)
     VALUES ($1,'OT-3','preventiva','em_curso',$2,'Rotina',true) RETURNING id`,
    [ORG, CLI])).id;

  await db.query(
    `INSERT INTO public.ops_ordem_tarefa (ordem_id, posicao, nome, obrigatoria, estado)
     VALUES ($1,1,'Obrigatória A',true,'pendente'),
            ($1,2,'Obrigatória B',true,'pendente'),
            ($1,3,'Opcional',false,'pendente')`, [ordemAuto]);

  let r = (await um(`SELECT public.rpc_ops_fechar_se_completa($1) AS r`, [ordemAuto])).r;
  conferir(r.fechou === false && r.porque === "faltam_tarefas",
    "com tarefas obrigatórias por responder, não fecha");
  conferir(r.faltam === 2, "e diz quantas faltam");

  await db.query(
    `UPDATE public.ops_ordem_tarefa SET estado='feita'
      WHERE ordem_id=$1 AND nome='Obrigatória A'`, [ordemAuto]);
  r = (await um(`SELECT public.rpc_ops_fechar_se_completa($1) AS r`, [ordemAuto])).r;
  conferir(r.fechou === false, "com uma respondida e outra não, continua sem fechar");

  const naoAuto = (await um(
    `INSERT INTO public.ops_ordem
       (organization_id, codigo, origem, estado, cliente_id, titulo, fecha_automatico)
     VALUES ($1,'OT-4','obra','em_curso',$2,'Obra',false) RETURNING id`, [ORG, CLI])).id;
  r = (await um(`SELECT public.rpc_ops_fechar_se_completa($1) AS r`, [naoAuto])).r;
  conferir(r.fechou === false && r.porque === "nao_e_automatica",
    "uma ordem não marcada para isso nunca fecha sozinha, nem sem tarefas nenhumas");

  const pausada = (await um(
    `INSERT INTO public.ops_ordem
       (organization_id, codigo, origem, estado, cliente_id, titulo, fecha_automatico,
        pausa_motivo, pausa_retoma_prevista)
     VALUES ($1,'OT-5','preventiva','pausada',$2,'Pausada',true,
             'A aguardar material', now() + interval '2 days') RETURNING id`, [ORG, CLI])).id;
  r = (await um(`SELECT public.rpc_ops_fechar_se_completa($1) AS r`, [pausada])).r;
  conferir(r.fechou === false && r.porque === "nao_esta_em_curso",
    "uma ordem pausada não fecha sozinha por baixo de quem a pausou");
}

console.log("\n─── fechar sozinha: quando sim ─────────");
{
  await db.query(
    `UPDATE public.ops_ordem_tarefa SET estado='nao_conforme'
      WHERE ordem_id=$1 AND nome='Obrigatória B'`, [ordemAuto]);

  const r = (await um(`SELECT public.rpc_ops_fechar_se_completa($1) AS r`, [ordemAuto])).r;
  conferir(r.fechou === true, "respondidas todas as obrigatórias, fecha");

  // "Não conforme" é uma resposta. Uma ordem que não fechasse por causa disso
  // ficava aberta para sempre à espera de um "sim" que ninguém vai dar.
  ok("e uma resposta 'não conforme' conta como respondida");

  const est = await um(`SELECT estado, fechada_em FROM public.ops_ordem WHERE id=$1`, [ordemAuto]);
  conferir(est.estado === "fechada", "o estado passou a fechada");
  conferir(est.fechada_em !== null, "com a data do fecho");

  const ev = await um(
    `SELECT tipo, descricao, depois FROM public.ops_evento
      WHERE entidade='ordem' AND entidade_id=$1 AND tipo='fechar'`, [ordemAuto]);
  conferir(!!ev, "e fica no histórico");
  conferir(ev?.depois?.automatico === true, "marcado como automático, e não como se alguém tivesse carregado");

  const outra = (await um(`SELECT public.rpc_ops_fechar_se_completa($1) AS r`, [ordemAuto])).r;
  conferir(outra.fechou === false, "chamar outra vez não faz nada — é chamada a toda a hora");
}

console.log("\n─── quem pode mexer nas listas ─────────");
{
  conferir(
    (await um(`SELECT has_function_privilege('anon',
        'public.rpc_ops_gravar_tipo_trabalho(uuid,text,text,boolean,uuid,boolean)','EXECUTE') AS p`)).p === false,
    "quem não tem sessão não mexe nos tipos de trabalho"
  );
  conferir(
    (await um(`SELECT has_table_privilege('anon','public.ops_centro_custo','SELECT') AS p`)).p === false,
    "nem lê os centros de custo"
  );
  conferir(
    (await um(`SELECT count(*)::int AS n FROM pg_policies
                WHERE tablename IN ('ops_tipo_trabalho','ops_centro_custo')
                  AND cmd <> 'SELECT'`)).n === 0,
    "e não há escrita direta nas tabelas — só pelas RPCs"
  );
}

console.log("\n─── o módulo continua contido ──────────");
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
console.log("✓ os campos novos, e a ordem só fecha sozinha quando devia");
