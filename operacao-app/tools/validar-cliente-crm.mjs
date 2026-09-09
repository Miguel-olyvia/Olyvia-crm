/**
 * Prova que a morada do cliente não se escreve duas vezes.
 *
 * O que interessa aqui:
 *   · a morada que o CRM já tem vira local com um toque;
 *   · a MESMA morada não vira dois locais — a mesma casa apareceria na lista
 *     com nomes ligeiramente diferentes, e ninguém saberia qual usar;
 *   · a morada de um cliente não se cola a outro;
 *   · nada disto escreve uma linha nas tabelas do CRM.
 *
 *     npm run validar-cliente-crm
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
const ENT_A = "77777777-7777-7777-7777-777777777771";
const ENT_B = "77777777-7777-7777-7777-777777777772";
const CLI_A = "22222222-2222-2222-2222-222222222221";
const CLI_B = "22222222-2222-2222-2222-222222222222";
const GESTOR = "aaaa0000-0000-0000-0000-00000000000a";
const TECNICO = "bbbb0000-0000-0000-0000-00000000000b";
const AUTH = {
  gestor: "aaaa1111-0000-0000-0000-00000000000a",
  tecnico: "bbbb1111-0000-0000-0000-00000000000b",
};
const MOR_1 = "eeee0000-0000-0000-0000-000000000001";
const MOR_2 = "eeee0000-0000-0000-0000-000000000002";
const MOR_B = "eeee0000-0000-0000-0000-000000000003";
const MOR_VELHA = "eeee0000-0000-0000-0000-000000000004";

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
  INSERT INTO public.anew_entities (id, display_name) VALUES
    ('${ENT_A}','Condominio Torre A'),
    ('${ENT_B}','Filipa Nunes');
  INSERT INTO public.anew_clients (id, organization_id, entity_id) VALUES
    ('${CLI_A}','${ORG}','${ENT_A}'),
    ('${CLI_B}','${ORG}','${ENT_B}');

  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ('${GESTOR}','${AUTH.gestor}','Gestora','g@x.pt'),
    ('${TECNICO}','${AUTH.tecnico}','Tecnico','t@x.pt');
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('${AUTH.gestor}','g@x.pt',now()),('${AUTH.tecnico}','t@x.pt',now());
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ('${AUTH.gestor}','${GESTOR}'),('${AUTH.tecnico}','${TECNICO}');

  -- As moradas, como o CRM as guarda.
  INSERT INTO public.anew_addresses (id, street, number, floor, unit, postal_code, city, district) VALUES
    ('${MOR_1}','Rua das Flores','12','3','E','1200-192','Lisboa','Lisboa'),
    ('${MOR_2}','Avenida da Liberdade','200',NULL,NULL,'1250-147','Lisboa','Lisboa'),
    ('${MOR_B}','Rua do Sol','7',NULL,NULL,'4000-001','Porto','Porto'),
    ('${MOR_VELHA}','Rua Antiga','1',NULL,NULL,'1000-001','Lisboa','Lisboa');

  INSERT INTO public.anew_entity_addresses (entity_id, address_id, address_type, is_primary, valid_to) VALUES
    ('${ENT_A}','${MOR_1}','obra', true, NULL),
    ('${ENT_A}','${MOR_2}','fiscal', false, NULL),
    -- Uma morada que o cliente já não usa. Não deve aparecer.
    ('${ENT_A}','${MOR_VELHA}','obra', false, now() - interval '1 day'),
    ('${ENT_B}','${MOR_B}','obra', true, NULL);

  INSERT INTO public.anew_entity_phones (entity_id, phone_number, country_code, phone_type, is_primary) VALUES
    ('${ENT_A}','912 000 000','+351','movel', true),
    ('${ENT_A}','213 000 000','+351','fixo', false);
  INSERT INTO public.anew_entity_emails (entity_id, email, is_primary) VALUES
    ('${ENT_A}','geral@torrea.pt', true);
`);

for (const f of ["schema.sql","permissoes.sql","rpcs.sql","rpcs-tarefas.sql","planos.sql",
                 "correcoes-modelo.sql","medicoes.sql","despacho.sql","orcamentos.sql",
                 "anexos.sql","planos-crud.sql","config.sql","custos.sql","cliente-crm.sql"]) {
  await db.exec(ler(f));
}

await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name) VALUES
    ('dddd0000-0000-0000-0000-00000000000d','${ORG}','Operacoes'),
    ('dddd0000-0000-0000-0000-00000000000e','${ORG}','Tecnicos');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT 'dddd0000-0000-0000-0000-00000000000d', code
      FROM public.anew_permissions WHERE category = 'operations';
  -- O técnico vê os sítios, mas não os cria.
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT 'dddd0000-0000-0000-0000-00000000000e', code
      FROM public.anew_permissions
     WHERE category = 'operations' AND code <> 'operations.locations.manage';

  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${GESTOR}','${ORG}','dddd0000-0000-0000-0000-00000000000d','active'),
    ('${TECNICO}','${ORG}','dddd0000-0000-0000-0000-00000000000e','active');

  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES
    ('${ORG}','${GESTOR}','gestor'),
    ('${ORG}','${TECNICO}','tecnico');

  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth, public TO authenticated;
  REVOKE INSERT, UPDATE, DELETE ON public.ops_anexo FROM authenticated;
`);

async function como(authUid, sql) {
  const r = await db.exec(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = '${authUid}';
    ${sql}
    COMMIT;
  `);
  return r.flatMap((x) => x.rows ?? []);
}

async function json(authUid, sql) {
  const bruto = Object.values((await como(authUid, sql)).at(-1) ?? {})[0];
  return typeof bruto === "string" ? JSON.parse(bruto) : bruto;
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

/* ── As moradas que o CRM já tem ────────────────────────────────────────── */
console.log("\n─── o que o CRM já sabe ─────────────────");
{
  const ms = await como(AUTH.gestor,
    `SELECT morada, principal, ja_e_local FROM public.ops_v_morada_cliente
      WHERE cliente_id='${CLI_A}' ORDER BY principal DESC, morada;`);

  ms.length === 2
    ? ok("2 moradas do cliente — a que já não se usa ficou de fora")
    : mau(`${ms.length} moradas, esperava 2`);

  ms[0]?.morada === "Rua das Flores 12, 3 E, 1200-192 Lisboa"
    ? ok(`escrita como se diz: "${ms[0].morada}"`)
    : mau(`morada mal montada: "${ms[0]?.morada}"`);

  ms[0]?.principal === true ? ok("a principal vem primeiro") : mau("a principal não veio primeiro");
  ms.every((m) => m.ja_e_local === false) ? ok("nenhuma virou local ainda") : mau("já diz que é local");
}

