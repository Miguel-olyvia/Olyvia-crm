// Passa uma linha de neg_resumo_quadro das colunas Financeiro e Obra para o cartão (puro, sem rede). Nunca rebenta com o que a base acrescente:
// uma coluna ou um tipo desconhecidos descartam o cartão. O estado do cartão só diz o que a coluna prova (nada de estados de obra inventados).
import type { PapelPessoa } from "@/components/pessoas/pessoasTipos";
import { COLUNAS_POS_CONTRATO, type ColunaPosContrato } from "@/components/pessoas/quadro/colunasPosContrato";
import type { CursorQuadro, LinhaQuadroDb } from "./quadroPessoasTipos";

/** Financeiro: contrato assinado e pagamento por validar. Obra: pagamento validado e ainda sem plano de obra lido (a abertura da obra é a fase 3 do plano). */
export type PassoPosContrato = "pagamentoPorValidar" | "obraPorAbrir";

export interface CartaoPosContrato {
  /** O id do negócio. */
  id: string;
  pessoaId: string;
  nome: string;
  papel: PapelPessoa;
  coluna: ColunaPosContrato;
  trabalho: string | null;
  valor: number | null;
  passo: PassoPosContrato;
}

export interface CartaoPosContratoComCursor {
  cartao: CartaoPosContrato;
  cursor: CursorQuadro | null;
}

const COLUNAS: readonly string[] = COLUNAS_POS_CONTRATO.map((c) => c.id);
const PASSO_DA_COLUNA: Record<ColunaPosContrato, PassoPosContrato> = { financeiro: "pagamentoPorValidar", obra: "obraPorAbrir" };

function valorDoCartao(valor: number | string | null): number | null {
  if (valor === null) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** `null`: a linha não é um cartão do pós-contrato. */
export function adaptarLinhaPosContrato(l: LinhaQuadroDb): CartaoPosContratoComCursor | null {
  if (!COLUNAS.includes(l.coluna) || l.tipo !== "negocio") return null;
  const coluna = l.coluna as ColunaPosContrato;
  return {
    cartao: {
      id: l.cartao_id, pessoaId: l.entity_id, nome: l.nome ?? "", papel: l.papel === "cliente" ? "cliente" : "lead", coluna, trabalho: l.titulo,
      valor: valorDoCartao(l.valor), passo: PASSO_DA_COLUNA[coluna],
    },
    cursor: l.chave_ordem === null ? null : { chave: l.chave_ordem, id: l.cartao_id },
  };
}
