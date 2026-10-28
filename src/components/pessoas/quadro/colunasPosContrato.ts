// As duas colunas do Pipeline DEPOIS do contrato: Financeiro e Obra (como na página de Negócios, fases 4 e 5).
// Não entram em ColunaQuadro de propósito: esse tipo é o das sete colunas que a base sempre devolveu, e quem o alarga parte quem o usa.
//
// A REGRA DE COLUNA (quem manda, e porquê):
//  - Por contactar, Contactado, Visita e Negócio: manda a fase DERIVADA do que o negócio tem ligado (chamada, visita, orçamento, proposta,
//    contrato). `negocios.fase` não conta aqui, porque os negócios do CRM não a escrevem (fica nula) e a derivada é o que a ficha do guia usa.
//  - Financeiro e Obra: o que o negócio TEM (contrato assinado; pagamento validado) e, como sinal, `negocios.fase` (4 e 5), que o motor da
//    Emylia grava ao faturar e ao abrir a obra. O Pipeline nunca escreve `negocios.fase`.
//  - Perdido fica fora. Ganho só entra quando já está no pós-contrato (senão voltava ao quadro um negócio ganho sem contrato).
// A base aplica a mesma regra em `neg_resumo_quadro` (rascunho NOVO-20261231995000); esta função é a versão pura, para a ficha e para os testes.

export type ColunaPosContrato = "financeiro" | "obra";

export interface DefColunaPosContrato {
  id: ColunaPosContrato;
  /** Faixa de cor da coluna (a fase diz-se sempre também por texto). */
  cor: string;
}

export const COLUNAS_POS_CONTRATO: readonly DefColunaPosContrato[] = [
  { id: "financeiro", cor: "bg-success" },
  { id: "obra", cor: "bg-foreground/70" },
];

export interface EntradaPosContrato {
  /** `negocios.estado`: aberto, ganho ou perdido. */
  estado: string;
  /** `negocios.fase` (0 a 5); `null` nos negócios que o CRM criou. */
  fase: number | null;
  contratoAssinado: boolean;
  pagamentoValidado: boolean;
}

const ESTADOS_DO_QUADRO: readonly string[] = ["aberto", "ganho"];
const ESTADOS_DE_CONTRATO_ASSINADO: readonly string[] = ["signed", "assinado"];
const FASE_FINANCEIRO = 4;
const FASE_OBRA = 5;

/** `client_contracts.status` de um contrato assinado (as duas grafias que a base usa). */
export function contratoEstaAssinado(estado: string | null | undefined): boolean {
  return estado != null && ESTADOS_DE_CONTRATO_ASSINADO.includes(estado);
}

/** Pagamento validado: a fatura está paga ou há número de recibo. */
export function pagamentoEstaValidado(n: { faturaPaga: boolean | null; reciboNumero: string | null }): boolean {
  return n.faturaPaga === true || (n.reciboNumero?.trim().length ?? 0) > 0;
}

/** A coluna do pós-contrato de um negócio, ou `null` se ele pertence às colunas da abordagem e do negócio (ou fica fora do quadro). */
export function colunaDoPosContrato(n: EntradaPosContrato): ColunaPosContrato | null {
  if (!ESTADOS_DO_QUADRO.includes(n.estado)) return null;
  const fase = n.fase !== null && Number.isFinite(n.fase) ? n.fase : null;
  if (n.pagamentoValidado || fase === FASE_OBRA) return "obra";
  if (n.contratoAssinado || fase === FASE_FINANCEIRO) return "financeiro";
  return null;
}
