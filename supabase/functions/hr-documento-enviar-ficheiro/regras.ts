/**
 * Regras puras da Edge hr-documento-enviar-ficheiro: ler o pedido, confirmar que
 * a extensao do caminho e o tipo real (pelos bytes) batem certo, e traduzir os
 * erros da RPC para HTTP. Sem Deno nem rede: testa-se no vitest
 * (regras.vitest.test.ts).
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`^${UUID}$`);
/**
 * O caminho que a politica de hr-documentos-quarantine impoe (20261207012900):
 * <organizacao>/<pessoa>/<documento>/<uuid>.<pdf|jpg|jpeg|png>, tudo em minusculas.
 * A 3.a pasta e o id do documento NOVO, gerado pelo cliente.
 */
const CAMINHO_RE = new RegExp(`^(${UUID})/(${UUID})/(${UUID})/${UUID}\\.(pdf|jpg|jpeg|png)$`);

export const TIPOS_DOCUMENTO = ["contrato", "adenda", "declaracao", "recibo", "outro"] as const;
/** Sem assinatura, a base so entrega estes (rpc_hr_portal_documento_enviar). */
export const TIPOS_SEM_ASSINATURA: readonly string[] = ["declaracao", "recibo"];
/** O tecto do bucket hr-documentos(-quarantine). */
export const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024;
const TITULO_MAXIMO = 200;
/**
 * Caracteres de controlo e invisiveis recusados no titulo (a mesma classe que a
 * RPC): C0, DEL e C1, larguras zero e marcas de direccao, separadores de linha
 * e paragrafo, isolamentos de direccao e o BOM.
 */
// eslint-disable-next-line no-control-regex -- os caracteres de controlo sao precisamente o que se recusa
const TITULO_INVISIVEIS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/;
/** Pedidos por actor e por minuto (_shared/rateLimit.ts). */
export const LIMITE_POR_MINUTO = 10;

export type Extensao = "pdf" | "jpg" | "jpeg" | "png";

export interface PedidoEnvio {
  organizationId: string;
  pessoaId: string;
  documentoId: string;
  caminho: string;
  extensao: Extensao;
  tipo: string;
  titulo: string;
  exigeAssinatura: boolean;
  conviteId: string | null;
  vinculoId: string | null;
}

/** Os codigos que a Edge devolve. Os da base sao a MESSAGE do RAISE; os outros sao da Edge. */
export type CodigoErro =
  | "pedido_invalido"
  | "estado_invalido"
  | "nao_encontrado"
  | "insufficient_privilege"
  | "nao_autenticado"
  | "limite_excedido"
  | "ficheiro_em_falta"
  | "ficheiro_invalido"
  | "ficheiro_demasiado_grande"
  | "pedido_repetido"
  | "erro_inesperado";

export type LeituraPedido = { ok: true; pedido: PedidoEnvio } | { ok: false; codigo: CodigoErro };

function uuidOuNulo(v: unknown): string | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  return typeof v === "string" && UUID_RE.test(v) ? v : undefined;
}

/**
 * Le o corpo do pedido. A organizacao do caminho tem de ser a activeCompany
 * enviada (organizationId); sem assinatura, so declaracao ou recibo (a mesma
 * regra que a base aplica, aqui antes de tocar no Storage).
 */
