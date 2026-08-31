/**
 * Corre a SEQUÊNCIA DE INSTALAÇÃO inteira contra um Postgres limpo:
 *
 *     schema.sql → permissoes.sql → notificacoes.sql → rpcs.sql
 *                 → rpcs-tarefas.sql
 *                 → planos.sql → correcoes-modelo.sql → medicoes.sql
 *                 → agenda.sql → despacho.sql → orcamentos.sql → anexos.sql
 *                 → assinaturas.sql
 *                 → planos-crud.sql → config.sql → packs.sql → custos.sql
 *                 → analises.sql → cliente-crm.sql
 *                 → criar-utilizador.sql
 *                 → pos-instalacao.sql → demo.sql → demo-remover.sql
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

/**
 * Um passo que TEM de ser recusado, e com a mensagem certa.
 *
 * Uma guarda que dispara a mensagem errada é quase tão má como não existir:
 * pára a operação e deixa quem a corre sem saber o que fazer a seguir.
 */
async function passoRecusado(nome, sql, trechoEsperado) {
  process.stdout.write(`→ ${nome}… `);
  try {
    await db.exec(sql);
    console.log("PASSOU — devia ter sido recusado");
    falhas.push(nome);
  } catch (e) {
    // Uma exceção dentro de BEGIN deixa a sessão em transação abortada.
    await db.exec("ROLLBACK").catch(() => {});
    if (e.message.includes(trechoEsperado)) {
      console.log("recusado, como devia");
    } else {
      console.log(`recusado, mas com a mensagem errada: ${e.message}`);
      falhas.push(nome);
    }
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

// Antes das RPCs, porque são elas que chamam ops_notificar(). A chamada está
// atrás de um to_regprocedure, por isso a ordem não parte nada — mas fora de
// ordem os avisos ficam por enviar, e isso não dá erro nenhum.
await passo("db/notificacoes.sql", ler("notificacoes.sql"));
await passo("db/notificacoes.sql outra vez (idempotência)", ler("notificacoes.sql"));

// A lógica na base: RPCs, triggers, planos, e as correções ao modelo.
// A ordem importa — correcoes-modelo.sql substitui funções que planos.sql cria.
await passo("db/rpcs.sql", ler("rpcs.sql"));
await passo("db/rpcs-tarefas.sql", ler("rpcs-tarefas.sql"));
await passo("db/planos.sql", ler("planos.sql"));
await passo("db/correcoes-modelo.sql", ler("correcoes-modelo.sql"));
await passo("db/correcoes-modelo.sql outra vez (idempotência)", ler("correcoes-modelo.sql"));
await passo("db/medicoes.sql", ler("medicoes.sql"));
await passo("db/medicoes.sql outra vez (idempotência)", ler("medicoes.sql"));
await passo("db/agenda.sql", ler("agenda.sql"));
await passo("db/agenda.sql outra vez (idempotência)", ler("agenda.sql"));
await passo("db/despacho.sql", ler("despacho.sql"));
await passo("db/despacho.sql outra vez (idempotência)", ler("despacho.sql"));
await passo("db/orcamentos.sql", ler("orcamentos.sql"));
await passo("db/orcamentos.sql outra vez (idempotência)", ler("orcamentos.sql"));
await passo("db/anexos.sql", ler("anexos.sql"));
await passo("db/anexos.sql outra vez (idempotência)", ler("anexos.sql"));
await passo("db/assinaturas.sql", ler("assinaturas.sql"));
await passo("db/assinaturas.sql outra vez (idempotência)", ler("assinaturas.sql"));
await passo("db/planos-crud.sql", ler("planos-crud.sql"));
await passo("db/planos-crud.sql outra vez (idempotência)", ler("planos-crud.sql"));
await passo("db/config.sql", ler("config.sql"));
await passo("db/config.sql outra vez (idempotência)", ler("config.sql"));
await passo("db/packs.sql", ler("packs.sql"));
await passo("db/packs.sql outra vez (idempotência)", ler("packs.sql"));
await passo("db/custos.sql", ler("custos.sql"));
await passo("db/custos.sql outra vez (idempotência)", ler("custos.sql"));
await passo("db/analises.sql", ler("analises.sql"));
await passo("db/analises.sql outra vez (idempotência)", ler("analises.sql"));
await passo("db/cliente-crm.sql", ler("cliente-crm.sql"));
await passo("db/cliente-crm.sql outra vez (idempotência)", ler("cliente-crm.sql"));

// ── 3. Criar o perfil de CRM de uma conta que so existe na autenticacao ──
await passo("db/criar-utilizador.sql", ler("criar-utilizador.sql"));
await passoRecusado(
  "db/criar-utilizador.sql outra vez recusa duplicar",
  ler("criar-utilizador.sql"),
  "já tem perfil de CRM"
);

console.log("\n─── depois de criar o utilizador ────────");
{
  const u = await um(`
    SELECT u.email, e.display_name AS nome, o.name AS org, r.name AS papel
      FROM public.anew_users u
      JOIN public.anew_entities e     ON e.id = u.entity_id
      JOIN public.anew_memberships m  ON m.user_id = u.id AND m.status = 'active'
      JOIN public.anew_organizations o ON o.id = m.organization_id
      JOIN public.anew_roles r        ON r.id = m.role_id
     WHERE u.email = 'olyvia-live-ui-check+11544965@example.invalid'`);
  u
    ? ok(`perfil criado: ${u.nome} — ${u.papel} em ${u.org}`)
    : mau("o perfil de CRM não ficou completo (entidade, utilizador e membership)");
}

// ── 4. Pós-instalação ────────────────────────────────────────────────────
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

// ── 5. Demo ──────────────────────────────────────────────────────────────
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
  c.tarefas === 7 ? ok("7 tarefas") : mau(`esperava 7 tarefas, encontrei ${c.tarefas}`);

  // A demo tem de deixar as medições prontas a responder, senão o ecrã do
  // técnico não tem nada para mostrar a quem a instala para experimentar.
  const m = await um(`
    SELECT count(*)::int AS n FROM public.ops_ordem_tarefa_medicao m
      JOIN public.ops_ordem_tarefa t ON t.id = m.ordem_tarefa_id
      JOIN public.ops_ordem o ON o.id = t.ordem_id
     WHERE o.codigo = 'OT-DEMO-001' AND m.lida_em IS NULL`);
  m.n === 3
    ? ok("3 medições por responder, uma de cada feitio")
    : mau(`esperava 3 medições por responder, encontrei ${m.n}`);

  const op = await um(`
    SELECT count(*)::int AS n FROM public.ops_medicao_opcao
     WHERE cria_corretiva`);
  op.n === 1
    ? ok("a opção que abre corretiva está ligada — é a que o Infraspeak tem desligada")
    : mau(`esperava 1 opção a abrir corretiva, encontrei ${op.n}`);
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

// ── 6. Remoção ───────────────────────────────────────────────────────────
// O lado do CRM é fotografado ANTES de remover e comparado depois. Contagens
// fixas quebram-se de cada vez que o teste ganha um passo novo, e uma
// verificação que se quebra sozinha acaba por ser desligada.
const crmAntesDaRemocao = await um(`
  SELECT
    (SELECT count(*)::int FROM public.anew_clients)          AS clientes,
    (SELECT count(*)::int FROM public.anew_users)            AS utilizadores,
    (SELECT count(*)::int FROM public.anew_entities)         AS entidades,
    (SELECT count(*)::int FROM public.anew_memberships)      AS memberships
`);

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
      (SELECT count(*)::int FROM public.anew_users)            AS utilizadores,
      (SELECT count(*)::int FROM public.anew_entities)         AS entidades,
      (SELECT count(*)::int FROM public.anew_memberships)      AS memberships
  `);
  c.ordens === 0 && c.locais === 0
    ? ok("a demo saiu toda")
    : mau(`sobraram ${c.ordens} ordens e ${c.locais} locais`);
  c.tarefas === 0 && c.sessoes === 0
    ? ok("tarefas e sessões saíram por CASCADE")
    : mau(`sobraram ${c.tarefas} tarefas e ${c.sessoes} sessões`);

  const crmDepois = {
    clientes: c.clientes,
    utilizadores: c.utilizadores,
    entidades: c.entidades,
    memberships: c.memberships,
  };
  JSON.stringify(crmAntesDaRemocao) === JSON.stringify(crmDepois)
    ? ok("os dados do CRM ficaram intactos")
    : mau(
        `a remoção da demo mexeu no CRM: ${JSON.stringify(crmAntesDaRemocao)} → ${JSON.stringify(crmDepois)}`
      );
}

// ── Voltar a correr um ficheiro sozinho, numa base já completa ──────────
//
// É isto que se faz a sério: um ficheiro muda, e cola-se SÓ esse no SQL Editor
// do Supabase, numa base que já tem tudo o resto.
//
// A sequência de cima NÃO apanha este caso. Correu correcoes-modelo.sql antes de
// orcamentos.sql, e o bloco de verificação desse ficheiro contava todas as
// tabelas `ops_*` e comparava com 26 — o número certo naquele instante. Numa
// base completa dá 27, e o ficheiro inteiro fazia rollback com "Esperadas 26
// tabelas ops_*, encontradas 27". Foi assim que rebentou em produção.
//
// Um ficheiro que não se pode voltar a correr não serve para nada.

console.log("\n─── cada ficheiro sozinho, numa base completa ─");

for (const f of [
  "schema.sql", "permissoes.sql", "notificacoes.sql", "rpcs.sql", "rpcs-tarefas.sql",
  "planos.sql", "correcoes-modelo.sql", "medicoes.sql", "agenda.sql", "despacho.sql",
  "orcamentos.sql", "anexos.sql", "assinaturas.sql", "planos-crud.sql", "config.sql", "custos.sql",
  "packs.sql", "analises.sql", "cliente-crm.sql",
]) {
  try {
    await db.exec(ler(f));
    ok(`db/${f} volta a correr sozinho`);
  } catch (e) {
    mau(`db/${f} não volta a correr: ${e.message.split("\n")[0]}`);
  }
}

// ── Veredicto ────────────────────────────────────────────────────────────
console.log("");
if (falhas.length) {
  console.error(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ a sequência de instalação corre de ponta a ponta, e é repetível");
