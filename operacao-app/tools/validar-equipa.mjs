/**
 * Prova db/equipa.sql (e a versão de db/pessoas-crm.sql que tira os clientes
 * da lista) contra um Postgres limpo (PGlite), sem tocar no Supabase.
 *
 *   · instala por cima de obras.sql e corre duas vezes (idempotente);
 *   · um cliente do CRM (só cliente) com perfil ATIVO fica inativo e perde
 *     as especialidades; não volta a poder ser ativado — nem por INSERT, nem
 *     por rpc_ops_gravar_perfil; quem é cliente E colaborador pode;
 *   · rpc_ops_equipa_crm deixa de listar clientes (exceto os que têm perfil,
 *     marcados e_cliente);
 *   · menu por empresa: automático pelo que existe, escolha guardada, nunca
 *     as duas áreas desligadas, só admin/gestor grava;
 *   · "entrar como" esquecido há mais de 2 h fecha-se.
 *
 *     npm run validar-equipa
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
  clienteA: "a0000000-0000-0000-0000-00000000000d", // só cliente da A
  clienteNovo: "a0000000-0000-0000-0000-00000000000e", // só cliente, sem perfil
  ambosA: "a0000000-0000-0000-0000-00000000000f", // cliente E colaborador
  gestorB: "b0000000-0000-0000-0000-00000000000a",
};
const AUTH = Object.fromEntries(
  Object.entries(U).map(([k, v]) => [k, v.replace(/^a/, "e").replace(/^b/, "d")])
);
const R = {
  tudoA: "d0000000-0000-0000-0000-00000000000a",
  tecA: "d0000000-0000-0000-0000-00000000000b",
  clienteA: "d0000000-0000-0000-0000-00000000000c",
  tudoB: "d0000000-0000-0000-0000-00000000000d",
};

await db.exec(STUBS_CRM);
await db.exec(AUTENTICACAO_REAL);
await db.exec(`
  ALTER TABLE public.anew_memberships ADD COLUMN IF NOT EXISTS role_is_client boolean NOT NULL DEFAULT false;
  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG_A}','Org A'), ('${ORG_B}','Org B');
  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ${Object.entries(U).map(([k, v]) => `('${v}','${AUTH[k]}','${k}','${k}@x.pt')`).join(",\n    ")};
`);

for (const f of [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
  "seguranca.sql", "tempos.sql", "obras.sql", "pessoas-crm.sql", "entrar-como.sql",
]) {
  try {
    await db.exec(ler(f));
  } catch (e) {
    console.error(`✗ ${f} falhou antes de chegar aqui: ${e.message}`);
    process.exit(1);
  }
}

await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name) VALUES
    ('${R.tudoA}','${ORG_A}','Direção A'), ('${R.tecA}','${ORG_A}','Técnicos A'),
    ('${R.clienteA}', NULL, 'Client'), ('${R.tudoB}','${ORG_B}','Direção B');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT r, code FROM public.anew_permissions,
      unnest(ARRAY['${R.tudoA}'::uuid, '${R.tudoB}'::uuid]) r
     WHERE category = 'operations';
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('${R.tecA}','operations.view'), ('${R.tecA}','operations.orders.view');
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status, role_is_client) VALUES
    ('${U.gestorA}','${ORG_A}','${R.tudoA}','active', false),
    ('${U.tecA}','${ORG_A}','${R.tecA}','active', false),
    ('${U.clienteA}','${ORG_A}','${R.clienteA}','active', true),
    ('${U.clienteNovo}','${ORG_A}','${R.clienteA}','active', true),
    ('${U.ambosA}','${ORG_A}','${R.clienteA}','active', true),
    ('${U.ambosA}','${ORG_A}','${R.tecA}','active', false),
    ('${U.gestorB}','${ORG_B}','${R.tudoB}','active', false);
  -- O caso da Mudelar: um cliente já com perfil ativo e especialidade.
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES
    ('${ORG_A}','${U.gestorA}','gestor'),
    ('${ORG_A}','${U.tecA}','tecnico'),
    ('${ORG_A}','${U.clienteA}','tecnico'),
    ('${ORG_B}','${U.gestorB}','gestor');
  INSERT INTO public.ops_skill (id, organization_id, nome) VALUES
    ('5c000000-0000-0000-0000-000000000001','${ORG_A}','Marmorista');
  INSERT INTO public.ops_utilizador_skill (utilizador_id, skill_id) VALUES
    ('${U.clienteA}','5c000000-0000-0000-0000-000000000001'),
    ('${U.tecA}','5c000000-0000-0000-0000-000000000001');
  INSERT INTO public.ops_entrar_como_log (organization_id, admin_id, alvo_id, inicio) VALUES
    ('${ORG_A}','${U.gestorA}','${U.tecA}', now() - interval '3 days'),
    ('${ORG_A}','${U.gestorA}','${U.tecA}', now() - interval '10 minutes');
  GRANT USAGE ON SCHEMA auth, public TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
`);

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
    await db.exec(authUid ? sessao(authUid, sql) : `BEGIN; ${sql}; COMMIT;`);
    mau(`${nome} — PASSOU, e devia ter sido recusado`);
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    if (!trecho || e.message.includes(trecho)) ok(nome);
    else mau(`${nome} — recusado com a mensagem errada: ${e.message.split("\n")[0]}`);
  }
}

/* ═══════════ instalar ═══════════ */
console.log("\n─── instalar equipa.sql ─────────────────");
try {
  await db.exec(ler("equipa.sql"));
  await db.exec(ler("equipa.sql"));
  ok("equipa.sql corre duas vezes");
} catch (e) {
  mau(`equipa.sql: ${e.message}`);
  process.exit(1);
}

