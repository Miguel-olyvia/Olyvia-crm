/**
 * O despacho da Edge Function `denuncia-publica` (canal de denuncias, Lei 93/2021), SEM Deno
 * e SEM rede: tudo o que vem de fora (cliente Supabase, relogio, registo de erros, segredos)
 * entra por `DepsDenuncia`. `index.ts` liga-o ao mundo real; os testes ligam-no a simulados.
 * Desenho: supabase/rascunhos/DESENHO-denuncias.md (seccao 4). Molde: `convite-admissao`.
 *
 * CONTRATO (um so para cliente, Edge e SQL; o SQL de 20261231994000 manda):
 *  - pedido: POST, JSON com `action` (`src/lib/denuncias/edgePublica.ts` envia `action`).
 *  - sucesso: 200 com `{ok: true, ...}`; falha: `{error: <codigo de CODIGOS_PUBLICOS>}`.
 *  - RPCs e argumentos: os de `NOVO-20261231994000_denuncias_rpcs.sql` (seccao C). O teste
 *    `contrato.vitest.test.ts` passa o corpo REAL do cliente por este handler.
 *
 * ACCOES (`verify_jwt = false`):
 *  - "canal":    {slug} -> {ativo, nome_org}. Nunca devolve o id da organizacao.
 *  - "criar":    formulario -> {codigo, pin}, UMA so vez. O PIN nasce aqui; a base so ve o HMAC.
 *                Anonima: o JWT e IGNORADO e nao existe identidade. Identificada: com JWT
 *                valido passa o id do Auth (a base resolve a conta e tira nome e email dela).
 *  - "entrar":   {slug, codigo, pin} -> {sessao} (30 min; a base guarda so o SHA-256).
 *                Codigo inexistente, PIN errado, bloqueada e limite: MESMA resposta e MESMO tempo.
 *  - "ler" / "responder": sessao no cabecalho `x-denuncia-sessao` (nunca no URL nem no corpo)
 *                -> {ok, denuncia: <vista do denunciante>}.
 *  - anexos: fase 2 (410).
 *
 * LIMITES: correm na base, atomicos, e FALHAM FECHADOS (erro do limitador = 503). Criar e
 * entrar contam DENTRO das proprias RPCs (reservar_codigo e entrar, com `p_chave_ip`); ver o
 * canal e ler/responder contam em `rpc_denuncia_publica_limitar`. A chave e o HMAC do IP
 * (pepper proprio, com o dia); sem IP so contam os baldes da organizacao/globais. Nunca se
 * conta pela sessao (ligava a contagem a uma denuncia).
 *
 * ANONIMATO: nao se guarda nem envia IP, user-agent, referer nem o corpo bruto. A organizacao
 * vem SEMPRE do slug validado pela base. Esta funcao so chama RPCs (nenhuma consulta directa
 * a tabelas), por isso nao ha consulta `service_role` a precisar do filtro `organization_id`
 * aqui: cada RPC o aplica por dentro.
 *
 * NUNCA sai nem se regista `error.message` nem `error.details` de um erro do Postgres: para o
 * Sentry vai so `erroSemDados` (tipo e SQLSTATE); para o cliente, codigos do catalogo.
 */
import { erroSemDados } from "../_shared/erroSemDados.ts";
import { gerarPin, gerarSessao, hmacIp, hmacPin, normalizarCodigo, normalizarPin, pepperValido, sha256Hex } from "./cripto.ts";
import { mapearErroRpc, statusDoCodigo, type CodigoPublico } from "./erros.ts";
import { ipDoPedido as ipPorOmissao } from "./ip.ts";
import {
  CODIGO_DEN,
  PIN_6,
  SESSAO_43,
  UUID,
  validarCriar,
  validarSlug,
  validarTextoResposta,
  vistaDoDenunciante,
} from "./pedidos.ts";

// -- constantes --------------------------------------------------------------------------

