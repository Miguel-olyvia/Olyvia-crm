/**
 * Prova o pós-contrato da obra (Frente B) contra um Postgres limpo (PGlite),
 * sem tocar no Supabase:
 *
 *   · um contrato sem quote_id com 2 orçamentos aceites (2 casas de banho)
 *     → a obra tem as tarefas dos DOIS, cada uma com o seu orçamento, e o
 *     orçamento alternativo (não aceite) fica de fora; com quote_id, só esse;
 *   · um serviço dentro de um conjunto (bundle_components) dá tarefa, com o
 *     tempo × quantidade;
 *   · a previsão ("Serviços do contrato") diz de que orçamento vem cada serviço,
 *     e a ida e volta com p_tarefas guarda o orçamento e o componente;
 *   · acrescentar um orçamento novo a uma obra existente não mexe no que lá está;
 *   · obra-arranque.sql: obras já arrancadas ficam com o plano aprovado; aprovar
 *     o plano e mexer (datas, equipa) → volta a "por aprovar", com evento;
 *   · sem as tabelas da Frente A → "por instalar" e não rebenta; com stubs
 *     mínimos delas → "Arrancar" bloqueado sem as 3 validações e permitido com
 *     elas; material_chega_em das notas de encomenda e o aviso "começa antes";
 *   · obras.sql e obra-arranque.sql correm duas vezes (e por qualquer ordem).
 *
 *     npm run validar-obra-arranque
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
const mau = (m) => {
  console.log(`  ✗ ${m}`);
  falhas.push(m);
};
const verifica = (cond, bom, mal) => (cond ? ok(bom) : mau(mal));

/* ── Identidades ────────────────────────────────────────────────────────── */
const ORG = "11111111-1111-1111-1111-111111111111";
const CLI = "22222222-2222-2222-2222-222222222222";
const U = {
  gestor: "a0000000-0000-0000-0000-00000000000a",
  sup: "a0000000-0000-0000-0000-00000000000b",
  tec: "a0000000-0000-0000-0000-00000000000c",
  tec2: "a0000000-0000-0000-0000-00000000000d",
};
const AUTH = Object.fromEntries(Object.entries(U).map(([k, v]) => [k, v.replace(/^a/, "e")]));

const S = {
  wc: "5e000000-0000-0000-0000-000000000001", // "Modelo WC": 2 passos (demolir → revestir)
  pint: "5e000000-0000-0000-0000-000000000002", // sem modelo: 2 h por unidade
  canal: "5e000000-0000-0000-0000-000000000003", // dentro do conjunto: 1,5 h × 2 pessoas
};
const P = {
  louca: "be000000-0000-0000-0000-000000000001",
  tinta: "be000000-0000-0000-0000-000000000002",
};
const PROP = { multi: "c0000000-0000-0000-0000-000000000001", qid: "c0000000-0000-0000-0000-000000000002" };
const Q = {
  suite: "99990000-0000-0000-0000-000000000001", // aceite: WC + conjunto (louça + canalização)
  servico: "99990000-0000-0000-0000-000000000002", // aceite: WC + pintura
  alternativa: "99990000-0000-0000-0000-000000000003", // NÃO aceite: pintura grande
  qid: "99990000-0000-0000-0000-000000000004", // o quote_id do 2.º contrato
  qidOutro: "99990000-0000-0000-0000-000000000005", // aceite na mesma proposta, mas o contrato escolheu o qid
  adenda: "99990000-0000-0000-0000-000000000006", // aceite depois (vai ser acrescentado)
  simples: "99990000-0000-0000-0000-000000000007", // orçamento de uma obra que já arrancou
};
const L = { conjunto: "11110000-0000-0000-0000-000000000001", conjuntoQid: "11110000-0000-0000-0000-000000000002" };
const C = {
  multi: "88880000-0000-0000-0000-000000000001",
  qid: "88880000-0000-0000-0000-000000000002",
  simples: "88880000-0000-0000-0000-000000000003",
};

