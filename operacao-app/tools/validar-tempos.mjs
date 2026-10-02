/**
 * Prova que o tempo conta o que deve — por pessoa, por tarefa, e ao vivo.
 *
 * Três defeitos que `db/tempos.sql` corrige, e que aqui se reproduzem:
 *
 *   1. Pausar fechava os relógios de todos, mas retomar só reabria o de quem
 *      carregou no botão. Agora cada um liga e desliga o seu, e as
 *      transições só mexem no que é delas.
 *   2. O tempo por tarefa era sempre zero (início e fim no mesmo instante).
 *   3. A mão de obra só aparecia depois de fechar — e, ao reabrir, a linha
 *      antiga podia somar-se à conta ao vivo.
 *
 *     npm run validar-tempos
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STUBS_CRM, PRIVILEGIOS_SUPABASE, AUTENTICACAO_REAL } from "./_stubs-crm.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (f) => readFileSync(join(RAIZ, "db", f), "utf8");

const db = new PGlite();
await db.waitReady;
const q = async (sql) => (await db.query(sql)).rows;
const um = async (sql) => (await q(sql))[0];

const falhas = [];
let passaram = 0;
const ok = (m) => { passaram++; console.log(`  ✓ ${m}`); };
const mau = (m) => { console.log(`  ✗ ${m}`); falhas.push(m); };

const ORG = "11111111-1111-1111-1111-111111111111";
const CLI = "22222222-2222-2222-2222-222222222222";
const ROLE = "dddd0000-0000-0000-0000-00000000000d";
const U = {
  gestor: "aaaa0000-0000-0000-0000-00000000000a",
  t1: "bbbb0000-0000-0000-0000-00000000000b",
  t2: "cccc0000-0000-0000-0000-00000000000c",
  t3: "eeee0000-0000-0000-0000-00000000000e",
};
const AUTH = {
  gestor: "aaaa1111-0000-0000-0000-00000000000a",
  t1: "bbbb1111-0000-0000-0000-00000000000b",
  t2: "cccc1111-0000-0000-0000-00000000000c",
  t3: "eeee1111-0000-0000-0000-00000000000e",
};
const O1 = "0e000000-0000-0000-0000-000000000001";  // equipa: T1 (responsável) + T2
const O2 = "0e000000-0000-0000-0000-000000000002";  // sem equipa
const O3 = "0e000000-0000-0000-0000-000000000003";  // a do custo ao vivo
const TAREFA1 = "0f000000-0000-0000-0000-000000000001";
const TAREFA2 = "0f000000-0000-0000-0000-000000000002";

await db.exec(STUBS_CRM);
await db.exec(PRIVILEGIOS_SUPABASE);
await db.exec(AUTENTICACAO_REAL);
for (const f of [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
  "seguranca.sql", "tempos.sql",
]) {
  try { await db.exec(ler(f)); }
  catch (e) { console.error(`✗ ${f} não correu: ${e.message}`); process.exit(1); }
}

await db.exec(`
  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}','Org');
  INSERT INTO public.anew_entities (id, display_name) VALUES ('77777777-7777-7777-7777-777777777777','Cliente');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('${CLI}','${ORG}','77777777-7777-7777-7777-777777777777');
  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${U.gestor}','${AUTH.gestor}','Gestora','g@x.pt'),
    ('${U.t1}','${AUTH.t1}','Tecnico 1','t1@x.pt'),
    ('${U.t2}','${AUTH.t2}','Tecnico 2','t2@x.pt'),
    ('${U.t3}','${AUTH.t3}','Tecnico de fora','t3@x.pt');
  INSERT INTO public.anew_roles (id, organization_id, name) VALUES ('${ROLE}','${ORG}','Operacoes');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT '${ROLE}'::uuid, code FROM public.anew_permissions WHERE category = 'operations';
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status)
    SELECT u, '${ORG}', '${ROLE}', 'active'
      FROM unnest(ARRAY['${U.gestor}','${U.t1}','${U.t2}','${U.t3}']::uuid[]) u;
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao, custo_hora) VALUES
    ('${ORG}','${U.gestor}','gestor',30), ('${ORG}','${U.t1}','tecnico',20),
    ('${ORG}','${U.t2}','tecnico',10), ('${ORG}','${U.t3}','tecnico',15);

  INSERT INTO public.ops_ordem (id, organization_id, codigo, origem, estado, cliente_id, titulo, responsavel_id) VALUES
    ('${O1}','${ORG}','OT-1','corretiva','agendada','${CLI}','Com equipa','${U.t1}'),
    ('${O2}','${ORG}','OT-2','corretiva','agendada','${CLI}','Sem equipa',NULL),
    ('${O3}','${ORG}','OT-3','corretiva','agendada','${CLI}','Custo ao vivo','${U.t1}');
  INSERT INTO public.ops_ordem_pessoa (ordem_id, utilizador_id, papel) VALUES
    ('${O1}','${U.t1}','responsavel'), ('${O1}','${U.t2}','executante'),
    ('${O3}','${U.t1}','responsavel'), ('${O3}','${U.t2}','executante');
  INSERT INTO public.ops_ordem_tarefa (id, ordem_id, nome, obrigatoria, tempo_estimado) VALUES
    ('${TAREFA1}','${O1}','Desmontar', true, 600),
    ('${TAREFA2}','${O1}','Limpar', false, 1200);
`);

/* ── Como uma pessoa ────────────────────────────────────────────────────── */