export function lerPedido(corpo: unknown): LeituraPedido {
  if (!corpo || typeof corpo !== "object") return { ok: false, codigo: "pedido_invalido" };
  const c = corpo as Record<string, unknown>;

  const caminho = typeof c.caminho === "string" ? c.caminho : "";
  const m = CAMINHO_RE.exec(caminho);
  if (!m) return { ok: false, codigo: "pedido_invalido" };
  const [, organizacaoDoCaminho, pessoaId, documentoId, extensao] = m;

  if (c.organizationId !== organizacaoDoCaminho) return { ok: false, codigo: "pedido_invalido" };

  const tipo = typeof c.tipo === "string" ? c.tipo : "";
  if (!(TIPOS_DOCUMENTO as readonly string[]).includes(tipo)) return { ok: false, codigo: "pedido_invalido" };

  const tituloBruto = typeof c.titulo === "string" ? c.titulo : "";
  if (TITULO_INVISIVEIS.test(tituloBruto)) return { ok: false, codigo: "pedido_invalido" };
  const titulo = tituloBruto.trim();
  if (titulo.length < 1 || titulo.length > TITULO_MAXIMO) return { ok: false, codigo: "pedido_invalido" };

  const exigeAssinatura = c.exigeAssinatura;
  if (typeof exigeAssinatura !== "boolean") return { ok: false, codigo: "pedido_invalido" };
  if (!exigeAssinatura && !TIPOS_SEM_ASSINATURA.includes(tipo)) return { ok: false, codigo: "estado_invalido" };

  const conviteId = uuidOuNulo(c.conviteId);
  const vinculoId = uuidOuNulo(c.vinculoId);
  if (conviteId === undefined || vinculoId === undefined) return { ok: false, codigo: "pedido_invalido" };

  return {
    ok: true,
    pedido: {
      organizationId: organizacaoDoCaminho,
      pessoaId,
      documentoId,
      caminho,
      extensao: extensao as Extensao,
      tipo,
      titulo,
      exigeAssinatura,
      conviteId,
      vinculoId,
    },
  };
}

/**
 * O tipo MIME a gravar, se o tipo real (detectSignature) bate com a extensao do
 * caminho; null se nao bate ou nao e um dos tres aceites. Um PNG com nome .pdf
 * e recusado: o portal abriria o ficheiro com o tipo errado.
 */
export function mimeConfirmado(assinatura: string | null, extensao: Extensao): string | null {
  if (assinatura === "pdf" && extensao === "pdf") return "application/pdf";
  if (assinatura === "png" && extensao === "png") return "image/png";
  if (assinatura === "jpeg" && (extensao === "jpg" || extensao === "jpeg")) return "image/jpeg";
  return null;
}

/**
 * Resposta de rpc_hr_documento_quarentena_dono -> o que fazer. null = o objecto
 * nao existe. So se recusa um dono PREENCHIDO e diferente de quem chama; dono
 * vazio passa (no remoto ha objectos com owner_id NULL e o caminho ja esta preso
 * a organizacao/pessoa/documento do pedido).
 */
export function decisaoDoDono(resposta: unknown, authUid: string): "em_falta" | "recusar" | "seguir" {
  if (resposta === null || resposta === undefined || typeof resposta !== "object") return "em_falta";
  const dono = (resposta as { dono?: unknown }).dono;
  if (typeof dono === "string" && dono !== "" && dono !== authUid) return "recusar";
  return "seguir";
}

/** O `code` de um erro PostgREST/Postgres, se houver; para registar sem expor a mensagem. */
export function codigoDoErro(erro: unknown): string | null {
  if (erro && typeof erro === "object" && "code" in erro) {
    const code = (erro as { code?: unknown }).code;
    if (typeof code === "string" && code !== "") return code;
  }
  return null;
}

/**
 * A RPC respondeu com um RAISE da propria funcao, ou seja, houve ROLLBACK e
 * nenhum documento ficou a apontar para o ficheiro. So nestes casos se apaga o
 * objecto copiado. Rede, timeout, 5xx ou erro sem codigo sao ambiguos (a
 * transaccao pode ter feito COMMIT): nao se apaga nada.
 */
export function erroProvaRollback(erro: unknown): boolean {
  const code = codigoDoErro(erro);
  if (code === null) return false;
  return ["42501", "HRA10", "HRA31", "HRA38"].includes(code) || /^HR9\d\d$/.test(code);
}

/** Erro da RPC (PostgREST: code = SQLSTATE, message = o codigo do RAISE) -> HTTP + codigo para o ecra. */
export function respostaDoErroRpc(erro: { code?: unknown; message?: unknown } | null): {
  status: number;
  codigo: CodigoErro;
} {
  switch (erro?.code) {
    case "42501":
      return { status: 403, codigo: "insufficient_privilege" };
    case "HRA10":
      return { status: 400, codigo: "pedido_invalido" };
    case "HRA31":
      return { status: 404, codigo: "nao_encontrado" };
    case "HRA38":
      return { status: 409, codigo: "estado_invalido" };
    default:
      return { status: 500, codigo: "erro_inesperado" };
  }
}