/* ── Um CRM como o real (só o que obras.sql lê) ─────────────────────────── */
await db.exec(STUBS_CRM);
await db.exec(`
  CREATE TABLE public.client_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contract_number text, client_id uuid,
    status text NOT NULL DEFAULT 'draft', total_value numeric DEFAULT 0, currency text DEFAULT 'EUR',
    organization_id uuid NOT NULL, quote_id uuid, proposal_id uuid, notes text, signature_date timestamptz,
    company_signature_date timestamptz, accepted_at timestamptz, created_by uuid NOT NULL, deleted_at timestamptz);
  CREATE TABLE public.auth_to_business_user_map (auth_user_id uuid, business_user_id uuid);
  CREATE OR REPLACE FUNCTION public.current_business_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT m.business_user_id FROM public.auth_to_business_user_map m WHERE m.auth_user_id = auth.uid() LIMIT 1 $fn$;
  CREATE OR REPLACE FUNCTION public.has_anew_permission(_auth_uid uuid, _permission_code text)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT EXISTS (SELECT 1 FROM public.anew_users au
        JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
        JOIN public.anew_role_permissions arp ON arp.role_id = am.role_id AND arp.permission_code = _permission_code
       WHERE au.auth_user_id = _auth_uid) $fn$;
  CREATE OR REPLACE FUNCTION public.get_user_visible_org_ids(_auth_uid uuid)
    RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT am.organization_id FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE au.auth_user_id = _auth_uid AND am.status = 'active' $fn$;

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}','Org');
  INSERT INTO public.anew_entities (id, display_name) VALUES ('77777777-7777-7777-7777-777777777777','Cliente');
  INSERT INTO public.anew_clients (id, organization_id, entity_id) VALUES ('${CLI}','${ORG}','77777777-7777-7777-7777-777777777777');
  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${U.gestor}','${AUTH.gestor}','Gestora','g@x.pt'), ('${U.sup}','${AUTH.sup}','Supervisor','s@x.pt'),
    ('${U.tec}','${AUTH.tec}','Técnico','t@x.pt'), ('${U.tec2}','${AUTH.tec2}','Técnico 2','t2@x.pt');
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id)
    SELECT auth_user_id, id FROM public.anew_users;

  -- Catálogo e orçamentos (as colunas que obras.sql lê).
  ALTER TABLE public.quote_lines ADD COLUMN service_id uuid, ADD COLUMN section_name text,
                                 ADD COLUMN source_deal_need_id uuid, ADD COLUMN product_id uuid,
                                 ADD COLUMN bundle_id uuid, ADD COLUMN selected_attributes jsonb;
  ALTER TABLE public.quotes ADD COLUMN proposal_id uuid, ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  CREATE TABLE public.service_categories (id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE public.services (
    id uuid PRIMARY KEY, name text NOT NULL, service_category_id uuid,
    technical_sheet_labor_description text, technical_sheet_labor_hours numeric,
    technical_sheet_labor_people_count numeric, organization_id uuid, sku text,
    is_deleted boolean NOT NULL DEFAULT false, deleted_at timestamptz);
  CREATE TABLE public.service_organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_id uuid, organization_id uuid);
  ALTER TABLE public.products ADD COLUMN name text;
  CREATE TABLE public.service_materials (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_id uuid NOT NULL,
    product_id uuid NOT NULL, quantity numeric NOT NULL, sort_order integer, deleted_at timestamptz);

  INSERT INTO public.services (id, name, organization_id, technical_sheet_labor_hours, technical_sheet_labor_people_count) VALUES
    ('${S.wc}', 'Modelo WC', '${ORG}', NULL, NULL),
    ('${S.pint}', 'Pintura de paredes', '${ORG}', 2, 1),
    ('${S.canal}', 'Canalização do conjunto', '${ORG}', 1.5, 2);
  INSERT INTO public.products (id, name) VALUES ('${P.louca}', 'Sanita suspensa'), ('${P.tinta}', 'Tinta branca');
  INSERT INTO public.service_materials (service_id, product_id, quantity) VALUES ('${S.pint}', '${P.tinta}', 1);

  INSERT INTO public.quotes (id, organization_id, cliente_id, quote_number, title, estado, accepted_at, proposal_id, total) VALUES
    ('${Q.suite}','${ORG}','${CLI}','ORC-1','WC suite','aceite', now() - interval '3 days','${PROP.multi}',9000),
    ('${Q.servico}','${ORG}','${CLI}','ORC-2','WC serviço','aceite', now() - interval '2 days','${PROP.multi}',7000),
    ('${Q.alternativa}','${ORG}','${CLI}','ORC-3','Alternativa','enviado', NULL,'${PROP.multi}',20000),
    ('${Q.qid}','${ORG}','${CLI}','ORC-4','Casa de banho','aceite', now() - interval '1 day','${PROP.qid}',5000),
    ('${Q.qidOutro}','${ORG}','${CLI}','ORC-5','Cozinha','aceite', now(),'${PROP.qid}',5000),
    ('${Q.adenda}','${ORG}','${CLI}','ORC-6','Adenda varanda','aceite', now(), NULL, 1000),
    ('${Q.simples}','${ORG}','${CLI}','ORC-7','Pintura sala','aceite', now(), NULL, 500);
  INSERT INTO public.quote_lines (id, quote_id, ordem, descricao_snapshot, qt, service_id, product_id, bundle_id, selected_attributes) VALUES
    (gen_random_uuid(), '${Q.suite}', 0, 'WC', 1, '${S.wc}', NULL, NULL, NULL),
    ('${L.conjunto}', '${Q.suite}', 1, 'Conjunto sanita', 2, NULL, NULL, gen_random_uuid(),
       '{"bundle_components":[{"id":"x1","name":"Sanita suspensa","type":"product","source_id":"${P.louca}","quantity":1},
                              {"id":"x2","name":"Canalização","type":"service","source_id":"${S.canal}","quantity":3}]}'),
    (gen_random_uuid(), '${Q.servico}', 0, 'WC', 1, '${S.wc}', NULL, NULL, NULL),
    (gen_random_uuid(), '${Q.servico}', 1, 'Pintura', 2, '${S.pint}', NULL, NULL, NULL),
    (gen_random_uuid(), '${Q.alternativa}', 0, 'Pintura grande', 10, '${S.pint}', NULL, NULL, NULL),
    (gen_random_uuid(), '${Q.qid}', 0, 'Pintura', 1, '${S.pint}', NULL, NULL, NULL),
    ('${L.conjuntoQid}', '${Q.qid}', 1, 'Conjunto sanita', 1, NULL, NULL, gen_random_uuid(),
       '{"bundle_components":[{"id":"y1","name":"Sanita suspensa","type":"product","source_id":"${P.louca}","quantity":1},
                              {"id":"y2","name":"Canalização","type":"service","source_id":"${S.canal}","quantity":1}]}'),
    (gen_random_uuid(), '${Q.qidOutro}', 0, 'Pintura cozinha', 4, '${S.pint}', NULL, NULL, NULL),
    (gen_random_uuid(), '${Q.adenda}', 0, 'Pintura varanda', 1, '${S.pint}', NULL, NULL, NULL),
    (gen_random_uuid(), '${Q.simples}', 0, 'Pintura', 1, '${S.pint}', NULL, NULL, NULL);
  INSERT INTO public.client_contracts (id, contract_number, client_id, status, organization_id, quote_id, proposal_id, signature_date, created_by) VALUES
    ('${C.multi}', 'CC-2026-0331', '${CLI}', 'signed', '${ORG}', NULL, '${PROP.multi}', now(), '${U.gestor}'),
    ('${C.qid}', 'CC-2026-0400', '${CLI}', 'signed', '${ORG}', '${Q.qid}', '${PROP.qid}', now(), '${U.gestor}'),
    ('${C.simples}', 'CC-2026-0401', '${CLI}', 'signed', '${ORG}', '${Q.simples}', NULL, now(), '${U.gestor}');
`);

