/**
 * Prova que `db/restringir-permissoes.sql` estreita o que tem de estreitar,
 * SÓ na organização indicada, e não corta o acesso a quem o corre.
 *
 * Reproduz o cenário real: dezenas de papéis chamados "Admin", um por
 * organização, todos com `operations.*` por causa do alargamento acidental do
 * `pos-instalacao.sql`. O utilizador pertence só a dois. Numa das suas
 * organizações há ainda um papel "Técnicos" que ficou com tudo.
 *
 * A primeira versão do ficheiro apagava em TODAS as organizações. Aqui
 * prova-se que já não: as outras nove ficam exatamente como estavam.
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
const OUTRA_PESSOA = "19923f59-08f6-40d8-a37b-051b7dcadf31";

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
    SELECT gen_random_uuid(), 'Empresa ' || lpad(g::text, 2, '0') FROM generate_series(1, 10) g;
  INSERT INTO public.anew_roles (id, organization_id, name, is_system)
    SELECT gen_random_uuid(), o.id, 'Admin', false FROM public.anew_organizations o;

  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${EU}', '${EU_AUTH}', 'Ruben', '1999rubencmail@gmail.com'),
    ('${OUTRA_PESSOA}', NULL, 'Técnica', 'tecnica@x.pt');
  INSERT INTO auth.users (id, email, email_confirmed_at)
    VALUES ('${EU_AUTH}', '1999rubencmail@gmail.com', now());

  -- Mas o utilizador só pertence às duas primeiras.
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status)
    SELECT '${EU}', r.organization_id, r.id, 'active'
      FROM public.anew_roles r JOIN public.anew_organizations o ON o.id = r.organization_id
     WHERE o.name IN ('Empresa 01', 'Empresa 02');

  -- Na Empresa 01 há um papel "Técnicos" que não é dele.
  INSERT INTO public.anew_roles (id, organization_id, name, is_system)
    SELECT gen_random_uuid(), o.id, 'Técnicos', false
      FROM public.anew_organizations o WHERE o.name = 'Empresa 01';
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status)
    SELECT '${OUTRA_PESSOA}', r.organization_id, r.id, 'active'
      FROM public.anew_roles r WHERE r.name = 'Técnicos';
`);

await db.exec(ler("schema.sql"));
await db.exec(ler("permissoes.sql"));

// O alargamento acidental: todos os papéis apanharam as permissões.
await db.exec(`
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
  SELECT r.id, p.code FROM public.anew_roles r
    CROSS JOIN public.anew_permissions p
   WHERE p.category = 'operations';
`);

const ORG1 = (await um(`SELECT id FROM public.anew_organizations WHERE name = 'Empresa 01'`)).id;
const ORG5 = (await um(`SELECT id FROM public.anew_organizations WHERE name = 'Empresa 05'`)).id;

/** O ficheiro tal e qual, com UMA substituição: a organização escolhida. */
const comOrg = (id) =>
  ler("restringir-permissoes.sql").replace("NULL::uuid", `'${id}'::uuid`);

async function recusado(nome, sql, trecho) {
  try {
    await db.exec(sql);
    mau(`${nome} — PASSOU, e devia ter sido recusado`);
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    e.message.includes(trecho) ? ok(nome) : mau(`${nome} — mensagem errada: ${e.message}`);
  }
}

const papeisComOps = async () =>
  (await um(`SELECT count(DISTINCT role_id)::int n FROM public.anew_role_permissions
              WHERE permission_code LIKE 'operations.%'`)).n;

console.log("\n─── antes de restringir ─────────────────");
{
  const a = await papeisComOps();
  a === 11 ? ok(`${a} papéis com operations.* — o alargamento acidental, reproduzido`)
           : mau(`esperava 11 papéis, há ${a}`);
}

console.log("\n─── as guardas ──────────────────────────");
await recusado("tal e qual, sem organização, recusa-se a correr",
  ler("restringir-permissoes.sql"), "Preenche organization_id");
await recusado("numa organização onde a pessoa não está, recusa-se",
  comOrg(ORG5), "não tem membership ativa nesta organização");
{
  const a = await papeisComOps();
  a === 11 ? ok("as recusas não apagaram nada") : mau(`as recusas mexeram: ${a} papéis`);
}

await db.exec(comOrg(ORG1));

console.log("\n─── depois de restringir a Empresa 01 ───");
{
  const d = await papeisComOps();
  d === 10 ? ok("só o papel 'Técnicos' da Empresa 01 perdeu as permissões")
           : mau(`esperava 10 papéis, ficaram ${d}`);

  const outras = await um(`
    SELECT count(*)::int n FROM public.anew_role_permissions rp
      JOIN public.anew_roles r ON r.id = rp.role_id
     WHERE r.organization_id <> '${ORG1}' AND rp.permission_code LIKE 'operations.%'`);
  outras.n === 9 * 15
    ? ok("as outras 9 organizações ficaram intactas (9 × 15 ligações)")
    : mau(`as outras organizações foram tocadas: ${outras.n} ligações`);

  const v = await um(`SELECT public.has_anew_permission('${EU_AUTH}','operations.view') AS pode`);
  v.pode ? ok("o utilizador mantém o acesso — a restrição não se virou contra ele")
         : mau("a restrição cortou o acesso de quem a correu");
}

// Correr outra vez não pode piorar nada.
await db.exec(comOrg(ORG1));
{
  const d = await papeisComOps();
  d === 10 ? ok("correr duas vezes é inofensivo") : mau(`a segunda passagem mudou para ${d}`);
}

console.log("");
if (falhas.length) {
  console.error(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ a restrição estreita o que devia, só onde devia, e não corta quem a corre");
