/**
 * Prova o planeamento automático das obras (obras.sql, secção 2c/6d/9b)
 * contra um Postgres limpo (PGlite), sem tocar no Supabase:
 *
 *   · os tempos padrão (manuais de casa de banho e cozinha) carregam-se pelo
 *     nome dos serviços, sem duplicar;
 *   · do contrato à obra: o pacote traz as tarefas da divisão; os extras
 *     JUNTAM-SE a um passo do pacote ou entram ENTRE dois passos; deslocação
 *     não dá tarefa; as linhas que dão medidas dão medidas;
 *   · a duração usa as medidas da área de intervenção (necessidade do
 *     negócio), senão as de referência do pacote;
 *   · tarefas condicionais (toalheiro, gás) só entram quando devem;
 *   · esperas em tempo corrido (cura, fabrico) e feriados no calendário;
 *   · a ida e volta do passo "Serviços do contrato" (p_tarefas) não perde nada;
 *   · aprender: terminar com a medida real, validar, e a obra seguinte usa o
 *     ritmo aprendido.
 *
 *     npm run validar-planeamento
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
  wc: ["5e000000-0000-0000-0000-000000000001", "MO Modelo Remodelação Completa - Casa de Banho Comum"],
  m1: ["5e000000-0000-0000-0000-000000000002", "MO Modelo 1 - Casa de Banho: Remoção de Banheira ou Poliban  + Revestimento até 60cm"],
  coz: ["5e000000-0000-0000-0000-000000000003", "MO Modelo Remodelação Completa - Cozinha"],
  sup: ["5e000000-0000-0000-0000-000000000004", "Supressão de ponto de água"],
  nicho: ["5e000000-0000-0000-0000-000000000005", "Mão de Obra Construção de Nicho (valor por unidade)"],
  toal: ["5e000000-0000-0000-0000-000000000006", "Instalação de Toalheiros Eletricos"],
  desl: ["5e000000-0000-0000-0000-000000000007", "Deslocação Fora do Raio de 30 km (valor p/km)"],
  eletro: ["5e000000-0000-0000-0000-000000000008", "Instalação de Eletrodomésticos de Cozinha"],
  gas: ["5e000000-0000-0000-0000-000000000009", "Instalação de Gás nas Paredes"],
  demol: ["5e000000-0000-0000-0000-00000000000a", "Mão de Obra Demolição de parede m2"],
};
const NEED_WC = "9e000000-0000-0000-0000-000000000001";
const MORADA = "ad000000-0000-0000-0000-000000000001";
const Q = {
  wc: "99990000-0000-0000-0000-000000000001",
  toal: "99990000-0000-0000-0000-000000000002",
  coz: "99990000-0000-0000-0000-000000000003",
  m1: "99990000-0000-0000-0000-000000000004",
};
const C = {
  wc: "88880000-0000-0000-0000-000000000001",
  toal: "88880000-0000-0000-0000-000000000002",
  coz: "88880000-0000-0000-0000-000000000003",
  m1: "88880000-0000-0000-0000-000000000004",
  wc2: "88880000-0000-0000-0000-000000000005",
  wc3: "88880000-0000-0000-0000-000000000006",
};

/* ── Um CRM como o real (só o que obras.sql lê) ─────────────────────────── */
await db.exec(STUBS_CRM);
await db.exec(`
  CREATE TABLE public.client_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contract_number text, client_id uuid,
    status text NOT NULL DEFAULT 'draft', total_value numeric DEFAULT 0, currency text DEFAULT 'EUR',
    organization_id uuid NOT NULL, quote_id uuid, notes text, signature_date timestamptz,
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
`);

const SEQUENCIA = [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
  "seguranca.sql", "tempos.sql",
];