const SEQUENCIA = [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
  "seguranca.sql", "tempos.sql",
];
for (const f of SEQUENCIA) {
  try {
    await db.exec(ler(f));
  } catch (e) {
    console.error(`✗ ${f} falhou: ${e.message}`);
    process.exit(1);
  }
}
console.log("\n─── instalar obras.sql ──────────────────");
try {
  await db.exec(ler("obras.sql"));
  await db.exec(ler("obras.sql"));
  ok("obras.sql corre duas vezes");
} catch (e) {
  mau(`obras.sql falhou: ${e.message}`);
  process.exit(1);
}

/* ── Perfis e permissões ────────────────────────────────────────────────── */
{
  const c = await um(`SELECT c.conname, pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
                        JOIN pg_class t ON t.oid = c.conrelid
                       WHERE t.relname = 'ops_utilizador_perfil' AND c.contype = 'c'
                         AND pg_get_constraintdef(c.oid) LIKE '%funcao%'`);
  if (c && !c.def.includes("supervisor")) {
    await db.exec(`ALTER TABLE public.ops_utilizador_perfil DROP CONSTRAINT ${c.conname};
      ALTER TABLE public.ops_utilizador_perfil ADD CONSTRAINT ${c.conname}
        CHECK (funcao IN ('admin','gestor','operador','tecnico','supervisor'));`);
  }
}
await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name) VALUES ('d0000000-0000-0000-0000-00000000000a','${ORG}','Tudo');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT 'd0000000-0000-0000-0000-00000000000a', code FROM public.anew_permissions WHERE category = 'operations';
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status)
    SELECT id, '${ORG}', 'd0000000-0000-0000-0000-00000000000a', 'active' FROM public.anew_users;
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao, custo_hora) VALUES
    ('${ORG}','${U.gestor}','gestor',30), ('${ORG}','${U.sup}','supervisor',28),
    ('${ORG}','${U.tec}','tecnico',20), ('${ORG}','${U.tec2}','tecnico',20);
  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  GRANT SELECT ON public.quotes, public.quote_lines, public.client_contracts, public.anew_users,
                  public.anew_clients, public.anew_entities TO authenticated;
  -- O "Modelo WC": demolir (fase 1) → revestir (fase 3), por unidade.
  INSERT INTO public.ops_obra_servico_tarefa (organization_id, servico_id, ordem, nome, fase, minutos_por_unidade, chave, depende_chaves)
  VALUES ('${ORG}', '${S.wc}', 1, 'Demolir', 1, 240, 'a', '{}'),
         ('${ORG}', '${S.wc}', 2, 'Revestir', 3, 480, 'b', '{a}');
`);

function sessao(authUid, sql) {
  return `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${authUid}'; ${sql} COMMIT;`;
}
async function chamar(authUid, sql) {
  try {
    const r = await db.exec(sessao(authUid, sql));
    const linhas = r.flatMap((x) => x.rows ?? []);
    const bruto = Object.values(linhas.at(-1) ?? {})[0];
    return typeof bruto === "string" && (bruto.startsWith("{") || bruto.startsWith("[")) ? JSON.parse(bruto) : bruto;
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    throw e;
  }
}
async function tenta(nome, fn) {
  try {
    return await fn();
  } catch (e) {
    mau(`${nome} — falhou: ${e.message.split("\n")[0]}`);
    return null;
  }
}
async function recusa(nome, fn, padrao) {
  try {
    await fn();
    mau(`${nome} — devia ter sido recusado`);
    return null;
  } catch (e) {
    const m = e.message.split("\n")[0];
    if (padrao && !padrao.test(m)) mau(`${nome} — recusado, mas com outra mensagem: ${m}`);
    else ok(`${nome} (${m})`);
    return m;
  }
}
const tarefas = (obra) =>
  q(`SELECT t.*, f.ordem AS fase,
            (SELECT array_agg(d.nome ORDER BY d.nome) FROM public.ops_obra_tarefa_dependencia x
               JOIN public.ops_obra_tarefa d ON d.id = x.depende_de_id WHERE x.tarefa_id = t.id) AS deps
       FROM public.ops_obra_tarefa t JOIN public.ops_obra_fase f ON f.id = t.fase_id
      WHERE t.obra_id = '${obra}' ORDER BY t.ordem`);
