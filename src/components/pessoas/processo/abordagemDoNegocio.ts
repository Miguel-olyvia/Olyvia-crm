// A abordagem DO NEGÓCIO. O Pipeline só tem negócios, e um negócio ainda sem orçamento, proposta, contrato nem levantamento guardado está em Por contactar,
// Contactado ou Visita, pelo que tem ligado: a mesma regra que a base usa para a coluna do quadro (levantamento > visita marcada > chamada > nada). Funções
// puras: a ficha do negócio usa-as para escolher o guia (e o assistente) certo, sem esperar que o item do processo, que vem do exemplo, o diga.
import type { ColunaQuadro } from "../quadro/cartoesQuadroPessoas";
import type { ItemProcesso } from "./tiposProcesso";

/** O que o negócio tem ligado, já contado (as visitas canceladas não entram). */
export interface LigadosDoNegocio {
  contactos: number;
  /** As visitas ligadas que não estão canceladas. */
  visitasMarcadas: number;
  /** Os levantamentos ligados já guardados. */
  levantamentos: number;
  /** O negócio traz um levantamento escrito (criado em «Novo negócio»): conta como guardado. */
  comLevantamentoEscrito: boolean;
}

const FASES_DE_ABORDAGEM: readonly ColunaQuadro[] = ["porContactar", "contactado", "visita", "levantamento"];

/** A fase é da abordagem (Por contactar, Contactado, Visita ou Levantamento): ainda não há orçamento. */
export const ehFaseDeAbordagem = (fase: ColunaQuadro): boolean => FASES_DE_ABORDAGEM.includes(fase);

/**
 * A fase de um item de negócio. Só um negócio em Orçamento SEM orçamentos e sem levantamento guardado recua para a abordagem (é o que a base faz); com
 * orçamentos, proposta ou contrato, ou em Levantamento (a decisão escrita no negócio), fica como está. Um item de pessoa nunca se mexe.
 */
export function faseDaAbordagem(item: ItemProcesso, ligados: LigadosDoNegocio): ColunaQuadro {
  if (item.tipo !== "negocio" || item.fase !== "orcamento" || item.orcamentos > 0) return item.fase;
  if (ligados.levantamentos > 0 || ligados.comLevantamentoEscrito) return item.fase;
  if (ligados.visitasMarcadas > 0) return "visita";
  if (ligados.contactos > 0) return "contactado";
  return "porContactar";
}

const ORDEM_DA_ABORDAGEM: readonly ColunaQuadro[] = ["porContactar", "contactado", "visita", "levantamento"];

/**
 * Quando uma fase da abordagem se conclui (uma chamada registada, uma visita marcada, o levantamento guardado) o negócio passa à seguinte NO MOMENTO, sem esperar que
 * o quadro volte a ler: o item avança para a fase que o que tem ligado diz (a mesma ordem da base). Só avança, e só na abordagem; o mesmo objeto se nada muda.
 */
export function itemComFaseConcluida(item: ItemProcesso, ligados: LigadosDoNegocio): ItemProcesso {
  if (item.tipo !== "negocio" || !ehFaseDeAbordagem(item.fase)) return item;
  const concluida: ColunaQuadro = ligados.levantamentos > 0 || ligados.comLevantamentoEscrito ? "levantamento"
    : ligados.visitasMarcadas > 0 ? "visita" : ligados.contactos > 0 ? "contactado" : "porContactar";
  return ORDEM_DA_ABORDAGEM.indexOf(concluida) > ORDEM_DA_ABORDAGEM.indexOf(item.fase) ? { ...item, fase: concluida } : item;
}

/** O item com a fase da abordagem; o mesmo objeto se a fase não muda. */
export function itemComFaseDaAbordagem(item: ItemProcesso, ligados: LigadosDoNegocio): ItemProcesso {
  const fase = faseDaAbordagem(item, ligados);
  return fase === item.fase ? item : { ...item, fase };
}