/* ── CRM: catálogo, orçamentos, necessidades, ficha do local, feriados ──── */
await db.exec(`
  ALTER TABLE public.quote_lines ADD COLUMN service_id uuid, ADD COLUMN section_name text,
                                 ADD COLUMN source_deal_need_id uuid;
  ALTER TABLE public.quotes ADD COLUMN site_address_id uuid;
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
  CREATE TABLE public.deal_needs (
    id uuid PRIMARY KEY, diag_area_m2 numeric, diag_tipo_area text, diag_m2_pavimento numeric,
    diag_perimetro_m numeric, diag_pe_direito_m numeric, diag_altura_revestimento text,
    diag_pontos_agua integer, diag_pontos_eletricos integer, diag_janela boolean, diag_local_cortes text,
    diag_gas text, diag_toalheiro boolean);
  CREATE TABLE public.quote_diagnostic_snapshot (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quote_id uuid NOT NULL, deal_need_id uuid,
    diag_area_m2 numeric, organization_id uuid NOT NULL);
  CREATE TABLE public.anew_address_building (
    address_id uuid PRIMARY KEY, acesso text, tem_elevador boolean, n_andares integer,
    habitada_durante_obra boolean, animais boolean, mobilada text, distancia_entrada text, gas text);
  CREATE TABLE public.schedule_holidays (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), country_code varchar(2) NOT NULL,
    organization_id uuid, name varchar(255) NOT NULL, holiday_date date NOT NULL, is_recurring boolean NOT NULL DEFAULT false);

  INSERT INTO public.schedule_holidays (country_code, organization_id, name, holiday_date, is_recurring)
    VALUES ('PT', NULL, 'Imaculada Conceição', '2000-12-08', true);
  INSERT INTO public.services (id, name, organization_id) VALUES
    ${Object.values(S).map(([id, nome]) => `('${id}', '${nome.replace(/'/g, "''")}', '${ORG}')`).join(",\n    ")};
  INSERT INTO public.anew_addresses (id, street, number, floor, postal_code, city)
    VALUES ('${MORADA}', 'Rua da Obra', '5', '3.º Esq', '1000-100', 'Lisboa');
  INSERT INTO public.anew_address_building (address_id, acesso, tem_elevador, habitada_durante_obra)
    VALUES ('${MORADA}', 'dificil', false, true);
  -- A casa de banho medida na visita: 5 m² de chão, 9 m de perímetro,
  -- revestimento até ao teto (2,5 m) → 22,5 m² de parede; 4 pontos de água.
  INSERT INTO public.deal_needs (id, diag_area_m2, diag_tipo_area, diag_m2_pavimento, diag_perimetro_m,
                                 diag_pe_direito_m, diag_altura_revestimento, diag_pontos_agua, diag_janela, diag_local_cortes)
    VALUES ('${NEED_WC}', 5, 'casa_banho', 5, 9, 2.5, 'teto', 4, false, 'fora');
  INSERT INTO public.quote_diagnostic_snapshot (quote_id, deal_need_id, diag_area_m2, organization_id)
    VALUES ('${Q.wc}', '${NEED_WC}', 5, '${ORG}');

  INSERT INTO public.quotes (id, organization_id, cliente_id, quote_number, title, estado, accepted_at, total, site_address_id) VALUES
    ('${Q.wc}','${ORG}','${CLI}','Q-WC','WC completa','aceite',now(),9000,'${MORADA}'),
    ('${Q.toal}','${ORG}','${CLI}','Q-TOAL','WC com toalheiro','aceite',now(),9000,NULL),
    ('${Q.coz}','${ORG}','${CLI}','Q-COZ','Cozinha','aceite',now(),12000,NULL),
    ('${Q.m1}','${ORG}','${CLI}','Q-M1','Modelo 1','aceite',now(),3000,NULL);
  INSERT INTO public.quote_lines (quote_id, ordem, descricao_snapshot, qt, service_id, source_deal_need_id) VALUES
    ('${Q.wc}',0,'Pacote',1,'${S.wc[0]}','${NEED_WC}'),
    ('${Q.wc}',1,'Supressão',2,'${S.sup[0]}',NULL),
    ('${Q.wc}',2,'Nicho',1,'${S.nicho[0]}',NULL),
    ('${Q.wc}',3,'Deslocação',50,'${S.desl[0]}',NULL),
    ('${Q.wc}',4,'Demolição',3,'${S.demol[0]}',NULL),
    ('${Q.toal}',0,'Pacote',1,'${S.wc[0]}',NULL),
    ('${Q.toal}',1,'Toalheiro',1,'${S.toal[0]}',NULL),
    ('${Q.coz}',0,'Pacote',1,'${S.coz[0]}',NULL),
    ('${Q.coz}',1,'Eletrodomésticos',5,'${S.eletro[0]}',NULL),
    ('${Q.coz}',2,'Gás',1,'${S.gas[0]}',NULL),
    ('${Q.m1}',0,'Pacote',1,'${S.m1[0]}',NULL);
  INSERT INTO public.client_contracts (id, contract_number, client_id, status, organization_id, quote_id, signature_date, created_by)
  SELECT id, 'CT-' || k, '${CLI}', 'signed', '${ORG}', quote, now(), '${U.gestor}'
    FROM (VALUES ('${C.wc}'::uuid, 'wc', '${Q.wc}'::uuid), ('${C.toal}', 'toal', '${Q.toal}'),
                 ('${C.coz}', 'coz', '${Q.coz}'), ('${C.m1}', 'm1', '${Q.m1}'),
                 ('${C.wc2}', 'wc2', '${Q.wc}'), ('${C.wc3}', 'wc3', '${Q.wc}')) x(id, k, quote);
