/**
 * O despacho da Edge Function `convite-admissao`, SEM Deno e SEM rede: tudo o
 * que vem de fora (clientes Supabase, limites, registo de erros, ambiente)
 * entra por `DepsConvite`. `index.ts` liga-o ao mundo real; os testes ligam-no
 * a simulados. Ver o cabecalho de `index.ts` para o desenho.
 *
 * Tres niveis de confianca:
 *  - "criar": RH autenticado. O JWT valida-se aqui, o actor DERIVA-SE dele
 *    (nunca do corpo), a organizacao da pessoa tem de ser a activa e o RH tem
 *    de ter permissao nela. So entao se chama a RPC com a chave de servico:
 *    o token e o hash nascem e morrem aqui (a RPC e service_role para que um RH
 *    nao possa escolher o proprio token chamando-a directamente). A RPC volta a
 *    validar tudo por dentro: esta funcao nao e a unica fronteira.
 *  - "cancelar" e "prolongar": RH autenticado, sem segredos. Correm com o JWT
 *    REENCAMINHADO (cliente com o Authorization do pedido): a RPC usa auth.uid().
 *  - "estado", "rascunho", "submeter" e anexos: sem sessao, so com o token.
 *    Limites por IP E por token_hash (o IP nao e fiavel: x-forwarded-for forja-se).
 *  - V3a: "otp_pedir", "otp_verificar", "sair", "ler" e "sensiveis" (ver `accoesPortal.ts`;
 *    so estes nomes: os das RPCs, como sessao_terminar, dao accao_desconhecida) com o
 *    mesmo limite por IP e token_hash; e "reenviar" (RH, ver `reenviar.ts`): JWT validado
 *    aqui, actor derivado dele, RPC so service_role, e-mail por correio directo.
 *
 * NUNCA sai nem se regista `error.details` nem `error.message` de um erro do
 * Postgres: a mensagem de um CHECK violado traz a linha inteira (token_hash,
 * email, rascunho). Para o Sentry vai so `erroSemDados` (tipo e SQLSTATE); para
 * o cliente, codigos do catalogo e mensagens fixas.
 */
import { detectClientIp } from "../_shared/clientIp.ts";
import { erroSemDados } from "../_shared/erroSemDados.ts";
import { orgScoped, type OrgScopedQueryBuilder } from "../_shared/orgScopedQuery.ts";
import { getClientIp, type RateLimitOptions, type RateLimitResult } from "../_shared/rateLimit.ts";
import { eAccaoAnexo, tratarAccaoAnexo, type ClienteAnexos } from "./accoesAnexos.ts";
import {
  eAccaoPortal,
  tectoPortalPorHora,
  tratarAccaoPortal,
  type AccaoPortal,
} from "./accoesPortal.ts";
import type { PedidoCorreio, ResultadoCorreio } from "./correio.ts";
import { CODIGOS_RECUSA_SUBMISSAO, eCodigoPublico, mapearErroRpc, statusDoCodigo } from "./erros.ts";
import {
  LIMITE_CRIAR_POR_PESSOA,
  LIMITE_CRIAR_POR_UTILIZADOR,
  UUID,
  formatarValidade,
  htmlConvite,
  lerResultadoCriar,
  linkDoConvite,
  linkParaOCriador,
  origemPermitida,
  textoConvite,
  resolverBaseUrl,
  sanearEmailErro,
  validarPedidoCriar,
} from "./pedidoCriar.ts";
import { prepararRascunho } from "./rascunho.ts";
import { reenviarConvite } from "./reenviar.ts";
import { CABECALHO_SESSAO, lerSessaoDoPedido } from "./sessao.ts";

/** Tecto por hora das accoes do RH (cancelar, prolongar), por utilizador. */
const LIMITE_ACCOES_RH_POR_UTILIZADOR = 60;
const MOTIVO_MAX = 2000;
const DIAS_MIN = 1;
const DIAS_MAX = 90;
/** Quantas vezes se tenta um token novo quando a base diz token_repetido (uma repeticao). */
const TENTATIVAS_TOKEN = 2;