const criar = (extra) =>
  chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_criar(p_org => '${ORG}', p_data_inicio => '2026-11-02', ${extra});`);

/* ── 1. Os orçamentos de um contrato ────────────────────────────────────── */
console.log("\n─── orçamentos do contrato ──────────────");
{
  const m = await q(`SELECT * FROM public.ops_contrato_orcamentos('${C.multi}') ORDER BY ordem`);
  verifica(m.length === 2 && m[0].quote_id === Q.suite && m[1].quote_id === Q.servico && m.every((x) => x.origem === "contrato"),
    "sem quote_id: os 2 aceites da proposta, pela ordem de aceitação, origem 'contrato' (o não aceite fica de fora)",
    `lista: ${JSON.stringify(m)}`);
  const u = await q(`SELECT * FROM public.ops_contrato_orcamentos('${C.qid}')`);
  verifica(u.length === 1 && u[0].quote_id === Q.qid, "com quote_id: só esse (mesmo havendo outro aceite)",
    `lista: ${JSON.stringify(u)}`);
}

/* ── 2. Previsão: de que orçamento vem cada serviço ─────────────────────── */
console.log("\n─── previsão (Serviços do contrato) ─────");
let previsao = await tenta("previsão do contrato com 2 orçamentos", () =>
  chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_previsao_contrato(p_org => '${ORG}', p_contrato_id => '${C.multi}', p_data_inicio => '2026-11-02');`));
if (previsao) {
  const sv = previsao.servicos;
  const rot = sv.map((s) => `${s.orcamento_rotulo}:${s.nome}${s.componente ? `#${s.componente}` : ""}`);
  verifica(sv.length === 4 && previsao.orcamentos?.length === 2,
    `4 serviços de 2 orçamentos: ${rot.join(", ")}`, `serviços: ${rot.join(", ")} orçamentos ${JSON.stringify(previsao.orcamentos)}`);
  const canal = sv.find((s) => s.servico_id === S.canal);
  verifica(canal && canal.componente === 2 && Number(canal.quantidade) === 6 && canal.orcamento_id === Q.suite
           && canal.tarefas.length >= 1 && canal.tarefas.every((t) => t.nome.startsWith("WC suite · ")),
    "o serviço do conjunto aparece (componente 2, qt 3 × 2 = 6) com as suas tarefas (sugeridas, sem modelo)",
    `canalização: ${JSON.stringify(canal)?.slice(0, 300)}`);
  verifica(sv.filter((s) => s.servico_id === S.wc).every((s) => s.tarefas.length === 2),
    "cada WC traz os seus 2 passos", "os WC não trazem 2 passos cada");
  verifica(!sv.some((s) => Number(s.quantidade) === 10), "a alternativa não aceite não entra", "a alternativa entrou");
}

/* ── 3. Criar a obra (expansão automática) ──────────────────────────────── */
console.log("\n─── obra com 2 orçamentos aceites ───────");
let obraMulti = await tenta("criar a obra do contrato", () => criar(`p_contrato_id => '${C.multi}'`));
if (obraMulti) {
  const ts = await tarefas(obraMulti.id);
  const demolir = ts.filter((t) => t.nome.endsWith("Demolir"));
  const revestir = ts.filter((t) => t.nome.endsWith("Revestir"));
  verifica(demolir.length === 2 && revestir.length === 2,
    "2 WC em 2 orçamentos = 2 conjuntos de tarefas", `tarefas: ${ts.map((t) => t.nome).join(" | ")}`);
  verifica(new Set(demolir.map((t) => t.orcamento_id)).size === 2 && demolir.some((t) => t.nome.startsWith("WC suite · "))
           && demolir.some((t) => t.nome.startsWith("WC serviço · ")),
    "cada uma com o seu orçamento e o rótulo no nome", `demolir: ${demolir.map((t) => `${t.nome}/${t.orcamento_id}`)}`);
  verifica(revestir.every((r) => r.deps?.length === 1 && ts.find((d) => d.nome === r.deps[0])?.orcamento_id === r.orcamento_id),
    "revestir depende do demolir do MESMO orçamento", `deps: ${revestir.map((r) => r.deps)}`);
  const canal = ts.find((t) => t.servico_id === S.canal);
  verifica(canal && canal.minutos_previstos === 1080 && canal.orcamento_componente === 2 && canal.orcamento_linha_id === L.conjunto,
    "o serviço dentro do conjunto deu tarefa (1080 min, componente 2, linha do conjunto)",
    `canalização: ${JSON.stringify(canal && { m: canal.minutos_previstos, c: canal.orcamento_componente })}`);
  const pint = ts.filter((t) => t.servico_id === S.pint);
  verifica(pint.length === 1 && pint[0].minutos_previstos === 240,
    "a pintura do 2.º orçamento (2 × 2 h) e nada da alternativa", `pinturas: ${pint.map((t) => t.minutos_previstos)}`);
  const o = await um(`SELECT orcamento_id FROM public.ops_obra WHERE id = '${obraMulti.id}'`);
  verifica(o.orcamento_id === Q.servico, "o orçamento principal da obra é o de sempre (o aceite mais recente)",
    `principal: ${o.orcamento_id}`);
  await recusa("o orçamento que entrou na obra do contrato não abre outra obra", () =>
    criar(`p_orcamento_id => '${Q.suite}'`), /já tem obra/);

  // Cancelar e voltar a criar, agora com as tarefas revistas no ecrã (p_tarefas).
  await chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_mudar_estado('${obraMulti.id}', 'cancelada', 'teste da ida e volta');`);
  const enviar = previsao.servicos.flatMap((s) =>
    s.tarefas.map((t) => ({
      nome: t.nome, fase: t.fase, minutos: t.minutos, pessoas_previstas: t.pessoas_previstas, pessoas: [],
      skill_id: null, skill_nome: t.skill_nome, orcamento_linha_id: s.linha_id, orcamento_id: s.orcamento_id,
      orcamento_componente: s.componente, servico_id: s.servico_id, servico_tarefa_id: t.servico_tarefa_id, depende: [],
    })));
  const ida = await tenta("criar com as tarefas revistas (p_tarefas)", () =>
    criar(`p_contrato_id => '${C.multi}', p_tarefas => '${JSON.stringify(enviar).replace(/'/g, "''")}'::jsonb`));
  if (ida) {
    const ts2 = await tarefas(ida.id);
    const c2 = ts2.find((t) => t.servico_id === S.canal);
    verifica(ts2.filter((t) => t.orcamento_linha_id).length === enviar.length && c2?.orcamento_componente === 2
             && new Set(ts2.filter((t) => t.orcamento_id).map((t) => t.orcamento_id)).size === 2,
      "a ida e volta guarda o orçamento e o componente de cada tarefa", `tarefas: ${ts2.length}`);
    obraMulti = ida;
  }
  const mau1 = [{ ...enviar[0], orcamento_id: Q.alternativa }];
  await chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_mudar_estado('${obraMulti.id}', 'cancelada', 'teste');`);
  await recusa("uma linha com o orçamento errado é recusada", () =>
    criar(`p_contrato_id => '${C.multi}', p_tarefas => '${JSON.stringify(mau1).replace(/'/g, "''")}'::jsonb`), /orçamento/);
  obraMulti = await tenta("criar outra vez (automática)", () => criar(`p_contrato_id => '${C.multi}'`));
}

