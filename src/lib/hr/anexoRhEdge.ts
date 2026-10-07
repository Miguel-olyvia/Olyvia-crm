/**
 * As tres accoes da Edge Function `hr-anexo-rh` (JWT do RH): `url` (reserva um
 * lugar na quarentena e devolve o URL assinado), `confirmar` (o servidor le a
 * assinatura REAL do ficheiro e promove-o) e `remover`.
 *
 * Nunca lancam. Devolvem `ok` com `data`, ou nao-ok com o `codigo` que o
 * servidor deu (`null` quando nao ha codigo: rede, resposta sem corpo). Uma
 * recusa de negocio nao e defeito; so o inesperado vai para o registo, e sem
 * nome de ficheiro, sem caminho e sem corpo.
 *
 * O pedido nunca leva organization_id: o servidor tira-o da linha.
 */
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { codigoDeErroEdge } from "@/lib/hr/errosAdmissao";
import { hrFrom } from "@/lib/hr/hrDb";
import type { TipoAnexoRh } from "@/lib/hr/anexosRh";

const FUNCAO = "hr-anexo-rh";
const ORIGEM_REGISTO = "hr-anexo-rh";

/** Tempo maximo de uma chamada a Edge: passado isto a accao falha em vez de ficar pendurada. */
export const TEMPO_MAXIMO_EDGE_MS = 30_000;

/** Tipos de falha sem codigo do servidor; so isto vai para o registo (nunca o texto do erro). */
type TipoFalhaEdge = "tempo_esgotado" | "rede" | "falha_de_rede";

export interface RespostaAnexoRh<T> {
  ok: boolean;
  data: T | null;
  /** Presente so quando `ok` e falso e o servidor deu um motivo. */
  codigo: string | null;
}

export interface PedidoUploadAnexoRh {
  pessoaId: string;
  tipo: TipoAnexoRh;
  nome: string;
  tamanho: number;
  mime: string;
  substituiAnexoId?: string;
}

export interface UploadAnexoRh {
  anexoId: string;
  caminho: string;
  uploadToken: string;
}

/** O anexo que o servidor aceitou (as colunas que o ecra pode mostrar). */
export interface AnexoRhAceite {
  id: string;
  tipo: TipoAnexoRh;
  nome_original: string;
  tamanho_bytes: number;
  mime_type: string;
}

function eDefeito(codigo: string | null): boolean {
  return codigo === null || codigo === "erro_inesperado";
}

/** O registo recebe so o tipo de falha: nunca nome, caminho, token nem corpo. */
function erroSemDados(accao: string, motivo: string): Error {
  return new Error(`${ORIGEM_REGISTO}: ${accao}: ${motivo}`);
}

function falha<T>(accao: string, codigo: string | null, tipo: TipoFalhaEdge = "falha_de_rede"): RespostaAnexoRh<T> {
  if (eDefeito(codigo)) captureFlowError(erroSemDados(accao, codigo ?? tipo), ORIGEM_REGISTO);
  return { ok: false, data: null, codigo };
}

function nomeDe(valor: unknown): string {
  return typeof valor === "object" && valor !== null && "name" in valor ? String((valor as { name: unknown }).name) : "";
}

/** Uma excepcao de fetch: TypeError (rede, CORS, DNS) ou FunctionsFetchError; o resto e generico. */
function tipoDeExcepcao(erro: unknown): TipoFalhaEdge {
  if (erro instanceof TypeError || nomeDe(erro) === "FunctionsFetchError") return "rede";
  return "falha_de_rede";
}