// A LISTA BRANCA DO CONVITE (submeter) -- plana. E EXACTAMENTE a lista de
// `src/lib/hr/conviteAdmissaoPayload.ts` e a que `rpc_hr_convite_admissao_submeter`
// le do jsonb (amarradas por `src/lib/hr/__tests__/conviteAdmissaoContrato.test.ts`).
// Uma lista branca explicita -- NUNCA `jsonb_populate_record` nem SQL dinamico.
const CAMPOS_CONVITE = [
  "carta_conducao_categorias",
  "carta_conducao_numero",
  "carta_conducao_validade",
  "conjuge_situacao_profissional",
  "conta_banco",
  "conta_swift",
  "conta_titular",
  "data_nascimento",
  "dependentes",
  "dependentes_deficientes",
  "email_pessoal",
  "estado_civil",
  "genero",
  "habilitacao_academica",
  "habilitacao_data_conclusao",
  // O numero da conta viaja como `iban`: e a chave que a RPC le ao submeter.
  "iban",
  "morada_codigo_postal",
  "morada_distrito",
  "morada_linha1",
  "morada_linha2",
  "morada_localidade",
  "morada_pais",
  "nacionalidade",
  "naturalidade_concelho",
  "naturalidade_freguesia",
  "naturalidade_pais",
  "nif",
  "niss",
  "numero_documento",
  "tamanho_baixo",
  "tamanho_baixo_detalhe",
  "tamanho_calcado",
  "tamanho_calcado_detalhe",
  "tamanho_cima",
  "tamanho_cima_detalhe",
  "telefone_pessoal",
  "tipo_documento",
  "validade_documento",
] as const;

// -- tipos ----------------------------------------------------------------------

type ResultadoRpc = PromiseLike<{ data: unknown; error: unknown }>;

/** O minimo de um cliente Supabase de que esta funcao precisa. */
export interface ClienteConvite {
  auth: {
    getUser(jwt: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }>;
  };
  rpc(fn: string, args: Record<string, unknown>): ResultadoRpc;
  // deno-lint-ignore no-explicit-any
  from(tabela: string): { select(colunas: string): any };
  functions: {
    invoke(
      nome: string,
      init: { headers: Record<string, string>; body: Record<string, unknown> },
    ): PromiseLike<{ data: unknown; error: { message?: string; context?: Response } | null }>;
  };
}

export interface DepsConvite {
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  /** Reserva do URL base quando a origem do pedido nao e permitida. */
  appBaseUrl?: string | null;
  allowedOrigin?: string | null;
  /**
   * Com `authorization`, o cliente reencaminha o JWT do chamador (chave publicavel).
   * Com `headers`, acrescenta-os a CADA pedido do cliente (a `estado` manda assim o
   * `x-portal-sessao`, que o PostgREST expoe a RPC em `request.headers`).
   */
  criarCliente(url: string, key: string, opcoes?: { authorization?: string; headers?: Record<string, string> }): ClienteConvite;
  /** Pepper do HMAC do OTP (segredo `PORTAL_OTP_PEPPER`). Sem ele (ou curto) o OTP falha FECHADO. */
  otpPepper?: string | null;
  /** Correio directo pelo SMTP da organizacao do processo, SEM `send-email` nem `email_logs`. */
  enviarCorreio?: (pedido: PedidoCorreio) => Promise<ResultadoCorreio>;
  /**
   * So a V3b liga isto. Ate la as accoes ANTIGAS de escrita (rascunho, submeter e os anexos)
   * respondem 410 portal_em_atualizacao sem tocar na base: o link sozinho nao escreve.
   */
  portalAntigoAtivo?: boolean;
  verificarLimite(svc: ClienteConvite, opcoes: RateLimitOptions): Promise<RateLimitResult>;
  registarTentativa(svc: ClienteConvite, bucket: string, identifier: string): Promise<void>;
  /** Recebe SO erros ja sem dados (ver `erroSemDados`). */
  registarErro(erro: Error): void;
  corsHeaders(req: Request): Record<string, string>;
}

type Responder = (corpo: Record<string, unknown>, status?: number) => Response;

interface Contexto {
  deps: DepsConvite;
  req: Request;
  responder: Responder;
  /** Regista um erro de uma RPC/cliente: so tipo e SQLSTATE, nunca message nem details. */
  reportar(origem: string, erro: unknown): void;
}

// -- utilitarios ----------------------------------------------------------------

async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 32 bytes aleatorios em base64url e o SHA-256 (hex de 64) desse texto. */
async function gerarTokenEHash(): Promise<{ token: string; hash: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { token, hash: await sha256Hex(token) };
}

function soCampos(origem: Record<string, unknown>, campos: readonly string[]): Record<string, unknown> {
  const resultado: Record<string, unknown> = {};
  for (const campo of campos) {
    if (campo in origem) resultado[campo] = origem[campo];
  }
  return resultado;
}

function eObjecto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

/** So os campos de texto pedidos, e so se forem texto: nada mais da resposta de uma RPC sai. */
function soTexto(origem: unknown, campos: readonly string[]): Record<string, string> {
  const saida: Record<string, string> = {};
  if (!eObjecto(origem)) return saida;
  for (const c of campos) {
    const v = origem[c];
    if (typeof v === "string") saida[c] = v;
  }
  return saida;
}

function bearer(req: Request): string | null {
  const cabecalho = req.headers.get("Authorization");
  if (!cabecalho) return null;
  const jwt = cabecalho.replace(/^Bearer\s+/i, "").trim();
  return jwt === "" ? null : jwt;
}

