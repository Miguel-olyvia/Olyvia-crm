/**
 * Prova db/pessoas-crm.sql contra um Postgres limpo (PGlite), sem tocar no
 * Supabase.
 *
 *   · instala numa base SEM RH e SEM as tabelas da agenda/equipas do CRM, e
 *     corre duas vezes (idempotente);
 *   · devolve todas as pessoas com acesso ativo à organização — com ou sem
 *     perfil de Operações — com os dados do CRM;
 *   · com as tabelas da agenda e do RH presentes (stubs com as colunas reais),
 *     devolve equipa, distritos, códigos postais, cargo, vínculo, local e a
 *     próxima ausência — e nada de salários, NIF ou motivos de ausência;
 *   · isolamento: o gestor da B não lê a A;
 *   · custo/hora só a quem tem costs.view; dados contratuais só a quem gere;
 *   · zero escritas, zero tabelas novas, zero FKs para fora de ops_*.
 *
 *     npm run validar-pessoas-crm
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AUTENTICACAO_REAL, STUBS_CRM } from "./_stubs-crm.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (f) => readFileSync(join(RAIZ, "db", f), "utf8");

const db = new PGlite();
await db.waitReady;
const um = async (sql) => (await db.query(sql)).rows[0];

const falhas = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mau = (m) => {
  console.log(`  ✗ ${m}`);
  falhas.push(m);
};
const confirma = (cond, m, detalhe) => (cond ? ok(m) : mau(detalhe ? `${m} — ${detalhe}` : m));

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "11111111-2222-2222-2222-222222222222";
const U = {
  gestorA: "a0000000-0000-0000-0000-00000000000a",
  tecA: "a0000000-0000-0000-0000-00000000000c",
  semOpsA: "a0000000-0000-0000-0000-00000000000d", // no Olyvia, sem perfil em Operações
  gestorB: "a0000000-0000-0000-0000-00000000000e",
  tecB: "a0000000-0000-0000-0000-00000000000f",
};
const AUTH = Object.fromEntries(Object.entries(U).map(([k, v]) => [k, v.replace(/^a/, "e")]));

await db.exec(STUBS_CRM);
await db.exec(AUTENTICACAO_REAL);
await db.exec(`
  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG_A}','Org A'), ('${ORG_B}','Org B');
  INSERT INTO public.anew_users (id, auth_user_id, name, email, phone) VALUES
    ${Object.entries(U).map(([k, v]) => `('${v}','${AUTH[k]}','${k}','${k}@x.pt','91000000${k.length}')`).join(",\n    ")};
`);

for (const f of [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
  "seguranca.sql",
]) {
  try {
    await db.exec(ler(f));
  } catch (e) {
    console.error(`✗ ${f} falhou antes de chegar aqui: ${e.message}`);
    process.exit(1);
  }
}

const R = {
  tudoA: "d0000000-0000-0000-0000-00000000000a",
  tecA: "d0000000-0000-0000-0000-00000000000b",
  tudoB: "d0000000-0000-0000-0000-00000000000c",
  tecB: "d0000000-0000-0000-0000-00000000000d",
};
await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name) VALUES
    ('${R.tudoA}','${ORG_A}','Direção A'), ('${R.tecA}','${ORG_A}','Técnicos A'),
    ('${R.tudoB}','${ORG_B}','Direção B'), ('${R.tecB}','${ORG_B}','Técnicos B');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT r, code FROM public.anew_permissions,
      unnest(ARRAY['${R.tudoA}'::uuid, '${R.tudoB}'::uuid]) r
     WHERE category = 'operations';
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('${R.tecA}','operations.view'), ('${R.tecA}','operations.orders.view'),
    ('${R.tecB}','operations.view'), ('${R.tecB}','operations.orders.view');
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${U.gestorA}','${ORG_A}','${R.tudoA}','active'),
    ('${U.tecA}','${ORG_A}','${R.tecA}','active'),
    ('${U.semOpsA}','${ORG_A}','${R.tecA}','active'),
    ('${U.gestorB}','${ORG_B}','${R.tudoB}','active'),
    ('${U.tecB}','${ORG_B}','${R.tecB}','active');
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao, custo_hora, zona_base) VALUES
    ('${ORG_A}','${U.gestorA}','gestor', 30, NULL),
    ('${ORG_A}','${U.tecA}','tecnico', 18.5, 'Margem Sul'),
    ('${ORG_B}','${U.gestorB}','gestor', 31, NULL),
    ('${ORG_B}','${U.tecB}','tecnico', 17, NULL);
  INSERT INTO public.ops_skill (id, organization_id, nome) VALUES
    ('5c000000-0000-0000-0000-000000000001','${ORG_A}','Canalização'),
    ('5c000000-0000-0000-0000-000000000002','${ORG_B}','AVAC');
  INSERT INTO public.ops_utilizador_skill (utilizador_id, skill_id) VALUES
    ('${U.tecA}','5c000000-0000-0000-0000-000000000001');
  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
`);

/* ── Sessões ─────────────────────────────────────────────────────────────── */
function sessao(authUid, sql) {
  return `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${authUid}'; ${sql}; COMMIT;`;
}
async function linhas(authUid, sql) {
  try {
    const r = await db.exec(sessao(authUid, sql));
    return r.filter((x) => x.fields?.length).at(-1)?.rows ?? [];
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    mau(`chamada falhou: ${e.message.split("\n")[0]}`);
    return [];
  }
}
async function recusa(nome, authUid, sql, trecho) {
  try {
    await db.exec(sessao(authUid, sql));
    mau(`${nome} — PASSOU, e devia ter sido recusado`);
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    if (!trecho || e.message.includes(trecho)) ok(nome);
    else mau(`${nome} — recusado com a mensagem errada: ${e.message.split("\n")[0]}`);
  }
}
const EQUIPA = (org) => `SELECT *, ausencia_inicio::text AS ai, ausencia_fim::text AS af,
  data_admissao::text AS da FROM public.rpc_ops_equipa_crm('${org}')`;
