/**
 * O pedido a hr-justificacao-anexo, sem Deno nem rede: autentica, le o corpo
 * com tecto, aplica o limite de uso (60 por hora, por utilizador E por accao)
 * e despacha para accoes.ts / limpeza.ts.
 */
import {
  eAccaoHumana,
  tratarAccaoHumana,
  type ClienteJustificacao,
  type RespostaAccao,
} from "./accoes.ts";

export const LIMITE_POR_HORA = 60;
export const JANELA_EM_MINUTOS = 60;
/** Tecto do corpo JSON: os pedidos validos tem uma centena de bytes. */
export const LIMITE_CORPO_BYTES = 16 * 1024;

/** O bucket do limite: um por accao, para um `abrir` em massa nao gastar os `url`. */
export function bucketDoLimite(accao: string): string {
  return `hr-justificacao-anexo:${accao}`;
}

export interface ResultadoLimite {
  allowed: boolean;
  retryAfterSeconds: number;
  /** O contador nao respondeu (leitura ou escrita falhou): nao se sabe se esta dentro do limite. */
  indisponivel?: boolean;
}

// -- limite de uso: regista ANTES de verificar --------------------------------

// deno-lint-ignore no-explicit-any
type ClienteContador = any;

/**
 * Regista a tentativa e SO DEPOIS conta (a actual incluida). Assim uma rajada
 * paralela nao passa toda: o pedido cujo registo ficou escrito em ultimo ve
 * todos os registos da rajada, e por isso no maximo `LIMITE_POR_HORA` pedidos
 * da janela veem `contagem <= limite`. As tentativas recusadas tambem contam
 * (quem insiste continua bloqueado).
 *
 * Se o registo ou a leitura falham devolve `indisponivel: true` (e `allowed:
 * false`); quem chama decide se falha fechado ou aberto.
 */
export async function consumirLimiteRegistandoPrimeiro(
  cliente: ClienteContador,
  bucket: string,
  identificador: string,
  agora: number = Date.now(),
): Promise<ResultadoLimite> {
  const indisponivel: ResultadoLimite = { allowed: false, retryAfterSeconds: 0, indisponivel: true };
  const janelaMs = JANELA_EM_MINUTOS * 60 * 1000;
  try {
    const escrita = await cliente.from("rate_limit_attempts").insert({ bucket, identifier: identificador });
    if (escrita?.error) return indisponivel;

    const leitura = await cliente
      .from("rate_limit_attempts")
      .select("created_at")
      .eq("bucket", bucket)
      .eq("identifier", identificador)
      .gte("created_at", new Date(agora - janelaMs).toISOString())
      .order("created_at", { ascending: false })
      .limit(LIMITE_POR_HORA + 1);
    if (leitura?.error || !Array.isArray(leitura?.data)) return indisponivel;

    const recentes = leitura.data as Array<{ created_at: string }>;
    if (recentes.length <= LIMITE_POR_HORA) return { allowed: true, retryAfterSeconds: 0 };

    // a tentativa em excesso mais antiga sai da janela quando o seu carimbo + janela passar
    const referencia = new Date(recentes[LIMITE_POR_HORA].created_at).getTime();
    if (!Number.isFinite(referencia)) return indisponivel;
    const retryAfterSeconds = Math.max(1, Math.ceil((referencia + janelaMs - agora) / 1000));
    return { allowed: false, retryAfterSeconds };
  } catch {
    return indisponivel;
  }
}

// -- corpo ----------------------------------------------------------------------

export type LeituraCorpo =
  | { ok: true; corpo: Record<string, unknown> | null }
  | { ok: false; resposta: RespostaAccao };

const recusa = (status: number): LeituraCorpo => ({ ok: false, resposta: { status, body: { error: "pedido_invalido" } } });

/**
 * Le o corpo JSON com tecto: Content-Type tem de ser application/json (415),
 * e o corpo nao pode passar de LIMITE_CORPO_BYTES (413) -- pelo Content-Length
 * e, se este faltar ou mentir, a medir os bytes a medida que chegam.
 * JSON invalido ou que nao e um objecto devolve `corpo: null` (como antes).
 */
