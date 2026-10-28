// O percurso do negócio: levantamento (opcional) -> orçamento -> proposta -> contrato -> ganho, ou perdido em qualquer fase. A fase
// DERIVA dos dados do negócio (nunca se guarda) e `FaseNegocio` não se altera: Levantamento só existe aqui, antes do Orçamento.
// Os registos da pessoa (contactos, visitas) não puxam o negócio para trás: só um levantamento ligado conta para sair de Levantamento.
import { faseDoNegocio, type FaseNegocio, type NegocioMes } from "./negocioMetas";
import type { EstadoRegistos } from "./registosTipos";

/** A fase de um negócio no percurso: as quatro de sempre mais Levantamento (antes) e Perdido (fora do percurso). */
export type FasePercurso = "levantamento" | FaseNegocio | "perdido";

/** A fase em que um negócio estava quando foi perdido: qualquer uma menos "perdido". */
export type FaseNaPerda = Exclude<FasePercurso, "perdido">;

/** O que se sabe da perda de um negócio e basta para o percurso. */
export interface PerdaDoPercurso {
  fase: FaseNaPerda;
}

export interface OpcoesPercurso {
  /** A perda guardada do negócio, se está perdido. */
  perda?: PerdaDoPercurso;
  /** Os registos das pessoas: sem eles, "ligado" fia-se na decisão do negócio. */
  registos?: EstadoRegistos;
}

/** O negócio tem um levantamento ligado? Sem registos à mão, vale a decisão escrita no negócio. */
function temLevantamentoLigado(negocio: NegocioMes, registos: EstadoRegistos | undefined): boolean {
  if (registos === undefined) return true;
  return registos.levantamentos.some((l) => l.negocioId === negocio.id);
}

/**
 * Sem orçamentos nem proposta, o negócio está em Levantamento enquanto o levantamento está por decidir, ou ligado mas ainda sem
 * nenhum levantamento ligado. Dispensado, ou com um levantamento ligado, passa a Orçamento. Os negócios antigos, sem decisão,
 * contam como Orçamento (o que sempre foram).
 * Um negócio DA BASE (`estadoReal`) com registos à mão segue a regra da base para a coluna do Quadro (neg_resumo_quadro): sem orçamentos, está em
 * Levantamento se tem um levantamento ligado (feito ou por fazer) e, se não tem, não está (a abordagem trata do resto); a decisão não conta.
 */
function aindaEmLevantamento(negocio: NegocioMes, registos: EstadoRegistos | undefined): boolean {
  if (negocio.orcamentos.length > 0) return false;
  if (negocio.estadoReal !== undefined && registos !== undefined) return registos.levantamentos.some((l) => l.negocioId === negocio.id);
  const decisao = negocio.decisaoLevantamento;
  if (decisao === "porDecidir") return true;
  return decisao === "ligado" && !temLevantamentoLigado(negocio, registos);
}

/** A fase do negócio no percurso. Com uma perda, "perdido"; as fases Proposta, Contrato e Ganho mandam sobre o levantamento. */
export function faseDoPercurso(negocio: NegocioMes, opcoes: OpcoesPercurso = {}): FasePercurso {
  if (opcoes.perda) return "perdido";
  const fase = faseDoNegocio(negocio);
  if (fase !== "orcamento") return fase;
  return aindaEmLevantamento(negocio, opcoes.registos) ? "levantamento" : "orcamento";
}

/** A fase em que o negócio está agora (nunca "perdido"): é a que se guarda quando se perde. */
export function faseNaPerda(negocio: NegocioMes, registos?: EstadoRegistos): FaseNaPerda {
  return faseDoPercurso(negocio, { registos }) as FaseNaPerda;
}

/**
 * Um negócio conta para as metas a partir do Orçamento. Um perdido conta conforme a fase em que foi perdido: perdido em
 * Levantamento nunca chegou às metas. O funil da abordagem (Levantamento e antes) conta à parte.
 */
export function contaParaMetas(negocio: NegocioMes, opcoes: OpcoesPercurso = {}): boolean {
  const fase = opcoes.perda ? opcoes.perda.fase : faseDoPercurso(negocio, opcoes);
  return fase !== "levantamento";
}

/** Os negócios que contam para as metas (a partir do Orçamento), pela mesma ordem. Os que estão em Levantamento ficam de fora. */
export const negociosParaMetas = (negocios: readonly NegocioMes[], registos?: EstadoRegistos): NegocioMes[] =>
  negocios.filter((n) => contaParaMetas(n, { registos }));

/** As colunas da abordagem que o funil conta (as mesmas da Parte 1 do Quadro de Pessoas). */
export type ColunaFunil = "porContactar" | "contactado" | "visita";

/** O funil da abordagem: as pessoas por coluna e os negócios em Levantamento. Conta à parte das metas. */
export interface DadosFunil {
  porContactar: number;
  contactado: number;
  visita: number;
  levantamento: number;
}

/**
 * Conta o funil: `colunas` tem a coluna de cada pessoa (`null` fora da abordagem, que não conta) e os negócios em Levantamento
 * contam como a última etapa da abordagem.
 */
export function funilDaAbordagem(
  colunas: readonly (ColunaFunil | null)[], negocios: readonly NegocioMes[], registos?: EstadoRegistos,
): DadosFunil {
  const pessoas = (coluna: ColunaFunil): number => colunas.filter((c) => c === coluna).length;
  return {
    porContactar: pessoas("porContactar"), contactado: pessoas("contactado"), visita: pessoas("visita"),
    levantamento: negocios.filter((n) => faseDoPercurso(n, { registos }) === "levantamento").length,
  };
}
