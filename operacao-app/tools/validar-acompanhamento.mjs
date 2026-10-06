/**
 * Prova db/acompanhamento-cliente.sql (o cliente acompanha a obra por um
 * link privado) contra um Postgres limpo (PGlite), sem tocar no Supabase.
 *
 *   · só o supervisor da obra ou o gestor geram/revogam o link e escolhem
 *     as fotos; o técnico não;
 *   · o cliente (anon) entra só com um token válido, não revogado e dentro
 *     da validade; gerar um novo revoga o anterior; obra cancelada, não;
 *   · o que sai: nada de custos, tempos, equipa (além do supervisor),
 *     contexto interno; só fotos marcadas e atrasos já comunicados;
 *   · a tabela dos links não se lê diretamente; o storage só assina fotos
 *     marcadas de obras com link ativo.
 *
 *     npm run validar-acompanhamento
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
const mau = (m) => {
  console.log(`  ✗ ${m}`);
  falhas.push(m);
};

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "11111111-2222-2222-2222-222222222222";
const U = {
  adminA: "a0000000-0000-0000-0000-000000000001",
  gestorA: "a0000000-0000-0000-0000-00000000000a",
  supA: "a0000000-0000-0000-0000-00000000000b",
  tecA: "a0000000-0000-0000-0000-00000000000c",
  tec2A: "a0000000-0000-0000-0000-00000000000d",
  admin2A: "a0000000-0000-0000-0000-00000000000e",
  tecAB: "a0000000-0000-0000-0000-00000000000f", // técnico na A, e também na B
  comA: "a0000000-0000-0000-0000-000000000010", // técnico com papel do CRM mais largo
  sysA: "a0000000-0000-0000-0000-000000000011", // técnico que é admin de sistema
  gscA: "a0000000-0000-0000-0000-000000000012", // gestor sem acesso a custos
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
  CREATE TABLE public._stub_admin_sistema (auth_user_id uuid PRIMARY KEY);
  CREATE OR REPLACE FUNCTION public.is_system_admin_user(_user_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
    $fn$ SELECT EXISTS (SELECT 1 FROM public._stub_admin_sistema WHERE auth_user_id = _user_id) $fn$;

  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG_A}','Org A'), ('${ORG_B}','Org B');
  INSERT INTO public.anew_users (id, auth_user_id, name, email) VALUES
    ${Object.entries(U).map(([k, v]) => `('${v}','${AUTH[k]}','${k}','${k}@x.pt')`).join(",\n    ")};
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id) VALUES
    ${Object.keys(U).map((k) => `('${AUTH[k]}','${U[k]}')`).join(",")};
  INSERT INTO public._stub_admin_sistema VALUES ('${AUTH.sysA}');
`);

for (const f of [
  "schema.sql", "permissoes.sql", "rpcs.sql", "rpcs-tarefas.sql", "planos.sql",
  "correcoes-modelo.sql", "medicoes.sql", "despacho.sql", "orcamentos.sql",
  "anexos.sql", "planos-crud.sql", "config.sql", "custos.sql", "cliente-crm.sql",
  "seguranca.sql", "tempos.sql", "obras.sql",
]) {
  try {
    await db.exec(ler(f));
  } catch (e) {
    console.error(`✗ ${f} falhou antes de chegar aqui: ${e.message}`);
    process.exit(1);
  }
}

console.log("\n─── instalar ────────────────────────────");
for (const f of ["obras-fotos.sql", "acompanhamento-cliente.sql"]) {
  try {
    await db.exec(ler(f));
    await db.exec(ler(f));
    ok(`${f} corre duas vezes`);
  } catch (e) {
    mau(`${f}: ${e.message}`);
    process.exit(1);
  }
}

const R = {
  tudoA: "d0000000-0000-0000-0000-00000000000a",
  tecA: "d0000000-0000-0000-0000-00000000000b",
  tudoB: "d0000000-0000-0000-0000-00000000000c",
  comA: "d0000000-0000-0000-0000-00000000000d",
};
await db.exec(`
  INSERT INTO public.anew_roles (id, organization_id, name) VALUES
    ('${R.tudoA}','${ORG_A}','Tudo A'), ('${R.tecA}','${ORG_A}','Tecnicos A'),
    ('${R.tudoB}','${ORG_B}','Tudo B'), ('${R.comA}','${ORG_A}','Tecnico + comercial A');
  INSERT INTO public.anew_role_permissions (role_id, permission_code)
    SELECT r, code FROM public.anew_permissions,
      unnest(ARRAY['${R.tudoA}'::uuid, '${R.tudoB}'::uuid, '${R.comA}'::uuid]) r
     WHERE category = 'operations';
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('${R.tecA}','operations.view'), ('${R.tecA}','operations.orders.view'),
    ('${R.tecA}','operations.orders.execute'),
    ('${R.comA}','quotes.delete');   -- o admin A não tem esta
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('${U.adminA}','${ORG_A}','${R.tudoA}','active'),
    ('${U.gestorA}','${ORG_A}','${R.tudoA}','active'),
    ('${U.supA}','${ORG_A}','${R.tudoA}','active'),
    ('${U.admin2A}','${ORG_A}','${R.tudoA}','active'),
    ('${U.tecA}','${ORG_A}','${R.tecA}','active'),
    ('${U.tec2A}','${ORG_A}','${R.tecA}','active'),
    ('${U.tecAB}','${ORG_A}','${R.tecA}','active'),
    ('${U.tecAB}','${ORG_B}','${R.tudoB}','active'),
    ('${U.comA}','${ORG_A}','${R.comA}','active'),
    ('${U.sysA}','${ORG_A}','${R.tecA}','active');
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao) VALUES
    ('${ORG_A}','${U.adminA}','admin'), ('${ORG_A}','${U.gestorA}','gestor'),
    ('${ORG_A}','${U.supA}','supervisor'), ('${ORG_A}','${U.admin2A}','admin'),
    ('${ORG_A}','${U.tecA}','tecnico'), ('${ORG_A}','${U.tec2A}','tecnico'),
    ('${ORG_A}','${U.tecAB}','tecnico'), ('${ORG_A}','${U.comA}','tecnico'),
    ('${ORG_A}','${U.sysA}','tecnico');
  GRANT USAGE ON SCHEMA auth, public TO authenticated, anon;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  GRANT SELECT ON public.anew_users TO authenticated;
`);

/* ── Uma obra com uma tarefa do técnico A ───────────────────────────────── */
const OBRA = "0b000000-0000-0000-0000-000000000001";
const FASE = "0f000000-0000-0000-0000-000000000001";
const T1 = "07000000-0000-0000-0000-000000000001";
const T2 = "07000000-0000-0000-0000-000000000002";
await db.exec(`
  INSERT INTO public.ops_obra (id, organization_id, codigo, titulo, supervisor_id, gestor_id)
    VALUES ('${OBRA}','${ORG_A}','OB-T-1','Obra teste','${U.supA}','${U.gestorA}');
  INSERT INTO public.ops_obra_fase (id, organization_id, obra_id, ordem, nome)
    VALUES ('${FASE}','${ORG_A}','${OBRA}',1,'Preparação');
  INSERT INTO public.ops_obra_tarefa (id, organization_id, obra_id, fase_id, nome, estado) VALUES
    ('${T1}','${ORG_A}','${OBRA}','${FASE}','Proteger chão','feita'),
    ('${T2}','${ORG_A}','${OBRA}','${FASE}','Já validada','validada');
  INSERT INTO public.ops_obra_tarefa_pessoa (tarefa_id, utilizador_id, organization_id, obra_id) VALUES
    ('${T1}','${U.tecA}','${ORG_A}','${OBRA}'), ('${T2}','${U.tecA}','${ORG_A}','${OBRA}');
`);


