/**
 * Prova a ORDEM de instalação de todo o SQL das melhorias de 06/10/2026 num
 * só Postgres limpo (PGlite): a base existente, depois os ficheiros novos pela
 * ordem da entrega (D:/Olyvia/entrega-melhorias-operacoes), DUAS vezes
 * seguidas — tem de correr sem erro das duas vezes.
 *
 *     node tools/validar-tudo-junto.mjs
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

const falhas = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mau = (m) => {
  console.log(`  ✗ ${m}`);
  falhas.push(m);
};

const ORG = "11111111-1111-1111-1111-111111111111";
const U = {
  admin: "a0000000-0000-0000-0000-000000000001",
  gestor: "a0000000-0000-0000-0000-00000000000a",
  sup: "a0000000-0000-0000-0000-00000000000b",
  tec: "a0000000-0000-0000-0000-00000000000c",
  tec2: "a0000000-0000-0000-0000-00000000000d",
  sup2: "a0000000-0000-0000-0000-00000000000e", // supervisor de OUTRA obra
};
const AUTH = Object.fromEntries(Object.entries(U).map(([k, v]) => [k, v.replace(/^a/, "e")]));

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
  CREATE OR REPLACE FUNCTION public.get_user_visible_org_ids(_auth_uid uuid)
    RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT am.organization_id FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE au.auth_user_id = _auth_uid AND am.status = 'active' $fn$;
  CREATE OR REPLACE FUNCTION public.is_system_admin_user(_user_id uuid)
    RETURNS boolean LANGUAGE sql STABLE AS $fn$ SELECT false $fn$;

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}','Org');
  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ${Object.entries(U).map(([k, v]) => `('${v}','${AUTH[k]}','${k}','${k}@x.pt')`).join(",\n    ")};
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ${Object.keys(U).map((k) => `('${AUTH[k]}','${U[k]}')`).join(",")};
`);


// A base que já está em produção.
const BASE = [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
  "seguranca.sql", "tempos.sql", "entrar-como.sql",
];
// A entrega, pela ordem em que se cola.
export const ORDEM = [
  "obras.sql",
  "obras-fotos.sql",
  "pessoas-crm.sql",
  "equipa.sql",
  "acompanhamento-cliente.sql",
  "margem-previsao.sql",
  "capacidade.sql",
  "dados-encomendas.sql",
  "chegadas.sql",
  "obras-fecho.sql",
  "offline.sql",
];

for (const f of BASE) {
  try {
    await db.exec(ler(f));
  } catch (e) {
    console.error(`✗ base ${f}: ${e.message}`);
    process.exit(1);
  }
}

for (const volta of [1, 2]) {
  console.log(`\n─── ${volta}.ª volta ───────────────────────`);
  for (const f of ORDEM) {
    try {
      await db.exec(ler(f));
      ok(f);
    } catch (e) {
      mau(`${volta}.ª volta, ${f}: ${e.message}`);
      break;
    }
  }
}

// Depois de tudo: as peças de hoje continuam lá (nenhum ficheiro posterior as desfez).
const fn = async (nome, frag) => {
  const r = await db.query(`SELECT pg_get_functiondef(p.oid) AS d FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1`, [nome]);
  return r.rows.some((x) => x.d.includes(frag));
};
for (const [nome, frag, msg] of [
  ["ops_obra_notificar", "fora_da_equipa", "os avisos continuam a recusar clientes e inativos"],
  ["ops_obra_avisar_bancada", "v_para <@", "a bancada volta a avisar quem é novo"],
  ["ops_obras_que_vejo", "", "a visibilidade calculada uma vez (velocidade) existe"],
  ["rpc_ops_obras_lista", "", "a lista rápida das Obras existe"],
]) {
  (await fn(nome, frag)) ? ok(msg) : mau(msg);
}

if (falhas.length) {
  console.log(`\n✗ ${falhas.length} falha(s)`);
  process.exit(1);
}
console.log("\n✓ tudo junto: a ordem da entrega instala e reinstala sem erro");
