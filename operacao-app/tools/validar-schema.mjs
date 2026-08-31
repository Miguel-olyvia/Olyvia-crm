// Valida o esquema de Operações contra um Postgres real
// (PGlite — Postgres compilado para WASM), com stubs mínimos do núcleo do CRM.
//
// Para que serve
// --------------
// A promessa desta migration é ser ADITIVA: não pode tocar em nada que já
// exista. A verificação central deste script é `FK para fora do módulo = 0` —
// se alguém acrescentar um REFERENCES a uma tabela do CRM, isto apanha-o.
//
// Não substitui o `supabase db push --dry-run` contra a base real. Corre em
// segundos, sem Docker e sem acesso ao Supabase, e apanha erros de sintaxe, de
// ordem de dependências e de contagem antes de lá chegar.
//
// Como correr
// -----------
//   npm i -D @electric-sql/pglite      (não é dependência do CRM)
//   npm run validar-schema
//
// Saída esperada: "✓ migration válida e contida ao módulo"

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CAMINHO_SCHEMA = join(RAIZ, "db", "schema.sql");

// Stubs do que a migration espera encontrar já feito. Assinaturas copiadas do
// esquema real do CRM (baseline + system_admin_least_privilege).
const NUCLEO = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT current_setting('request.jwt.claim.sub', true)::uuid $$;

CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public.anew_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);

-- Colunas copiadas do esquema real (src/integrations/supabase/types.ts).
CREATE TABLE public.anew_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid,
  name text NOT NULL DEFAULT 'Utilizador',
  email text NOT NULL DEFAULT 'u@example.com',
  phone text,
  avatar_url text,
  status text NOT NULL DEFAULT 'active',
  deleted_at timestamptz);

-- anew_clients NÃO tem coluna de nome: vive em anew_entities.display_name.
CREATE TABLE public.anew_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  type text NOT NULL DEFAULT 'company',
  status text NOT NULL DEFAULT 'active');

CREATE TABLE public.anew_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  status text,
  deleted_at timestamptz);

CREATE TABLE public.anew_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, organization_id uuid, role_id uuid,
  status text NOT NULL DEFAULT 'active');

CREATE TABLE public.anew_role_permissions (
  role_id uuid, permission_code text);

CREATE TABLE public.anew_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text NOT NULL,
  scope text,
  supports_scope boolean NOT NULL DEFAULT false,
  is_dangerous boolean DEFAULT false,
  parent_code text,
  display_order integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now());