async function como(auth, sql) {
  return db.exec(`BEGIN; SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = '${auth}';
    ${sql};
    COMMIT;`);
}
async function ver(auth, sql) {
  const r = await como(auth, sql);
  return r.flatMap((x) => (x.rows?.length ? [x.rows] : [])).at(-1) ?? [];
}
async function deveCorrer(nome, auth, sql) {
  try { await como(auth, sql); ok(nome); }
  catch (e) { await db.exec("ROLLBACK").catch(() => {}); mau(`${nome} — ${e.message.split("\n")[0]}`); }
}
async function deveSerRecusado(nome, auth, sql, trecho) {
  try { await como(auth, sql); mau(`${nome} — PASSOU, e devia ter sido recusado`); }
  catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    !trecho || e.message.includes(trecho)
      ? ok(nome) : mau(`${nome} — recusado com a mensagem errada: ${e.message.split("\n")[0]}`);
  }
}

const transitar = (id, t, motivo = null, retoma = null) =>
  `SELECT public.rpc_ops_transitar_ordem('${id}','${t}',${motivo ? `'${motivo}'` : "NULL"},` +
  `${retoma ? `'${retoma}'::timestamptz` : "NULL"})`;
const sessao = (id, acao) => `SELECT public.rpc_ops_sessao('${id}','${acao}')`;
const abertas = async (ordem) =>
  (await q(`SELECT u.name FROM public.ops_sessao_trabalho s JOIN public.anew_users u ON u.id = s.utilizador_id
             WHERE s.ordem_id = '${ordem}' AND s.fim IS NULL ORDER BY u.name`)).map((r) => r.name);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ── T1. Cada um conta o seu ────────────────────────────────────────────── */
console.log("\n─── T1 · relógios por pessoa ────────────");
await deveCorrer("a gestora inicia a ordem à distância", AUTH.gestor, transitar(O1, "iniciar"));
igual(await abertas(O1), [])
  ? ok("e não lhe conta tempo — ela não está na equipa")
  : mau(`abriram-se relógios: ${await abertas(O1)}`);

await deveCorrer("o Técnico 1 entra", AUTH.t1, sessao(O1, "entrar"));
await deveCorrer("o Técnico 2 entra", AUTH.t2, sessao(O1, "entrar"));
await deveCorrer("o Técnico 1 entra outra vez (não duplica)", AUTH.t1, sessao(O1, "entrar"));
igual(await abertas(O1), ["Tecnico 1", "Tecnico 2"])
  ? ok("dois relógios abertos, um por pessoa") : mau(`abertos: ${await abertas(O1)}`);

