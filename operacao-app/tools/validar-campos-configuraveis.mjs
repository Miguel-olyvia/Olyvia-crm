/**
 * Valida a migração do CRM 20261209100000_campos_configuraveis.sql contra um
 * Postgres limpo (PGlite), a correr como utilizador autenticado — as mesmas
 * políticas e GRANTs que a app usa.
 *
 * As tabelas do CRM são stubs mínimos com as colunas que a migração usa
 * (copiadas do esquema real). As funções de permissão do CRM são versões
 * simplificadas: aqui só interessa o que a migração faz com o resultado.
 *
 *     node tools/validar-campos-configuraveis.mjs
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACAO = readFileSync(
  join(RAIZ, "supabase", "migrations", "20261209100000_campos_configuraveis.sql"), "utf8");

const db = new PGlite();
await db.waitReady;

const falhas = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mau = (m) => { console.log(`  ✗ ${m}`); falhas.push(m); };

const ORG = "11111111-1111-1111-1111-111111111111";
const OUTRA = "11111111-1111-1111-1111-222222222222";
const ENT = "77777777-7777-7777-7777-777777777777";
const CLI = "22222222-2222-2222-2222-222222222222";
const ADDR = "33333333-3333-3333-3333-333333333333";
const DEAL = "44444444-4444-4444-4444-444444444444";
const NEED = "55555555-5555-5555-5555-555555555555";
const LEAD = "66666666-6666-6666-6666-666666666666";
const ROLE_ADMIN = "aaaaaaaa-0000-0000-0000-000000000001";
const ROLE_COM = "aaaaaaaa-0000-0000-0000-000000000002";
const AUTH = {
  admin: "a0000000-0000-0000-0000-00000000000a",
  comercial: "b0000000-0000-0000-0000-00000000000b",
  fora: "c0000000-0000-0000-0000-00000000000c",
};

await db.exec(`
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;

  CREATE TABLE public.anew_organizations (id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE public.anew_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auth_user_id uuid, name text);
  CREATE TABLE public.anew_memberships (
    user_id uuid, organization_id uuid, role_id uuid, status text DEFAULT 'active', role_is_client boolean);
  CREATE TABLE public.anew_role_permissions (role_id uuid, permission_code text);

  CREATE TABLE public.anew_addresses (id uuid PRIMARY KEY, floor text);
  CREATE TABLE public.anew_entity_addresses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid NOT NULL, address_id uuid NOT NULL,
    address_type text, valid_to timestamptz, created_at timestamptz DEFAULT now());
  CREATE TABLE public.anew_address_building (
    address_id uuid PRIMARY KEY, acesso text, impacto_percent int, estacionamento text,
    zona_estacionamento text, tem_elevador boolean, n_elevadores int, n_andares int,
    n_fracoes_por_andar int, tipologia text, area_util_m2 numeric(7,2), n_divisoes int,
    n_casas_banho int, ano_construcao int, pavimento text, eletrica text, quadro_diferencial boolean,
    canalizacao text, gas text, amianto text, habitada_durante_obra boolean, animais boolean,
    notas_interior text, created_at timestamptz DEFAULT now(), created_by uuid,
    updated_at timestamptz DEFAULT now(), updated_by uuid);

  CREATE TABLE public.deals (id uuid PRIMARY KEY, organization_id uuid NOT NULL);
  CREATE TABLE public.deal_needs (
    id uuid PRIMARY KEY, deal_id uuid NOT NULL, title text NOT NULL,
    diag_tipo_area text, diag_m2_pavimento numeric(10,2), diag_perimetro_m numeric(10,2),
    diag_pe_direito_m numeric(10,2), diag_altura_revestimento text, diag_pontos_agua int,
    diag_pontos_eletricos int, diag_portas_proteger int, diag_janela boolean, diag_toalheiro boolean,
    diag_local_cortes text, diag_gas text, diag_distancia_entrada text, diag_mobilada text,
    diag_cliente_recusou_fotos boolean);
  CREATE TABLE public.anew_clients (
    id uuid PRIMARY KEY, organization_id uuid NOT NULL, entity_id uuid NOT NULL,
    deleted_at timestamptz, custom_fields jsonb DEFAULT '{}'::jsonb);
  CREATE TABLE public.anew_leads (
    id uuid PRIMARY KEY, organization_id uuid NOT NULL, root_organization_id uuid,
    field_values jsonb NOT NULL DEFAULT '{}'::jsonb);
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

  CREATE FUNCTION public.current_business_user_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
    $$ SELECT id FROM public.anew_users WHERE auth_user_id = auth.uid() $$;
  CREATE FUNCTION public.get_user_visible_org_ids(_auth_uid uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT am.organization_id FROM public.anew_users au
      JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
     WHERE au.auth_user_id = _auth_uid $$;
  -- Cópia de 20261206120000.
  CREATE FUNCTION public.current_user_has_permission_in_org(_permission_code text, _org_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT auth.uid() IS NOT NULL AND _org_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.anew_users au
      JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
        AND am.organization_id = _org_id AND am.role_is_client IS NOT TRUE
      JOIN public.anew_role_permissions arp ON arp.role_id = am.role_id
        AND arp.permission_code = _permission_code
      WHERE au.auth_user_id = auth.uid()) $$;
  CREATE FUNCTION public.has_anew_permission(_auth_uid uuid, _code text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (SELECT 1 FROM public.anew_users au
      JOIN public.anew_memberships am ON am.user_id = au.id AND am.status = 'active'
      JOIN public.anew_role_permissions arp ON arp.role_id = am.role_id AND arp.permission_code = _code
      WHERE au.auth_user_id = _auth_uid) $$;
  CREATE FUNCTION public.fn_deal_org_in_scope(p_org uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT p_org IN (SELECT public.get_user_visible_org_ids(auth.uid())) $$;
  CREATE FUNCTION public.fn_lead_org_in_scope(p_org uuid, p_root uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT p_org IN (SELECT public.get_user_visible_org_ids(auth.uid())) $$;
  -- Simplificada: quem é membro da empresa do cliente da entidade.
  CREATE FUNCTION public.fn_entity_delivery_address_access(p_entity_id uuid, p_mode text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (SELECT 1 FROM public.anew_clients c WHERE c.entity_id = p_entity_id
      AND c.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) $$;

  INSERT INTO public.anew_organizations VALUES ('${ORG}', 'Org'), ('${OUTRA}', 'Outra');
  INSERT INTO public.anew_users (auth_user_id, name) VALUES
    ('${AUTH.admin}', 'Admin'), ('${AUTH.comercial}', 'Comercial'), ('${AUTH.fora}', 'Fora');
  INSERT INTO public.anew_memberships (user_id, organization_id, role_id)
    SELECT id, '${ORG}'::uuid, '${ROLE_ADMIN}'::uuid FROM public.anew_users WHERE name = 'Admin'
    UNION ALL SELECT id, '${ORG}'::uuid, '${ROLE_COM}'::uuid FROM public.anew_users WHERE name = 'Comercial'
    UNION ALL SELECT id, '${OUTRA}'::uuid, '${ROLE_ADMIN}'::uuid FROM public.anew_users WHERE name = 'Fora';
  INSERT INTO public.anew_role_permissions VALUES
    ('${ROLE_ADMIN}', 'settings.update'), ('${ROLE_ADMIN}', 'clients.edit'), ('${ROLE_ADMIN}', 'leads.edit'),
    ('${ROLE_COM}', 'clients.edit'), ('${ROLE_COM}', 'leads.edit');

  INSERT INTO public.anew_clients (id, organization_id, entity_id, custom_fields)
    VALUES ('${CLI}', '${ORG}', '${ENT}', '{"vip": true}');
  INSERT INTO public.anew_addresses VALUES ('${ADDR}', '3.º Esq');
  INSERT INTO public.anew_entity_addresses (entity_id, address_id, address_type)
    VALUES ('${ENT}', '${ADDR}', 'delivery');
  INSERT INTO public.anew_address_building (address_id, tem_elevador) VALUES ('${ADDR}', true);
  INSERT INTO public.deals VALUES ('${DEAL}', '${ORG}');
  INSERT INTO public.deal_needs (id, deal_id, title, diag_tipo_area) VALUES ('${NEED}', '${DEAL}', 'WC', 'casa_banho');
  INSERT INTO public.anew_leads (id, organization_id, field_values) VALUES ('${LEAD}', '${ORG}', '{"origem_form": "x"}');
`);

console.log("\nMigração");
try {
  await db.exec(MIGRACAO);
  ok("aplica num Postgres limpo (CONFERIR passou)");
  await db.exec(MIGRACAO);
  ok("é idempotente (segunda vez sem erro)");
} catch (e) {
  mau(`a migração falhou: ${e.message}`);
  process.exit(1);
}

const como = async (quem, sql) => {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${AUTH[quem]}', false); SET ROLE authenticated;`);
  try {
    return (await db.query(sql)).rows;
  } finally {
    await db.exec("RESET ROLE;");
  }
};
const deveFalhar = async (titulo, quem, sql, padrao) => {
  try {
    await como(quem, sql);
    mau(`${titulo}: devia ter falhado`);
  } catch (e) {
    if (padrao && !padrao.test(e.message)) mau(`${titulo}: erro inesperado "${e.message}"`);
    else ok(`${titulo} (${e.message})`);
  }
};
const j = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

const CAMPOS_LOCAL = [
  { chave: "habitada_durante_obra", sistema: true, rotulo: "Loja aberta ao público", ordem: 0 },
  { chave: "tipologia", sistema: true, ativo: false, ordem: 1 },
  { chave: "horario_acesso", tipo: "escolha", rotulo: "Horário de acesso", seccao: "acessos",
    opcoes: [{ valor: "manha", rotulo: "Manhã" }, { valor: "tarde", rotulo: "Tarde" }], ordem: 2 },
  { chave: "credenciacao", tipo: "sim_nao", rotulo: "Exige credenciação", ordem: 3 },
  { chave: "entidade_credencia", tipo: "texto", rotulo: "Quem credencia", ordem: 4,
    condicao: { campo: "credenciacao", valores: ["true"] } },
  { chave: "n_cacifos", tipo: "numero", rotulo: "Cacifos", minimo: 0, maximo: 20, ordem: 5 },
  { chave: "area_loja", tipo: "numero", rotulo: "Área da loja", minimo: 0, casas_decimais: 2, unidade: "m²", ordem: 6 },
  { chave: "tipo_elevador", tipo: "escolha", rotulo: "Tipo de elevador", ordem: 7,
    opcoes: [{ valor: "carga", rotulo: "Carga" }, { valor: "pessoas", rotulo: "Pessoas" }],
    condicao: { campo: "tem_elevador", valores: ["true"] } },
  { chave: "data_vistoria", tipo: "data", rotulo: "Vistoria", ordem: 8 },
];

console.log("\nConfiguração");
{
  const [r] = await como("admin", `SELECT public.rpc_cfg_gravar_ficha('${ORG}', 'local', ${j(CAMPOS_LOCAL)}) AS n`);
  r.n === CAMPOS_LOCAL.length ? ok(`o admin grava ${r.n} campos`) : mau(`gravou ${r.n}`);
  const linhas = await como("comercial", `SELECT chave, sistema, ativo, rotulo FROM public.cfg_campos WHERE organization_id = '${ORG}' AND ficha = 'local' ORDER BY ordem`);
  linhas.length === CAMPOS_LOCAL.length ? ok("um membro sem settings.update lê a configuração") : mau(`o comercial leu ${linhas.length}`);
  const tip = linhas.find((l) => l.chave === "tipologia");
  tip && tip.sistema && tip.ativo === false && tip.rotulo === null ? ok("campo de sistema escondido sem rótulo próprio") : mau("tipologia mal gravada");
  const fora = await como("fora", `SELECT count(*)::int AS n FROM public.cfg_campos WHERE organization_id = '${ORG}'`);
  fora[0].n === 0 ? ok("outra empresa não vê a configuração") : mau("outra empresa vê a configuração");
  const [rr] = await como("admin", `SELECT public.rpc_cfg_gravar_ficha('${ORG}', 'local', ${j(CAMPOS_LOCAL)}) AS n`);
  rr.n === CAMPOS_LOCAL.length ? ok("gravar outra vez substitui (não duplica)") : mau("duplicou");
}
await deveFalhar("comercial sem settings.update não configura", "comercial",
  `SELECT public.rpc_cfg_gravar_ficha('${ORG}', 'local', '[]')`, /permissão/);
await deveFalhar("admin de outra empresa não configura esta", "fora",
  `SELECT public.rpc_cfg_gravar_ficha('${ORG}', 'local', '[]')`, /permissão/);
await deveFalhar("chave reservada (piso)", "admin",
  `SELECT public.rpc_cfg_gravar_ficha('${ORG}', 'local', ${j([{ chave: "piso", tipo: "texto", rotulo: "Piso" }])})`, /em uso/);
await deveFalhar("coluna de sistema usada como campo da empresa", "admin",
  `SELECT public.rpc_cfg_gravar_ficha('${ORG}', 'local', ${j([{ chave: "acesso", tipo: "texto", rotulo: "A" }])})`, /em uso/);
await deveFalhar("campo de sistema que não existe", "admin",
  `SELECT public.rpc_cfg_gravar_ficha('${ORG}', 'local', ${j([{ chave: "inventado", sistema: true }])})`, /não é um campo de sistema/);
await deveFalhar("escolha sem opções", "admin",
  `SELECT public.rpc_cfg_gravar_ficha('${ORG}', 'local', ${j([{ chave: "x", tipo: "escolha", rotulo: "X" }])})`, /opções/);
await deveFalhar("mínimo maior que o máximo", "admin",
  `SELECT public.rpc_cfg_gravar_ficha('${ORG}', 'local', ${j([{ chave: "x", tipo: "numero", rotulo: "X", minimo: 5, maximo: 1 }])})`, /mínimo/);
await deveFalhar("condição sobre campo inexistente", "admin",
  `SELECT public.rpc_cfg_gravar_ficha('${ORG}', 'local', ${j([{ chave: "x", tipo: "texto", rotulo: "X", condicao: { campo: "nada", valores: ["a"] } }])})`, /Condição/);
await deveFalhar("chave repetida", "admin",
  `SELECT public.rpc_cfg_gravar_ficha('${ORG}', 'local', ${j([{ chave: "x", tipo: "texto", rotulo: "X" }, { chave: "x", tipo: "texto", rotulo: "Y" }])})`, /repetida/);
await deveFalhar("ficha desconhecida", "admin",
  `SELECT public.rpc_cfg_gravar_ficha('${ORG}', 'obra', '[]')`, /desconhecida/);
{
  const [r] = await como("admin", `SELECT public.rpc_cfg_gravar_ficha('${ORG}', 'local', ${j(CAMPOS_LOCAL)}) AS n`);
  r.n === CAMPOS_LOCAL.length ? ok("um erro não deixa a configuração a meio (transação)") : mau("configuração a meio");
}

console.log("\nNomes");
{
  await como("admin", `SELECT public.rpc_cfg_gravar_empresa('${ORG}', 'comercial', ${j({ cliente: { singular: "Loja", plural: "Lojas" }, obra: { singular: "Intervenção", plural: "Intervenções" } })})`);
  const [r] = await como("comercial", `SELECT termos->'cliente'->>'plural' AS p, modelo_setor FROM public.cfg_empresa WHERE organization_id = '${ORG}'`);
  r?.p === "Lojas" && r.modelo_setor === "comercial" ? ok("grava e lê os nomes") : mau("nomes não gravados");
}
await deveFalhar("nome desconhecido", "admin",
  `SELECT public.rpc_cfg_gravar_empresa('${ORG}', NULL, ${j({ fatura: { singular: "a", plural: "b" } })})`, /desconhecido/);
await deveFalhar("nome sem plural", "admin",
  `SELECT public.rpc_cfg_gravar_empresa('${ORG}', NULL, ${j({ cliente: { singular: "a" } })})`, /plural/);
await deveFalhar("comercial não muda os nomes", "comercial",
  `SELECT public.rpc_cfg_gravar_empresa('${ORG}', NULL, '{}')`, /permissão/);

console.log("\nFicha do local — valores");
// Um valor de um campo que já não existe tem de sobreviver.
await db.exec(`INSERT INTO public.anew_address_extra (address_id, organization_id, valores)
  VALUES ('${ADDR}', '${ORG}', '{"campo_antigo": "fica"}')`);
{
  const [r] = await como("comercial", `SELECT public.rpc_local_extra_gravar('${ENT}', '${ADDR}', '${ORG}', ${j({
    horario_acesso: "tarde", credenciacao: false, entidade_credencia: "PSP", n_cacifos: "3",
    area_loja: "95,5", tipo_elevador: "carga", data_vistoria: "2026-10-20", inventado: "x" })}) AS v`);
  const v = r.v;
  v.horario_acesso === "tarde" ? ok("escolha válida gravada") : mau("escolha");
  v.n_cacifos === 3 && v.area_loja === 95.5 ? ok("números como texto (com vírgula) passam a número") : mau(`números: ${JSON.stringify(v)}`);
  !("entidade_credencia" in v) ? ok("condição sobre campo da empresa: sai quando não se cumpre") : mau("condição não aplicada");
  v.tipo_elevador === "carga" ? ok("condição sobre campo de sistema (tem_elevador = sim) cumprida") : mau("condição de sistema");
  !("inventado" in v) ? ok("chaves desconhecidas são ignoradas") : mau("guardou chave desconhecida");
  v.campo_antigo === "fica" ? ok("valores de campos apagados/escondidos mantêm-se") : mau("perdeu valor antigo");
  const [l] = await como("comercial", `SELECT public.rpc_local_extra_ler('${ENT}', '${ORG}') AS m`);
  l.m[ADDR]?.horario_acesso === "tarde" ? ok("lê os valores por morada") : mau("leitura");
}
{
  await db.exec(`UPDATE public.anew_address_building SET tem_elevador = false WHERE address_id = '${ADDR}'`);
  const [r] = await como("comercial", `SELECT public.rpc_local_extra_gravar('${ENT}', '${ADDR}', '${ORG}', ${j({ tipo_elevador: "carga" })}) AS v`);
  !("tipo_elevador" in r.v) ? ok("sem elevador, o tipo de elevador sai") : mau("tipo_elevador ficou");
}
await deveFalhar("opção que não existe", "comercial",
  `SELECT public.rpc_local_extra_gravar('${ENT}', '${ADDR}', '${ORG}', ${j({ horario_acesso: "noite" })})`, /Horário de acesso: opção inválida/);
await deveFalhar("número fora dos limites", "comercial",
  `SELECT public.rpc_local_extra_gravar('${ENT}', '${ADDR}', '${ORG}', ${j({ n_cacifos: 21 })})`, /Cacifos: tem de estar entre/);
await deveFalhar("casas decimais a mais", "comercial",
  `SELECT public.rpc_local_extra_gravar('${ENT}', '${ADDR}', '${ORG}', ${j({ n_cacifos: "2,5" })})`, /casa/);
await deveFalhar("data impossível", "comercial",
  `SELECT public.rpc_local_extra_gravar('${ENT}', '${ADDR}', '${ORG}', ${j({ data_vistoria: "2026-02-31" })})`, /data inválida/);
await deveFalhar("sim/não com texto", "comercial",
  `SELECT public.rpc_local_extra_gravar('${ENT}', '${ADDR}', '${ORG}', ${j({ credenciacao: "sim" })})`, /sim ou não/);
await deveFalhar("outra empresa não grava nesta morada", "fora",
  `SELECT public.rpc_local_extra_gravar('${ENT}', '${ADDR}', '${ORG}', '{}')`, /permissão/);
await deveFalhar("tabela de valores não se lê diretamente", "comercial",
  `SELECT * FROM public.anew_address_extra`, /permission denied/);
{
  await como("comercial", `SELECT public.rpc_local_extra_gravar('${ENT}', '${ADDR}', '${ORG}', ${j({ horario_acesso: "" })})`);
  await db.exec(`DELETE FROM public.anew_address_extra WHERE true`);
  await como("comercial", `SELECT public.rpc_local_extra_gravar('${ENT}', '${ADDR}', '${ORG}', '{}')`);
  const [r] = await db.query(`SELECT count(*)::int AS n FROM public.anew_address_extra`).then((x) => x.rows);
  r.n === 0 ? ok("tudo vazio = sem linha") : mau("ficou linha vazia");
}

console.log("\nDiagnóstico, cliente e lead");
await como("admin", `SELECT public.rpc_cfg_gravar_ficha('${ORG}', 'diagnostico', ${j([
  { chave: "diag_mobilada", sistema: true, rotulo: "Espaço ocupado" },
  { chave: "tem_amostras", tipo: "sim_nao", rotulo: "Amostras" },
  { chave: "so_cozinha", tipo: "texto", rotulo: "Só cozinha", condicao: { campo: "diag_tipo_area", valores: ["cozinha"] } },
])})`);
{
  const [r] = await como("comercial", `SELECT public.rpc_diag_extra_gravar('${NEED}', ${j({ tem_amostras: true, so_cozinha: "x" })}) AS v`);
  r.v.tem_amostras === true && !("so_cozinha" in r.v) ? ok("diagnóstico: grava e aplica a condição sobre diag_tipo_area") : mau(`diag: ${JSON.stringify(r.v)}`);
}
await deveFalhar("diagnóstico de outra empresa", "fora",
  `SELECT public.rpc_diag_extra_gravar('${NEED}', '{}')`, /permissão/);
await deveFalhar("campo de sistema do diagnóstico com condição", "admin",
  `SELECT public.rpc_cfg_gravar_ficha('${ORG}', 'diagnostico', ${j([{ chave: "diag_gas", sistema: true, condicao: { campo: "diag_tipo_area", valores: ["cozinha"] } }])})`, /regras/);

await como("admin", `SELECT public.rpc_cfg_gravar_ficha('${ORG}', 'cliente', ${j([
  { chave: "n_contribuinte_interno", tipo: "texto", rotulo: "Código interno" }])})`);
await deveFalhar("cliente: 'vip' é reservado", "admin",
  `SELECT public.rpc_cfg_gravar_ficha('${ORG}', 'cliente', ${j([{ chave: "vip", tipo: "sim_nao", rotulo: "VIP" }])})`, /em uso/);
{
  const [r] = await como("comercial", `SELECT public.rpc_cliente_extra_gravar('${CLI}', ${j({ n_contribuinte_interno: " AB12 " })}) AS v`);
  r.v.vip === true && r.v.n_contribuinte_interno === "AB12" ? ok("cliente: grava e mantém o vip") : mau(`cliente: ${JSON.stringify(r.v)}`);
}
await como("admin", `SELECT public.rpc_cfg_gravar_ficha('${ORG}', 'lead', ${j([
  { chave: "orcamento_previsto", tipo: "numero", rotulo: "Orçamento previsto", minimo: 0 }])})`);
{
  const [r] = await como("comercial", `SELECT public.rpc_lead_extra_gravar('${LEAD}', ${j({ orcamento_previsto: 15000 })}) AS v`);
  r.v.orcamento_previsto === 15000 && r.v.origem_form === "x" ? ok("lead: grava e mantém os campos do formulário") : mau(`lead: ${JSON.stringify(r.v)}`);
}
await deveFalhar("lead de outra empresa", "fora",
  `SELECT public.rpc_lead_extra_gravar('${LEAD}', '{}')`, /permissão/);

console.log(falhas.length ? `\n✗ ${falhas.length} falha(s)` : "\n✓ Tudo certo");
process.exit(falhas.length ? 1 : 0);