{
  const c = await como(AUTH.gestor,
    `SELECT telefone, tipo, principal, email FROM public.ops_v_contacto_cliente
      WHERE cliente_id='${CLI_A}' ORDER BY principal DESC;`);
  c.length === 2 ? ok("2 telefones") : mau(`${c.length} telefones`);
  c[0]?.telefone === "+351 912 000 000"
    ? ok(`o principal primeiro: ${c[0].telefone}`)
    : mau(`telefone: ${c[0]?.telefone}`);
  c[0]?.email === "geral@torrea.pt" ? ok("com o email do cliente") : mau(`email: ${c[0]?.email}`);
}

/* ── Da morada ao local ─────────────────────────────────────────────────── */
console.log("\n─── um toque, e o local existe ──────────");

const criar = (args) => {
  const p = { p_cliente_id: `'${CLI_A}'`, ...args };
  return `SELECT public.rpc_ops_criar_local(${Object.entries(p)
    .map(([k, v]) => `${k} => ${v}`).join(", ")});`;
};

let LOC;
{
  const r = await json(AUTH.gestor, criar({ p_address_id: `'${MOR_1}'` }));
  r?.ok ? ok(`nasceu o local ${r.codigo}`) : mau(`não criou: ${JSON.stringify(r)}`);
  LOC = r.id;

  r.nome === "Rua das Flores 12 3 E"
    ? ok(`com o nome vindo da morada: "${r.nome}"`)
    : mau(`nome: "${r.nome}"`);

  const l = await um(`
    SELECT morada, cidade, cod_postal, address_id, tipo FROM public.ops_local WHERE id='${LOC}'`);
  l.cidade === "Lisboa" && l.cod_postal === "1200-192"
    ? ok("cidade e código postal copiados, sem ninguém escrever")
    : mau(`cidade=${l.cidade} cp=${l.cod_postal}`);
  l.address_id === MOR_1
    ? ok("e sabe de que morada do CRM veio")
    : mau("perdeu a ligação à morada");
}