/* ── 4. Com quote_id: só esse ───────────────────────────────────────────── */
let obraQid = await tenta("criar a obra do contrato com quote_id", () => criar(`p_contrato_id => '${C.qid}'`));
if (obraQid) {
  const ts = await tarefas(obraQid.id);
  verifica(ts.every((t) => !t.orcamento_id || t.orcamento_id === Q.qid) && ts.some((t) => t.servico_id === S.canal)
           && !ts.some((t) => t.nome.includes(" · ")),
    "com quote_id só entram as tarefas desse orçamento (sem rótulo no nome)", `tarefas: ${ts.map((t) => t.nome)}`);
}

/* ── 5. Acrescentar um orçamento novo (adenda) a uma obra existente ─────── */
console.log("\n─── acrescentar orçamento (adenda) ──────");
if (obraQid) {
  const antes = await tarefas(obraQid.id);
  // Interna (sem verificação de quem chama): hoje ainda não há adendas no CRM.
  const r = await tenta("acrescentar o orçamento novo", async () =>
    (await um(`SELECT public.ops_obra_acrescentar_orcamentos_impl('${obraQid.id}', ARRAY['${Q.adenda}','${Q.qid}']::uuid[]) AS r`)).r);
  const depois = await tarefas(obraQid.id);
  const fimAntes = antes.reduce((m, t) => (t.fim_planeado > m ? t.fim_planeado : m), antes[0].fim_planeado);
  const novas = depois.filter((t) => t.orcamento_id === Q.adenda);
  verifica(r?.acrescentadas === 1 && novas.length === 1 && novas[0].nome.startsWith("Adenda varanda · ")
           && novas[0].inicio_planeado > fimAntes,
    "entra a tarefa do orçamento novo, depois do fim atual; o que já estava salta-se",
    `r=${JSON.stringify(r)} novas=${novas.map((t) => `${t.nome} ${t.inicio_planeado}`)}`);
  verifica(antes.every((a) => {
    const d = depois.find((x) => x.id === a.id);
    return d && +d.inicio_planeado === +a.inicio_planeado && +d.fim_planeado === +a.fim_planeado;
  }), "as tarefas que já estavam não mexem", "as tarefas antigas mexeram");
  const r2 = (await um(`SELECT public.ops_obra_acrescentar_orcamentos_impl('${obraQid.id}', ARRAY['${Q.adenda}']::uuid[]) AS r`)).r;
  verifica(r2?.acrescentadas === 0, "acrescentar outra vez não duplica", `segunda vez: ${JSON.stringify(r2)}`);
}