function sessao(authUid, sql) {
  return authUid
    ? `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${authUid}'; ${sql}; COMMIT;`
    : `BEGIN; SET LOCAL ROLE anon; ${sql}; COMMIT;`;
}
async function chamar(authUid, sql) {
  const r = await db.exec(sessao(authUid, sql));
  const rows = r.flatMap((x) => x.rows ?? []);
  return Object.values(rows.at(-1) ?? {})[0];
}
async function passa(nome, authUid, sql) {
  try {
    const r = await chamar(authUid, sql);
    ok(nome);
    return r;
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    mau(`${nome} — falhou: ${e.message.split("\n")[0]}`);
    return null;
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
const ANON = null;
const json = (t) => (t ? JSON.parse(t) : null);

/* Uma segunda fase com trabalho por fazer, fotos e atrasos. */
const FASE2 = "0f000000-0000-0000-0000-000000000002";
const T3 = "07000000-0000-0000-0000-000000000003";
const FOTO1 = "f0700000-0000-0000-0000-000000000001";
const FOTO2 = "f0700000-0000-0000-0000-000000000002";
await db.exec(`
  UPDATE public.ops_obra SET morada = 'Rua das Flores, 7', estado = 'em_curso' WHERE id = '${OBRA}';
  UPDATE public.ops_obra_tarefa SET minutos_previstos = 240, inicio_planeado = '2026-10-05', fim_planeado = '2026-10-05'
   WHERE id IN ('${T1}','${T2}');
  INSERT INTO public.ops_obra_fase (id, organization_id, obra_id, ordem, nome)
    VALUES ('${FASE2}','${ORG_A}','${OBRA}',2,'Canalização');
  INSERT INTO public.ops_obra_tarefa (id, organization_id, obra_id, fase_id, nome, estado, minutos_previstos, inicio_planeado, fim_planeado)
    VALUES ('${T3}','${ORG_A}','${OBRA}','${FASE2}','Abrir roços','por_fazer', 480, '2026-10-06', '2026-10-07');
  INSERT INTO public.ops_obra_tarefa_foto (id, organization_id, obra_id, tarefa_id, caminho, nome, legenda)
    VALUES ('${FOTO1}','${ORG_A}','${OBRA}','${T1}','${ORG_A}/${OBRA}/${T1}/a.jpg','a.jpg','Chão protegido'),
           ('${FOTO2}','${ORG_A}','${OBRA}','${T1}','${ORG_A}/${OBRA}/${T1}/b.jpg','b.jpg','Interna, não mostrar');
  INSERT INTO public.ops_obra_tarefa_atraso (organization_id, obra_id, tarefa_id, motivo, contexto, novo_fim, cliente_avisado, nota_cliente)
    VALUES ('${ORG_A}','${OBRA}','${T3}','material_em_falta','O fornecedor X falhou outra vez — NOTA INTERNA', '2026-10-09', true,
            'O material chega na quinta-feira.'),
           ('${ORG_A}','${OBRA}','${T3}','equipa','Faltou alguém — NAO COMUNICADO', '2026-10-10', false, NULL);
`);

console.log("\n─── quem partilha ───────────────────────");
await recusa("o técnico não gera o link", AUTH.tecA, `SELECT public.rpc_ops_obra_partilha_criar('${OBRA}')`, "Só o supervisor");
await recusa("o cliente (sem sessão) não gera o link", ANON, `SELECT public.rpc_ops_obra_partilha_criar('${OBRA}')`, "permission denied");
const g1 = json(await passa("o gestor gera um link", AUTH.gestorA, `SELECT public.rpc_ops_obra_partilha_criar('${OBRA}', 30)::text`));
/^[0-9a-f]{64}$/.test(g1?.token ?? "") ? ok("o token tem 64 caracteres hex") : mau(`token: ${g1?.token}`);
{
  const guardado = (await um(`SELECT token_hash FROM public.ops_obra_partilha WHERE revogada_em IS NULL`))?.token_hash;
  guardado && guardado !== g1?.token ? ok("a base guarda só o hash, não o token") : mau("o token está guardado em claro");
}
const g2 = json(await passa("o supervisor gera outro (revoga o anterior)", AUTH.supA, `SELECT public.rpc_ops_obra_partilha_criar('${OBRA}')::text`));

console.log("\n─── o cliente entra ─────────────────────");
await recusa("o link antigo deixa de funcionar", ANON, `SELECT public.rpc_ops_acompanhar('${g1?.token}')`, "inválido");
await recusa("um token inventado, não", ANON, `SELECT public.rpc_ops_acompanhar('${"a".repeat(64)}')`, "inválido");
await recusa("um token curto, não", ANON, `SELECT public.rpc_ops_acompanhar('abc')`, "inválido");
const d = json(await passa("o link novo abre sem sessão", ANON, `SELECT public.rpc_ops_acompanhar('${g2?.token}')::text`));
d?.obra?.codigo === "OB-T-1" && d?.obra?.morada === "Rua das Flores, 7" ? ok("vê a sua obra") : mau(`obra: ${JSON.stringify(d?.obra)}`);
d?.progresso?.percentagem === 50
  ? ok("progresso pesado pelo tempo (480 de 960 min → 50 %)")
  : mau(`progresso: ${JSON.stringify(d?.progresso)}`);
d?.fase_atual?.nome === "Canalização" && d?.proxima_fase == null
  ? ok("fase atual: Canalização; sem próxima")
  : mau(`fases: ${JSON.stringify(d?.fase_atual)} / ${JSON.stringify(d?.proxima_fase)}`);
d?.fases?.length === 2 && d.fases[0].estado === "concluida" ? ok("a 1.ª fase aparece concluída") : mau(`fases: ${JSON.stringify(d?.fases)}`);
d?.fotos?.length === 0 ? ok("sem fotos marcadas, não vê nenhuma") : mau(`vê ${d?.fotos?.length} fotos`);
d?.supervisor?.nome === "supA" ? ok("vê o nome do supervisor") : mau(`supervisor: ${JSON.stringify(d?.supervisor)}`);
{
  const txt = JSON.stringify(d ?? {});
  const proibido = ["minutos", "custo", "NOTA INTERNA", "NAO COMUNICADO", "tecA", "gestorA", "Interna, não mostrar", "token"];
  const fugas = proibido.filter((p) => txt.includes(p));
  fugas.length === 0
    ? ok("não sai nada interno (custos, tempos, equipa, notas, fotos não marcadas)")
    : mau(`fugas: ${fugas.join(", ")}`);
  d?.atrasos?.length === 1 && d.atrasos[0].nota === "O material chega na quinta-feira." && d.atrasos[0].novo_fim === "2026-10-09"
    ? ok("só o atraso comunicado, com a nota ao cliente e a nova data")
    : mau(`atrasos: ${JSON.stringify(d?.atrasos)}`);
}
{
  const n = (await um(`SELECT acessos FROM public.ops_obra_partilha WHERE revogada_em IS NULL`))?.acessos;
  n === 1 ? ok("o acesso fica contado") : mau(`acessos: ${n}`);
}
await recusa("o cliente não lê a tabela dos links", ANON, `SELECT count(*) FROM public.ops_obra_partilha`, "permission denied");
await recusa("nem a equipa a lê diretamente", AUTH.gestorA, `SELECT count(*) FROM public.ops_obra_partilha`, "permission denied");
await recusa("o cliente não chama a função interna", ANON, `SELECT public.ops_obra_acompanhamento_dados('${OBRA}')`, "permission denied");

console.log("\n─── fotos para o cliente ────────────────");
await recusa("o técnico não escolhe as fotos", AUTH.tecA, `SELECT public.rpc_ops_obra_foto_cliente('${FOTO1}', true)`, "Só o supervisor");
await passa("o supervisor marca uma foto", AUTH.supA, `SELECT public.rpc_ops_obra_foto_cliente('${FOTO1}', true)`);
{
  const d2 = json(await chamar(ANON, `SELECT public.rpc_ops_acompanhar('${g2?.token}')::text`));
  d2?.fotos?.length === 1 && d2.fotos[0].legenda === "Chão protegido"
    ? ok("o cliente vê só a foto marcada")
    : mau(`fotos: ${JSON.stringify(d2?.fotos)}`);
  const s1 = await chamar(ANON, `SELECT public.ops_obra_foto_partilhada('${ORG_A}/${OBRA}/${T1}/a.jpg')`);
  const s2 = await chamar(ANON, `SELECT public.ops_obra_foto_partilhada('${ORG_A}/${OBRA}/${T1}/b.jpg')`);
  s1 === true && s2 === false ? ok("o storage só assina a foto marcada") : mau(`storage: marcada=${s1}, outra=${s2}`);
}

console.log("\n─── estado, pré-visualização, revogar ───");
{
  const e = json(await passa("o supervisor vê o estado do link", AUTH.supA, `SELECT public.rpc_ops_obra_partilha_estado('${OBRA}')::text`));
  e?.ativa === true && e?.pode_gerir === true && e?.acessos >= 1 && !("token" in (e ?? {}))
    ? ok("ativo, pode gerir, com acessos e sem o token")
    : mau(`estado: ${JSON.stringify(e)}`);
  const et = json(await passa("o técnico vê o estado", AUTH.tecA, `SELECT public.rpc_ops_obra_partilha_estado('${OBRA}')::text`));
  et?.pode_gerir === false ? ok("mas não pode gerir") : mau(`técnico: ${JSON.stringify(et)}`);
  const p = json(await passa("a pré-visualização mostra o mesmo que o cliente vê", AUTH.tecA,
    `SELECT public.rpc_ops_obra_acompanhamento_previa('${OBRA}')::text`));
  p?.fotos?.length === 1 && p?.obra?.codigo === "OB-T-1" ? ok("…com a foto marcada") : mau(`prévia: ${JSON.stringify(p?.fotos)}`);
  await recusa("quem não vê a obra não pré-visualiza", AUTH.tec2A,
    `SELECT public.rpc_ops_obra_acompanhamento_previa('${OBRA}')`, "não encontrada");
}
await db.exec(`UPDATE public.ops_obra_partilha SET expira_em = now() - interval '1 minute' WHERE revogada_em IS NULL`);
await recusa("um link fora da validade diz que expirou", ANON, `SELECT public.rpc_ops_acompanhar('${g2?.token}')`, "expirou");
{
  const s = await chamar(ANON, `SELECT public.ops_obra_foto_partilhada('${ORG_A}/${OBRA}/${T1}/a.jpg')`);
  s === false ? ok("e o storage deixa de assinar") : mau("o storage continua a assinar com o link expirado");
}
const g3 = json(await passa("gera-se um novo", AUTH.gestorA, `SELECT public.rpc_ops_obra_partilha_criar('${OBRA}')::text`));
await recusa("o técnico não revoga", AUTH.tecA, `SELECT public.rpc_ops_obra_partilha_revogar('${OBRA}')`, "Só o supervisor");
await passa("o supervisor revoga", AUTH.supA, `SELECT public.rpc_ops_obra_partilha_revogar('${OBRA}')`);
await recusa("revogado, o cliente já não entra", ANON, `SELECT public.rpc_ops_acompanhar('${g3?.token}')`, "inválido");
{
  const g4 = json(await chamar(AUTH.gestorA, `SELECT public.rpc_ops_obra_partilha_criar('${OBRA}')::text`));
  await db.exec(`UPDATE public.ops_obra SET estado = 'cancelada' WHERE id = '${OBRA}'`);
  await recusa("obra cancelada: o link deixa de abrir", ANON, `SELECT public.rpc_ops_acompanhar('${g4?.token}')`, "inválido");
  await recusa("e não se gera outro", AUTH.gestorA, `SELECT public.rpc_ops_obra_partilha_criar('${OBRA}')`, "cancelada");
}

console.log(
  falhas.length
    ? `\n✗ acompanhamento: ${falhas.length} falha(s)`
    : "\n✓ acompanhamento: link privado, só o que o cliente deve ver, revogável e com validade"
);
process.exit(falhas.length ? 1 : 0);