/** Valida o JWT do RH e devolve o id do utilizador (auth.users.id), ou `null`. */
async function utilizadorDoJwt(svc: ClienteConvite, jwt: string): Promise<string | null> {
  const { data, error } = await svc.auth.getUser(jwt);
  return error || !data?.user ? null : data.user.id;
}

async function dentroDoLimite(ctx: Contexto, svc: ClienteConvite, limites: RateLimitOptions[]): Promise<boolean> {
  for (const l of limites) {
    const r = await ctx.deps.verificarLimite(svc, l);
    if (!r.allowed) return false;
  }
  for (const l of limites) await ctx.deps.registarTentativa(svc, l.bucket, l.identifier);
  return true;
}

/** A consulta a uma tabela multi-tenant com o cliente de servico leva SEMPRE o filtro de organizacao. */
// deno-lint-ignore no-explicit-any
function selectDaOrg(svc: ClienteConvite, tabela: string, colunas: string, org: string): any {
  return orgScoped(
    { from: (t: string) => svc.from(t).select(colunas) as unknown as OrgScopedQueryBuilder },
    tabela,
    org,
  );
}

// -- criar ----------------------------------------------------------------------

type ProcessoCriado = { ok: true; token: string; conviteId: string | null } | { ok: false; codigo: string };

/** Gera token e hash e chama a RPC; com `token_repetido` gera OUTRO e tenta uma vez mais. */
async function abrirProcesso(
  ctx: Contexto,
  svc: ClienteConvite,
  args: { pessoaId: string; email: string; actor: string },
): Promise<ProcessoCriado> {
  let codigo = "erro_inesperado";
  for (let tentativa = 0; tentativa < TENTATIVAS_TOKEN; tentativa++) {
    const { token, hash } = await gerarTokenEHash();
    const { data, error } = await svc.rpc("rpc_hr_convite_admissao_criar", {
      p_pessoa_id: args.pessoaId,
      p_token_hash: hash,
      // A validade decide-se na base (portal_validade_dias); a RPC ignora este valor.
      p_valid_until: null,
      p_email: args.email,
      p_actor: args.actor,
    });
    if (!error) return { ok: true, token, conviteId: lerResultadoCriar(data).conviteId };
    codigo = mapearErroRpc(error as { code?: string; message?: string }).codigo;
    // Uma recusa de negocio e resposta legitima; so o inesperado, um token que a
    // propria Edge gerou mal (token_invalido) ou repetido duas vezes e defeito.
    if (codigo === "token_repetido" && tentativa + 1 < TENTATIVAS_TOKEN) continue;
    if (["erro_inesperado", "token_invalido", "token_repetido"].includes(codigo)) ctx.reportar("criar", error);
    return { ok: false, codigo };
  }
  return { ok: false, codigo };
}

/** A validade que a base calculou, lida com o JWT do RH (o resumo nao e executavel por service_role). */
async function validadeDoResumo(ctx: Contexto, authorization: string, pessoaId: string, conviteId: string | null) {
  try {
    const user = ctx.deps.criarCliente(ctx.deps.supabaseUrl, ctx.deps.anonKey, { authorization });
    const { data, error } = await user.rpc("rpc_hr_convite_admissao_resumo", { p_pessoa_id: pessoaId });
    if (error) {
      ctx.reportar("criar resumo", error);
      return null;
    }
    const { valid_until: validade, convite_id: id } = soTexto(data, ["valid_until", "convite_id"]);
    if (conviteId !== null && id !== conviteId) return null;
    return validade ?? null;
  } catch (e) {
    ctx.reportar("criar resumo", e);
    return null;
  }
}

/**
 * Guarda o token cifrado no Vault (`rpc_hr_convite_link_guardar`, so service_role), para o
 * RH poder REENVIAR o mesmo link. A RPC confirma que SHA-256(token) e o token_hash do
 * processo. Melhor-esforco: se falhar o convite existe e o e-mail sai (so o reenvio fica
 * por fazer, e `reenviar` di-lo com link_indisponivel); o defeito reporta-se sem dados.
 */
async function guardarLink(ctx: Contexto, svc: ClienteConvite, conviteId: string | null, token: string) {
  if (!conviteId) return;
  try {
    const { error } = await svc.rpc("rpc_hr_convite_link_guardar", { p_convite_id: conviteId, p_token: token });
    if (error) ctx.reportar("criar link_guardar", error);
  } catch (e) {
    ctx.reportar("criar link_guardar", e);
  }
}

/**
 * O e-mail do convite sai por correio DIRECTO (SMTP da organizacao do processo), NUNCA pela
 * send-email, que gravaria o link em email_logs. So o link e a validade que o resumo devolveu,
 * sem dados pessoais. Melhor-esforco: se falhar, o RH ainda tem o link (uma so vez). O erro
 * sai so como codigo.
 */