export const CORPO_MAX_BYTES = 64 * 1024;
export const CABECALHO_SESSAO = "x-denuncia-sessao";
export const SESSAO_MINUTOS = 30;
/** Tempo minimo de `entrar`, para que acerto e falha nao se distingam pelo relogio. */
export const ENTRAR_MINIMO_MS = 400;

const ANEXO_PREFIXO = "anexo_";
const CORS_FIXO = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": `authorization, x-client-info, apikey, content-type, ${CABECALHO_SESSAO}`,
  "Access-Control-Max-Age": "600",
};
const SEGURANCA = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

// -- tipos -------------------------------------------------------------------------------

type ResultadoRpc = PromiseLike<{ data: unknown; error: unknown }>;
type Objecto = Record<string, unknown>;

/** O minimo de um cliente Supabase (chave de servico) de que esta funcao precisa. */
export interface ClienteDenuncia {
  auth: { getUser(jwt: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }> };
  rpc(fn: string, args: Objecto): ResultadoRpc;
}

export interface DepsDenuncia {
  supabaseUrl: string;
  serviceKey: string;
  /** `DENUNCIAS_PIN_PEPPER` (>= 32 caracteres). Sem ele, criar e entrar falham FECHADOS (503). */
  pinPepper?: string | null;
  /** `DENUNCIAS_IP_PEPPER` (>= 32 caracteres). Sem ele, com IP conhecido, tudo falha FECHADO (503). */
  ipPepper?: string | null;
  criarCliente(url: string, chave: string): ClienteDenuncia;
  /** Recebe SO erros ja sem dados (ver `erroSemDados`). */
  registarErro(erro: Error): void;
  corsHeaders(req: Request): Record<string, string>;
  /** Por omissao `ipDoPedido` de ip.ts (nunca o primeiro valor de x-forwarded-for). */
  ipDoPedido?(req: Request): string | null;
  agora(): number;
  /** AAAA-MM-DD em UTC. */
  hoje(): string;
  dormir(ms: number): Promise<void>;
}

type Responder = (corpo: Objecto, status?: number) => Response;

interface Contexto {
  deps: DepsDenuncia;
  req: Request;
  svc: ClienteDenuncia;
  responder: Responder;
  reportar(origem: string, erro: unknown): void;
}

/** O balde de `rpc_denuncia_publica_limitar` (criar e entrar contam dentro das proprias RPCs). */
type Balde = "canal" | "sessao";

// -- utilitarios -------------------------------------------------------------------------

const eObjecto = (v: unknown): v is Objecto => v !== null && typeof v === "object" && !Array.isArray(v);

const falha = (ctx: Contexto, codigo: CodigoPublico): Response => ctx.responder({ error: codigo }, statusDoCodigo(codigo));

/** Um erro de uma RPC: so o codigo do catalogo sai; o inesperado regista-se sem dados. */
function falhaDeRpc(ctx: Contexto, origem: string, erro: unknown): Response {
  const { codigo } = mapearErroRpc(erro as { code?: string; message?: string });
  if (codigo === "erro_inesperado") ctx.reportar(origem, erro);
  return falha(ctx, codigo);
}

/**
 * A chave do IP para os limites da base: HMAC hex de 64 (pepper + dia), ou `null` sem IP
 * detectavel (a base conta so nos baldes da organizacao/globais). Com IP e sem pepper valido
 * falha FECHADA (`erro`).
 */
async function chaveIp(ctx: Contexto): Promise<{ chave: string | null } | { erro: Response }> {
  const ip = (ctx.deps.ipDoPedido ?? ipPorOmissao)(ctx.req);
  if (!ip) return { chave: null };
  if (!pepperValido(ctx.deps.ipPepper)) {
    ctx.deps.registarErro(new Error("denuncia-publica: DENUNCIAS_IP_PEPPER em falta ou curto"));
    return { erro: falha(ctx, "indisponivel") };
  }
  return { chave: await hmacIp(ctx.deps.ipPepper, ip, ctx.deps.hoje()) };
}

/**
 * Consome o limite de `balde` NA BASE (atomico). `null` se dentro; senao a resposta (429 ou
 * 503). Falha FECHADA: erro, excepcao ou resposta que nao seja um booleano = `indisponivel`.
 */
