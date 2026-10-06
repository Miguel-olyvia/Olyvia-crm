/**
 * Prova os ficheiros de DADOS DE TESTE tal como vão ser colados no SQL Editor
 * (tools/gerar-dados-de-teste.mjs), numa base com DUAS organizações:
 *
 *   · com duas organizações em Operações e sem nome, recusa — e diz quais são;
 *   · com um nome que não existe, recusa;
 *   · com o nome certo, cria tudo nessa organização e NADA na outra;
 *   · há obras em todos os estados, tarefas em todos os estados, extras em
 *     todos os estados, e registos de tempo de mais do que uma pessoa;
 *   · correr outra vez não duplica;
 *   · remover deixa zero dados DEMO, mantém o modelo da casa de banho, e não
 *     toca no CRM.
 *
 *     node tools/validar-demo.mjs
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STUBS_CRM, DADOS_CRM } from "./_stubs-crm.mjs";
import { dadosDeTeste, dadosDeTesteRemover } from "./gerar-dados-de-teste.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (f) => readFileSync(join(RAIZ, "db", f), "utf8");

const INSTALACAO = [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
  "seguranca.sql", "tempos.sql", "obras.sql",
];

const ORG_A = "11111111-1111-1111-1111-111111111111"; // "Grupo de teste", dos stubs
const ORG_B = "b0000000-0000-0000-0000-00000000000b";
const RUBEN = "55555555-5555-5555-5555-555555555555";
const TEC1 = "c0000000-0000-0000-0000-000000000001";
const TEC2 = "c0000000-0000-0000-0000-000000000002";
const SUP = "c0000000-0000-0000-0000-000000000003";
const GESTOR_B = "c0000000-0000-0000-0000-00000000000b";

const db = new PGlite();
await db.waitReady;
const um = async (sql) => (await db.query(sql)).rows[0];

const falhas = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mau = (m) => {
  console.log(`  ✗ ${m}`);
  falhas.push(m);
};
const verifica = (cond, m, detalhe = "") => (cond ? ok(m) : mau(`${m}${detalhe ? ` — ${detalhe}` : ""}`));

async function passo(nome, sql) {
  try {
    await db.exec(sql);
  } catch (e) {
    console.log(`✗ ${nome}: ${e.message}`);
    process.exit(1);
  }
}

async function recusado(nome, sql, trecho) {
  try {
    await db.exec(sql);
    mau(`${nome} — devia ter sido recusado`);
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    verifica(e.message.includes(trecho), nome, e.message);
  }
}

// ── Base: o CRM, o módulo, e duas organizações com gente em Operações ──
await passo("stubs", STUBS_CRM);
await passo("dados CRM", DADOS_CRM);
for (const f of INSTALACAO) await passo(f, ler(f));
await passo("segunda organização e perfis", `
  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG_B}', 'Outra empresa');
  INSERT INTO public.anew_entities (id, display_name) VALUES ('e000000b-0000-0000-0000-00000000000b', 'Cliente B');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('d000000b-0000-0000-0000-00000000000b', '${ORG_B}', 'e000000b-0000-0000-0000-00000000000b');
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao, custo_hora, criado_em) VALUES
    ('${ORG_A}', '${RUBEN}', 'gestor', 25, now() - interval '4 days'),
    ('${ORG_A}', '${TEC1}', 'tecnico', 15, now() - interval '3 days'),
    ('${ORG_A}', '${TEC2}', 'tecnico', 14, now() - interval '2 days'),
    ('${ORG_A}', '${SUP}', 'supervisor', 20, now() - interval '1 day'),
    ('${ORG_B}', '${GESTOR_B}', 'gestor', 25, now());
`);

const contarCrm = async () =>
  um(`SELECT (SELECT count(*) FROM public.anew_clients)::int AS clientes,
             (SELECT count(*) FROM public.anew_organizations)::int AS orgs,
             (SELECT count(*) FROM public.anew_users)::int AS users`);
const crmAntes = await contarCrm();

console.log("─── escolher a organização ──────────────");
await recusado("duas organizações e sem nome: recusa e diz quais", dadosDeTeste(""), "Há 2 organizações com Operações");
await recusado("um nome que não existe: recusa", dadosDeTeste("Empresa Fantasma"), "Não há nenhuma organização");
const nada = await um(`SELECT count(*)::int AS n FROM public.ops_obra`);
verifica(nada.n === 0, "uma recusa não deixa nada a meio");

console.log("─── criar ───────────────────────────────");
await passo("dados-de-teste.sql com o nome", dadosDeTeste("grupo de teste"));

const contar = async (org) =>
  um(`SELECT
    (SELECT count(*) FROM public.ops_obra WHERE organization_id='${org}' AND codigo LIKE 'OB-DEMO-%')::int AS obras,
    (SELECT count(*) FROM public.ops_ordem WHERE organization_id='${org}' AND codigo LIKE 'OT-DEMO-%')::int AS ordens,
    (SELECT count(*) FROM public.ops_obra_modelo WHERE organization_id='${org}')::int AS modelos,
    (SELECT count(*) FROM public.ops_obra_tarefa WHERE organization_id='${org}')::int AS tarefas,
    (SELECT count(*) FROM public.ops_obra_registo WHERE organization_id='${org}')::int AS registos,
    (SELECT count(*) FROM public.ops_obra_extra WHERE organization_id='${org}')::int AS extras,
    (SELECT count(*) FROM public.ops_local WHERE organization_id='${org}' AND codigo LIKE 'DEMO-%')::int AS locais`);

const a = await contar(ORG_A);
const b = await contar(ORG_B);
verifica(a.obras === 6, `6 obras DEMO na organização escolhida`, JSON.stringify(a));
verifica(a.ordens > 0 && a.locais > 0, `ordens (${a.ordens}) e locais (${a.locais}) DEMO também lá`);
verifica(a.modelos === 3, "3 modelos: casa de banho, cozinha e pintura");
verifica(Object.values(b).every((n) => n === 0), "nada na outra organização", JSON.stringify(b));

const estados = async (tabela, col = "estado") =>
  (await db.query(`SELECT DISTINCT ${col} AS e FROM public.${tabela} WHERE organization_id='${ORG_A}' ORDER BY 1`)).rows
    .map((r) => r.e)
    .join(",");
verifica((await estados("ops_obra")) === "concluida,em_curso,planeada,suspensa", "obras em todos os estados", await estados("ops_obra"));
verifica(
  (await estados("ops_obra_tarefa")) === "em_curso,feita,por_fazer,rejeitada,validada",
  "tarefas em todos os estados",
  await estados("ops_obra_tarefa")
);
verifica((await estados("ops_obra_extra")) === "aprovado,enviado,recusado,registado", "extras em todos os estados", await estados("ops_obra_extra"));

const pessoas = await um(`SELECT count(DISTINCT utilizador_id)::int AS n FROM public.ops_obra_registo WHERE organization_id='${ORG_A}' AND fim IS NOT NULL`);
verifica(pessoas.n === 2, "tempos dos 2 técnicos (as métricas por pessoa têm com quê comparar)", `pessoas=${pessoas.n}`);

const ritmo = await db.query(`
  SELECT r.utilizador_id, round(sum(extract(epoch FROM r.fim - r.inicio)/60) / sum(t.minutos_previstos), 2) AS fator
    FROM public.ops_obra_registo r JOIN public.ops_obra_tarefa t ON t.id = r.tarefa_id
   WHERE r.organization_id='${ORG_A}' AND r.fim IS NOT NULL AND t.nome NOT ILIKE '%demão%'
   GROUP BY 1 ORDER BY 2`);
verifica(
  ritmo.rows.length === 2 && Number(ritmo.rows[1].fator) - Number(ritmo.rows[0].fator) >= 0.1,
  "uma pessoa é claramente mais lenta do que a outra",
  JSON.stringify(ritmo.rows)
);

const demao = await um(`
  SELECT round(avg(extract(epoch FROM r.fim - r.inicio)/60 / t.minutos_previstos), 2) AS fator
    FROM public.ops_obra_registo r JOIN public.ops_obra_tarefa t ON t.id = r.tarefa_id
   WHERE r.organization_id='${ORG_A}' AND r.fim IS NOT NULL AND t.nome ILIKE '%demão%'`);
verifica(Number(demao.fator) > 1.2, `as demãos derrapam sempre (real/previsto = ${demao.fator})`);

const semMotivo = await um(`
  SELECT count(*)::int AS n FROM public.ops_obra_tarefa t
    JOIN public.ops_obra o ON o.id = t.obra_id
   WHERE t.organization_id='${ORG_A}' AND t.estado IN ('feita','validada','rejeitada') AND t.motivo_desvio IS NULL
     AND (SELECT sum(extract(epoch FROM r.fim - r.inicio)/60) FROM public.ops_obra_registo r WHERE r.tarefa_id = t.id)
         > t.minutos_previstos * (1 + o.tolerancia_percent/100.0)`);
verifica(semMotivo.n === 0, "toda a tarefa acima da tolerância tem motivo de desvio, como a app exige");

const validadas = await um(`
  SELECT count(*) FILTER (WHERE validada_por = '${SUP}')::int AS sup, count(*)::int AS total
    FROM public.ops_obra_tarefa WHERE organization_id='${ORG_A}' AND estado='validada'`);
verifica(validadas.total > 0 && validadas.sup === validadas.total, "as validações são do supervisor", JSON.stringify(validadas));

const abertos = await um(`SELECT count(*)::int AS n FROM public.ops_obra_registo WHERE fim IS NULL`);
verifica(abertos.n === 1, "só um relógio a correr (o da OB-DEMO-001)", `abertos=${abertos.n}`);

const planeada = await um(`SELECT data_inicio_prevista > current_date AS futura FROM public.ops_obra WHERE codigo='OB-DEMO-005'`);
verifica(planeada.futura === true, "a obra planeada começa no futuro");

console.log("─── outra vez ───────────────────────────");
await passo("dados-de-teste.sql outra vez", dadosDeTeste("Grupo de teste"));
const a2 = await contar(ORG_A);
verifica(JSON.stringify(a2) === JSON.stringify(a), "correr outra vez não duplica nada", `${JSON.stringify(a)} → ${JSON.stringify(a2)}`);

console.log("─── remover ─────────────────────────────");
await passo("dados-de-teste-remover.sql", dadosDeTesteRemover());
const a3 = await contar(ORG_A);
verifica(
  a3.obras === 0 && a3.ordens === 0 && a3.locais === 0 && a3.tarefas === 0 && a3.registos === 0 && a3.extras === 0,
  "não fica nenhum dado DEMO",
  JSON.stringify(a3)
);
const modelos = (await db.query(`SELECT nome FROM public.ops_obra_modelo WHERE organization_id='${ORG_A}'`)).rows.map((r) => r.nome);
verifica(modelos.length === 1 && modelos[0] === "Remodelação casa de banho", "fica só o modelo da casa de banho", modelos.join(","));
const perfis = await um(`SELECT count(*)::int AS n FROM public.ops_utilizador_perfil`);
verifica(perfis.n === 5, "os perfis das pessoas ficam");
verifica(JSON.stringify(await contarCrm()) === JSON.stringify(crmAntes), "o CRM ficou como estava");

// ── Só uma pessoa em Operações (o caso de quem está a começar) ──
console.log("─── só uma pessoa, uma organização ──────");
{
  const so = new PGlite();
  await so.waitReady;
  await so.exec(STUBS_CRM);
  await so.exec(DADOS_CRM);
  for (const f of INSTALACAO) await so.exec(ler(f));
  await so.exec(`INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao)
                 VALUES ('${ORG_A}', '${RUBEN}', 'gestor');`);
  try {
    await so.exec(dadosDeTeste(""));
    const r = (await so.query(`SELECT count(*)::int AS obras,
        (SELECT count(*) FROM public.ops_obra_registo)::int AS registos
        FROM public.ops_obra WHERE codigo LIKE 'OB-DEMO-%'`)).rows[0];
    verifica(r.obras === 6 && r.registos > 0, "sem nome escolhe a única organização e cria tudo com uma só pessoa", JSON.stringify(r));
  } catch (e) {
    mau(`com uma só pessoa rebentou: ${e.message}`);
  }
}

if (falhas.length) {
  console.log(`\n✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("\n✓ os dados de teste criam-se na organização certa, completos, sem duplicar, e saem todos");