`);

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
  ok("obras.sql corre duas vezes com o planeamento automático");
} catch (e) {
  mau(`obras.sql falhou: ${e.message}`);
  process.exit(1);
}

/* ── Perfis ─────────────────────────────────────────────────────────────── */
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
`);

function sessao(authUid, sql) {
  return `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${authUid}'; ${sql} COMMIT;`;
}
async function chamar(authUid, sql) {
  try {
    const r = await db.exec(sessao(authUid, sql));
    const linhas = r.flatMap((x) => x.rows ?? []);
    const bruto = Object.values(linhas.at(-1) ?? {})[0];
    return typeof bruto === "string" && bruto.startsWith("{") ? JSON.parse(bruto) : bruto;
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
const tarefas = (obra) =>
  q(`SELECT t.*, f.ordem AS fase, (SELECT array_agg(d.chave ORDER BY d.chave) FROM public.ops_obra_tarefa_dependencia x
                                     JOIN public.ops_obra_tarefa d ON d.id = x.depende_de_id WHERE x.tarefa_id = t.id) AS deps,
            (SELECT array_agg(d.nome) FROM public.ops_obra_tarefa_dependencia x
               JOIN public.ops_obra_tarefa d ON d.id = x.depende_de_id WHERE x.tarefa_id = t.id) AS deps_nomes
       FROM public.ops_obra_tarefa t JOIN public.ops_obra_fase f ON f.id = t.fase_id
      WHERE t.obra_id = '${obra}' ORDER BY t.ordem`);
const passo = (ts, linhaServico, chave) => ts.find((t) => t.servico_id === linhaServico && t.chave === chave);

/* ── 1. Calendário: esperas em tempo corrido ────────────────────────────── */
console.log("\n─── calendário ──────────────────────────");
{
  // Seg 2 a sex 6 de novembro de 2026 e a semana seguinte; 480 min/dia, 08:00.
  const dias = `ARRAY['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-09','2026-11-10']::date[]`;
  const r = await um(`SELECT
      public.ops_obra_minuto_apos_espera(${dias}, '08:00', 480, 480, 0) AS sem,
      public.ops_obra_minuto_apos_espera(${dias}, '08:00', 480, 5*480, 48) AS sexta_48,
      public.ops_obra_minuto_apos_espera(${dias}, '08:00', 480, 240, 24) AS meio_dia_24,
      public.ops_obra_minuto_apos_espera(${dias}, '08:00', 480, 480, 12) AS fim_dia_12`);
  verifica(Number(r.sem) === 480, "sem espera, começa logo", `sem espera deu ${r.sem}`);
  // Sexta às 16:00 + 48 h = domingo 16:00 → segunda (índice 5) de manhã.
  verifica(Number(r.sexta_48) === 5 * 480, "sexta ao fim do dia + 48 h de cura → segunda de manhã",
    `sexta + 48 h deu o minuto ${r.sexta_48}`);
  // Segunda às 12:00 + 24 h = terça às 12:00 → minuto 480 + 240.
  verifica(Number(r.meio_dia_24) === 720, "a meio do dia + 24 h → no dia seguinte à mesma hora",
    `meio do dia + 24 h deu ${r.meio_dia_24}`);
  // Segunda às 16:00 + 12 h = terça às 04:00 → terça de manhã.
  verifica(Number(r.fim_dia_12) === 480, "a cura que acaba de madrugada deixa começar de manhã",
    `fim do dia + 12 h deu ${r.fim_dia_12}`);
  const l = await um(`SELECT public.ops_obra_dias_uteis_lista('${ORG}', '2026-12-07', 3) AS d`);
  verifica(l.d.map((d) => d.toISOString().slice(0, 10)).join(",") === "2026-12-07,2026-12-09,2026-12-10",
    "o feriado nacional de 8 de dezembro não é dia útil", `dias úteis: ${l.d}`);
}

/* ── 2. Tempos padrão ───────────────────────────────────────────────────── */
console.log("\n─── tempos padrão ───────────────────────");
let semente = await tenta("carregar os tempos padrão", () =>
  chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_semear_tempos_padrao('${ORG}');`));
{
  const c = await um(`SELECT
      (SELECT count(*)::int FROM public.ops_obra_servico_tarefa WHERE servico_id = '${S.wc[0]}') AS wc,
      (SELECT count(*)::int FROM public.ops_obra_servico_tarefa WHERE servico_id = '${S.coz[0]}') AS coz,
      (SELECT count(*)::int FROM public.ops_obra_servico_tarefa WHERE servico_id = '${S.m1[0]}') AS m1,
      (SELECT tipo FROM public.ops_obra_servico_perfil WHERE servico_id = '${S.wc[0]}') AS tipo,
      (SELECT planear FROM public.ops_obra_servico_perfil WHERE servico_id = '${S.desl[0]}') AS desl,
      (SELECT medida_para FROM public.ops_obra_servico_perfil WHERE servico_id = '${S.eletro[0]}') AS eletro,
      (SELECT count(*)::int FROM public.ops_obra_servico_tarefa) AS total`);
  verifica(c.wc === 18 && c.coz === 21 && c.m1 === 12,
    `casa de banho 18 passos, cozinha 21, modelo 1 com 12`, `passos: ${JSON.stringify(c)}`);
  verifica(c.tipo === "casa_banho" && c.desl === false && c.eletro === "eletrodomesticos",
    "perfis: pacote de casa de banho, deslocação não planeia, eletrodomésticos dão medida",
    `perfis: ${JSON.stringify(c)}`);
  verifica(semente?.nao_encontrados?.length > 0,
    `os serviços que não existem nesta base ficam listados (${semente?.nao_encontrados?.length})`,
    "devia listar os serviços não encontrados");
  const de2 = await chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_semear_tempos_padrao('${ORG}');`);
  const c2 = await um(`SELECT count(*)::int AS total FROM public.ops_obra_servico_tarefa`);
  verifica(c2.total === c.total && de2.passos === semente.passos, "carregar duas vezes não duplica",
    `segunda carga: ${c.total} → ${c2.total}`);
  const p = await um(`SELECT condicao, espera_antes_horas, medida, fatores FROM public.ops_obra_servico_tarefa
                       WHERE servico_id = '${S.wc[0]}' AND chave = '2.3'`);
  verifica(Array.isArray(p.condicao?.servicos) && p.condicao.servicos.includes(S.toal[0]),
    "a condição do aquecimento aponta para o serviço do toalheiro desta organização",
    `condição: ${JSON.stringify(p.condicao)}`);
}

/* ── 3. Do contrato à obra: casa de banho com extras ────────────────────── */
console.log("\n─── contrato → obra (casa de banho) ─────");
// A obra arranca numa segunda; o dia 4 (quarta) é feriado da organização.
await db.exec(`INSERT INTO public.schedule_holidays (country_code, organization_id, name, holiday_date)
               VALUES ('PT', '${ORG}', 'Feriado municipal', '2026-11-04');`);
const geral = await um(`SELECT public.ops_obra_semear_tipo_geral_impl('${ORG}') AS id`);
const obraWc = await tenta("abrir a obra do contrato da casa de banho", () =>
  chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_criar(p_org => '${ORG}', p_contrato_id => '${C.wc}',
                         p_modelo_id => '${geral.id}', p_data_inicio => '2026-11-02');`));
const tw = obraWc ? await tarefas(obraWc.id) : [];
{
  const doTipo = tw.filter((t) => t.modelo_tarefa_id);
  verifica(doTipo.length === 0, "com um pacote, as tarefas do tipo de obra não se repetem",
    `${doTipo.length} tarefas do tipo de obra: ${doTipo.map((t) => t.nome).join(", ")}`);
  const pac = tw.filter((t) => t.servico_id === S.wc[0]);
  verifica(pac.length === 17 && !passo(tw, S.wc[0], "2.3"),
    "o pacote traz 17 tarefas (sem o aquecimento: não há toalheiro)", `pacote com ${pac.length} tarefas`);
  verifica(!tw.some((t) => t.servico_id === S.desl[0]), "a deslocação não dá tarefa", "a deslocação deu tarefa");
  verifica(!tw.some((t) => t.servico_id === S.sup[0]), "a supressão de ponto de água não fica tarefa à parte",
    "a supressão ficou tarefa à parte");

  const can = passo(tw, S.wc[0], "2.1");
  // 6 h + 4 h × 4 pontos de água (da visita) = 22 h; + 2 × 1,5 h de supressão.
  verifica(can?.minutos_previstos === 1320 + 180 && can?.minutos_juntos === 180 && can?.medida_qt == 4,
    "canalização: 4 pontos de água da visita + as 2 supressões juntas (25 h)",
    `canalização: ${can?.minutos_previstos} min, juntos ${can?.minutos_juntos}, medida ${can?.medida_qt}`);

  const az = passo(tw, S.wc[0], "3.3");
  verifica(Number(az?.medida_qt) === 27.5 && az?.minutos_previstos === 120 + 60 * 27.5,
    "azulejo: 5 m² de chão + 22,5 m² de parede (perímetro × pé-direito) = 27,5 m²",
    `azulejo: medida ${az?.medida_qt}, ${az?.minutos_previstos} min`);
  verifica(az?.fatores_chave === "altura_revestimento=teto|janela=nao|local_cortes=fora",
    `fatores do azulejo: ${az?.fatores_chave}`, `fatores do azulejo: ${az?.fatores_chave}`);
  const ent = passo(tw, S.wc[0], "1.4");
  verifica(ent?.fatores_chave === "acesso=dificil|andar=3+|elevador=nao",
    `fatores do entulho (ficha do local): ${ent?.fatores_chave}`, `fatores do entulho: ${ent?.fatores_chave}`);
  verifica(az?.minutos_origem === "padrao" && az?.ritmo_n === 0, "sem dados reais, o tempo é o padrão",
    `origem: ${az?.minutos_origem}`);

  const dem = passo(tw, S.wc[0], "1.3");
  verifica(dem?.minutos_previstos === 120 + Math.round(36 * 27.5) + 3 * 48,
    "a demolição de parede junta-se à demolição do pacote", `demolição: ${dem?.minutos_previstos} min`);

  const nicho = tw.find((t) => t.servico_id === S.nicho[0]);
  const imp = passo(tw, S.wc[0], "3.2");
  verifica(nicho && (nicho.deps ?? []).includes("2.4") && (imp?.deps_nomes ?? []).includes(nicho.nome),
    "o nicho entra ENTRE os ensaios e a impermeabilização",
    `nicho depende de ${nicho?.deps}; impermeabilização depende de ${imp?.deps}`);

  const bet = passo(tw, S.wc[0], "3.1");
  const dias = (a, b) => (new Date(a) - new Date(b)) / 86400000;
  verifica(imp && bet && Number(imp.espera_antes_horas) === 48 && dias(imp.inicio_planeado, bet.fim_planeado) >= 2,
    `impermeabilização ${imp?.inicio_planeado}: pelo menos 48 h depois da betonilha (${bet?.fim_planeado})`,
    `impermeabilização ${imp?.inicio_planeado} vs betonilha ${bet?.fim_planeado}`);
  const noFeriado = tw.filter((t) => String(t.inicio_planeado).startsWith("2026-11-04") ||
                                     String(t.fim_planeado).startsWith("2026-11-04"));
  const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
  verifica(tw.every((t) => iso(t.inicio_planeado) !== "2026-11-04" && iso(t.fim_planeado) !== "2026-11-04"),
    "nenhuma tarefa começa ou acaba no feriado municipal", `${noFeriado.length} tarefas no feriado`);
}

/* ── 4. Condicionais: toalheiro e gás ───────────────────────────────────── */
console.log("\n─── tarefas condicionais ────────────────");
{
  const o = await tenta("abrir a obra com toalheiro", () =>
    chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_criar(p_org => '${ORG}', p_contrato_id => '${C.toal}', p_data_inicio => '2026-11-02');`));
  const t = o ? await tarefas(o.id) : [];
  const aq = passo(t, S.wc[0], "2.3");
  const lig = passo(t, S.wc[0], "4.3");
  verifica(aq && aq.minutos_previstos === 120 + 45,
    "com toalheiro no orçamento, entra a preparação do aquecimento (com metade do tempo do toalheiro)",
    `aquecimento: ${aq?.minutos_previstos}`);
  verifica(lig && lig.minutos_juntos === 45, "e a outra metade junta-se à ligação elétrica final",
    `ligação: juntos ${lig?.minutos_juntos}`);
  // As medidas de referência do pacote (sem visita): 22 m² no azulejo.
  verifica(Number(passo(t, S.wc[0], "3.3")?.medida_qt) === 22, "sem visita, a medida é a de referência do pacote (22 m²)",
    `azulejo sem visita: ${passo(t, S.wc[0], "3.3")?.medida_qt}`);
}
{
  const o = await tenta("abrir a obra da cozinha", () =>
    chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_criar(p_org => '${ORG}', p_contrato_id => '${C.coz}', p_data_inicio => '2026-11-02');`));
  const t = o ? await tarefas(o.id) : [];
  const gas = passo(t, S.coz[0], "2.3");
  verifica(gas && gas.minutos_previstos === 360 + 360, "cozinha com gás: a instalação de gás entra, com o extra junto",
    `gás: ${gas?.minutos_previstos}`);
  const el = passo(t, S.coz[0], "4.4");
  verifica(Number(el?.medida_qt) === 5 && !t.some((x) => x.servico_id === S.eletro[0]),
    "os 5 eletrodomésticos do orçamento são a medida da instalação (não uma tarefa a mais)",
    `eletrodomésticos: medida ${el?.medida_qt}`);
  const med = passo(t, S.coz[0], "4.2");
  const col = passo(t, S.coz[0], "4.3");
  const dias = (a, b) => (new Date(a) - new Date(b)) / 86400000;
  verifica(col && med && dias(col.inicio_planeado, med.fim_planeado) >= 5,
    `a bancada coloca-se depois dos 5 dias de fabrico (${med?.fim_planeado} → ${col?.inicio_planeado})`,
    `bancada: medição ${med?.fim_planeado}, colocação ${col?.inicio_planeado}`);
}
{
  const o = await tenta("abrir a obra do modelo 1", () =>
    chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_criar(p_org => '${ORG}', p_contrato_id => '${C.m1}', p_data_inicio => '2026-11-02');`));
  const t = o ? await tarefas(o.id) : [];
  verifica(t.length === 12 && Number(passo(t, S.m1[0], "3.3")?.medida_qt) === 2.8,
    "modelo 1: 12 tarefas e o azulejo da zona do duche (1 + 1,8 m²)",
    `modelo 1: ${t.length} tarefas, azulejo ${passo(t, S.m1[0], "3.3")?.medida_qt}`);
}

