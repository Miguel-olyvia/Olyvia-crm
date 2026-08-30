/**
 * Prova que "orçamentei X, gastei quanto?" conta as duas metades.
 *
 * O que interessa aqui:
 *   · o material lança-se, e a mão de obra continua a vir das sessões;
 *   · o mesmo material não entra em duas obras — o custo apareceria a dobrar
 *     e ninguém daria por isso a olhar para uma delas;
 *   · a comparação é LINHA A LINHA, porque um total igual esconde um material
 *     que ficou barato e outro que disparou;
 *   · o que se gastou SEM estar orçamentado aparece, que é onde as obras
 *     costumam derrapar.
 *
 *     npm run validar-custos
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
const CAT_LOUCA = "cccc1111-0000-0000-0000-000000000001";
const CAT_TINTA = "cccc1111-0000-0000-0000-000000000002";
const COMPRA = "cccc2222-0000-0000-0000-000000000001";
const LINHA_COMPRA = "cccc3333-0000-0000-0000-000000000001";

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
                 "correcoes-modelo.sql","medicoes.sql","despacho.sql","orcamentos.sql",
                 "anexos.sql","planos-crud.sql","config.sql","custos.sql"]) {
  await db.exec(ler(f));
}

await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name) VALUES
    ('dddd0000-0000-0000-0000-00000000000d','${ORG}','Operacoes'),
    ('dddd0000-0000-0000-0000-00000000000e','${ORG}','Tecnicos');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT 'dddd0000-0000-0000-0000-00000000000d', code
      FROM public.anew_permissions WHERE category = 'operations';
  -- O técnico executa e NÃO vê custos. É o que separa quem faz de quem paga.
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT 'dddd0000-0000-0000-0000-00000000000e', code
      FROM public.anew_permissions
     WHERE category = 'operations' AND code <> 'operations.costs.view';

  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${GESTOR}','${ORG}','dddd0000-0000-0000-0000-00000000000d','active'),
    ('${TECNICO}','${ORG}','dddd0000-0000-0000-0000-00000000000e','active');

  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao, custo_hora) VALUES
    ('${ORG}','${GESTOR}','gestor', 25.00),
    ('${ORG}','${TECNICO}','tecnico', 20.00);

  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth, public TO authenticated;
  REVOKE INSERT, UPDATE, DELETE ON public.ops_anexo FROM authenticated;
`);

/* ── O cenário: um orçamento com duas linhas de catálogo ─────────────────── */
// Louça: 2 × 50 € = 100 €.  Tinta: 10 × 20 € = 200 €.  Custo previsto: 300 €.
await db.exec(`
  INSERT INTO public.catalog_items
    (id, organization_id, item_code, descricao, categoria, custo_material, custo_mao_obra) VALUES
    ('${CAT_LOUCA}','${ORG}','MAT-001','Louca sanitaria','Materiais', 50.00, 0),
    ('${CAT_TINTA}','${ORG}','MAT-002','Tinta lavavel','Materiais', 20.00, 0);

  INSERT INTO public.quotes (id, organization_id, cliente_id, quote_number, title, estado, accepted_at, total)
    VALUES ('${ORC}','${ORG}','${CLI}','ORC-001','Remodelacao','aceite',now(), 615.00);

  INSERT INTO public.quote_lines
    (quote_id, catalog_item_id, ordem, item_description, unidade, qt, custo_material_unit, custo_mao_obra_unit)
  VALUES
    ('${ORC}','${CAT_LOUCA}',0,'Louca sanitaria','un', 2, 50.00, 0),
    ('${ORC}','${CAT_TINTA}',1,'Tinta lavavel','L',   10, 20.00, 0);

  -- Uma compra a sério: 2 louças, mas a 62,50 € — subiu desde o orçamento.
  INSERT INTO public.purchase_orders (id, organization_id, order_number, order_date, status)
    VALUES ('${COMPRA}','${ORG}','PO-2026-001', current_date, 'recebida');
  INSERT INTO public.purchase_order_items
    (id, purchase_order_id, description, sku, quantity, unit_price, total_price)
    VALUES ('${LINHA_COMPRA}','${COMPRA}','Louca sanitaria','MAT-001', 2, 62.50, 125.00);
`);