/* ── 6. Uma obra que já arrancou ANTES do obra-arranque.sql ──────────────── */
const obraAntiga = await tenta("obra simples", () => criar(`p_contrato_id => '${C.simples}'`));
if (obraAntiga) {
  await tenta("arrancar sem o checklist instalado", () =>
    chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_mudar_estado('${obraAntiga.id}', 'em_curso', NULL);`));
}

/* ── 7. obra-arranque.sql ───────────────────────────────────────────────── */
console.log("\n─── instalar obra-arranque.sql ──────────");
try {
  await db.exec(ler("obra-arranque.sql"));
  await db.exec(ler("obra-arranque.sql"));
  await db.exec(ler("obras.sql"));
  await db.exec(ler("obra-arranque.sql"));
  ok("obra-arranque.sql corre duas vezes, e obras.sql outra vez por cima");
} catch (e) {
  mau(`obra-arranque.sql falhou: ${e.message}`);
  process.exit(1);
}
const arranque = (obra, quem = AUTH.gestor) => chamar(quem, `SELECT public.rpc_ops_obra_arranque('${obra}');`);
const aprovar = (obra, quem = AUTH.gestor) => chamar(quem, `SELECT public.rpc_ops_obra_aprovar_plano('${obra}');`);
const eventos = async (obra, tipo) =>
  (await um(`SELECT count(*)::int AS n FROM public.ops_evento WHERE entidade_id = '${obra}' AND tipo = '${tipo}'`)).n;

if (obraAntiga) {
  const a = await arranque(obraAntiga.id);
  verifica(a.plano.estado === "aprovado" && a.arrancou && (await eventos(obraAntiga.id, "plano_aprovado")) === 1,
    "a obra que já tinha arrancado fica com o plano aprovado (um evento, mesmo a correr 3 vezes)",
    `arranque: ${JSON.stringify(a.plano)}`);
}

console.log("\n─── sem as tabelas da Frente A ──────────");
if (obraMulti) {
  const a = await tenta("checklist sem a Frente A", () => arranque(obraMulti.id));
  verifica(a && a.encomenda_cliente.estado === "por_instalar" && a.fornecedor.estado === "por_instalar"
           && a.plano.estado === "por_aprovar" && a.pode_arrancar === false && a.falta.length === 1,
    "Encomenda Cliente e fornecedor \"por instalar\", plano por aprovar, falta 1 coisa",
    `arranque: ${JSON.stringify(a)?.slice(0, 300)}`);
  await recusa("arrancar sem o plano aprovado", () =>
    chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_mudar_estado('${obraMulti.id}', 'em_curso', NULL);`), /aprovar o plano/);
  await recusa("o técnico não aprova o plano", () => aprovar(obraMulti.id, AUTH.tec));
  const ap = await tenta("aprovar o plano", () => aprovar(obraMulti.id));
  const a2 = await arranque(obraMulti.id);
  verifica(ap?.ok && a2.plano.estado === "aprovado" && a2.plano.aprovado_por === U.gestor && a2.plano.aprovado_por_nome === "Gestora"
           && a2.plano.aprovado_em && a2.pode_arrancar === true,
    "plano aprovado: quem e quando; sem a Frente A pode arrancar", `depois de aprovar: ${JSON.stringify(a2.plano)}`);

  // Mexer nas datas → por aprovar, com evento.
  const t = (await tarefas(obraMulti.id)).find((x) => x.servico_id === S.pint);
  await tenta("mudar as datas de uma tarefa", () =>
    chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_planear_tarefa('${t.id}', '2026-12-01', '2026-12-01');`));
  const a3 = await arranque(obraMulti.id);
  verifica(a3.plano.estado === "por_aprovar" && a3.pode_arrancar === false && (await eventos(obraMulti.id, "plano_por_aprovar")) === 1,
    "mudar datas depois de aprovado → por aprovar (e fica o evento)", `depois de mexer: ${JSON.stringify(a3.plano)}`);
  await aprovar(obraMulti.id);
  await tenta("mudar a equipa de uma tarefa", () =>
    chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_atribuir_tarefa('${t.id}', ARRAY['${U.tec2}']::uuid[]);`));
  verifica((await arranque(obraMulti.id)).plano.estado === "por_aprovar",
    "mudar a equipa depois de aprovado → por aprovar", "mudar a equipa não desaprovou o plano");
  await aprovar(obraMulti.id);
  await tenta("arrancar com o plano aprovado", () =>
    chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_mudar_estado('${obraMulti.id}', 'em_curso', NULL);`));
  await tenta("mexer numa obra em curso", () =>
    chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_planear_tarefa('${t.id}', '2026-12-02', '2026-12-02');`));
  verifica((await arranque(obraMulti.id)).plano.estado === "aprovado",
    "depois de arrancar, replanear já não desaprova", "uma obra em curso voltou a por aprovar");
}

