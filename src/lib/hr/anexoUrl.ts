/**
 * O URL assinado de um anexo da admissao, pedido a Edge Function
 * `hr-anexo-url`. E a UNICA porta de leitura do ficheiro: o caminho no Storage
 * nunca chega ao cliente (a coluna esta fechada por GRANT), e o servidor
 * decide a permissao por tipo e audita a abertura do cartao de cidadao e do
 * comprovativo de IBAN ANTES de emitir o URL.
 *
 * O body e so `{ anexoId }`: a organizacao deriva-se da propria linha no
 * servidor, nunca de um valor vindo daqui. O URL vive o tempo de uma abertura
 * (60 s; 300 s na fotografia) -- quem o recebe nao o guarda.
 */
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { isPermissionError } from "@/lib/hr/hrDb";

export interface UrlAnexo {
  url: string;
  /** Validade do URL em segundos, quando o servidor a diz. */
  expiraEmSegundos: number | null;
  tipo: string | null;
  mime_type: string | null;
}

/**
 * `functions.invoke` nao traz o `code` do PostgREST: um 401/403 chega como
 * `FunctionsHttpError` com a `Response` em `context`. Os dois contam como recusa.
 */
export function eRecusaDePermissao(error: unknown): boolean {
  if (isPermissionError(error)) return true;
  const contexto = (error as { context?: { status?: unknown } } | null)?.context;
  return contexto?.status === 401 || contexto?.status === 403;
}

/** Lanca em qualquer falha; so o que nao e recusa de permissao vai para o registo. */
export async function pedirUrlAnexo(anexoId: string): Promise<UrlAnexo> {
  const { data, error } = await supabase.functions.invoke("hr-anexo-url", {
    body: { anexoId },
  });
  if (error) {
    if (!eRecusaDePermissao(error)) captureFlowError(error, "hr-anexo-obter-url");
    throw error;
  }
  const resposta = data as {
    url?: unknown;
    expiraEmSegundos?: unknown;
    tipo?: unknown;
    mime_type?: unknown;
  } | null;
  if (!resposta || typeof resposta.url !== "string" || resposta.url === "") {
    throw new Error("hr-anexo-url: resposta inesperada");
  }
  return {
    url: resposta.url,
    expiraEmSegundos: typeof resposta.expiraEmSegundos === "number" ? resposta.expiraEmSegundos : null,
    tipo: typeof resposta.tipo === "string" ? resposta.tipo : null,
    mime_type: typeof resposta.mime_type === "string" ? resposta.mime_type : null,
  };
}