async function travar(ctx: Contexto, balde: Balde): Promise<Response | null> {
  const ip = await chaveIp(ctx);
  if ("erro" in ip) return ip.erro;
  try {
    const { data, error } = await ctx.svc.rpc("rpc_denuncia_publica_limitar", { p_balde: balde, p_chave_ip: ip.chave });
    if (error) {
      ctx.reportar("limitar", error);
      return falha(ctx, "indisponivel");
    }
    if (typeof data !== "boolean") {
      ctx.reportar("limitar", new TypeError("resposta"));
      return falha(ctx, "indisponivel");
    }
    return data ? null : falha(ctx, "demasiadas_tentativas");
  } catch (e) {
    ctx.reportar("limitar", e);
    return falha(ctx, "indisponivel");
  }
}

function bearer(req: Request): string | null {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  return jwt === "" ? null : jwt;
}

/** O id do utilizador do Auth no JWT, ou `null` (a chave publicavel, expirado ou falha do Auth). */
async function utilizadorDoJwt(ctx: Contexto): Promise<string | null> {
  const jwt = bearer(ctx.req);
  if (!jwt) return null;
  try {
    const { data, error } = await ctx.svc.auth.getUser(jwt);
    return error || !data?.user ? null : data.user.id;
  } catch (e) {
    ctx.reportar("jwt", e);
    return null;
  }
}

// -- canal -------------------------------------------------------------------------------

interface CanalLido { ativo: boolean; org: string | null; nome: string | null }

/** `rpc_denuncia_publica_canal` -> {ativo, organization_id, organizacao, responsaveis}. */
async function lerCanal(ctx: Contexto, slug: string): Promise<{ erro: Response } | CanalLido> {
  const { data, error } = await ctx.svc.rpc("rpc_denuncia_publica_canal", { p_slug: slug });
  if (error) return { erro: falhaDeRpc(ctx, "canal", error) };
  if (!eObjecto(data) || data.ativo !== true) return { ativo: false, org: null, nome: null };
  const org = typeof data.organization_id === "string" && UUID.test(data.organization_id) ? data.organization_id : null;
  if (!org) ctx.reportar("canal", new TypeError("resposta"));
  const nome = typeof data.organizacao === "string" ? data.organizacao : null;
  return { ativo: org !== null, org, nome };
}

async function tratarCanal(ctx: Contexto, payload: Objecto): Promise<Response> {
  const slug = validarSlug(payload.slug);
  if (!slug) return falha(ctx, "pedido_invalido");
  const recusa = await travar(ctx, "canal");
  if (recusa) return recusa;
  const canal = await lerCanal(ctx, slug);
  if ("erro" in canal) return canal.erro;
  if (!canal.ativo) return ctx.responder({ ok: true, ativo: false });
  return ctx.responder({ ok: true, ativo: true, nome_org: canal.nome });
}

// -- criar -------------------------------------------------------------------------------

/**
 * Reserva o codigo (a base gasta AQUI o limite de criar, por IP e por organizacao) para o
 * nonce `reservaHash`; so a `_criar` com o mesmo nonce o usa.
 */
async function reservarCodigo(ctx: Contexto, slug: string, chave: string | null, reservaHash: string): Promise<{ erro: Response } | { org: string; codigo: string }> {
  const { data, error } = await ctx.svc.rpc("rpc_denuncia_publica_reservar_codigo", { p_slug: slug, p_chave_ip: chave, p_reserva_hash: reservaHash });
  if (error) return { erro: falhaDeRpc(ctx, "criar reservar", error) };
  const org = eObjecto(data) ? data.organization_id : undefined;
  const codigo = eObjecto(data) ? data.codigo : undefined;
  if (typeof org !== "string" || !UUID.test(org) || typeof codigo !== "string" || !CODIGO_DEN.test(codigo)) {
    ctx.reportar("criar reservar", new TypeError("resposta"));
    return { erro: falha(ctx, "erro_inesperado") };
  }
  return { org, codigo };
}