const porId = (rows) => new Map(rows.map((r) => [r.utilizador_id, r]));

/* Tudo o que existe em public, com o número de linhas: para provar zero escritas. */
async function fotografia() {
  const ts = (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`)).rows;
  const out = {};
  for (const { tablename } of ts) {
    out[tablename] = (await um(`SELECT count(*)::int n FROM public."${tablename}"`)).n;
  }
  return JSON.stringify(out);
}

/* ═══════════ 1. Sem RH e sem agenda ═══════════ */
console.log("\n─── instalar sem RH nem agenda ──────────");
const tabelasAntes = (await um(`SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'`)).n;
try {
  await db.exec(ler("pessoas-crm.sql"));
  await db.exec(ler("pessoas-crm.sql"));
  ok("pessoas-crm.sql corre duas vezes");
} catch (e) {
  mau(`pessoas-crm.sql: ${e.message}`);
  process.exit(1);
}
confirma(
  (await um(`SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'`)).n === tabelasAntes,
  "não cria tabela nenhuma"
);
{
  const fk = await um(`
    SELECT count(*)::int n FROM pg_constraint c
      JOIN pg_class s ON s.oid = c.conrelid JOIN pg_class t ON t.oid = c.confrelid
     WHERE c.contype = 'f' AND s.relname LIKE 'ops\\_%' AND t.relname NOT LIKE 'ops\\_%'`);
  confirma(fk.n === 0, "FK de ops_* para fora do módulo: 0", `encontrei ${fk.n}`);
  const f = await um(`SELECT p.prosecdef, p.provolatile, p.proconfig::text AS cfg
                        FROM pg_proc p WHERE p.oid = to_regprocedure('public.rpc_ops_equipa_crm(uuid)')`);
  confirma(f?.prosecdef && /search_path=public/.test(f.cfg), "SECURITY DEFINER com search_path fixo");
  // Numa função STABLE o plpgsql recusa INSERT/UPDATE/DELETE: é a garantia de só leitura.
  confirma(f?.provolatile === "s", "STABLE — o Postgres recusa-lhe qualquer escrita");
  const anon = await um(`SELECT has_function_privilege('anon', 'public.rpc_ops_equipa_crm(uuid)', 'EXECUTE') AS v`);
  confirma(anon.v === false, "anon não a pode chamar");
}

console.log("\n─── o que devolve só com o núcleo do CRM ─");
{
  const rows = await linhas(AUTH.gestorA, EQUIPA(ORG_A));
  const m = porId(rows);
  confirma(rows.length === 3, "as 3 pessoas com acesso à A, e só essas", `vieram ${rows.length}`);
  const sem = m.get(U.semOpsA);
  confirma(sem && sem.em_operacoes === false && sem.funcao === null,
    "quem está no Olyvia sem perfil de Operações aparece, marcado como tal");
  const t = m.get(U.tecA);
  confirma(t?.email === "tecA@x.pt" && t?.telefone && t?.papel_crm === "Técnicos A",
    "nome, email, telefone e papel vêm do CRM", JSON.stringify(t));
  confirma(t?.funcao === "tecnico" && t?.zona_base === "Margem Sul" && t?.skills_nomes?.[0] === "Canalização",
    "função, zona-base e especialidades vêm de Operações");
  confirma(Number(t?.custo_hora) === 18.5 && t?.pode_ver_custos === true, "o gestor vê o custo/hora");
  confirma(t?.rh_disponivel === false && t?.rh_ligado === false && t?.cargo === null,
    "sem RH: os campos de RH vêm vazios, sem erro");
  confirma(t?.equipa_crm === null && t?.distritos === null && t?.ausencia_tipo === null,
    "sem agenda nem equipas: vêm vazios, sem erro");
}
{
  const rows = await linhas(AUTH.tecA, EQUIPA(ORG_A));
  confirma(rows.length === 3, "o técnico (operations.view) também lê a equipa");
  confirma(rows.every((r) => r.custo_hora === null && r.pode_ver_custos === false),
    "custo/hora escondido a quem não tem costs.view");
}

console.log("\n─── isolamento ──────────────────────────");
await recusa("o gestor da B não lê a equipa da A", AUTH.gestorB, EQUIPA(ORG_A), "Sem acesso");
await recusa("sem sessão, não", "", EQUIPA(ORG_A), "Sem acesso");
await recusa("quem está no Olyvia mas não em Operações, não", AUTH.semOpsA, EQUIPA(ORG_A), "Sem acesso");
{
  const rows = await linhas(AUTH.gestorB, EQUIPA(ORG_B));
  confirma(rows.length === 2 && rows.every((r) => [U.gestorB, U.tecB].includes(r.utilizador_id)),
    "o gestor da B lê só a B");
  const skA = rows.flatMap((r) => r.skills_nomes ?? []);
  confirma(!skA.includes("Canalização"), "nem as especialidades da A");
}

/* ═══════════ 2. Com agenda e equipas do CRM ═══════════ */
console.log("\n─── com a agenda e as equipas do CRM ────");
// Colunas copiadas do esquema real (baseline + 20261110620000).
await db.exec(`
  ALTER TABLE public.anew_users ADD COLUMN position text, ADD COLUMN location text;
  ALTER TABLE public.anew_roles ADD COLUMN code text;
  UPDATE public.anew_roles SET code = 'tecnico' WHERE id = '${R.tecA}';
  UPDATE public.anew_users SET position = 'Canalizador', location = 'Seixal' WHERE id = '${U.tecA}';

  CREATE TABLE public.organization_teams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
    name varchar NOT NULL, leader_id uuid, is_active boolean DEFAULT true);
  CREATE TABLE public.organization_team_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid NOT NULL, user_id uuid NOT NULL UNIQUE);
  CREATE TABLE public.schedule_resources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
    resource_type text DEFAULT 'user' NOT NULL, user_id uuid, is_active boolean DEFAULT true,
    organization_id uuid);
  CREATE TABLE public.administrative_divisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), country_code varchar(2) NOT NULL,
    admin_level integer NOT NULL, name text NOT NULL);
  CREATE TABLE public.resource_districts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resource_id uuid NOT NULL REFERENCES public.schedule_resources(id),
    district_id uuid NOT NULL REFERENCES public.administrative_divisions(id),
    priority integer NOT NULL DEFAULT 1, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.resource_service_areas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resource_id uuid NOT NULL,
    postal_code_prefix varchar(4) NOT NULL, is_active boolean DEFAULT true);
  CREATE TABLE public.resource_time_off (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resource_id uuid NOT NULL, title text NOT NULL,
    reason text, start_date date NOT NULL, end_date date NOT NULL, approved boolean DEFAULT false);

  INSERT INTO public.organization_teams (id, organization_id, name) VALUES
    ('7e000000-0000-0000-0000-000000000001','${ORG_A}','Equipa Sul'),
    ('7e000000-0000-0000-0000-000000000002','${ORG_B}','Equipa da B');
  INSERT INTO public.organization_team_members (team_id, user_id) VALUES
    ('7e000000-0000-0000-0000-000000000001','${U.tecA}');
  INSERT INTO public.schedule_resources (id, name, user_id, organization_id) VALUES
    ('5e000000-0000-0000-0000-000000000001','tecA','${U.tecA}','${ORG_A}'),
    ('5e000000-0000-0000-0000-000000000002','tecB','${U.tecB}','${ORG_B}');
  INSERT INTO public.administrative_divisions (id, country_code, admin_level, name) VALUES
    ('ad000000-0000-0000-0000-000000000001','PT',1,'Setúbal'),
    ('ad000000-0000-0000-0000-000000000002','PT',1,'Lisboa'),
    ('ad000000-0000-0000-0000-000000000003','PT',1,'Porto');
  INSERT INTO public.resource_districts (resource_id, district_id, priority) VALUES
    ('5e000000-0000-0000-0000-000000000001','ad000000-0000-0000-0000-000000000001',1),
    ('5e000000-0000-0000-0000-000000000001','ad000000-0000-0000-0000-000000000002',2),
    ('5e000000-0000-0000-0000-000000000002','ad000000-0000-0000-0000-000000000003',1);
  INSERT INTO public.resource_service_areas (resource_id, postal_code_prefix) VALUES
    ('5e000000-0000-0000-0000-000000000001','2840');
  INSERT INTO public.resource_time_off (resource_id, title, reason, start_date, end_date, approved) VALUES
    ('5e000000-0000-0000-0000-000000000001','Férias','Motivo privado CRM', current_date + 20, current_date + 25, true),
    ('5e000000-0000-0000-0000-000000000001','Não aprovada', NULL, current_date + 1, current_date + 2, false),
    ('5e000000-0000-0000-0000-000000000001','Já passou', NULL, current_date - 10, current_date - 5, true);
`);
try {
  await db.exec(ler("pessoas-crm.sql"));
  ok("reinstala por cima, com a agenda presente");
} catch (e) {
  mau(`reinstalar: ${e.message}`);
}
{
  const t = porId(await linhas(AUTH.gestorA, EQUIPA(ORG_A))).get(U.tecA);
  confirma(t?.equipa_crm === "Equipa Sul", "equipa do CRM", t?.equipa_crm);
  confirma(JSON.stringify(t?.distritos) === JSON.stringify(["Setúbal", "Lisboa"]),
    "distritos da agenda, pela prioridade", JSON.stringify(t?.distritos));
  confirma(JSON.stringify(t?.codigos_postais) === JSON.stringify(["2840"]), "códigos postais da agenda");
  confirma(t?.cargo_crm === "Canalizador" && t?.local_crm === "Seixal" && t?.papel_crm_codigo === "tecnico",
    "cargo, localidade e código do papel no CRM");
  confirma(t?.ausencia_tipo === "Férias" && t?.ausencia_origem === "crm",
    "a próxima ausência aprovada da agenda (a não aprovada e a passada ficam de fora)",
    `${t?.ausencia_tipo} ${t?.ai}`);
  confirma(!JSON.stringify(t).includes("Motivo privado"), "o motivo da ausência não sai");
  const b = porId(await linhas(AUTH.gestorB, EQUIPA(ORG_B))).get(U.tecB);
  confirma(JSON.stringify(b?.distritos) === JSON.stringify(["Porto"]), "a B vê os seus distritos");
}

/* ═══════════ 3. Com o RH ═══════════ */
console.log("\n─── com o RH ────────────────────────────");
// Colunas copiadas de origin/feature/rh-pessoas (as que esta RPC lê, mais as
// sensíveis, para provar que NÃO saem).
const PE = "9e000000-0000-0000-0000-000000000001";
await db.exec(`
  CREATE TABLE public.pessoas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
    numero_interno text, primeiro_nome text NOT NULL, apelido text NOT NULL,
    nif text, morada_pessoal text, email_pessoal text,
    cargo text, local_trabalho text, data_admissao date,
    estado_contrato text NOT NULL DEFAULT 'em_curso', estado_registo text NOT NULL DEFAULT 'activo',
    dias_trabalho text[], local_id uuid, cargo_id uuid, deleted_at timestamptz);
  CREATE TABLE public.pessoas_contas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pessoa_id uuid NOT NULL, organization_id uuid NOT NULL,
    anew_user_id uuid NOT NULL, estado text NOT NULL DEFAULT 'activa', ligada_em timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.pessoas_vinculos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pessoa_id uuid NOT NULL, organization_id uuid NOT NULL,
    tipo_contrato text NOT NULL, regime text NOT NULL DEFAULT 'tempo_inteiro', data_inicio date NOT NULL,
    estado text NOT NULL DEFAULT 'activo', categoria_funcao text, deleted_at timestamptz);
  CREATE TABLE public.hr_cargos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, nome text NOT NULL,
    salario_base numeric(12,2) NOT NULL, deleted_at timestamptz);
  CREATE TABLE public.hr_locais_trabalho (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, nome text NOT NULL,
    deleted_at timestamptz);
  CREATE TABLE public.pessoas_afectacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pessoa_id uuid NOT NULL, organization_id uuid NOT NULL,
    local_id uuid NOT NULL, valido_de date NOT NULL, valido_ate date, deleted_at timestamptz);
  CREATE TABLE public.hr_ausencias_tipos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, codigo text NOT NULL,
    nome text NOT NULL, categoria text NOT NULL);
  CREATE TABLE public.pessoas_ausencias_pedidos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, pessoa_id uuid NOT NULL,
    tipo_id uuid NOT NULL, data_inicio date NOT NULL, data_fim date NOT NULL, motivo text,
    estado text NOT NULL DEFAULT 'pendente_chefia');

  INSERT INTO public.hr_cargos (id, organization_id, nome, salario_base) VALUES
    ('ca000000-0000-0000-0000-000000000001','${ORG_A}','Técnico de Manutenção', 1234.56);
  INSERT INTO public.hr_locais_trabalho (id, organization_id, nome) VALUES
    ('10c00000-0000-0000-0000-000000000001','${ORG_A}','Sede'),
    ('10c00000-0000-0000-0000-000000000002','${ORG_A}','Obra Almada');
  INSERT INTO public.pessoas (id, organization_id, numero_interno, primeiro_nome, apelido, nif, morada_pessoal,
                              cargo, data_admissao, local_id, cargo_id) VALUES
    ('${PE}','${ORG_A}','F-007','Tec','A','123456789','Rua Secreta 1','cargo em texto','2024-03-01',
     '10c00000-0000-0000-0000-000000000001','ca000000-0000-0000-0000-000000000001');
  INSERT INTO public.pessoas_contas (pessoa_id, organization_id, anew_user_id) VALUES
    ('${PE}','${ORG_A}','${U.tecA}');
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, regime, data_inicio, estado, categoria_funcao) VALUES
    ('${PE}','${ORG_A}','sem_termo','tempo_inteiro','2024-03-01','activo','geral'),
    ('${PE}','${ORG_A}','termo_certo','tempo_parcial','2023-01-01','terminado','geral');
  INSERT INTO public.pessoas_afectacoes (pessoa_id, organization_id, local_id, valido_de) VALUES
    ('${PE}','${ORG_A}','10c00000-0000-0000-0000-000000000002', current_date - 3);
  INSERT INTO public.hr_ausencias_tipos (id, organization_id, codigo, nome, categoria) VALUES
    ('a7000000-0000-0000-0000-000000000001','${ORG_A}','DOE','Baixa médica','doenca'),
    ('a7000000-0000-0000-0000-000000000002','${ORG_A}','FOR','Formação','outro');
  INSERT INTO public.pessoas_ausencias_pedidos (organization_id, pessoa_id, tipo_id, data_inicio, data_fim, motivo, estado) VALUES
    ('${ORG_A}','${PE}','a7000000-0000-0000-0000-000000000001', current_date + 2, current_date + 4, 'Diagnóstico X', 'aprovado'),
    ('${ORG_A}','${PE}','a7000000-0000-0000-0000-000000000002', current_date, current_date, NULL, 'pendente_chefia');
`);
try {
  await db.exec(ler("pessoas-crm.sql"));
  ok("reinstala por cima, com o RH presente");
} catch (e) {
  mau(`reinstalar com RH: ${e.message}`);
}
const foto1 = await fotografia();
{
  const rows = await linhas(AUTH.gestorA, EQUIPA(ORG_A));
  const t = porId(rows).get(U.tecA);
  confirma(t?.rh_disponivel === true && t?.rh_ligado === true, "a ficha de RH está ligada à conta");
  confirma(t?.numero_interno === "F-007", "número interno do RH");
  confirma(t?.cargo === "Técnico de Manutenção", "cargo pelo catálogo de cargos", t?.cargo);
  confirma(t?.local_trabalho === "Obra Almada", "local pela afetação de hoje", t?.local_trabalho);
  confirma(t?.tipo_contrato === "sem_termo" && t?.regime === "tempo_inteiro" && t?.categoria_funcao === "geral",
    "o vínculo ativo, e não o terminado");
  confirma(t?.estado_contrato === "em_curso" && t?.da === "2024-03-01", "estado do contrato e data de admissão");
  confirma(t?.ausencia_tipo === "Ausência" && t?.ausencia_origem === "rh",
    "a ausência do RH mais próxima ganha à da agenda — e a de doença diz só 'Ausência'",
    `${t?.ausencia_tipo} ${t?.ausencia_origem}`);
  const tudo = JSON.stringify(rows);
  confirma(!/1234\.56|123456789|Rua Secreta|Diagnóstico|Baixa médica/.test(tudo),
    "nada de salário, NIF, morada pessoal, motivo ou tipo sensível de ausência");
  const g = porId(rows).get(U.gestorA);
  confirma(g?.rh_disponivel === true && g?.rh_ligado === false && g?.numero_interno === null,
    "quem não tem ficha de RH ligada aparece sem campos de RH");
}
{
  const t = porId(await linhas(AUTH.tecA, EQUIPA(ORG_A))).get(U.tecA);
  confirma(t?.cargo === "Técnico de Manutenção" && t?.tipo_contrato === null && t?.regime === null
    && t?.estado_contrato === null && t?.da === null,
    "ao técnico: cargo sim, dados contratuais não");
}
{
  // Com a pessoa sem cargo_id e sem afetação: cai para os campos de texto.
  await db.exec(`UPDATE public.pessoas SET cargo_id = NULL WHERE id = '${PE}';
                 UPDATE public.pessoas_afectacoes SET valido_ate = current_date - 1;`);
  const t = porId(await linhas(AUTH.gestorA, EQUIPA(ORG_A))).get(U.tecA);
  confirma(t?.cargo === "cargo em texto" && t?.local_trabalho === "Sede",
    "sem cargo do catálogo nem afetação: cargo em texto e local por defeito", `${t?.cargo} / ${t?.local_trabalho}`);
}
await recusa("com RH, o gestor da B continua sem ler a A", AUTH.gestorB, EQUIPA(ORG_A), "Sem acesso");
{
  const rowsB = await linhas(AUTH.gestorB, EQUIPA(ORG_B));
  confirma(rowsB.every((r) => r.rh_ligado === false), "a ficha da A não aparece na B");
}

console.log("\n─── zero escritas ───────────────────────");
{
  // As chamadas acima não mudaram uma linha em lado nenhum.
  // (o UPDATE de teste acima não muda contagens.)
  await linhas(AUTH.gestorA, EQUIPA(ORG_A));
  await linhas(AUTH.tecA, EQUIPA(ORG_A));
  confirma((await fotografia()) === foto1, "depois das chamadas, nenhuma tabela mudou de tamanho");
}

console.log(falhas.length ? `\n✗ ${falhas.length} falha(s)` : "\n✓ pessoas do CRM/RH: regras provadas");
process.exit(falhas.length ? 1 : 0);