/* ── 8. Com as tabelas da Frente A (stubs mínimos) ──────────────────────── */
console.log("\n─── com a Frente A ──────────────────────");
await db.exec(`
  ALTER TABLE public.purchase_orders ADD COLUMN expected_delivery date;
  CREATE TABLE public.obra_encomenda_cliente (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, contract_id uuid NOT NULL,
    obra_id uuid, estado text NOT NULL DEFAULT 'rascunho', fornecedor_estado text NOT NULL DEFAULT 'por_gerar',
    validada_por uuid, validada_em timestamptz, versao int NOT NULL DEFAULT 1,
    criada_em timestamptz NOT NULL DEFAULT now(), atualizada_em timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.obra_encomenda_cliente_linha (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, encomenda_id uuid NOT NULL,
    tipo text NOT NULL, product_id uuid, service_id uuid, quote_id uuid, quote_line_id uuid, qtd_necessaria numeric);
  CREATE TABLE public.nota_encomenda_fornecedor (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, encomenda_cliente_id uuid NOT NULL,
    supplier_id uuid, estado text NOT NULL DEFAULT 'proposta', purchase_order_id uuid, prazo_previsto date);
  CREATE TABLE public.nota_encomenda_fornecedor_linha (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nota_id uuid NOT NULL, encomenda_linha_id uuid,
    product_id uuid, qtd numeric);
`);
if (obraQid) {
  // O plano aprovado primeiro (para ver a Encomenda Cliente a "desaprová-lo").
  await tenta("aprovar o plano da obra com quote_id", () => aprovar(obraQid.id));
  let a = await arranque(obraQid.id);
  verifica(a.encomenda_cliente.estado === "por_gerar" && a.fornecedor.estado === "por_validar" && !a.pode_arrancar
           && a.falta.some((f) => /Encomenda Cliente/.test(f)),
    "sem Encomenda Cliente: por gerar, fornecedor por validar, não arranca", `arranque: ${JSON.stringify(a.falta)}`);
  await recusa("arrancar sem as 3 validações", () =>
    chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_mudar_estado('${obraQid.id}', 'em_curso', NULL);`), /Encomenda Cliente/);

  const ENC = "ec000000-0000-0000-0000-000000000001";
  await db.exec(`INSERT INTO public.obra_encomenda_cliente (id, organization_id, contract_id, estado, criada_em)
                 VALUES ('${ENC}', '${ORG}', '${C.qid}', 'rascunho', now() - interval '1 hour');`);
  a = await arranque(obraQid.id);
  verifica(a.encomenda_cliente.estado === "rascunho" && a.fornecedor.estado === "por_validar" && !a.pode_arrancar,
    "Encomenda Cliente em rascunho: não arranca", `arranque: ${JSON.stringify(a.encomenda_cliente)}`);

  // Validada DEPOIS do plano aprovado; notas por aprovar.
  const LIN = "ec000000-0000-0000-0000-0000000000a1";
  const NOTA = "ec000000-0000-0000-0000-0000000000b1";
  const PO = "ec000000-0000-0000-0000-0000000000c1";
  await db.exec(`
    UPDATE public.obra_encomenda_cliente SET estado = 'validada', validada_por = '${U.gestor}', validada_em = now(),
           fornecedor_estado = 'por_aprovar' WHERE id = '${ENC}';
    INSERT INTO public.obra_encomenda_cliente_linha (id, organization_id, encomenda_id, tipo, product_id, quote_id, quote_line_id, qtd_necessaria)
      VALUES ('${LIN}', '${ORG}', '${ENC}', 'produto', '${P.louca}', '${Q.qid}', '${L.conjuntoQid}', 1),
             (gen_random_uuid(), '${ORG}', '${ENC}', 'consumivel', '${P.tinta}', '${Q.qid}', NULL, 1);
    INSERT INTO public.nota_encomenda_fornecedor (id, organization_id, encomenda_cliente_id, estado, prazo_previsto)
      VALUES ('${NOTA}', '${ORG}', '${ENC}', 'proposta', '2030-01-10');
    INSERT INTO public.nota_encomenda_fornecedor_linha (nota_id, encomenda_linha_id, product_id, qtd)
      VALUES ('${NOTA}', '${LIN}', '${P.louca}', 1), ('${NOTA}', NULL, '${P.tinta}', 1);
  `);
  a = await arranque(obraQid.id);
  verifica(a.encomenda_cliente.estado === "validada" && a.encomenda_cliente.validada_por_nome === "Gestora"
           && a.fornecedor.estado === "por_aprovar" && a.fornecedor.notas?.propostas === 1
           && a.plano.estado === "por_aprovar" && /depois/.test(a.plano.motivo ?? "") && !a.pode_arrancar,
    "validada depois do plano: o plano volta a por aprovar; nota por aprovar",
    `arranque: ${JSON.stringify({ ec: a.encomenda_cliente.estado, fo: a.fornecedor, pl: a.plano.motivo })}`);

  // Aprovada a nota (com a encomenda ao fornecedor) e o plano outra vez.
  await db.exec(`
    INSERT INTO public.purchase_orders (id, organization_id, order_number, status, expected_delivery)
      VALUES ('${PO}', '${ORG}', 'PO-1', 'pending', '2030-02-01');
    UPDATE public.nota_encomenda_fornecedor SET estado = 'aprovada', purchase_order_id = '${PO}' WHERE id = '${NOTA}';
    UPDATE public.obra_encomenda_cliente SET fornecedor_estado = 'aprovada' WHERE id = '${ENC}';
  `);
  const ap = await tenta("aprovar o plano com as notas aprovadas", () => aprovar(obraQid.id));
  const ts = await tarefas(obraQid.id);
  const canal = ts.find((t) => t.servico_id === S.canal);
  const pint = ts.find((t) => t.servico_id === S.pint && t.orcamento_id === Q.qid);
  verifica(canal?.material_chega_em?.toISOString().slice(0, 10) === "2030-02-01" && canal.material_chega_origem === "crm"
           && pint?.material_chega_em?.toISOString().slice(0, 10) === "2030-02-01",
    "material_chega_em pela encomenda ao fornecedor (expected_delivery): o conjunto pela linha da Encomenda Cliente, a pintura pela ficha",
    `canal ${canal?.material_chega_em} pintura ${pint?.material_chega_em}`);
  a = await arranque(obraQid.id);
  verifica(a.pode_arrancar && a.plano.material_antes.length >= 2 && ap?.avisos?.some((x) => /antes de o material chegar/.test(x)),
    "as 3 validadas: pode arrancar, com aviso das tarefas que começam antes do material",
    `arranque: ${JSON.stringify({ p: a.pode_arrancar, m: a.plano.material_antes?.length, av: ap?.avisos })}`);
  // Uma data dita à mão não se pisa.
  await chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_material_chega('${pint.id}', '2029-06-01', 'combinado', false);`);
  await chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_material_sincronizar('${obraQid.id}');`);
  const pint2 = await um(`SELECT material_chega_em, material_chega_origem FROM public.ops_obra_tarefa WHERE id = '${pint.id}'`);
  verifica(pint2.material_chega_origem === "manual" && pint2.material_chega_em.toISOString().slice(0, 10) === "2029-06-01",
    "a data dita à mão não é pisada pelas notas", `pintura: ${JSON.stringify(pint2)}`);
  await aprovar(obraQid.id);
  await tenta("arrancar com as 3 validações", () =>
    chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_mudar_estado('${obraQid.id}', 'em_curso', NULL);`));
  const est = await um(`SELECT estado FROM public.ops_obra WHERE id = '${obraQid.id}'`);
  verifica(est.estado === "em_curso", "arrancou", `estado: ${est.estado}`);
}
{
  // "Não necessária" conta como feita; obra sem contrato = não aplicável.
  const branca = await tenta("obra em branco", () =>
    chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_criar(p_org => '${ORG}', p_titulo => 'Obra avulsa', p_data_inicio => '2026-11-02');`));
  if (branca) {
    await chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_gravar_tarefa(p_obra_id => '${branca.id}', p_fase_id => (SELECT id FROM public.ops_obra_fase WHERE obra_id = '${branca.id}' AND ordem = 1), p_nome => 'Visita', p_minutos => 60);`).catch(() => null);
    const a = await arranque(branca.id);
    verifica(a.encomenda_cliente.estado === "nao_aplicavel" && a.fornecedor.estado === "nao_aplicavel" && a.encomenda_cliente.ok,
      "obra sem contrato: Encomenda Cliente e fornecedor não aplicáveis", `arranque: ${JSON.stringify(a.encomenda_cliente)}`);
  }
  const obraS = await um(`SELECT id FROM public.ops_obra WHERE contrato_id = '${C.multi}' AND estado <> 'cancelada'`);
  await db.exec(`INSERT INTO public.obra_encomenda_cliente (organization_id, contract_id, estado, fornecedor_estado, validada_em)
                 VALUES ('${ORG}', '${C.simples}', 'validada', 'nao_necessaria', now());`);
  const s = await arranque((await um(`SELECT id FROM public.ops_obra WHERE contrato_id = '${C.simples}'`)).id);
  verifica(s.fornecedor.estado === "nao_necessaria" && s.fornecedor.ok, "fornecedor \"não necessária\" conta como feito",
    `fornecedor: ${JSON.stringify(s.fornecedor)}`);
  void obraS;
}