async function tratarCriar(ctx: Contexto, payload: Objecto): Promise<Response> {
  const { deps } = ctx;
  const slug = validarSlug(payload.slug);
  const pedido = validarCriar(payload);
  if (!slug || !pedido) return falha(ctx, "pedido_invalido");
  if (!pepperValido(deps.pinPepper)) {
    deps.registarErro(new Error("denuncia-publica criar: DENUNCIAS_PIN_PEPPER em falta ou curto"));
    return falha(ctx, "indisponivel");
  }
  const ip = await chaveIp(ctx);
  if ("erro" in ip) return ip.erro;

  // Anonima: o JWT nem se olha. Identificada: so se o JWT for de um utilizador.
  const utilizador = pedido.modo === "identificada" ? await utilizadorDoJwt(ctx) : null;
  const reservaHash = (await gerarSessao()).hash;
  const reserva = await reservarCodigo(ctx, slug, ip.chave, reservaHash);
  if ("erro" in reserva) return reserva.erro;

  const pin = gerarPin();
  const pinHash = await hmacPin(deps.pinPepper, reserva.org, reserva.codigo, pin);
  // Com conta ligada, nome e email vem da pessoa (a base), nao do corpo.
  const identidade = pedido.identidade && utilizador ? { ...pedido.identidade, nome: null, email: null } : pedido.identidade;
  const { error } = await ctx.svc.rpc("rpc_denuncia_publica_criar", {
    p_slug: slug,
    p_codigo: reserva.codigo,
    p_reserva_hash: reservaHash,
    p_dados: pedido.dados,
    p_pin_hash: pinHash,
    p_identidade: identidade,
    p_auth_user_id: utilizador,
    p_impedidos: pedido.impedidos,
  });
  if (error) return falhaDeRpc(ctx, "criar", error);
  // O PIN sai UMA so vez, nesta resposta: nunca e gravado nem registado.
  return ctx.responder({ ok: true, codigo: reserva.codigo, pin });
}

// -- entrar ------------------------------------------------------------------------------

const recusaUniforme = (ctx: Contexto): Response => falha(ctx, "codigo_ou_pin_invalido");

async function entrarSemEspera(ctx: Contexto, payload: Objecto): Promise<Response> {
  const { deps } = ctx;
  if (!pepperValido(deps.pinPepper)) {
    deps.registarErro(new Error("denuncia-publica entrar: DENUNCIAS_PIN_PEPPER em falta ou curto"));
    return falha(ctx, "indisponivel");
  }
  const ip = await chaveIp(ctx);
  if ("erro" in ip) return ip.erro;

  const slug = validarSlug(payload.slug);
  const codigo = typeof payload.codigo === "string" ? normalizarCodigo(payload.codigo) : "";
  const pin = typeof payload.pin === "string" ? normalizarPin(payload.pin) : "";
  if (!slug || !CODIGO_DEN.test(codigo) || !PIN_6.test(pin)) return recusaUniforme(ctx);

  // O id da organizacao so serve de sal ao HMAC do PIN; a base volta a resolve-la pelo slug.
  const canal = await lerCanal(ctx, slug);
  if ("erro" in canal) return canal.erro;
  if (!canal.ativo || !canal.org) return recusaUniforme(ctx);

  const sessao = await gerarSessao();
  // O limite de entrada (por IP e por organizacao) conta DENTRO desta RPC: acima dele, false.
  const { data, error } = await ctx.svc.rpc("rpc_denuncia_publica_entrar", {
    p_slug: slug,
    p_codigo: codigo,
    p_pin_hash: await hmacPin(deps.pinPepper, canal.org, codigo, pin),
    p_sessao_hash: sessao.hash,
    p_chave_ip: ip.chave,
  });
  if (error) return falhaDeRpc(ctx, "entrar", error);
  if (data !== true) return recusaUniforme(ctx);
  return ctx.responder({ ok: true, sessao: sessao.token, expira_em_minutos: SESSAO_MINUTOS });
}