await deveSerRecusado("quem não está na ordem não conta tempo nela", AUTH.t3, sessao(O1, "entrar"),
  "Só quem está na ordem conta tempo nela");

await deveCorrer("o Técnico 1 pausa a ordem", AUTH.t1,
  transitar(O1, "pausar", "falta material", "2030-01-01T09:00:00Z"));
{
  const r = await um(`SELECT count(*) FILTER (WHERE fim IS NULL)::int AS abertas,
                             count(*) FILTER (WHERE motivo_fim = 'pausa')::int AS pausa
                        FROM public.ops_sessao_trabalho WHERE ordem_id = '${O1}'`);
  r.abertas === 0 && r.pausa === 2
    ? ok("pausar pára toda a gente, e fica escrito porquê") : mau(`depois de pausar: ${JSON.stringify(r)}`);
}

await deveCorrer("o Técnico 2 retoma", AUTH.t2, transitar(O1, "retomar"));
igual(await abertas(O1), ["Tecnico 2"])
  ? ok("retomar liga o relógio de quem retoma — o Técnico 1 liga o seu quando voltar")
  : mau(`abertos depois de retomar: ${await abertas(O1)}`);
await deveCorrer("o Técnico 1 volta", AUTH.t1, sessao(O1, "entrar"));
await deveCorrer("o Técnico 2 sai para almoçar", AUTH.t2, sessao(O1, "sair"));
igual(await abertas(O1), ["Tecnico 1"])
  ? ok("sair fecha só o próprio relógio") : mau(`abertos: ${await abertas(O1)}`);
{
  const r = await um(`SELECT motivo_fim FROM public.ops_sessao_trabalho
                       WHERE ordem_id='${O1}' AND utilizador_id='${U.t2}' ORDER BY inicio DESC LIMIT 1`);
  r.motivo_fim === "pessoa" ? ok("… com motivo 'pessoa'") : mau(`motivo: ${r.motivo_fim}`);
}

{
  let recusou = false;
  try {
    await db.exec(`INSERT INTO public.ops_sessao_trabalho (ordem_id, utilizador_id, inicio)
                   VALUES ('${O1}','${U.t1}', now())`);
  } catch { recusou = true; }
  recusou ? ok("a base não aceita dois relógios abertos da mesma pessoa na mesma ordem")
          : mau("aceitou um segundo relógio aberto");
}

await deveCorrer("numa ordem sem equipa, quem a inicia é quem a faz", AUTH.gestor, transitar(O2, "iniciar"));
igual(await abertas(O2), ["Gestora"])
  ? ok("… e conta-lhe o tempo") : mau(`abertos na ordem sem equipa: ${await abertas(O2)}`);

/* ── T2. Tempo por tarefa ───────────────────────────────────────────────── */
console.log("\n─── T2 · tempo por tarefa ───────────────");
await deveCorrer("o Técnico 1 começa a tarefa 'Desmontar'", AUTH.t1,
  `SELECT public.rpc_ops_tarefa_iniciar('${TAREFA1}')`);
{
  const s = await q(`SELECT ordem_tarefa_id, motivo_fim, fim IS NULL AS aberta FROM public.ops_sessao_trabalho
                      WHERE ordem_id='${O1}' AND utilizador_id='${U.t1}' ORDER BY inicio DESC, fim NULLS FIRST LIMIT 2`);
  s[0]?.ordem_tarefa_id === TAREFA1 && s[0]?.aberta && s[1]?.motivo_fim === "troca"
    ? ok("o relógio passou da ordem para a tarefa ('troca'), sem se desdobrar")
    : mau(`sessões: ${JSON.stringify(s)}`);
}
// Dez minutos de trabalho na tarefa.
await db.exec(`UPDATE public.ops_sessao_trabalho SET inicio = now() - interval '10 minutes'
                WHERE ordem_tarefa_id = '${TAREFA1}' AND fim IS NULL`);