async function enviarEmail(
  ctx: Contexto,
  args: { email: string; organizationId: string; baseUrl: string; token: string; validade: string | null },
): Promise<{ enviado: boolean; erro: string | null }> {
  const enviar = ctx.deps.enviarCorreio;
  if (!enviar) {
    ctx.deps.registarErro(new Error("convite-admissao criar: correio nao configurado"));
    return { enviado: false, erro: "smtp_nao_configurado" };
  }
  const link = linkDoConvite(args.baseUrl, args.token);
  const prazo = formatarValidade(args.validade);
  let resultado: ResultadoCorreio;
  try {
    resultado = await enviar({
      organizationId: args.organizationId,
      para: args.email,
      assunto: "Convite de admissão",
      html: htmlConvite(link, prazo),
      texto: textoConvite(link, prazo),
    });
  } catch (e) {
    ctx.reportar("criar email", e);
    return { enviado: false, erro: "smtp_falhou" };
  }
  if (resultado.enviado) return { enviado: true, erro: null };
  ctx.deps.registarErro(new Error(`convite-admissao criar: correio ${resultado.erroCodigo}`));
  return { enviado: false, erro: sanearEmailErro(resultado.erroCodigo, args.token) };
}

async function registarEnvio(ctx: Contexto, svc: ClienteConvite, conviteId: string | null, envio: { enviado: boolean; erro: string | null }) {
  // Sem id de convite nao ha nada a registar: a RPC faria um UPDATE a vazio.
  if (!conviteId) {
    ctx.deps.registarErro(new Error("convite-admissao: rpc_hr_convite_admissao_criar sem id"));
    return;
  }
  try {
    const { data, error } = await svc.rpc("rpc_hr_convite_admissao_registar_envio", {
      p_convite_id: conviteId,
      p_enviado: envio.enviado,
      p_erro: envio.erro,
    });
    if (error) ctx.reportar("criar registar_envio", error);
    else if (data !== true) ctx.deps.registarErro(new Error("convite-admissao: registar_envio nao encontrou o convite"));
  } catch (e) {
    ctx.reportar("criar registar_envio", e);
  }
}

async function tratarCriar(ctx: Contexto, payload: unknown): Promise<Response> {
  const { deps, req, responder } = ctx;
  const jwt = bearer(req);
  if (!jwt) return responder({ error: "sem_sessao" }, 401);

  const pedido = validarPedidoCriar(payload);
  if (!pedido) return responder({ error: "pedido_invalido" }, 400);
  const { pessoaId, organizationId, email } = pedido;

  // O URL base e obrigatorio ANTES de criar seja o que for: sem ele o link (que so
  // se mostra uma vez) sairia relativo e o convite ficava perdido.
  const baseUrl = resolverBaseUrl(
    origemPermitida(req.headers.get("origin"), deps.allowedOrigin) ?? deps.appBaseUrl,
  );
  if (!baseUrl) {
    deps.registarErro(new Error("convite-admissao: sem origem permitida e APP_BASE_URL em falta ou invalido"));
    return responder({ error: "erro_inesperado" }, 500);
  }

  const svc = deps.criarCliente(deps.supabaseUrl, deps.serviceKey);
  const actor = await utilizadorDoJwt(svc, jwt);
  if (!actor) return responder({ error: "sem_sessao" }, 401);

  // A organizacao activa e so um seletor: a pessoa tem de ser DELA (filtro
  // organization_id) e o RH tem de ter a permissao NELA. Qualquer recusa da o
  // mesmo nao_encontrado, para nao revelar fichas de outras organizacoes.
  const { data: pessoa, error: erroPessoa } = await selectDaOrg(svc, "pessoas", "organization_id, deleted_at", organizationId)
    .eq("id", pessoaId)
    .maybeSingle();
  if (erroPessoa) {
    ctx.reportar("criar pessoa", erroPessoa);
    return responder({ error: "erro_inesperado" }, 500);
  }
  if (!pessoa || pessoa.deleted_at) return responder({ error: "nao_encontrado" }, statusDoCodigo("nao_encontrado"));

  const { data: pode, error: erroPermissao } = await svc.rpc("has_anew_permission_in_org", {
    _auth_uid: actor,
    _permission_code: "hr.pessoas.convite.enviar",
    _organization_id: organizationId,
  });
  if (erroPermissao) {
    ctx.reportar("criar permissao", erroPermissao);
    return responder({ error: "erro_inesperado" }, 500);
  }
  if (!pode) return responder({ error: "nao_encontrado" }, statusDoCodigo("nao_encontrado"));

  // Rate limit so depois da permissao: quem nao pode nao enche o contador.
  const dentro = await dentroDoLimite(ctx, svc, [
    { bucket: "convite-admissao-criar", identifier: actor, maxAttempts: LIMITE_CRIAR_POR_UTILIZADOR, windowMinutes: 60 },
    { bucket: "convite-admissao-criar-pessoa", identifier: pessoaId, maxAttempts: LIMITE_CRIAR_POR_PESSOA, windowMinutes: 60 },
  ]);
  if (!dentro) return responder({ error: "demasiadas_tentativas" }, 429);

  // O actor e o id de auth.users derivado do JWT, nunca o do corpo do pedido.
  const processo = await abrirProcesso(ctx, svc, { pessoaId, email, actor });
  if (!processo.ok) return responder({ error: processo.codigo }, statusDoCodigo(processo.codigo));
  const { token, conviteId } = processo;
  await guardarLink(ctx, svc, conviteId, token);

  const validade = await validadeDoResumo(ctx, `Bearer ${jwt}`, pessoaId, conviteId);
  const envio = await enviarEmail(ctx, { email, organizationId, baseUrl, token, validade });
  await registarEnvio(ctx, svc, conviteId, envio);

  // O link so sai quando o e-mail NAO foi: e a unica vez que o RH o pode ver.
  // Nunca e gravado, nunca entra em log nem no Sentry. O hash nunca sai.
  const link = linkParaOCriador({ emailEnviado: envio.enviado, baseUrl, token });
  return responder({
    ok: true,
    convite_id: conviteId,
    // Sem heranca de rascunho desde a V2: o campo fica so para o hook que o le.
    rascunho_herdado: false,
    link_retido: !envio.enviado && link === null,
    email_enviado: envio.enviado,
    valid_until: validade,
    email_erro: envio.erro,
    link,
  });
}