export async function lerCorpoJson(req: Request): Promise<LeituraCorpo> {
  const tipo = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (tipo !== "application/json") return recusa(415);

  const declarado = req.headers.get("content-length");
  if (declarado !== null && Number(declarado) > LIMITE_CORPO_BYTES) return recusa(413);

  const partes: Uint8Array[] = [];
  let total = 0;
  const leitor = req.body?.getReader();
  if (leitor) {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > LIMITE_CORPO_BYTES) {
        await leitor.cancel().catch(() => undefined);
        return recusa(413);
      }
      partes.push(value);
    }
  }
  const bytes = new Uint8Array(total);
  let posicao = 0;
  for (const parte of partes) {
    bytes.set(parte, posicao);
    posicao += parte.byteLength;
  }

  let corpo: unknown = null;
  try {
    corpo = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    corpo = null;
  }
  const objecto = corpo !== null && typeof corpo === "object" && !Array.isArray(corpo);
  return { ok: true, corpo: objecto ? (corpo as Record<string, unknown>) : null };
}

// -- pedido humano --------------------------------------------------------------

export interface PedidoHumano {
  accao: unknown;
  /** auth uid do utilizador real; nunca "service_role" (o index recusa-os antes). */
  authUid: string;
  payload: Record<string, unknown> | null;
  svc: ClienteJustificacao;
  /** Regista E verifica uma tentativa no limite (bucket, identificador). */
  consumirLimite: (bucket: string, identificador: string) => Promise<ResultadoLimite>;
  registarErro?: (erro: unknown) => void;
}

/** `confirmar` fecha um upload que ja foi reservado: se o contador cai, deixa-se passar. */
const FALHA_ABERTO: readonly string[] = ["confirmar"];

export async function tratarPedidoHumano(p: PedidoHumano): Promise<RespostaAccao> {
  if (!eAccaoHumana(p.accao)) return { status: 400, body: { error: "accao_desconhecida" } };

  const limite = await p.consumirLimite(bucketDoLimite(p.accao), p.authUid);
  if (limite.indisponivel) {
    if (!FALHA_ABERTO.includes(p.accao)) {
      p.registarErro?.(new Error("hr-justificacao-anexo: contador do limite indisponivel"));
      return { status: 500, body: { error: "erro_inesperado" } };
    }
  } else if (!limite.allowed) {
    return { status: 429, body: { error: "rate_limited", retry_after_seconds: limite.retryAfterSeconds } };
  }

  return await tratarAccaoHumana({
    accao: p.accao,
    svc: p.svc,
    authUid: p.authUid,
    payload: p.payload,
    registarErro: p.registarErro,
  });
}

// -- o pedido HTTP inteiro --------------------------------------------------------

export interface DependenciasHttp {
  /** Segredo do cron ou chave de servico (requireServiceRoleOrCronSecret). */
  eCron: (req: Request) => boolean;
  /** Valida o JWT; lanca (AuthError) se nao ha sessao valida. */
  resolverChamador: (req: Request) => Promise<{ isServiceRole: boolean; authUid: string }>;
  limpar: () => Promise<RespostaAccao>;
  humano: (accao: unknown, authUid: string, payload: Record<string, unknown> | null) => Promise<RespostaAccao>;
}

/**
 * A autenticacao vem ANTES de ler o corpo: sem segredo do cron nem JWT valido
 * o pedido morre em 401 (excepcao do resolverChamador) sem o corpo ser tocado.
 * Com o segredo/chave de servico so a accao `limpar` e permitida; um humano
 * (JWT) nunca chega a `limpar`, que para ele e uma accao desconhecida.
 */
export async function tratarPedidoHttp(req: Request, dep: DependenciasHttp): Promise<RespostaAccao> {
  const cron = dep.eCron(req);
  let authUid = "";
  if (!cron) {
    const caller = await dep.resolverChamador(req);
    if (caller.isServiceRole) return { status: 403, body: { error: "sem_permissao" } };
    authUid = caller.authUid;
  }

  const leitura = await lerCorpoJson(req);
  if (!leitura.ok) return leitura.resposta;
  const body = leitura.corpo;

  if (cron) {
    if (body?.accao === "limpar") return await dep.limpar();
    return { status: 403, body: { error: "sem_permissao" } };
  }
  return await dep.humano(body?.accao, authUid, body);
}
