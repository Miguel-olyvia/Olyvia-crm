/**
 * Corre a SEQUÊNCIA DE INSTALAÇÃO inteira contra um Postgres limpo:
 *
 *     schema.sql → permissoes.sql → pos-instalacao.sql → demo.sql → demo-remover.sql
 *
 * Serve para que ninguém descubra em produção que o terceiro ficheiro não
 * corre depois do segundo. Corre em segundos, sem Docker e sem tocar no
 * Supabase.
 *
 *     npm run validar-instalacao
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STUBS_CRM, DADOS_CRM } from "./_stubs-crm.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (f) => readFileSync(join(RAIZ, "db", f), "utf8");

const db = new PGlite();
await db.waitReady;
const q = async (sql) => (await db.query(sql)).rows;
const um = async (sql) => (await q(sql))[0];

const falhas = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mau = (m) => {
  console.log(`  ✗ ${m}`);
  falhas.push(m);
};

async function passo(nome, sql) {
  process.stdout.write(`→ ${nome}… `);
  try {
    await db.exec(sql);
    console.log("ok");
  } catch (e) {
    console.log("FALHOU");
    console.error(`\n  ${e.message}\n`);
    process.exit(1);
  }
}

// ── 1. Um CRM como o real ────────────────────────────────────────────────
await passo("stubs do CRM", STUBS_CRM);
await passo("dados do CRM (1 org, 1 cliente, 1 utilizador)", DADOS_CRM);

// ── 2. O esquema ─────────────────────────────────────────────────────────
await passo("db/schema.sql", ler("schema.sql"));

// Idempotência: aplicar duas vezes tem de ser inofensivo. É a diferença
// entre poder repetir a instalação e ficar com medo de lhe tocar.
await passo("db/schema.sql outra vez (idempotência)", ler("schema.sql"));

// Sem permissoes.sql o esquema fica de pé na mesma — só ninguém vê nada.
// Correr a seguir prova que o catálogo é um passo à parte, não um pré-requisito.
{
  const n = await um(
    `SELECT count(*)::int AS n FROM public.anew_permissions WHERE category = 'operations'`
  );
  n.n === 0
    ? ok("schema.sql não escreveu uma linha fora de ops_*")
    : mau(`schema.sql escreveu ${n.n} permissões — devia ter escrito 0`);
}

await passo("db/permissoes.sql", ler("permissoes.sql"));
await passo("db/permissoes.sql outra vez (idempotência)", ler("permissoes.sql"));

// ── 3. Pós-instalação ────────────────────────────────────────────────────
// Corrido VERBATIM. Os stubs foram feitos para casar com a CONFIGURAÇÃO do
// ficheiro, em vez de o ficheiro ser adulterado para casar com o teste.
await passo("db/pos-instalacao.sql", ler("pos-instalacao.sql"));
await passo("db/pos-instalacao.sql outra vez (idempotência)", ler("pos-instalacao.sql"));

console.log("\n─── depois da pós-instalação ────────────");
{
  const r = await um(
    `SELECT count(*)::int AS n FROM public.anew_role_permissions
      WHERE permission_code LIKE 'operations.%'`
  );
  r.n === 15
    ? ok(`as 15 permissões foram atribuídas ao papel`)
    : mau(`esperava 15 permissões atribuídas, encontrei ${r.n}`);

  const p = await um(
    `SELECT funcao, custo_hora FROM public.ops_utilizador_perfil LIMIT 1`
  );
  p?.funcao === "admin"
    ? ok("o utilizador ficou com perfil de admin no módulo")
    : mau(`esperava perfil admin, encontrei ${JSON.stringify(p)}`);
  p && p.custo_hora === null
    ? ok("custo_hora fica por preencher, em vez de ser inventado")
    : mau("custo_hora devia ficar NULL");
}

// ── 4. Demo ──────────────────────────────────────────────────────────────
await passo("db/demo.sql", ler("demo.sql"));
await passo("db/demo.sql outra vez (idempotência)", ler("demo.sql"));

console.log("\n─── depois da demo ──────────────────────");
{
  const c = await um(`
    SELECT
      (SELECT count(*)::int FROM public.ops_local  WHERE codigo LIKE 'DEMO-%')      AS locais,
      (SELECT count(*)::int FROM public.ops_ativo  WHERE codigo LIKE 'DEMO-%')      AS ativos,
      (SELECT count(*)::int FROM public.ops_ordem  WHERE codigo LIKE 'OT-DEMO-%')   AS ordens,
      (SELECT count(*)::int FROM public.ops_ordem_tarefa)                           AS tarefas,
      (SELECT count(*)::int FROM public.ops_sessao_trabalho)                        AS sessoes
  `);
  c.locais === 5 ? ok("5 locais") : mau(`esperava 5 locais, encontrei ${c.locais}`);
  c.ativos === 2 ? ok("2 ativos") : mau(`esperava 2 ativos, encontrei ${c.ativos}`);
  c.ordens === 5 ? ok("5 ordens") : mau(`esperava 5 ordens, encontrei ${c.ordens}`);
  c.tarefas === 6 ? ok("6 tarefas") : mau(`esperava 6 tarefas, encontrei ${c.tarefas}`);
  c.sessoes === 2
    ? ok("2 sessões de trabalho — a demo não duplicou ao correr duas vezes")
    : mau(`esperava 2 sessões, encontrei ${c.sessoes}`);

  // A árvore tem mesmo quatro níveis: Torre › Piso › Garagem, sob o cliente.
  const prof = await um(`
    WITH RECURSIVE t AS (
      SELECT id, parent_id, 1 AS nivel FROM public.ops_local WHERE parent_id IS NULL
      UNION ALL
      SELECT l.id, l.parent_id, t.nivel + 1
        FROM public.ops_local l JOIN t ON l.parent_id = t.id
    ) SELECT max(nivel)::int AS n FROM t`);
  prof.n === 3
    ? ok("a árvore de locais desce 3 níveis (Torre › Piso › Espaço)")
    : mau(`esperava profundidade 3, encontrei ${prof.n}`);

  // O ciclo inspeção → reparação fechou-se.
  const ciclo = await um(`
    SELECT nova.codigo AS nova, t.nome AS tarefa, velha.codigo AS velha
      FROM public.ops_ordem nova
      JOIN public.ops_ordem_tarefa t ON t.id = nova.gerada_por_tarefa_id
      JOIN public.ops_ordem velha ON velha.id = t.ordem_id
     WHERE nova.codigo = 'OT-DEMO-005'`);
  ciclo?.velha === "OT-DEMO-001" && ciclo?.tarefa === "Estado do suporte"
    ? ok("a corretiva aponta para a tarefa não conforme que a gerou")
    : mau(`o ciclo inspeção→reparação não ficou ligado: ${JSON.stringify(ciclo)}`);

  // 47m + 2h00 = 2h47m = 10020s. É daqui que sai o custo de mão de obra.
  const tempo = await um(`
    SELECT COALESCE(sum(EXTRACT(EPOCH FROM (fim - inicio))), 0)::int AS s
      FROM public.ops_sessao_trabalho`);
  tempo.s === 10020
    ? ok("2h47m de trabalho registado — o custo deixa de ser 0,00 €")
    : mau(`esperava 10020s de trabalho, encontrei ${tempo.s}s`);

  // A vista de clientes resolve o nome que anew_clients não tem.
  const cli = await um(`SELECT nome FROM public.ops_v_cliente LIMIT 1`);
  cli?.nome === "Cliente de teste"
    ? ok("ops_v_cliente resolve o nome a partir de anew_entities")
    : mau(`ops_v_cliente não devolveu o nome: ${JSON.stringify(cli)}`);

  // A vista da equipa não pode expor custo_hora, de todo.
  const colunas = await q(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ops_v_equipa'`);
  colunas.some((c) => c.column_name === "custo_hora")
    ? mau("ops_v_equipa expõe custo_hora — a regra dura está quebrada")
    : ok("ops_v_equipa não tem custo_hora");
}

// ── 5. Remoção ───────────────────────────────────────────────────────────
await passo("db/demo-remover.sql", ler("demo-remover.sql"));

console.log("\n─── depois de remover a demo ────────────");
{
  const c = await um(`
    SELECT
      (SELECT count(*)::int FROM public.ops_ordem)             AS ordens,
      (SELECT count(*)::int FROM public.ops_local)             AS locais,
      (SELECT count(*)::int FROM public.ops_ordem_tarefa)      AS tarefas,
      (SELECT count(*)::int FROM public.ops_sessao_trabalho)   AS sessoes,
      (SELECT count(*)::int FROM public.anew_clients)          AS clientes,
      (SELECT count(*)::int FROM public.anew_users)            AS utilizadores
  `);
  c.ordens === 0 && c.locais === 0
    ? ok("a demo saiu toda")
    : mau(`sobraram ${c.ordens} ordens e ${c.locais} locais`);
  c.tarefas === 0 && c.sessoes === 0
    ? ok("tarefas e sessões saíram por CASCADE")
    : mau(`sobraram ${c.tarefas} tarefas e ${c.sessoes} sessões`);
  c.clientes === 1 && c.utilizadores === 1
    ? ok("o cliente e o utilizador do CRM ficaram intactos")
    : mau("a remoção da demo mexeu em dados do CRM");
}

// ── Veredicto ────────────────────────────────────────────────────────────
console.log("");
if (falhas.length) {
  console.error(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ a sequência de instalação corre de ponta a ponta, e é repetível");