// -- cancelar e prolongar -------------------------------------------------------

function pedidoCancelar(p: Record<string, unknown>): { args: Record<string, unknown> } | { erro: string } {
  if (typeof p.convite_id !== "string" || !UUID.test(p.convite_id)) return { erro: "pedido_invalido" };
  if (typeof p.organization_id !== "string" || !UUID.test(p.organization_id)) return { erro: "pedido_invalido" };
  const motivo = typeof p.motivo === "string" ? p.motivo.trim() : "";
  if (motivo === "" || motivo.length > MOTIVO_MAX) return { erro: "pedido_invalido" };
  return { args: { p_convite_id: p.convite_id, p_organization_id: p.organization_id, p_motivo: motivo } };
}

function pedidoProlongar(p: Record<string, unknown>): { args: Record<string, unknown> } | { erro: string } {
  if (typeof p.convite_id !== "string" || !UUID.test(p.convite_id)) return { erro: "pedido_invalido" };
  if (typeof p.organization_id !== "string" || !UUID.test(p.organization_id)) return { erro: "pedido_invalido" };
  const dias = p.dias;
  if (typeof dias !== "number" || !Number.isInteger(dias) || dias < DIAS_MIN || dias > DIAS_MAX) {
    return { erro: "dias_invalidos" };
  }
  return { args: { p_convite_id: p.convite_id, p_organization_id: p.organization_id, p_dias: dias } };
}

/** O que cada accao do RH devolve ao ecra: so estes campos de texto, e nada mais. */
const CAMPOS_RESPOSTA_RH = {
  cancelar: ["convite_id", "estado", "estado_portal"],
  prolongar: ["convite_id", "valid_until", "estado", "estado_portal"],
} as const;

async function tratarAccaoRh(ctx: Contexto, accao: "cancelar" | "prolongar", payload: Record<string, unknown>) {
  const { deps, req, responder } = ctx;
  const jwt = bearer(req);
  if (!jwt) return responder({ error: "sem_sessao" }, 401);

  const svc = deps.criarCliente(deps.supabaseUrl, deps.serviceKey);
  const utilizador = await utilizadorDoJwt(svc, jwt);
  if (!utilizador) return responder({ error: "sem_sessao" }, 401);

  const pedido = accao === "cancelar" ? pedidoCancelar(payload) : pedidoProlongar(payload);
  if ("erro" in pedido) return responder({ error: pedido.erro }, statusDoCodigo(pedido.erro));

  const bucket = `convite-admissao-${accao}`;
  const dentro = await dentroDoLimite(ctx, svc, [
    { bucket, identifier: utilizador, maxAttempts: LIMITE_ACCOES_RH_POR_UTILIZADOR, windowMinutes: 60 },
  ]);
  if (!dentro) return responder({ error: "demasiadas_tentativas" }, 429);

  // O JWT do RH reencaminhado: a RPC usa auth.uid() e valida permissao e organizacao.
  const user = deps.criarCliente(deps.supabaseUrl, deps.anonKey, { authorization: `Bearer ${jwt}` });
  const { data, error } = await user.rpc(`rpc_hr_convite_admissao_${accao}`, pedido.args);
  if (error) {
    let { codigo } = mapearErroRpc(error as { code?: string; message?: string });
    // Cancelar desde `aprovada` exige hr.onboarding.approve (42501): "sem permissao"
    // e "nao existe" dao o MESMO erro, para nao revelar processos.
    if (codigo === "insufficient_privilege") codigo = "nao_encontrado";
    // limite_excedido (HRA41, 60 eventos por hora) e um erro esperado de utilizacao: nao se reporta.
    if (codigo === "erro_inesperado") ctx.reportar(accao, error);
    return responder({ error: codigo }, statusDoCodigo(codigo));
  }
  return responder({ ok: true, ...soTexto(data, CAMPOS_RESPOSTA_RH[accao]) });
}