/* ── 5. A ida e volta do passo "Serviços do contrato" ───────────────────── */
console.log("\n─── passo 2 (p_tarefas) ─────────────────");
{
  const prev = await tenta("pré-visualizar o contrato", async () => {
    // Um orçamento, uma obra viva: a primeira sai do caminho.
    await db.exec(`UPDATE public.ops_obra SET estado = 'cancelada' WHERE estado <> 'cancelada' AND contrato_id IN ('${C.wc}')`);
    return chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_previsao_contrato(p_org => '${ORG}', p_contrato_id => '${C.wc2}', p_data_inicio => '2026-11-02');`); });
  const lista = [...(prev?.servicos ?? []).flatMap((s) => s.tarefas)];
  const az = lista.find((t) => t.chave_passo === "3.2");
  verifica(az && Number(az.espera_antes_horas) === 48 && az.minutos_origem === "padrao",
    "a pré-visualização traz a espera e a origem do tempo", `pré-visualização: ${JSON.stringify(az ?? {}).slice(0, 160)}`);
  const pos = new Map(lista.map((t, i) => [t.id, i + 1]));
  const enviar = lista.map((t) => ({
    nome: t.nome, fase: t.fase, minutos: t.minutos, pessoas_previstas: t.pessoas_previstas, pessoas: [],
    skill_id: t.skill_id, orcamento_linha_id: t.linha_id, servico_id: t.servico_id, servico_tarefa_id: t.servico_tarefa_id,
    depende: t.depende.map((d) => pos.get(d)).filter(Boolean), chave_passo: t.chave_passo,
    espera_antes_horas: t.espera_antes_horas, medida: t.medida, medida_qt: t.medida_qt, minutos_origem: t.minutos_origem,
    ritmo_n: t.ritmo_n, fatores: t.fatores, fatores_chave: t.fatores_chave, minutos_juntos: t.minutos_juntos,
  }));
  const o = await tenta("abrir a obra com as tarefas do passo 2", () =>
    chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_criar(p_org => '${ORG}', p_contrato_id => '${C.wc2}',
       p_data_inicio => '2026-11-02', p_tarefas => '${JSON.stringify(enviar).replace(/'/g, "''")}'::jsonb);`));
  const t = o ? await tarefas(o.id) : [];
  const imp = t.find((x) => x.chave === "3.2");
  verifica(t.length === lista.length && Number(imp?.espera_antes_horas) === 48 &&
           t.find((x) => x.chave === "2.1")?.minutos_juntos === 180 &&
           t.find((x) => x.chave === "3.3")?.fatores_chave === "altura_revestimento=teto|janela=nao|local_cortes=fora",
    "nada se perde na ida e volta (espera, extras juntos, fatores)",
    `ida e volta: ${t.length}/${lista.length} tarefas; espera ${imp?.espera_antes_horas}`);
}

