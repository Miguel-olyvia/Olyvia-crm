/**
 * Prova que `db/restringir-permissoes.sql` estreita o que tem de estreitar, e
 * não corta o acesso a quem o corre.
 *
 * Reproduz o cenário real: dezenas de papéis chamados "Admin", um por
 * organização, todos com `operations.*` por causa do alargamento acidental do
 * `pos-instalacao.sql`. O utilizador pertence só a dois.
 *
 *     npm run validar-restricao
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
const um = async (sql) => (await db.query(sql)).rows[0];

const falhas = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mau = (m) => { console.log(`  ✗ ${m}`); falhas.push(m); };

const EU = "09923f59-08f6-40d8-a37b-051b7dcadf30";
const EU_AUTH = "cb3792b7-1da6-42ff-b23c-86b96c040989";

await db.exec(STUBS_CRM);
await db.exec(`
  ALTER TABLE public.anew_roles ADD COLUMN code text;

  CREATE OR REPLACE FUNCTION public.has_anew_permission(_auth_uid uuid, _permission_code text)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT EXISTS (
      SELECT 1 FROM public.anew_users au
        JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
        JOIN public.anew_role_permissions arp
          ON arp.role_id = am.role_id AND arp.permission_code = _permission_code
       WHERE au.auth_user_id = _auth_uid) $fn$;

  -- 10 organizações, cada uma com o seu papel "Admin". É o cenário real.
  INSERT INTO public.anew_organizations (id, name)
    SELECT gen_random_uuid(), 'Empresa ' || g FROM generate_series(1, 10) g;
  INSERT INTO public.anew_roles (id, organization_id, name, is_system)
    SELECT gen_random_uuid(), o.id, 'Admin', false FROM public.anew_organizations o;

  INSERT INTO public.anew_users (id, auth_user_id, name, email)
    VALUES ('${EU}', '${EU_AUTH}', 'Ruben', '1999rubencmail@gmail.com');
  INSERT INTO auth.users (id, email, email_confirmed_at)
    VALUES ('${EU_AUTH}', '1999rubencmail@gmail.com', now());

  -- Mas o utilizador só pertence a duas.
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status)
    SELECT '${EU}', r.organization_id, r.id, 'active'
      FROM public.anew_roles r ORDER BY r.id LIMIT 2;
`);

await db.exec(ler("schema.sql"));
await db.exec(ler("permissoes.sql"));

// O alargamento acidental: todos os papéis "Admin" apanharam as permissões.
await db.exec(`
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT r.id, p.code FROM public.anew_roles r
    CROSS JOIN public.anew_permissions p
   WHERE r.name = 'Admin' AND p.category = 'operations';
`);

console.log("\n─── antes de restringir ─────────────────");
{
  const a = await um(`SELECT count(DISTINCT role_id)::int n FROM public.anew_role_permissions
                       WHERE permission_code LIKE 'operations.%'`);
  a.n === 10 ? ok(`${a.n} papéis com operations.* — o alargamento acidental, reproduzido`)
             : mau(`esperava 10 papéis, há ${a.n}`);
}

await db.exec(ler("restringir-permissoes.sql"));

console.log("\n─── depois ──────────────────────────────");
{
  const d = await um(`SELECT count(DISTINCT role_id)::int n FROM public.anew_role_permissions
                       WHERE permission_code LIKE 'operations.%'`);
  d.n === 2 ? ok("ficaram só os 2 papéis que o utilizador tem")
            : mau(`esperava 2 papéis, ficaram ${d.n}`);

  const v = await um(`SELECT public.has_anew_permission('${EU_AUTH}','operations.view') AS pode`);
  v.pode ? ok("o utilizador mantém o acesso — a restrição não se virou contra ele")
         : mau("a restrição cortou o acesso de quem a correu");

  const l = await um(`SELECT count(*)::int n FROM public.anew_role_permissions
                       WHERE permission_code LIKE 'operations.%'`);
  l.n === 30 ? ok("15 permissões × 2 papéis = 30 ligações")
             : mau(`esperava 30 ligações, há ${l.n}`);

  const outras = await um(`SELECT count(*)::int n FROM public.anew_role_permissions
                            WHERE permission_code NOT LIKE 'operations.%'`);
  outras.n === 0 ? ok("nenhuma permissão do CRM foi tocada (não havia nenhuma para tocar)")
                 : ok(`${outras.n} permissões do CRM intactas`);
}

// Correr outra vez não pode piorar nada.
await db.exec(ler("restringir-permissoes.sql"));
{
  const d = await um(`SELECT count(DISTINCT role_id)::int n FROM public.anew_role_permissions
                       WHERE permission_code LIKE 'operations.%'`);
  d.n === 2 ? ok("correr duas vezes é inofensivo") : mau(`a segunda passagem mudou para ${d.n}`);
}

console.log("");
if (falhas.length) {
  console.error(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ a restrição estreita o que devia, e não corta quem a corre");
