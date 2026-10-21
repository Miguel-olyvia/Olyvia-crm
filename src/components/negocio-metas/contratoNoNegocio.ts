// Contratos dentro do negócio (fecho v4, migration E). A página de contratos é partilhada com a Mudelar: tudo o que é decisão do negócio vive
// aqui, puro e sem rede, e a página só o usa quando traz um negócio (`?negocio=` no endereço) ou um contrato com `negocio_id`.
// Sem negócio nada disto muda o que a página faz.

export type GravacaoDeContrato = "rpc_create_client_contract" | "neg_criar_contrato";

/** A criar a partir de um negócio grava por `neg_criar_contrato` (o contrato nasce ligado); sem negócio, como sempre. */
export function escolherGravacaoDeContrato({ criarNoNegocioId }: { criarNoNegocioId?: string | null }): GravacaoDeContrato {
  return criarNoNegocioId ? "neg_criar_contrato" : "rpc_create_client_contract";
}

/** Os parâmetros de `neg_criar_contrato`: os 15 de `rpc_create_client_contract` mais o negócio (16 no total). */
export function parametrosNegCriarContrato<T extends Record<string, unknown>>(negocioId: string, parametros: T): { p_negocio_id: string } & T {
  return { p_negocio_id: negocioId, ...parametros };
}

/** O que a página precisa de saber do negócio de um contrato. */
export interface NegocioDoContrato {
  id: string;
  titulo: string | null;
  fecho: string | null;
  estado: string | null;
  decisaoOrigemTipo: string | null;
  decisaoOrigemId: string | null;
}

const texto = (valor: unknown): string | null => (typeof valor === "string" && valor !== "" ? valor : null);

/** Lê a linha de `negocios` (só as colunas pedidas); sem linha ou sem id devolve `null`, e um campo que não é texto fica nulo. */
export function lerNegocioDoContrato(linha: unknown): NegocioDoContrato | null {
  if (typeof linha !== "object" || linha === null) return null;
  const l = linha as Record<string, unknown>;
  const id = texto(l.id);
  if (!id) return null;
  return {
    id, titulo: texto(l.titulo), fecho: texto(l.fecho), estado: texto(l.estado),
    decisaoOrigemTipo: texto(l.decisao_origem_tipo), decisaoOrigemId: texto(l.decisao_origem_id),
  };
}

/**
 * O que se diz antes de anular um contrato ligado a um negócio e gerar o substituto:
 * - `reabre`: o contrato era a origem do ganho; o substituto reabre o negócio até nova assinatura e fica ligado a ele;
 * - `perdido`: o negócio está perdido, o substituto não herda o negócio;
 * - `sem_permissao`: sem `pessoas.edit` o substituto não se liga ao negócio;
 * - `null`: nada a dizer (sem negócio, sem substituto, ou o negócio não depende deste contrato).
 */
export type AvisoDeSubstituicao = "reabre" | "perdido" | "sem_permissao" | "a_verificar" | "indisponivel" | null;

/** O estado da leitura do negócio do contrato: enquanto não chega (ou se falha) não se sabe se o substituto reabre algo. */
export type LeituraDoNegocio = "pendente" | "falhou" | "pronta";

export function avisoDeSubstituicao(
  { negocio, contratoId, vaiGerarSubstituto, podeEditarNegocio, leitura = "pronta" }:
  { negocio: NegocioDoContrato | null; contratoId: string; vaiGerarSubstituto: boolean; podeEditarNegocio: boolean; leitura?: LeituraDoNegocio },
): AvisoDeSubstituicao {
  if (!vaiGerarSubstituto) return null;
  if (!podeEditarNegocio) return negocio || leitura !== "pronta" ? "sem_permissao" : null;
  if (leitura === "pendente") return "a_verificar";
  if (leitura === "falhou") return "indisponivel";
  if (!negocio) return null;
  if (negocio.estado === "perdido") return "perdido";
  const eraAOrigemDoGanho = negocio.estado === "ganho" && negocio.decisaoOrigemTipo === "contrato" && negocio.decisaoOrigemId === contratoId;
  return eraAOrigemDoGanho ? "reabre" : null;
}

/** Enquanto o negócio não foi verificado, o botão de anular com substituto fica parado: o aviso podia faltar. */
export function substitutoSemVerificar(aviso: AvisoDeSubstituicao): boolean {
  return aviso === "a_verificar" || aviso === "indisponivel";
}

/** Cada botão pede a permissão do negócio e a do documento: um contrato ligado a um negócio só gera substituto a quem tem `pessoas.edit`. */
export function substitutoBloqueado({ temNegocio, podeEditarNegocio }: { temNegocio: boolean; podeEditarNegocio: boolean }): boolean {
  return temNegocio && !podeEditarNegocio;
}