/* ── 6. Aprender ────────────────────────────────────────────────────────── */
console.log("\n─── aprender ────────────────────────────");
if (obraWc) {
  const az = passo(tw, S.wc[0], "3.3");
  // Duas pessoas, 1000 min cada = 2000 min reais para 25 m² (não 27,5).
  await db.exec(`
    UPDATE public.ops_obra_tarefa SET estado = 'em_curso', iniciada_em = now() - interval '2 days' WHERE id = '${az.id}';
    INSERT INTO public.ops_obra_registo (organization_id, obra_id, tarefa_id, utilizador_id, inicio, fim) VALUES
      ('${ORG}','${obraWc.id}','${az.id}','${U.tec}', now() - interval '1000 minutes', now()),
      ('${ORG}','${obraWc.id}','${az.id}','${U.tec2}', now() - interval '1000 minutes', now());`);
  const fim = await tenta("terminar o azulejo com a medida real", () =>
    chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_terminar_tarefa('${az.id}', true, 'trabalho_imprevisto', NULL, 25);`));
  const real = await um(`SELECT medida_real FROM public.ops_obra_tarefa WHERE id = '${az.id}'`);
  verifica(fim?.estado === "feita" && Number(real.medida_real) === 25, "a medida real fica gravada (25 m²)",
    `terminar: ${JSON.stringify(fim)}, medida real ${real.medida_real}`);
  await tenta("o supervisor valida", () =>
    chamar(AUTH.sup, `SELECT public.rpc_ops_obra_validar_tarefa('${az.id}', true);`));
  const rit = await q(`SELECT fatores_chave, n, minutos_fixos, minutos_por_unidade FROM public.ops_obra_ritmo
                        WHERE servico_tarefa_id = '${az.servico_tarefa_id}' ORDER BY fatores_chave`);
  // Observado: (2000 − 120) ÷ 25 = 75,2 min/m². Geral: (3 × 60 + 75,2) ÷ 4 = 63,8.
  // Por fatores, puxado para o geral: (3 × 63,8 + 75,2) ÷ 4 = 66,65.
  const g = rit.find((r) => r.fatores_chave === "");
  const e = rit.find((r) => r.fatores_chave !== "");
  verifica(g && Number(g.minutos_por_unidade) === 63.8 && g.n === 1,
    "o ritmo geral do azulejo mexe pouco com 1 obra (60 → 63,8 min/m²)", `ritmo geral: ${JSON.stringify(g)}`);
  verifica(e && Number(e.minutos_por_unidade) === 66.65, "o ritmo para estes fatores fica 66,65 min/m²",
    `ritmo por fatores: ${JSON.stringify(e)}`);
  const hist = await um(`SELECT count(*)::int AS n FROM public.ops_obra_ritmo_historico WHERE servico_tarefa_id = '${az.servico_tarefa_id}'`);
  verifica(hist.n === 2, "cada mudança do ritmo fica no histórico", `histórico: ${hist.n}`);

  const o3 = await tenta("abrir outra obra do mesmo orçamento", async () => {
    await db.exec(`UPDATE public.ops_obra SET estado = 'cancelada' WHERE estado <> 'cancelada' AND contrato_id IN ('${C.wc}', '${C.wc2}')`);
    return chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_criar(p_org => '${ORG}', p_contrato_id => '${C.wc3}', p_data_inicio => '2026-11-16');`); });
  const t3 = o3 ? await tarefas(o3.id) : [];
  const az3 = passo(t3, S.wc[0], "3.3");
  verifica(az3?.minutos_origem === "aprendido" && az3?.ritmo_n === 1 &&
           az3?.minutos_previstos === Math.round(120 + 66.65 * 27.5),
    `a obra seguinte usa o ritmo aprendido: ${az3?.minutos_previstos} min (era ${az.minutos_previstos})`,
    `obra seguinte: ${az3?.minutos_previstos} min, origem ${az3?.minutos_origem}`);
}

