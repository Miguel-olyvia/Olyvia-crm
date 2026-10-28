// A fase do negócio a partir do Negócio: o motor da Emylia manda (Orçamento, Proposta, Contrato, Financeiro, Obra) e a barra única de fases
// (barraUnica.ts) acaba em Financeiro e Obra. Funções puras, sem rede. Antes do Negócio (Por contactar, Contacto, Visita) a fase NÃO é da Emylia: ficam as do nosso fluxo.
//
// De onde vem a fase (a regra, dita num só sítio):
//  - negócio lido da base pelo caminho do Ben (neg_ler_negocios), sem documentos do CRM: a fase é a do motor (`negocios.fase` gravada pela Emylia e,
//    a fase 3 é o Negócio, cujos passos (Orçamento, Proposta, Contrato, Fim) são da lista da fase, não fases);
//  - negócio com documentos do CRM, ou ainda por ler: a base da Emylia não os vê (fase 0, sem orçamento), por isso vale o que o CRM prova: um
//    contrato assinado põe-no em Financeiro. A Obra só se prova pela fase gravada da Emylia.
import type { Negocio } from "@/emylia/motor";
import type { ItemProcesso } from "../processo/tiposProcesso";

/** As fases da Emylia depois da Visita (FASES de /negocios): Negócio (com os passos Orçamento, Proposta, Contrato e Fim), Financeiro e Obra. */
export type FaseEmylia = "negocio" | "financeiro" | "obra";

/** Pela ordem do percurso da Emylia depois da Visita. */
export const FASES_EMYLIA: readonly FaseEmylia[] = ["negocio", "financeiro", "obra"];

const FASE_NEGOCIO = 3;
const FASE_FINANCEIRO = 4;
const FASE_OBRA = 5;

/** A fase que o motor diz; `null` antes do Negócio, num negócio perdido ou com uma fase que a Emylia não conhece. */
export function faseEmyliaDoNegocio(d: Negocio): FaseEmylia | null {
  if (d.perdido) return null;
  if (d.fase === FASE_OBRA) return "obra";
  if (d.fase === FASE_FINANCEIRO) return "financeiro";
  return d.fase === FASE_NEGOCIO ? "negocio" : null;
}

interface EntradaFaseDaFicha {
  /** O negócio como a Emylia o lê; `undefined` se a organização ainda não foi lida ou não o devolveu. */
  d: Negocio | undefined;
  /** O negócio tem documentos do CRM (a Emylia lê-o, não o grava). */
  docsCrm: boolean;
  /** O CRM tem um contrato assinado neste negócio. */
  contratoAssinado: boolean;
}

export function faseEmyliaDaFicha({ d, docsCrm, contratoAssinado }: EntradaFaseDaFicha): FaseEmylia | null {
  if (d && !docsCrm) {
    const doMotor = faseEmyliaDoNegocio(d);
    if (doMotor) return doMotor;
  }
  return contratoAssinado ? "financeiro" : null;
}

/**
 * O item do guia de um negócio que já não tem processo (ganho, com o contrato assinado): só serve para o guia ter uma fase, uma barra e «Fases feitas»
 * onde pôr Financeiro e Obra. Não tem valor nem prazo e o seu passo («Ganhar o negócio») não tem botão: o que se faz a seguir é da Emylia.
 */
export function itemDoPosContrato(negocio: { id: string; servico: string }, pessoaId: string): ItemProcesso {
  return {
    id: negocio.id, pessoaId, tipo: "negocio", fase: "contrato", trabalho: negocio.servico, valor: null, prazo: null, atrasado: false, orcamentos: 1,
    verificacao: "verificado", propostaRascunho: false, visitaFeita: false, propostaAceite: true, prontoAGanhar: true,
  };
}
