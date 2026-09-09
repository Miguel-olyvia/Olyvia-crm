/**
 * Prova que "orçamentei X, gastei quanto?" tem resposta.
 *
 * O que interessa aqui:
 *   · o custo previsto é CUSTO, não preço de venda;
 *   · as linhas ficam congeladas — rever o orçamento depois não reescreve
 *     aquilo contra o qual se está a comparar;
 *   · um orçamento gera UMA obra, por muitas vezes que se carregue no botão;
 *   · o desvio é nulo quando não houve orçamento, e não zero;
 *   · nada disto escreve uma linha em `quotes` ou `quote_lines`.
 *
 *     npm run validar-orcamentos
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
const AUTH = {
  gestor: "aaaa1111-0000-0000-0000-00000000000a",
  tecnico: "bbbb1111-0000-0000-0000-00000000000b",
};
const ORC = "99990000-0000-0000-0000-000000000001";
const ORC_RASCUNHO = "99990000-0000-0000-0000-000000000002";
const ORC_SEM_CLIENTE = "99990000-0000-0000-0000-000000000003";

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

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}','Org');
  INSERT INTO public.anew_entities (id, display_name)
    VALUES ('77777777-7777-7777-7777-777777777777','Cliente');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('${CLI}','${ORG}','77777777-7777-7777-7777-777777777777');

  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${GESTOR}','${AUTH.gestor}','Gestora','g@x.pt'),
    ('${TECNICO}','${AUTH.tecnico}','Tecnico','t@x.pt');
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('${AUTH.gestor}','g@x.pt',now()),('${AUTH.tecnico}','t@x.pt',now());
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ('${AUTH.gestor}','${GESTOR}'),('${AUTH.tecnico}','${TECNICO}');
`);

for (const f of ["schema.sql","permissoes.sql","rpcs.sql","rpcs-tarefas.sql","planos.sql",
                 "correcoes-modelo.sql","medicoes.sql","despacho.sql","orcamentos.sql"]) {
  await db.exec(ler(f));
}

await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name)
    VALUES ('dddd0000-0000-0000-0000-00000000000d','${ORG}','Operacoes');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT 'dddd0000-0000-0000-0000-00000000000d', code
      FROM public.anew_permissions WHERE category = 'operations';
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${GESTOR}','${ORG}','dddd0000-0000-0000-0000-00000000000d','active'),
    ('${TECNICO}','${ORG}','dddd0000-0000-0000-0000-00000000000d','active');

  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao, custo_hora) VALUES
    ('${ORG}','${GESTOR}','gestor', 25.00),
    ('${ORG}','${TECNICO}','tecnico', 20.00);

  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth, public TO authenticated;
`);

/* ── Os orçamentos ──────────────────────────────────────────────────────── */
// Duas linhas: 2×50 de material + 10×20 de mão de obra = 300 € de CUSTO.
// Mas o total ao cliente é 615 €, porque leva margem e IVA. É essa diferença
// que este teste existe para apanhar: comparar o gasto real contra o preço de
// venda daria um desvio bonito e falso.
await db.exec(`
  INSERT INTO public.quotes (id, organization_id, cliente_id, quote_number, title,
                             obra_endereco, obra_notas, estado, accepted_at, total) VALUES
    ('${ORC}','${ORG}','${CLI}','ORC-2026-001','Remodelacao da casa de banho',
     'Rua das Flores 12, Lisboa','Cliente pede obra antes do Natal.','aceite',now(),615.00),
    ('${ORC_RASCUNHO}','${ORG}','${CLI}','ORC-2026-002','Ainda a pensar',NULL,NULL,'rascunho',NULL,0),
    ('${ORC_SEM_CLIENTE}','${ORG}',NULL,'ORC-2026-003','Sem cliente',NULL,NULL,'aceite',now(),0);

  INSERT INTO public.quote_lines (quote_id, ordem, categoria, item_description, unidade,
                                  qt, custo_material_unit, custo_mao_obra_unit, total_sem_iva) VALUES
    ('${ORC}',0,'Materiais','Louca sanitaria','un',2, 50.00,  0.00, 200.00),
    ('${ORC}',1,'Mao de obra','Instalacao','h',   10,  0.00, 20.00, 300.00);
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

async function chamar(authUid, sql) {
  const r = await db.exec(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = '${authUid}';
    ${sql}
    COMMIT;
  `);
  const linhas = r.flatMap((x) => x.rows ?? []);
  const bruto = Object.values(linhas.at(-1) ?? {})[0];
  return typeof bruto === "string" ? JSON.parse(bruto) : bruto;
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

const porAndar = (id) => `SELECT public.rpc_ops_obra_de_orcamento('${id}');`;