async function chamar(
  accao: string,
  corpo: Record<string, unknown>,
): Promise<RespostaAnexoRh<Record<string, unknown>>> {
  const controlador = new AbortController();
  let esgotou = false;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<"esgotado">((resolve) => {
    temporizador = setTimeout(() => {
      esgotou = true;
      controlador.abort();
      resolve("esgotado");
    }, TEMPO_MAXIMO_EDGE_MS);
  });
  try {
    const resultado = await Promise.race([
      supabase.functions.invoke(FUNCAO, { body: { accao, ...corpo }, signal: controlador.signal }),
      limite,
    ]);
    if (resultado === "esgotado") return falha(accao, null, "tempo_esgotado");
    const { data, error } = resultado;
    if (error || data?.error) {
      const codigo = await codigoDeErroEdge(error, data);
      return falha(accao, codigo, nomeDe(error) === "FunctionsFetchError" ? "rede" : "falha_de_rede");
    }
    return { ok: true, data: (data ?? {}) as Record<string, unknown>, codigo: null };
  } catch (erro) {
    return falha(accao, null, esgotou ? "tempo_esgotado" : tipoDeExcepcao(erro));
  } finally {
    clearTimeout(temporizador);
  }
}

export async function pedirUploadAnexoRh(
  pedido: PedidoUploadAnexoRh,
): Promise<RespostaAnexoRh<UploadAnexoRh>> {
  const resposta = await chamar("url", {
    pessoa_id: pedido.pessoaId,
    tipo: pedido.tipo,
    nome: pedido.nome,
    tamanho: pedido.tamanho,
    mime: pedido.mime,
    ...(pedido.substituiAnexoId ? { substitui_anexo_id: pedido.substituiAnexoId } : {}),
  });
  if (!resposta.ok) return { ok: false, data: null, codigo: resposta.codigo };
  const { anexo_id, caminho, upload_token } = resposta.data;
  if (typeof anexo_id !== "string" || typeof caminho !== "string" || typeof upload_token !== "string") {
    return falha("url", null);
  }
  return { ok: true, codigo: null, data: { anexoId: anexo_id, caminho, uploadToken: upload_token } };
}

export async function confirmarAnexoRh(pedido: {
  anexoId: string;
  substituiAnexoId?: string;
}): Promise<RespostaAnexoRh<{ anexo: AnexoRhAceite }>> {
  const resposta = await chamar("confirmar", {
    anexo_id: pedido.anexoId,
    ...(pedido.substituiAnexoId ? { substitui_anexo_id: pedido.substituiAnexoId } : {}),
  });
  if (!resposta.ok) return { ok: false, data: null, codigo: resposta.codigo };
  const anexo = resposta.data.anexo as Partial<AnexoRhAceite> | undefined;
  if (!anexo || typeof anexo.id !== "string") return falha("confirmar", null);
  return { ok: true, codigo: null, data: { anexo: anexo as AnexoRhAceite } };
}

export async function removerAnexoRh(anexoId: string): Promise<RespostaAnexoRh<Record<string, never>>> {
  const resposta = await chamar("remover", { anexo_id: anexoId });
  if (!resposta.ok) return { ok: false, data: null, codigo: resposta.codigo };
  // So ok:true conta como remocao feita; um 200 vazio e uma resposta em que nao se pode confiar.
  if (resposta.data?.ok !== true) return falha("remover", null);
  return { ok: true, codigo: null, data: {} };
}

/**
 * O anexo promovido com este id, ou null (nao existe, nao esta promovido ou a
 * leitura falhou). Serve para tirar a duvida depois de um confirmar repetido ou
 * de resposta perdida (anexo_estado_invalido): se ja esta na lista, o envio
 * correu bem. So colunas concedidas a authenticated; nunca lanca.
 */
export async function anexoRhPromovido(anexoId: string): Promise<AnexoRhAceite | null> {
  try {
    const { data, error } = await hrFrom("pessoas_anexos")
      .select("id, tipo, nome_original, tamanho_bytes, mime_type")
      .eq("id", anexoId)
      .eq("estado", "promovido")
      .maybeSingle();
    if (error) {
      captureFlowError(erroSemDados("verificar", "leitura_falhada"), ORIGEM_REGISTO);
      return null;
    }
    const linha = data as Partial<AnexoRhAceite> | null;
    return linha && typeof linha.id === "string" ? (linha as AnexoRhAceite) : null;
  } catch {
    captureFlowError(erroSemDados("verificar", "falha_de_rede"), ORIGEM_REGISTO);
    return null;
  }
}