{
  const m = await um(`
    SELECT ja_e_local FROM public.ops_v_morada_cliente
     WHERE address_id='${MOR_1}' AND cliente_id='${CLI_A}'`);
  m.ja_e_local === true
    ? ok("a morada deixa de aparecer como por usar")
    : mau("continua a oferecer-se uma morada que já é local");
}

{
  // Carregar duas vezes no botão devolve o mesmo local, não cria outro.
  const r = await json(AUTH.gestor, criar({ p_address_id: `'${MOR_1}'` }));
  r?.id === LOC && r?.ja_existia === true
    ? ok("a mesma morada não vira dois locais — devolve o que já lá está")
    : mau(`criou outro: ${JSON.stringify(r)}`);

  const n = await um(`SELECT count(*)::int AS n FROM public.ops_local WHERE address_id='${MOR_1}'`);
  n.n === 1 ? ok("continua a haver um só") : mau(`${n.n} locais para a mesma morada`);
}

await deveSerRecusado(
  "a morada de um cliente não se cola a outro",
  AUTH.gestor,
  `SELECT public.rpc_ops_criar_local(p_cliente_id => '${CLI_A}', p_address_id => '${MOR_B}');`,
  "não é deste cliente"
);

await deveSerRecusado(
  "uma morada que o cliente já não usa não se oferece",
  AUTH.gestor,
  `SELECT public.rpc_ops_criar_local(p_cliente_id => '${CLI_A}', p_address_id => '${MOR_VELHA}');`,
  "não é deste cliente"
);

/* ── Criar do nada ──────────────────────────────────────────────────────── */
console.log("\n─── e sem morada, também dá ─────────────");
{
  const r = await json(AUTH.gestor, criar({
    p_nome: "'Garagem -2'", p_tipo: "'espaco'", p_parent_id: `'${LOC}'`,
  }));
  r?.ok ? ok(`criou "${r.nome}" dentro do outro local`) : mau(`falhou: ${JSON.stringify(r)}`);

  const l = await um(`SELECT parent_id, tipo, address_id FROM public.ops_local WHERE id='${r.id}'`);
  l.parent_id === LOC ? ok("com o pai certo") : mau(`parent_id=${l.parent_id}`);
  l.address_id === null ? ok("e sem morada do CRM, que é o esperado") : mau("inventou uma morada");
}

await deveSerRecusado(
  "sem nome e sem morada, é recusado",
  AUTH.gestor,
  criar({ p_nome: "'  '" }),
  "precisa de um nome"
);

await deveSerRecusado(
  "um tipo inventado é recusado",
  AUTH.gestor,
  criar({ p_nome: "'X'", p_tipo: "'planeta'" }),
  "Tipo de local inválido"
);

await deveSerRecusado(
  "um técnico sem locations.manage não cria locais",
  AUTH.tecnico,
  criar({ p_nome: "'Do tecnico'" }),
  "Sem permissão"
);

/* ── O CRM ficou intacto ────────────────────────────────────────────────── */
console.log("\n─── o CRM ficou intacto ─────────────────");
{
  const a = await um(`SELECT count(*)::int AS n FROM public.anew_addresses`);
  const ea = await um(`SELECT count(*)::int AS n FROM public.anew_entity_addresses`);
  const t = await um(`SELECT count(*)::int AS n FROM public.anew_entity_phones`);
  a.n === 4 && ea.n === 4 && t.n === 2
    ? ok("moradas, ligações e telefones como estavam")
    : mau(`addresses=${a.n} entity_addresses=${ea.n} phones=${t.n}`);

  const fk = await um(`
    SELECT count(*)::int AS n
      FROM pg_constraint c
      JOIN pg_class tt ON tt.oid = c.conrelid
      JOIN pg_class f ON f.oid = c.confrelid
     WHERE c.contype='f' AND tt.relname LIKE 'ops\\_%' AND f.relname NOT LIKE 'ops\\_%'`);
  fk.n === 0 ? ok("zero chaves estrangeiras para fora") : mau(`${fk.n} para fora`);

  const tr = await um(`
    SELECT count(*)::int AS n FROM pg_trigger g
      JOIN pg_class tt ON tt.oid = g.tgrelid
     WHERE NOT g.tgisinternal
       AND tt.relname IN ('anew_addresses','anew_entity_addresses','anew_entity_phones')`);
  tr.n === 0 ? ok("e nenhum trigger nosso nas tabelas de morada") : mau(`${tr.n} triggers`);
}

console.log("");
if (falhas.length) {
  console.log(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ a morada do cliente não se escreve duas vezes");