/* ── A lista de orçamentos por pôr a andar ──────────────────────────────── */
console.log("\n─── o que falta pôr a andar ─────────────");
{
  const v = await q(`SELECT numero, custo_previsto, linhas, tem_obra, total
                       FROM public.ops_v_orcamento ORDER BY numero`);
  v.length === 2
    ? ok("só os aceites aparecem — o rascunho fica de fora")
    : mau(`a vista trouxe ${v.length} orçamentos, esperava 2`);

  const o = v.find((x) => x.numero === "ORC-2026-001");
  Number(o.custo_previsto) === 300
    ? ok("custo previsto: 300 € (2×50 de material + 10×20 de mão de obra)")
    : mau(`custo previsto ${o.custo_previsto}, esperava 300`);
  Number(o.total) === 615
    ? ok("e o total ao cliente continua a ser 615 € — são coisas diferentes")
    : mau(`total ${o.total}`);
  o.tem_obra === false ? ok("ainda não tem obra") : mau("já diz que tem obra");
}

/* ── Pôr a andar ────────────────────────────────────────────────────────── */
console.log("\n─── do orçamento à obra ─────────────────");

await deveSerRecusado(
  "um orçamento em rascunho não vira obra",
  AUTH.gestor,
  porAndar(ORC_RASCUNHO),
  "orçamento aceite"
);

await deveSerRecusado(
  "um orçamento sem cliente não vira obra",
  AUTH.gestor,
  porAndar(ORC_SEM_CLIENTE),
  "não tem cliente"
);

let CODIGO, ID;
{
  const r = await chamar(AUTH.gestor, porAndar(ORC));
  r?.ok ? ok(`nasceu a obra ${r.codigo}`) : mau(`não criou: ${JSON.stringify(r)}`);
  CODIGO = r.codigo;
  ID = r.id;

  r.linhas === 2 ? ok("as 2 linhas do orçamento ficaram congeladas")
                 : mau(`congelou ${r.linhas} linha(s)`);
  Number(r.custo_previsto) === 300
    ? ok("com 300 € de custo previsto — o CUSTO, não os 615 € de venda")
    : mau(`custo previsto ${r.custo_previsto}`);

  const o = await um(`
    SELECT origem, titulo, descricao, orcamento_id, estado
      FROM public.ops_ordem WHERE id='${ID}'`);
  o.origem === "obra" ? ok("origem 'obra'") : mau(`origem ${o.origem}`);
  o.orcamento_id === ORC ? ok("e sabe de que orçamento veio") : mau("perdeu a ligação ao orçamento");
  o.titulo === "Remodelacao da casa de banho"
    ? ok("herdou o título do orçamento")
    : mau(`título: ${o.titulo}`);
  o.descricao?.includes("Rua das Flores") && o.descricao?.includes("antes do Natal")
    ? ok("a morada da obra e as notas do cliente vieram no corpo, para quem lá chega ler")
    : mau(`descrição sem a morada ou as notas: ${o.descricao}`);
}

await deveSerRecusado(
  "carregar duas vezes no botão não abre duas obras",
  AUTH.gestor,
  porAndar(ORC),
  "já tem obra"
);

{
  const v = await um(`SELECT tem_obra FROM public.ops_v_orcamento WHERE id='${ORC}'`);
  v.tem_obra === true
    ? ok("e o orçamento saiu da lista de 'por pôr a andar'")
    : mau("continua a aparecer como por pôr a andar");
}

/* ── Congelado quer dizer congelado ─────────────────────────────────────── */
console.log("\n─── congelado quer dizer congelado ──────");
{
  // O orçamento é revisto DEPOIS de a obra começar. Acontece.
  await db.exec(`
    UPDATE public.quote_lines SET custo_material_unit = 500
     WHERE quote_id = '${ORC}' AND ordem = 0;`);

  const p = await um(`
    SELECT sum(total_sem_iva)::numeric AS t FROM public.ops_ordem_previsto WHERE ordem_id='${ID}'`);
  Number(p.t) === 300
    ? ok("rever o orçamento não reescreveu o que a obra tinha congelado")
    : mau(`o previsto mudou para ${p.t}`);

  // Repor, para não confundir o resto do teste.
  await db.exec(`
    UPDATE public.quote_lines SET custo_material_unit = 50
     WHERE quote_id = '${ORC}' AND ordem = 0;`);
}