CREATE TABLE public.suppliers (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.client_portal_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.products (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

CREATE FUNCTION public.get_user_visible_org_ids(_auth_uid uuid)
  RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT id FROM public.anew_organizations $$;

CREATE FUNCTION public.has_anew_permission(_auth_uid uuid, _permission_code text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT false $$;

CREATE FUNCTION public.is_system_admin_user(_user_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT false $$;

CREATE FUNCTION public.current_business_user_id()
  RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT id FROM public.anew_users LIMIT 1 $$;
`;

const db = new PGlite();
await db.waitReady;

console.log("→ a criar stubs do núcleo do CRM…");
await db.exec(NUCLEO);
console.log("  stubs ok");

const migration = readFileSync(CAMINHO_SCHEMA, "utf8");

console.log("→ a aplicar o esquema…");
try {
  await db.exec(migration);
  console.log("  esquema aplicado sem erro");
} catch (e) {
  console.error("\n✗ FALHOU:", e.message);
  if (e.cause) console.error("  causa:", e.cause);
  process.exit(1);
}

// ── Verificações independentes das do próprio ficheiro ──────────────────
const q = async (sql) => (await db.query(sql)).rows;

const [{ n: tabelas }] = await q(
  `SELECT count(*)::int AS n FROM pg_tables
    WHERE schemaname='public' AND tablename LIKE 'ops\\_%'`);

const [{ n: semRls }] = await q(
  `SELECT count(*)::int AS n FROM pg_tables
    WHERE schemaname='public' AND tablename LIKE 'ops\\_%' AND NOT rowsecurity`);

const [{ n: policies }] = await q(
  `SELECT count(*)::int AS n FROM pg_policies
    WHERE schemaname='public' AND tablename LIKE 'ops\\_%'`);

const [{ n: permissoes }] = await q(
  `SELECT count(*)::int AS n FROM public.anew_permissions WHERE category='operations'`);

const [{ n: indices }] = await q(
  `SELECT count(*)::int AS n FROM pg_indexes
    WHERE schemaname='public' AND indexname LIKE 'ops\\_%'`);

const [{ n: funcoes }] = await q(
  `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
    WHERE ns.nspname='public' AND p.proname LIKE 'ops\\_%'`);

// O ponto central: a migration não pode ter tocado em nada de fora.
const fkParaFora = await q(
  `SELECT c.conname, t.relname AS origem, f.relname AS destino
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_class f ON f.oid = c.confrelid
    WHERE c.contype = 'f'
      AND t.relname LIKE 'ops\\_%'
      AND f.relname NOT LIKE 'ops\\_%'`);

const tabelasSemPolicy = await q(
  `SELECT t.tablename FROM pg_tables t
    WHERE t.schemaname='public' AND t.tablename LIKE 'ops\\_%'
      AND NOT EXISTS (SELECT 1 FROM pg_policies p
                       WHERE p.schemaname='public' AND p.tablename = t.tablename)`);

console.log("\n─── resultado ───────────────────────────");
console.log(`  tabelas ops_*          ${tabelas}`);
console.log(`  sem RLS ligada         ${semRls}`);
console.log(`  policies               ${policies}`);
console.log(`  índices ops_*          ${indices}`);
console.log(`  funções ops_*          ${funcoes}`);
console.log(`  escritas fora de ops_*  ${permissoes}`);
console.log(`  FK para fora do módulo ${fkParaFora.length}`);
if (fkParaFora.length) console.log("   ", fkParaFora);
console.log(`  tabelas sem policy     ${tabelasSemPolicy.length}`,
  tabelasSemPolicy.length ? tabelasSemPolicy.map(r => r.tablename).join(", ") : "");

const falhas = [];
if (semRls !== 0) falhas.push(`${semRls} tabelas sem RLS`);
if (fkParaFora.length !== 0) falhas.push(`${fkParaFora.length} FK para fora do módulo`);
if (permissoes !== 0)
  falhas.push(`o esquema escreveu ${permissoes} permissões — devia escrever 0 fora de ops_*`);

// ── Comportamento ───────────────────────────────────────────────────────
// As mesmas afirmações que o teste pgTAP faz, mas verificáveis sem Docker.
// Correm como dono das tabelas, por isso a RLS não se aplica aqui — o que
// está a ser testado são as constraints e as dependências, não as policies.

console.log("\n─── comportamento ───────────────────────");

const deveCorrer = async (nome, sql) => {
  try {
    await db.exec(sql);
    console.log(`  ✓ ${nome}`);
  } catch (e) {
    console.log(`  ✗ ${nome} — ${e.message}`);
    falhas.push(nome);
  }
};

const deveFalhar = async (nome, sql) => {
  try {
    await db.exec(sql);
    console.log(`  ✗ ${nome} — devia ter sido recusado e passou`);
    falhas.push(nome);
  } catch {
    console.log(`  ✓ ${nome}`);
  }
};

const ORG = "11111111-1111-1111-1111-111111111111";
const CLI = "22222222-2222-2222-2222-222222222222";
const LOC = "33333333-3333-3333-3333-333333333333";
const ORD = "44444444-4444-4444-4444-444444444444";

await db.exec(`
  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}', 'Org');
  INSERT INTO public.anew_entities (id, display_name)
    VALUES ('77777777-7777-7777-7777-777777777777', 'Cliente de teste');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('${CLI}', '${ORG}', '77777777-7777-7777-7777-777777777777');
  INSERT INTO public.ops_local (id, organization_id, cliente_id, codigo, nome, tipo)
    VALUES ('${LOC}', '${ORG}', '${CLI}', 'T-001', 'Local', 'morada');
  INSERT INTO public.ops_ordem
    (id, organization_id, codigo, origem, estado, cliente_id, local_id, titulo)
    VALUES ('${ORD}', '${ORG}', 'OT-2026-99999', 'corretiva', 'agendada',
            '${CLI}', '${LOC}', 'Ordem');
`);

// O teste central da promessa aditiva.
await deveCorrer(
  "apagar um cliente do CRM com dados de Operações a apontar-lhe",
  `DELETE FROM public.anew_clients WHERE id = '${CLI}'`);

const [{ n: sobreviveu }] = await q(
  `SELECT count(*)::int AS n FROM public.ops_ordem WHERE id = '${ORD}'`);
if (sobreviveu === 1) console.log("  ✓ a ordem sobrevive ao apagamento do cliente");
else { console.log("  ✗ a ordem desapareceu com o cliente"); falhas.push("ordem órfã"); }

// Glossário congelado.
await deveFalhar("origem 'avaria' é recusada",
  `INSERT INTO public.ops_ordem (organization_id, codigo, origem, estado, cliente_id, titulo)
   VALUES ('${ORG}', 'OT-1', 'avaria', 'agendada', '${CLI}', 'x')`);

await deveFalhar("estado 'atrasada' é recusado (é badge, não estado)",
  `INSERT INTO public.ops_ordem (organization_id, codigo, origem, estado, cliente_id, titulo)
   VALUES ('${ORG}', 'OT-2', 'corretiva', 'atrasada', '${CLI}', 'x')`);

await deveFalhar("função 'supervisor' é recusada",
  `INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao)
   VALUES ('${ORG}', gen_random_uuid(), 'supervisor')`);

// ops_ordem_alvo aceita os três casos (docs/11 §6).
await deveCorrer("um alvo pode ser só um sítio, sem ativo",
  `INSERT INTO public.ops_ordem_alvo (ordem_id, local_id) VALUES ('${ORD}', '${LOC}')`);

await deveCorrer("um alvo pode ser só uma checklist, sem sítio nem ativo",
  `INSERT INTO public.ops_checklist (id, organization_id, codigo, nome)
     VALUES ('55555555-5555-5555-5555-555555555555', '${ORG}', 'CL-0001', 'Checklist');
   INSERT INTO public.ops_ordem_alvo (ordem_id, checklist_id)
     VALUES ('${ORD}', '55555555-5555-5555-5555-555555555555')`);

await deveFalhar("um alvo vazio é recusado",
  `INSERT INTO public.ops_ordem_alvo (ordem_id) VALUES ('${ORD}')`);

// Auto-referência de local: 2 níveis (obra) e n níveis (FM), mesmo modelo.
await deveCorrer("a árvore de locais aceita 4 níveis",
  `INSERT INTO public.ops_local (id, organization_id, cliente_id, parent_id, codigo, nome, tipo)
     VALUES ('66666666-6666-6666-6666-666666666666', '${ORG}', '${CLI}', '${LOC}',
             'T-002', 'Piso -2', 'piso');
   INSERT INTO public.ops_local (organization_id, cliente_id, parent_id, codigo, nome, tipo)
     VALUES ('${ORG}', '${CLI}', '66666666-6666-6666-6666-666666666666',
             'T-003', 'Garagem', 'espaco')`);

if (falhas.length) {
  console.error("\n✗", falhas.join(" · "));
  process.exit(1);
}
console.log("\n✓ esquema válido, contido ao módulo, e com o comportamento esperado");