// -- reenviar (RH) --------------------------------------------------------------

/** Por hora: por utilizador (como as outras accoes do RH) e por convite (o mesmo link nao se reenvia sem parar). */
const LIMITE_REENVIAR_POR_CONVITE = 5;

async function tratarReenviar(ctx: Contexto, payload: Record<string, unknown>): Promise<Response> {
  const { deps, req, responder } = ctx;
  const jwt = bearer(req);
  if (!jwt) return responder({ error: "sem_sessao" }, 401);

  const svc = deps.criarCliente(deps.supabaseUrl, deps.serviceKey);
  // O actor DERIVA-SE do JWT, nunca do corpo: a RPC e so service_role e confia nele.
  const actor = await utilizadorDoJwt(svc, jwt);
  if (!actor) return responder({ error: "sem_sessao" }, 401);

  const { convite_id: conviteId, organization_id: organizationId } = payload;
  if (typeof conviteId !== "string" || !UUID.test(conviteId) || typeof organizationId !== "string" || !UUID.test(organizationId)) {
    return responder({ error: "pedido_invalido" }, 400);
  }

  // Tudo o que e preciso para ENVIAR confirma-se ANTES da RPC: ela grava o evento
  // `reenviado`, e esse nao pode ficar sem e-mail por falta de URL ou de correio.
  const baseUrl = resolverBaseUrl(origemPermitida(req.headers.get("origin"), deps.allowedOrigin) ?? deps.appBaseUrl);
  if (!baseUrl || !deps.enviarCorreio) {
    deps.registarErro(new Error("convite-admissao reenviar: sem URL base ou sem correio configurado"));
    return responder({ error: "erro_inesperado" }, 500);
  }

  const dentro = await dentroDoLimite(ctx, svc, [
    { bucket: "convite-admissao-reenviar", identifier: actor, maxAttempts: LIMITE_ACCOES_RH_POR_UTILIZADOR, windowMinutes: 60 },
    { bucket: "convite-admissao-reenviar-convite", identifier: conviteId, maxAttempts: LIMITE_REENVIAR_POR_CONVITE, windowMinutes: 60 },
  ]);
  if (!dentro) return responder({ error: "demasiadas_tentativas" }, 429);

  const r = await reenviarConvite({
    svc,
    enviarCorreio: deps.enviarCorreio,
    conviteId,
    organizationId,
    actor,
    baseUrl,
    reportar: ctx.reportar,
    registarErro: deps.registarErro,
  });
  return responder(r.body, r.status);
}

// -- accoes publicas (so com o token) -------------------------------------------

function tectoPorHora(accao: string): number {
  if (eAccaoPortal(accao)) return tectoPortalPorHora(accao);
  if (accao === "estado") return 30;
  // O rascunho grava com "debounce" de 3s enquanto a pessoa escreve.
  if (accao === "rascunho") return 240;
  return eAccaoAnexo(accao) ? 30 : 10;
}

/** O minimo publico da `estado` (V3a): o que a base devolve e so isto; o resto nunca sai daqui. */
const CHAVES_ESTADO_PUBLICO = [
  "existe",
  "estado",
  "estado_portal",
  "valid_until",
  "primeiro_nome",
  "organizacao_nome",
  "bloqueado",
  "precisa_otp",
] as const;

/**
 * A `estado` leva a sessao ao PostgREST no cabecalho `x-portal-sessao` (o SHA-256 dela,
 * nunca o segredo) para a RPC calcular `precisa_otp`. Um cliente PROPRIO para este
 * pedido: o cabecalho vai em cada pedido do cliente, e o do rate limit nao o leva.
 */
async function clienteDoEstado(ctx: Contexto, svc: ClienteConvite, payload: Record<string, unknown>): Promise<ClienteConvite> {
  const sessao = lerSessaoDoPedido(ctx.req, payload);
  if (!sessao) return svc;
  const { deps } = ctx;
  return deps.criarCliente(deps.supabaseUrl, deps.serviceKey, { headers: { [CABECALHO_SESSAO]: await sha256Hex(sessao) } });
}