async function como(authUid, sql) {
  const r = await db.exec(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = '${authUid}';
    ${sql}
    COMMIT;
  `);
  return r.flatMap((x) => x.rows ?? []).at(-1);
}

async function json(authUid, sql) {
  const bruto = Object.values((await como(authUid, sql)) ?? {})[0];
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

/* ── A obra ─────────────────────────────────────────────────────────────── */
console.log("\n─── a obra nasce do orçamento ───────────");

const OBRA = await json(AUTH.gestor, `SELECT public.rpc_ops_obra_de_orcamento('${ORC}');`);
const ID = OBRA.id;
{
  Number(OBRA.custo_previsto) === 300
    ? ok(`${OBRA.codigo}, com 300 € de custo previsto`)
    : mau(`custo previsto ${OBRA.custo_previsto}`);

  const n = await um(`
    SELECT count(*)::int AS n FROM public.ops_ordem_previsto
     WHERE ordem_id='${ID}' AND catalog_item_id IS NOT NULL`);
  n.n === 2
    ? ok("as 2 linhas trouxeram o item de catálogo — é o que permite emparelhar")
    : mau(`só ${n.n} linhas com catálogo`);
}

/* ── Lançar material ────────────────────────────────────────────────────── */
console.log("\n─── lançar o material ───────────────────");

const lancar = (args) => {
  const p = { p_ordem_id: `'${ID}'`, p_tipo: "'material'", ...args };
  return `SELECT public.rpc_ops_lancar_custo(${Object.entries(p)
    .map(([k, v]) => `${k} => ${v}`).join(", ")});`;
};

{
  // Do catálogo, sem preço: herda o de tabela.
  const r = await json(AUTH.gestor, lancar({
    p_descricao: "NULL",
    p_quantidade: "2",
    p_valor_unit: "NULL",
    p_catalog_item_id: `'${CAT_LOUCA}'`,
  }));
  Number(r.total) === 100
    ? ok("do catálogo, sem preço escrito: 2 × 50 € = 100 €")
    : mau(`total ${r.total}`);
  r.origem === "catalogo" ? ok("marcado como vindo do catálogo") : mau(`origem ${r.origem}`);

  const c = await um(`SELECT descricao FROM public.ops_custo WHERE catalog_item_id='${CAT_LOUCA}'`);
  c.descricao === "Louca sanitaria"
    ? ok("e herdou a descrição, sem ninguém a escrever")
    : mau(`descrição: ${c.descricao}`);
}

await deveSerRecusado(
  "um custo sem descrição e sem catálogo é recusado",
  AUTH.gestor,
  lancar({ p_descricao: "'  '", p_quantidade: "1", p_valor_unit: "10" }),
  "precisa de uma descrição"
);

await deveSerRecusado(
  "quantidade zero é recusada",
  AUTH.gestor,
  lancar({ p_descricao: "'Nada'", p_quantidade: "0", p_valor_unit: "10" }),
  "maior do que zero"
);

await deveSerRecusado(
  "a mão de obra não se lança à mão",
  AUTH.gestor,
  lancar({ p_tipo: "'mao_obra'", p_descricao: "'Horas'", p_quantidade: "8", p_valor_unit: "20" }),
  "sai das sessões de trabalho"
);

await deveSerRecusado(
  "um técnico sem costs.view não lança custos",
  AUTH.tecnico,
  lancar({ p_descricao: "'Do tecnico'", p_quantidade: "1", p_valor_unit: "10" }),
  "Sem permissão"
);

/* ── Compras ────────────────────────────────────────────────────────────── */
console.log("\n─── o material que se comprou ───────────");
{
  const l = await um(`SELECT quantidade, preco_unit, ja_atribuido FROM public.ops_v_compra_linha`);
  Number(l.quantidade) === 2 && Number(l.preco_unit) === 62.5
    ? ok("a compra PO-2026-001 tem 2 louças a 62,50 €")
    : mau(`compra: ${JSON.stringify(l)}`);
  Number(l.ja_atribuido) === 0 ? ok("nada atribuído ainda") : mau(`ja_atribuido ${l.ja_atribuido}`);
}

// O primeiro lançamento foi do catálogo, a 50 €. Corrige-se para a compra real.
{
  const c = await um(`SELECT id FROM public.ops_custo WHERE catalog_item_id='${CAT_LOUCA}'`);
  await deveCorrer(
    "apagar o lançamento de tabela",
    AUTH.gestor,
    `SELECT public.rpc_ops_remover_custo('${c.id}');`
  );

  const r = await json(AUTH.gestor, lancar({
    p_descricao: "NULL",
    p_quantidade: "2",
    p_valor_unit: "NULL",
    p_catalog_item_id: `'${CAT_LOUCA}'`,
    p_compra_linha_id: `'${LINHA_COMPRA}'`,
  }));
  Number(r.total) === 125
    ? ok("lançado da compra: 2 × 62,50 € = 125 € — o preço que se pagou, não o de tabela")
    : mau(`total ${r.total}`);
  r.origem === "compra" ? ok("marcado como vindo de uma compra") : mau(`origem ${r.origem}`);
}

await deveSerRecusado(
  "o mesmo material não entra numa segunda obra",
  AUTH.gestor,
  lancar({
    p_descricao: "NULL",
    p_quantidade: "1",
    p_valor_unit: "NULL",
    p_compra_linha_id: `'${LINHA_COMPRA}'`,
  }),
  "só sobram 0"
);

{
  const l = await um(`SELECT ja_atribuido FROM public.ops_v_compra_linha`);
  Number(l.ja_atribuido) === 2
    ? ok("e a compra passou a mostrar-se toda atribuída")
    : mau(`ja_atribuido ${l.ja_atribuido}`);
}

/* ── Mão de obra ────────────────────────────────────────────────────────── */
console.log("\n─── a mão de obra continua automática ───");
{
  await db.exec(`
    INSERT INTO public.ops_sessao_trabalho (ordem_id, utilizador_id, inicio, fim)
      VALUES ('${ID}','${TECNICO}', now() - interval '3 hours', now());
    SELECT public.ops_recalcular_custo_mao_obra('${ID}');`);

  const m = await um(`
    SELECT total, origem FROM public.ops_custo WHERE ordem_id='${ID}' AND tipo='mao_obra'`);
  Number(m.total) === 60
    ? ok("3 horas × 20 €/h = 60 €, sem ninguém escrever nada")
    : mau(`mão de obra ${m?.total}`);
  m.origem === "calculado" ? ok("marcada como calculada") : mau(`origem ${m.origem}`);

  await deveSerRecusado(
    "e não se apaga à mão — voltaria no recálculo seguinte",
    AUTH.gestor,
    `SELECT public.rpc_ops_remover_custo(
       (SELECT id FROM public.ops_custo WHERE ordem_id='${ID}' AND tipo='mao_obra'));`,
    "calculado das sessões"
  );
}

/* ── A conta ────────────────────────────────────────────────────────────── */
console.log("\n─── orçamentei 300, gastei quanto? ──────");
{
  const c = await um(`
    SELECT previsto, real_material, real_mao_obra, real_total, desvio, desvio_percent
      FROM public.ops_v_ordem_custo WHERE ordem_id='${ID}'`);
  Number(c.previsto) === 300 ? ok("previsto: 300 €") : mau(`previsto ${c.previsto}`);
  Number(c.real_material) === 125 ? ok("material: 125 €") : mau(`material ${c.real_material}`);
  Number(c.real_mao_obra) === 60 ? ok("mão de obra: 60 €") : mau(`mão de obra ${c.real_mao_obra}`);
  Number(c.real_total) === 185 ? ok("gasto: 185 €") : mau(`gasto ${c.real_total}`);
  Number(c.desvio) === -115
    ? ok("desvio −115 € — mas a tinta ainda está por comprar")
    : mau(`desvio ${c.desvio}`);
}

/* ── Linha a linha ──────────────────────────────────────────────────────── */
console.log("\n─── e agora, linha a linha ──────────────");
{
  // Tinta: orçamentada a 20 €, comprada a 26 €. E um extra que ninguém previu.
  await como(AUTH.gestor, lancar({
    p_descricao: "NULL", p_quantidade: "10", p_valor_unit: "26",
    p_catalog_item_id: `'${CAT_TINTA}'`,
  }));

  const linhas = await q(`
    SELECT descricao, previsto, real, desvio, situacao
      FROM public.ops_v_custo_por_item WHERE ordem_id='${ID}' ORDER BY descricao`);

  linhas.length === 2 ? ok("duas linhas emparelhadas por item de catálogo")
                      : mau(`${linhas.length} linhas`);

  const louca = linhas.find((l) => l.descricao?.includes("Louca"));
  Number(louca?.previsto) === 100 && Number(louca?.real) === 125 && Number(louca?.desvio) === 25
    ? ok("louça: orçamentada 100 €, gasta 125 € — 25 € acima")
    : mau(`louça: ${JSON.stringify(louca)}`);

  const tinta = linhas.find((l) => l.descricao?.includes("Tinta"));
  Number(tinta?.desvio) === 60
    ? ok("tinta: 200 € orçamentados, 260 € gastos — 60 € acima")
    : mau(`tinta: ${JSON.stringify(tinta)}`);
}

{
  // O que se gastou sem estar orçamentado é onde as obras derrapam.
  await db.exec(`
    INSERT INTO public.catalog_items (id, organization_id, item_code, descricao, custo_material)
      VALUES ('cccc1111-0000-0000-0000-000000000003','${ORG}','MAT-003','Andaime', 80);`);
  await como(AUTH.gestor, lancar({
    p_tipo: "'servico'", p_descricao: "NULL", p_quantidade: "1", p_valor_unit: "NULL",
    p_catalog_item_id: "'cccc1111-0000-0000-0000-000000000003'",
  }));

  const l = await um(`
    SELECT descricao, previsto, real, situacao FROM public.ops_v_custo_por_item
     WHERE ordem_id='${ID}' AND situacao='nao_orcamentado'`);
  l && Number(l.real) === 80
    ? ok(`o que ninguém previu aparece: ${l.descricao}, 80 €`)
    : mau("um gasto fora do orçamento passou despercebido");
}

/* ── Quem vê os números ─────────────────────────────────────────────────── */
console.log("\n─── ver custos é uma permissão ──────────");
{
  const n = await como(AUTH.tecnico,
    `SELECT count(*)::int AS n FROM public.ops_custo WHERE ordem_id='${ID}';`);
  n.n === 0
    ? ok("um técnico sem 'costs.view' não vê uma única linha de custo")
    : mau(`o técnico viu ${n.n} custos`);
}

/* ── O CRM ficou intacto ────────────────────────────────────────────────── */
console.log("\n─── o CRM ficou intacto ─────────────────");
{
  const c = await um(`SELECT count(*)::int AS n FROM public.catalog_items`);
  const p = await um(`SELECT count(*)::int AS n FROM public.purchase_order_items`);
  c.n === 3 && p.n === 1
    ? ok("catálogo e compras como estavam")
    : mau(`catalog_items=${c.n} purchase_order_items=${p.n}`);

  const fk = await um(`
    SELECT count(*)::int AS n
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class f ON f.oid = c.confrelid
     WHERE c.contype='f' AND t.relname LIKE 'ops\\_%' AND f.relname NOT LIKE 'ops\\_%'`);
  fk.n === 0 ? ok("zero chaves estrangeiras para fora") : mau(`${fk.n} para fora`);

  const tr = await um(`
    SELECT count(*)::int AS n FROM pg_trigger g
      JOIN pg_class t ON t.oid = g.tgrelid
     WHERE NOT g.tgisinternal
       AND t.relname IN ('catalog_items','purchase_orders','purchase_order_items')`);
  tr.n === 0 ? ok("e nenhum trigger nosso no catálogo nem nas compras") : mau(`${tr.n} triggers`);
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ a conta conta as duas metades, e diz qual foi a linha que derrapou");