/* ── 9. Segurança ───────────────────────────────────────────────────────── */
console.log("\n─── segurança ───────────────────────────");
{
  const r = await um(`SELECT
      has_function_privilege('anon', 'public.rpc_ops_obra_arranque(uuid)', 'EXECUTE') AS anon_arr,
      has_function_privilege('anon', 'public.rpc_ops_obra_aprovar_plano(uuid)', 'EXECUTE') AS anon_apr,
      has_function_privilege('authenticated', 'public.ops_obra_arranque_impl(uuid)', 'EXECUTE') AS auth_impl,
      has_function_privilege('authenticated', 'public.ops_obra_acrescentar_orcamentos_impl(uuid,uuid[])', 'EXECUTE') AS auth_acr,
      has_function_privilege('authenticated', 'public.ops_obra_material_frente_a_impl(uuid)', 'EXECUTE') AS auth_mat`);
  verifica(!r.anon_arr && !r.anon_apr && !r.auth_impl && !r.auth_acr && !r.auth_mat,
    "anon não chama as RPCs; as funções internas não estão dadas a authenticated", `privilégios: ${JSON.stringify(r)}`);
}

console.log(falhas.length ? `\n✗ ${falhas.length} falha(s)` : "\n✓ obra e arranque: todos os orçamentos, conjuntos, plano aprovado, checklist e material");
process.exit(falhas.length ? 1 : 0);