async function tratarEstado(ctx: Contexto, svc: ClienteConvite, tokenHash: string) {
  const { responder } = ctx;
  const { data, error } = await svc.rpc("rpc_hr_convite_admissao_estado", { p_token_hash: tokenHash });
  if (error) {
    ctx.reportar("estado", error);
    return responder({ error: "erro_inesperado" }, 500);
  }
  // A RPC devolve o motivo EM JSONB (nao por excepcao) para o incremento de
  // `attempts` sobreviver. So sai o motivo se for um codigo do catalogo.
  const motivo = eObjecto(data) ? data.erro : undefined;
  if (typeof motivo === "string") {
    if (eCodigoPublico(motivo)) return responder({ error: motivo }, statusDoCodigo(motivo));
    ctx.deps.registarErro(new Error("convite-admissao: motivo de estado fora do catalogo"));
    return responder({ error: "erro_inesperado" }, 500);
  }
  if (!eObjecto(data)) {
    ctx.deps.registarErro(new Error("convite-admissao estado: resposta da RPC invalida"));
    return responder({ error: "erro_inesperado" }, 500);
  }
  // Sem sessao: so o minimo publico. Os anexos e o rascunho vem da accao `ler`, com sessao.
  return responder({ ok: true, convite: soCampos(data, CHAVES_ESTADO_PUBLICO) });
}

async function tratarRascunho(ctx: Contexto, svc: ClienteConvite, tokenHash: string, payload: Record<string, unknown>) {
  const { responder } = ctx;
  // Retira niss, iban e conta_numero e recusa o resto fora da lista ANTES da RPC:
  // o CHECK da V2 recusaria o rascunho inteiro (23514).
  const preparado = prepararRascunho(payload.rascunho);
  if (!preparado.ok) return responder({ error: preparado.codigo }, statusDoCodigo(preparado.codigo));

  const { data, error } = await svc.rpc("rpc_hr_convite_admissao_rascunho", {
    p_token_hash: tokenHash,
    p_rascunho: preparado.rascunho,
  });
  if (error) {
    if (mapearErroRpc(error as { code?: string; message?: string }).codigo === "rascunho_demasiado_grande") {
      return responder({ error: "rascunho_demasiado_grande" }, 400);
    }
    ctx.reportar("rascunho", error);
    return responder({ error: "rascunho_nao_gravado" }, 400);
  }
  const motivo = eObjecto(data) ? data.erro : undefined;
  if (typeof motivo === "string") {
    const codigo = eCodigoPublico(motivo) ? motivo : "convite_invalido";
    return responder({ error: codigo }, statusDoCodigo(codigo));
  }
  return responder({ ok: true });
}

async function tratarSubmeter(
  ctx: Contexto,
  svc: ClienteConvite,
  tokenHash: string,
  payload: Record<string, unknown>,
  ip: string,
) {
  const { req, responder } = ctx;
  // Regista a ultima recusa no convite para o RH a ver. Melhor-esforco: nunca
  // muda a resposta. Os `pessoa_id` em conflito vao so para a base.
  const registarRecusa = async (codigo: string, campos: string[], conflitos: string[]) => {
    if (!(CODIGOS_RECUSA_SUBMISSAO as readonly string[]).includes(codigo)) return;
    try {
      const { error } = await svc.rpc("rpc_hr_convite_admissao_registar_recusa", {
        p_token_hash: tokenHash,
        p_codigo: codigo,
        p_campos: campos,
        p_conflito_pessoa_ids: conflitos,
      });
      if (error) ctx.reportar("registar_recusa", error);
    } catch (e) {
      ctx.reportar("registar_recusa", e);
    }
  };

  const dados = payload.dados;
  if (!dados || typeof dados !== "object") {
    await registarRecusa("pedido_invalido", [], []);
    return responder({ error: "pedido_invalido" }, 400);
  }
  const assinaturaNome = typeof payload.assinatura_nome === "string" ? payload.assinatura_nome.trim() : "";
  if (assinaturaNome === "") {
    await registarRecusa("assinatura_obrigatoria", [], []);
    return responder({ error: "assinatura_obrigatoria" }, 400);
  }

  const { error } = await svc.rpc("rpc_hr_convite_admissao_submeter", {
    p_token_hash: tokenHash,
    // PLANO, sem reagrupar por tabela: a RPC le `p_dados ->> '<chave>'` directamente.
    p_dados: soCampos(dados as Record<string, unknown>, CAMPOS_CONVITE),
    p_assinatura_nome: assinaturaNome,
    p_ip: ip,
    p_user_agent: req.headers.get("user-agent") ?? null,
  });
  if (error) {
    const mapeado = mapearErroRpc(error as { code?: string; message?: string; details?: string });
    if (mapeado.codigo === "erro_inesperado") ctx.reportar("submeter", error);
    await registarRecusa(mapeado.codigo, mapeado.campos ?? [], mapeado.conflitos ?? []);
    return responder(
      {
        error: mapeado.codigo,
        // Os campos em falta so saem em `admissao_incompleta`; os conflitos NUNCA.
        ...(mapeado.codigo === "admissao_incompleta" ? { campos: mapeado.campos ?? [] } : {}),
      },
      statusDoCodigo(mapeado.codigo),
    );
  }
  return responder({ ok: true, avisos: [] as string[] });
}