/* ── 7. Gravar um modelo no ecrã não perde o encaixe ────────────────────── */
console.log("\n─── modelos ─────────────────────────────");
{
  const lista = await chamar(AUTH.gestor, `SELECT public.rpc_ops_servicos_com_modelo('${ORG}');`);
  const sup = (typeof lista === "string" ? JSON.parse(lista) : lista).find((s) => s.servico_id === S.sup[0]);
  verifica(sup?.padrao && sup?.tarefas?.[0]?.encaixe, "a lista dos modelos mostra os tempos padrão e o encaixe",
    `lista: ${JSON.stringify(sup ?? {}).slice(0, 160)}`);
  const enviar = sup.tarefas.map(({ nome, fase, minutos_por_unidade, minutos_fixos, pessoas, skill_id, chave }) =>
    ({ nome, fase, minutos_por_unidade: minutos_por_unidade + 10, minutos_fixos, pessoas, skill_id, chave }));
  await tenta("gravar o modelo da supressão no ecrã", () =>
    chamar(AUTH.gestor, `SELECT public.rpc_ops_servico_modelo_gravar('${ORG}', '${S.sup[0]}', '${JSON.stringify(enviar)}'::jsonb);`));
  const d = await um(`SELECT encaixe, origem, minutos_por_unidade FROM public.ops_obra_servico_tarefa WHERE servico_id = '${S.sup[0]}' ORDER BY ordem LIMIT 1`);
  verifica(d.encaixe?.casa_banho?.alvo === "2.1" && d.origem === "manual" && Number(d.minutos_por_unidade) === 100,
    "gravar no ecrã muda o tempo e guarda o encaixe (pela chave)", `depois de gravar: ${JSON.stringify(d)}`);
  const de3 = await chamar(AUTH.gestor, `SELECT public.rpc_ops_obra_semear_tempos_padrao('${ORG}');`);
  verifica((de3.saltados ?? []).includes(S.sup[1]), "carregar outra vez não pisa um modelo gravado à mão",
    `saltados: ${JSON.stringify(de3.saltados)}`);
}

console.log(falhas.length ? `\n✗ ${falhas.length} falha(s)` : "\n✓ planeamento automático: tempos padrão, encaixe, medidas, esperas, feriados e aprendizagem");
process.exit(falhas.length ? 1 : 0);