/* ═══════════ 1. clientes fora da equipa ═══════════ */
console.log("\n─── clientes fora da equipa ─────────────");
{
  const p = await um(`SELECT ativo FROM public.ops_utilizador_perfil WHERE utilizador_id = '${U.clienteA}'`);
  confirma(p?.ativo === false, "o cliente que já tinha perfil ativo ficou inativo (sem apagar)");
  const s = await um(`SELECT count(*)::int n FROM public.ops_utilizador_skill WHERE utilizador_id = '${U.clienteA}'`);
  confirma(s.n === 0, "e perdeu as especialidades");
  const t = await um(`SELECT count(*)::int n FROM public.ops_utilizador_skill WHERE utilizador_id = '${U.tecA}'`);
  confirma(t.n === 1, "o técnico verdadeiro mantém a sua");
}
await recusa(
  "reativar o cliente por SQL é recusado",
  null,
  `UPDATE public.ops_utilizador_perfil SET ativo = true WHERE utilizador_id = '${U.clienteA}'`,
  "é cliente desta empresa"
);
await recusa(
  "criar perfil ativo para um cliente por SQL é recusado",
  null,
  `INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES ('${ORG_A}','${U.clienteNovo}','tecnico')`,
  "é cliente desta empresa"
);
await recusa(
  "o gestor também não consegue dar função a um cliente (rpc_ops_gravar_perfil)",
  AUTH.gestorA,
  `SELECT public.rpc_ops_gravar_perfil('${ORG_A}','${U.clienteNovo}','tecnico', NULL, true)`,
  "é cliente desta empresa"
);
{
  await linhas(AUTH.gestorA, `SELECT public.rpc_ops_gravar_perfil('${ORG_A}','${U.ambosA}','tecnico', NULL, true)`);
  const p = await um(`SELECT ativo FROM public.ops_utilizador_perfil WHERE utilizador_id = '${U.ambosA}'`);
  confirma(p?.ativo === true, "quem é cliente E colaborador pode ser da equipa");
}
{
  const p = await um(`SELECT count(*)::int n FROM public.ops_obra_pessoas_livres_impl('${ORG_A}', current_date, current_date, NULL) x
                       WHERE x.utilizador_id = '${U.clienteA}'`).catch(() => ({ n: -1 }));
  confirma(p.n === 0, "o cliente não aparece nas pessoas livres da distribuição", `n=${p.n}`);
}
{
  const rows = await linhas(AUTH.gestorA, `SELECT utilizador_id, e_cliente, em_operacoes FROM public.rpc_ops_equipa_crm('${ORG_A}')`);
  const m = new Map(rows.map((r) => [r.utilizador_id, r]));
  confirma(!m.has(U.clienteNovo), "a lista da equipa não mostra clientes sem perfil");
  confirma(m.get(U.clienteA)?.e_cliente === true, "o cliente que tinha perfil aparece marcado (para se ver e desativar)");
  confirma(m.get(U.tecA)?.e_cliente === false && m.get(U.ambosA)?.e_cliente === false,
    "colaboradores (mesmo os que também são clientes) não vêm marcados");
}