await deveCorrer("responde 'feita'", AUTH.t1,
  `SELECT public.rpc_ops_responder_tarefa('${TAREFA1}','feita')`);
{
  const t = await um(`SELECT EXTRACT(EPOCH FROM (fim - inicio))::int AS s FROM public.ops_ordem_tarefa WHERE id='${TAREFA1}'`);
  t.s >= 595 && t.s <= 610
    ? ok(`início e fim da tarefa a ${t.s}s um do outro — já não é zero`)
    : mau(`a tarefa durou ${t.s}s, esperava ~600`);
  igual(await abertas(O1), ["Tecnico 1"])
    ? ok("responder fechou o relógio da tarefa e continuou a contar na ordem")
    : mau(`abertos: ${await abertas(O1)}`);
  const s = await um(`SELECT ordem_tarefa_id FROM public.ops_sessao_trabalho
                       WHERE ordem_id='${O1}' AND utilizador_id='${U.t1}' AND fim IS NULL`);
  s.ordem_tarefa_id === null ? ok("… na ordem, sem tarefa") : mau("ficou presa na tarefa");
}
{
  const v = await ver(AUTH.t1, `SELECT ordem_tarefa_id, tempo_estimado, tempo_real, desvio, a_contar
                                  FROM public.ops_v_tarefa_tempo WHERE ordem_id='${O1}' ORDER BY nome`);
  const d = v.find((x) => x.ordem_tarefa_id === TAREFA1);
  const l = v.find((x) => x.ordem_tarefa_id === TAREFA2);
  d && Number(d.tempo_real) >= 595 && Number(d.tempo_estimado) === 600 && Math.abs(Number(d.desvio)) <= 10
    ? ok(`ops_v_tarefa_tempo: 'Desmontar' estimada 600s, real ${d.tempo_real}s`)
    : mau(`vista: ${JSON.stringify(d)}`);
  l && Number(l.tempo_real) === 0 && !l.a_contar
    ? ok("'Limpar' ainda não teve tempo nenhum") : mau(`vista: ${JSON.stringify(l)}`);
}
await deveSerRecusado("não se começa uma tarefa já respondida", AUTH.t1,
  `SELECT public.rpc_ops_tarefa_iniciar('${TAREFA1}')`, "já está respondida");
await deveCorrer("o Técnico 2 volta e começa 'Limpar'", AUTH.t2,
  `SELECT public.rpc_ops_tarefa_iniciar('${TAREFA2}')`);
{
  const v = await ver(AUTH.t2, `SELECT a_contar, a_contar_por FROM public.ops_v_tarefa_tempo WHERE ordem_tarefa_id='${TAREFA2}'`);
  v[0]?.a_contar && String(v[0]?.a_contar_por).includes(U.t2)
    ? ok("a vista diz quem está a contar nela") : mau(`vista: ${JSON.stringify(v[0])}`);
}
await deveCorrer("pára a tarefa sem a responder (foi buscar uma peça)", AUTH.t2,
  `SELECT public.rpc_ops_tarefa_terminar('${TAREFA2}')`);
{
  const s = await um(`SELECT ordem_tarefa_id FROM public.ops_sessao_trabalho
                       WHERE ordem_id='${O1}' AND utilizador_id='${U.t2}' AND fim IS NULL`);
  s && s.ordem_tarefa_id === null
    ? ok("o relógio dele continua, na ordem") : mau(`depois de terminar: ${JSON.stringify(s)}`);
  const t = await um(`SELECT estado FROM public.ops_ordem_tarefa WHERE id='${TAREFA2}'`);
  t.estado === "pendente" ? ok("e a tarefa continua por responder") : mau(`a tarefa ficou ${t.estado}`);
}
await deveCorrer("fechar", AUTH.t1, transitar(O1, "fechar"));
igual(await abertas(O1), [])
  ? ok("fechar pára toda a gente") : mau(`abertos depois de fechar: ${await abertas(O1)}`);