/** Acerto e falha esperam o mesmo minimo: o relogio nao distingue um codigo que existe. */
async function tratarEntrar(ctx: Contexto, payload: Objecto): Promise<Response> {
  const inicio = ctx.deps.agora();
  const resposta = await entrarSemEspera(ctx, payload);
  const falta = ENTRAR_MINIMO_MS - (ctx.deps.agora() - inicio);
  if (falta > 0) await ctx.deps.dormir(falta);
  return resposta;
}

// -- ler e responder ---------------------------------------------------------------------

async function sessaoDoPedido(ctx: Contexto): Promise<string | null> {
  const sessao = (ctx.req.headers.get(CABECALHO_SESSAO) ?? "").trim();
  return SESSAO_43.test(sessao) ? await sha256Hex(sessao) : null;
}

async function tratarComSessao(ctx: Contexto, accao: "ler" | "responder", payload: Objecto): Promise<Response> {
  const sessaoHash = await sessaoDoPedido(ctx);
  if (!sessaoHash) return falha(ctx, "sessao_invalida");
  const texto = accao === "responder" ? validarTextoResposta(payload.texto) : null;
  if (accao === "responder" && texto === null) return falha(ctx, "pedido_invalido");

  const recusa = await travar(ctx, "sessao");
  if (recusa) return recusa;

  const { data, error } = await ctx.svc.rpc(
    accao === "ler" ? "rpc_denuncia_publica_ler" : "rpc_denuncia_publica_responder",
    accao === "ler" ? { p_sessao_hash: sessaoHash } : { p_sessao_hash: sessaoHash, p_texto: texto },
  );
  if (error) return falhaDeRpc(ctx, accao, error);
  const vista = vistaDoDenunciante(data);
  if (!vista) {
    ctx.reportar(accao, new TypeError("resposta"));
    return falha(ctx, "erro_inesperado");
  }
  return ctx.responder({ ok: true, denuncia: vista });
}

// -- entrada -----------------------------------------------------------------------------

/** Le o corpo com tecto de 64 KB (cabecalho E tamanho real). `null` = demasiado grande. */
async function lerCorpo(req: Request): Promise<Objecto | null> {
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declarado) && declarado > CORPO_MAX_BYTES) return null;
  const bruto = await req.text();
  if (new TextEncoder().encode(bruto).byteLength > CORPO_MAX_BYTES) return null;
  try {
    const json: unknown = JSON.parse(bruto);
    return eObjecto(json) ? json : {};
  } catch {
    return {};
  }
}

export function criarHandler(deps: DepsDenuncia): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const cors = { ...deps.corsHeaders(req), ...CORS_FIXO };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const responder: Responder = (corpo, status = 200) =>
      new Response(JSON.stringify(corpo), { status, headers: { ...cors, ...SEGURANCA } });
    if (req.method !== "POST") return responder({ error: "method_not_allowed" }, 405);

    const ctx: Contexto = {
      deps,
      req,
      svc: deps.criarCliente(deps.supabaseUrl, deps.serviceKey),
      responder,
      reportar: (origem, erro) => deps.registarErro(erroSemDados(`denuncia-publica ${origem}`, erro)),
    };

    try {
      const payload = await lerCorpo(req);
      if (payload === null) return falha(ctx, "corpo_demasiado_grande");
      const accao = payload.action;

      // Os anexos ficam para a fase 2: nem chegam a base nem ao limite.
      if (typeof accao === "string" && accao.startsWith(ANEXO_PREFIXO)) return falha(ctx, "anexos_indisponiveis");
      if (accao === "canal") return await tratarCanal(ctx, payload);
      if (accao === "criar") return await tratarCriar(ctx, payload);
      if (accao === "entrar") return await tratarEntrar(ctx, payload);
      if (accao === "ler" || accao === "responder") return await tratarComSessao(ctx, accao, payload);
      return falha(ctx, "accao_desconhecida");
    } catch (e) {
      ctx.reportar("excepcao", e);
      return falha(ctx, "erro_inesperado");
    }
  };
}