/* ═══════════ 2. menu por empresa ═══════════ */
console.log("\n─── menu por empresa ────────────────────");
{
  const [r] = await linhas(AUTH.gestorB, `SELECT public.rpc_ops_modulos('${ORG_B}') AS m`);
  confirma(r?.m?.manutencao === true && r?.m?.obras === true, "empresa sem nada: as duas áreas", JSON.stringify(r?.m));
}
await db.exec(`INSERT INTO public.ops_local (organization_id, cliente_id, codigo, nome)
               VALUES ('${ORG_B}', gen_random_uuid(), 'L-1', 'Edifício')`);
{
  const [r] = await linhas(AUTH.gestorB, `SELECT public.rpc_ops_modulos('${ORG_B}') AS m`);
  confirma(r?.m?.manutencao === true && r?.m?.obras === false,
    "só com locais (manutenção): Obras escondidas automaticamente", JSON.stringify(r?.m));
}
{
  const [r] = await linhas(AUTH.gestorB, `SELECT public.rpc_ops_gravar_modulos('${ORG_B}', NULL, true) AS m`);
  confirma(r?.m?.manutencao === true && r?.m?.obras === true, "o gestor liga as Obras à mão", JSON.stringify(r?.m));
  const [r2] = await linhas(AUTH.gestorB, `SELECT public.rpc_ops_gravar_modulos('${ORG_B}', false, true) AS m`);
  confirma(r2?.m?.manutencao === false && r2?.m?.obras === true, "e desliga a Manutenção", JSON.stringify(r2?.m));
}
await recusa(
  "as duas áreas desligadas é recusado",
  AUTH.gestorB,
  `SELECT public.rpc_ops_gravar_modulos('${ORG_B}', false, false)`,
  "pelo menos uma área"
);
await recusa(
  "um técnico não muda o que a empresa usa",
  AUTH.tecA,
  `SELECT public.rpc_ops_gravar_modulos('${ORG_A}', false, true)`,
  "administrador ou gestor"
);
await recusa(
  "o gestor da B não mexe na A",
  AUTH.gestorB,
  `SELECT public.rpc_ops_gravar_modulos('${ORG_A}', false, true)`
);
await recusa(
  "escrever direto na tabela é recusado",
  AUTH.gestorB,
  `INSERT INTO public.ops_org_modulos (organization_id, manutencao) VALUES ('${ORG_B}', true)`
);

/* ═══════════ 3. entrar como esquecido ═══════════ */
console.log("\n─── entrar como esquecido ───────────────");
{
  const r = await um(`SELECT count(*) FILTER (WHERE fim IS NULL)::int abertos,
                             count(*) FILTER (WHERE fim = inicio + interval '2 hours')::int fechados
                        FROM public.ops_entrar_como_log`);
  confirma(r.abertos === 1 && r.fechados === 1,
    "o de há 3 dias fechou-se (fim = início + 2 h); o de há 10 minutos continua aberto", JSON.stringify(r));
}

console.log("");
if (falhas.length) {
  console.log(`✗ equipa: ${falhas.length} falha(s)`);
  process.exit(1);
}
console.log("✓ equipa: clientes fora, menu por empresa e entrar-como sem pontas soltas");