async function tratarPortal(
  ctx: Contexto,
  svc: ClienteConvite,
  accao: AccaoPortal,
  tokenHash: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const { deps, req, responder } = ctx;
  const r = await tratarAccaoPortal(accao, {
    svc,
    tokenHash,
    payload,
    req,
    otpPepper: deps.otpPepper,
    enviarCorreio: deps.enviarCorreio,
    reportar: ctx.reportar,
    registarErro: deps.registarErro,
  });
  return responder(r.body, r.status);
}

async function tratarPublica(ctx: Contexto, accao: string, payload: Record<string, unknown>): Promise<Response> {
  const { deps, req, responder } = ctx;
  const token = payload.token;
  if (typeof token !== "string" || token.length < 20 || token.length > 200) {
    return responder({ error: "convite_invalido" }, 401);
  }

  const svc = deps.criarCliente(deps.supabaseUrl, deps.serviceKey);
  const tokenHash = await sha256Hex(token);
  const ip = getClientIp(req);
  const maxAttempts = tectoPorHora(accao);
  // Por IP (como ate aqui) E por token_hash: o x-forwarded-for forja-se, o token
  // do convite nao. O identificador e o hash, nunca o token em claro.
  const dentro = await dentroDoLimite(ctx, svc, [
    { bucket: `convite-admissao-${accao}`, identifier: ip, maxAttempts, windowMinutes: 60 },
    { bucket: `convite-admissao-token-${accao}`, identifier: tokenHash, maxAttempts, windowMinutes: 60 },
  ]);
  if (!dentro) return responder({ error: "demasiadas_tentativas" }, 429);

  if (eAccaoAnexo(accao)) {
    const resultado = await tratarAccaoAnexo({
      accao,
      svc: svc as unknown as ClienteAnexos,
      tokenHash,
      payload,
      // So um IP valido ou null (a coluna e inet): nunca o "unknown" do rate limit.
      ip: detectClientIp(req),
      supabaseUrl: deps.supabaseUrl,
      registarErro: (e) => ctx.reportar("anexos", e),
    });
    return responder(resultado.body, resultado.status);
  }
  if (eAccaoPortal(accao)) return tratarPortal(ctx, svc, accao, tokenHash, payload);
  if (accao === "estado") return tratarEstado(ctx, await clienteDoEstado(ctx, svc, payload), tokenHash);
  if (accao === "rascunho") return tratarRascunho(ctx, svc, tokenHash, payload);
  return tratarSubmeter(ctx, svc, tokenHash, payload, ip);
}

// -- entrada --------------------------------------------------------------------

export function criarHandler(deps: DepsConvite): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const cors = deps.corsHeaders(req);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    const responder: Responder = (corpo, status = 200) =>
      new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", ...cors } });
    if (req.method !== "POST") return responder({ error: "method_not_allowed" }, 405);

    const ctx: Contexto = {
      deps,
      req,
      responder,
      reportar: (origem, erro) => deps.registarErro(erroSemDados(`convite-admissao ${origem}`, erro)),
    };

    try {
      const bruto = await req.json().catch(() => null);
      const payload = eObjecto(bruto) ? bruto : {};
      const accao = payload.action;

      if (accao === "criar") return await tratarCriar(ctx, payload);
      if (accao === "cancelar" || accao === "prolongar") return await tratarAccaoRh(ctx, accao, payload);
      if (accao === "reenviar") return await tratarReenviar(ctx, payload);
      // Ate a V3b, o link sozinho nao escreve: as accoes antigas de escrita nem chegam a base,
      // ao rate limit ou ao token. Corpo fixo, sem dados.
      if ((accao === "rascunho" || accao === "submeter" || eAccaoAnexo(accao)) && !deps.portalAntigoAtivo) {
        return responder({ error: "portal_em_atualizacao" }, 410);
      }
      if (accao !== "estado" && accao !== "submeter" && accao !== "rascunho" && !eAccaoAnexo(accao) && !eAccaoPortal(accao)) {
        return responder({ error: "accao_desconhecida" }, 400);
      }
      return await tratarPublica(ctx, accao as string, payload);
    } catch (e) {
      ctx.reportar("excepcao", e);
      return responder({ error: "erro_inesperado" }, 500);
    }
  };
}