/* ── T3. Mão de obra ao vivo, sem contar duas vezes ─────────────────────── */
console.log("\n─── T3 · mão de obra ao vivo ────────────");
const custo = async () =>
  (await ver(AUTH.gestor, `SELECT real_mao_obra, mao_obra_em_curso, sessoes_abertas
                             FROM public.ops_v_ordem_custo WHERE ordem_id='${O3}'`))[0];
const perto = (a, b) => Math.abs(Number(a) - b) <= 0.1;

await deveCorrer("o Técnico 1 inicia", AUTH.t1, transitar(O3, "iniciar"));
await deveCorrer("o Técnico 2 entra", AUTH.t2, sessao(O3, "entrar"));
// 2h a 20 €/h + 1h a 10 €/h = 50 €
await db.exec(`
  UPDATE public.ops_sessao_trabalho SET inicio = now() - interval '2 hours'
   WHERE ordem_id='${O3}' AND utilizador_id='${U.t1}';
  UPDATE public.ops_sessao_trabalho SET inicio = now() - interval '1 hour'
   WHERE ordem_id='${O3}' AND utilizador_id='${U.t2}';`);
{
  const c = await custo();
  c && perto(c.real_mao_obra, 50) && c.mao_obra_em_curso && c.sessoes_abertas === 2
    ? ok(`em curso, a mão de obra já se vê: ${c.real_mao_obra} € (2h×20 + 1h×10), a contar`)
    : mau(`ao vivo: ${JSON.stringify(c)}`);
  const linhas = await um(`SELECT count(*)::int n FROM public.ops_custo WHERE ordem_id='${O3}'`);
  linhas.n === 0 ? ok("… sem escrever nada em ops_custo") : mau("a vista escreveu custos");
}
{
  const t = await ver(AUTH.t1, `SELECT count(*)::int n FROM public.ops_v_ordem_custo`);
  t[0]?.n === 0 ? ok("o técnico não vê a vista de custos") : mau("o técnico vê custos");
  const v = await ver(AUTH.t1, `SELECT segundos, total FROM public.ops_mao_obra_viva('${O3}')`);
  Number(v[0]?.segundos) >= 3 * 3600 && v[0]?.total === null
    ? ok("ops_mao_obra_viva dá-lhe o tempo, e não os euros")
    : mau(`ops_mao_obra_viva para o técnico: ${JSON.stringify(v[0])}`);
}
await deveCorrer("fechar", AUTH.t1, transitar(O3, "fechar"));
{
  const c = await custo();
  const linha = await um(`SELECT total FROM public.ops_custo WHERE ordem_id='${O3}' AND origem='calculado'`);
  c && perto(c.real_mao_obra, 50) && !c.mao_obra_em_curso && perto(linha?.total, 50)
    ? ok(`fechada, vale a linha do fecho (${linha.total} €) — e não a soma das duas`)
    : mau(`depois de fechar: ${JSON.stringify(c)} / linha ${JSON.stringify(linha)}`);
}
await deveCorrer("reabrir", AUTH.gestor, transitar(O3, "reabrir"));
await deveCorrer("o Técnico 1 volta ao trabalho", AUTH.t1, sessao(O3, "entrar"));
await db.exec(`UPDATE public.ops_sessao_trabalho SET inicio = now() - interval '1 hour'
                WHERE ordem_id='${O3}' AND utilizador_id='${U.t1}' AND fim IS NULL`);
{
  const c = await custo();
  c && perto(c.real_mao_obra, 70)
    ? ok(`reaberta, conta ao vivo (${c.real_mao_obra} €) e ignora a linha velha do fecho — não 120`)
    : mau(`depois de reabrir: ${JSON.stringify(c)}`);
}

console.log("");
if (falhas.length) {
  console.error(`✗ ${falhas.length} verificação(ões) falharam (${passaram} passaram)`);
  process.exit(1);
}
console.log(`✓ ${passaram} verificações: o tempo é de quem o trabalha, tarefa a tarefa, e vê-se enquanto corre`);