/* ── Previsto contra real ───────────────────────────────────────────────── */
console.log("\n─── orçamentei 300, gastei quanto? ──────");
{
  const c = await um(`SELECT previsto, real_total, desvio FROM public.ops_v_ordem_custo WHERE ordem_id='${ID}'`);
  Number(c.previsto) === 300 ? ok("previsto: 300 €") : mau(`previsto ${c.previsto}`);
  Number(c.real_total) === 0 ? ok("real: 0 € — ainda ninguém gastou nada") : mau(`real ${c.real_total}`);
  Number(c.desvio) === -300
    ? ok("desvio −300 €, porque ainda está tudo por gastar")
    : mau(`desvio ${c.desvio}`);

  // O material que se comprou, e a mão de obra que se gastou.
  await db.exec(`
    INSERT INTO public.ops_custo (ordem_id, tipo, descricao, quantidade, valor_unit, total) VALUES
      ('${ID}','material','Louca sanitaria (real)', 2, 62.50, 125.00),
      ('${ID}','mao_obra','Instalacao (real)',     12, 20.00, 240.00),
      ('${ID}','servico','Aluguer de andaime',      1, 80.00,  80.00);`);

  const d = await um(`
    SELECT previsto, real_material, real_mao_obra, real_outros, real_total, desvio, desvio_percent
      FROM public.ops_v_ordem_custo WHERE ordem_id='${ID}'`);
  Number(d.real_total) === 445 ? ok("real: 445 €") : mau(`real ${d.real_total}`);
  Number(d.real_material) === 125 && Number(d.real_mao_obra) === 240 && Number(d.real_outros) === 80
    ? ok("repartido: 125 material, 240 mão de obra, 80 outros")
    : mau(`repartição errada: ${JSON.stringify(d)}`);
  Number(d.desvio) === 145
    ? ok("desvio +145 € — passou 145 € do previsto")
    : mau(`desvio ${d.desvio}`);
  Number(d.desvio_percent) === 48.3
    ? ok("ou seja, +48,3 %")
    : mau(`desvio_percent ${d.desvio_percent}`);
}

{
  // Uma corretiva não veio de orçamento nenhum. "Não havia orçamento" não é
  // o mesmo que "orçamento de zero euros" — e a diferença tem de aparecer.
  const r = await chamar(AUTH.gestor,
    `SELECT public.rpc_ops_criar_ordem(p_titulo => 'Sem orcamento', p_cliente_id => '${CLI}');`);
  const c = await um(`
    SELECT previsto, desvio, desvio_percent FROM public.ops_v_ordem_custo
     WHERE ordem_id = (SELECT id FROM public.ops_ordem WHERE codigo='${r.codigo}')`);
  c.previsto === null && c.desvio === null && c.desvio_percent === null
    ? ok("sem orçamento, o desvio é nulo — não é zero")
    : mau(`previsto=${c.previsto} desvio=${c.desvio}`);
}

/* ── Quem vê os números ─────────────────────────────────────────────────── */
console.log("\n─── ver custos é uma permissão ──────────");
{
  // Um técnico sem `operations.costs.view` vê a obra e não vê o previsto.
  await db.exec(`
    INSERT INTO public.anew_roles (id, organization_id, name)
      VALUES ('dddd0000-0000-0000-0000-00000000000e','${ORG}','Tecnicos');
    INSERT INTO public.anew_role_permissions (role_id, permission_code)
      SELECT 'dddd0000-0000-0000-0000-00000000000e', code
        FROM public.anew_permissions
       WHERE category = 'operations' AND code <> 'operations.costs.view';
    UPDATE public.anew_memberships SET role_id = 'dddd0000-0000-0000-0000-00000000000e'
     WHERE user_id = '${TECNICO}';`);

  const r = await db.exec(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = '${AUTH.tecnico}';
    SELECT count(*)::int AS n FROM public.ops_ordem_previsto;
    COMMIT;
  `);
  const n = r.flatMap((x) => x.rows ?? []).at(-1)?.n;
  n === 0
    ? ok("um técnico sem 'costs.view' não vê uma única linha de previsto")
    : mau(`o técnico viu ${n} linha(s) de previsto`);
}

/* ── Nada foi escrito no CRM ────────────────────────────────────────────── */
console.log("\n─── o CRM ficou intacto ─────────────────");
{
  const qs = await um(`SELECT count(*)::int AS n FROM public.quotes`);
  const ls = await um(`SELECT count(*)::int AS n FROM public.quote_lines`);
  qs.n === 3 && ls.n === 2
    ? ok("os 3 orçamentos e as 2 linhas continuam como estavam")
    : mau(`quotes=${qs.n} quote_lines=${ls.n}`);

  const e = await um(`
    SELECT COALESCE(estado,'') AS estado, accepted_at IS NOT NULL AS aceite
      FROM public.quotes WHERE id='${ORC}'`);
  e.estado === "aceite" && e.aceite
    ? ok("o orçamento não foi marcado como 'feito' nem nada — Operações não lhe toca")
    : mau(`o estado do orçamento mudou: ${JSON.stringify(e)}`);

  const fk = await um(`
    SELECT count(*)::int AS n
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class f ON f.oid = c.confrelid
     WHERE c.contype='f' AND t.relname LIKE 'ops\\_%' AND f.relname NOT LIKE 'ops\\_%'`);
  fk.n === 0
    ? ok("zero chaves estrangeiras de ops_* para fora, incluindo para quotes")
    : mau(`${fk.n} chave(s) estrangeira(s) para o CRM`);

  const tr = await um(`
    SELECT count(*)::int AS n FROM pg_trigger g
      JOIN pg_class t ON t.oid = g.tgrelid
     WHERE NOT g.tgisinternal AND t.relname IN ('quotes','quote_lines')`);
  tr.n === 0 ? ok("e nenhum trigger nosso em quotes ou quote_lines")
             : mau(`${tr.n} trigger(s) postos por nós no CRM`);
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ 'orçamentei X, gastei quanto?' tem resposta, e o CRM não deu por nada");
