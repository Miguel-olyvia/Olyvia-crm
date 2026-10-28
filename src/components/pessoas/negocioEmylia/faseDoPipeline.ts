// A fase de um negócio no Pipeline, numa SÓ função partilhada pela ficha e pelo quadro, para os dois nunca discordarem. As seis fases são as de /negocios (FASES da
// Emylia): Por contactar, Contactado, Visita, Negócio, Financeiro, Obra, e `negocios.fase` (0 a 5) grava-as. Enquanto `negocios.fase` for nula (os negócios do CRM),
// deriva-se do que o negócio tem, pela MESMA ordem que a base usa para a coluna do quadro (neg_resumo_quadro, lido no catálogo): contrato > proposta > orçamento >
// levantamento (só com levantamento GUARDADO) > visita > chamada > por contactar. As quatro colunas levantamento, orçamento, proposta e contrato do quadro são a fase
// Negócio. Funções puras.
import type { ColunaQuadro } from "../quadro/cartoesQuadroPessoas";

export const FASES_PIPELINE = ["porContactar", "contactado", "visita", "negocio", "financeiro", "obra"] as const;
export type FasePipeline = (typeof FASES_PIPELINE)[number];

/** O número de `negocios.fase` (0 a 5) de uma fase. */
export const numeroDaFase = (f: FasePipeline): number => FASES_PIPELINE.indexOf(f);

/** A fase de um `negocios.fase` gravado; `null` se é nulo ou não é um inteiro de 0 a 5. */
export function fasePipelineDaGravada(fase: number | null | undefined): FasePipeline | null {
  return typeof fase === "number" && Number.isInteger(fase) && fase >= 0 && fase < FASES_PIPELINE.length ? FASES_PIPELINE[fase] : null;
}

/** O que o negócio tem (o que o CRM sabe dele). */
export interface TemDoNegocio {
  chamadas: number;
  /** Visitas ligadas que não estão canceladas. */
  visitas: number;
  /** Há um levantamento GUARDADO (ligado ou escrito no negócio). */
  levantamento: boolean;
  orcamentos: number;
  proposta: boolean;
  contrato: boolean;
}

export function fasePipelineDerivada(t: TemDoNegocio): FasePipeline {
  if (t.contrato || t.proposta || t.orcamentos > 0 || t.levantamento) return "negocio";
  if (t.visitas > 0) return "visita";
  if (t.chamadas > 0) return "contactado";
  return "porContactar";
}

interface EntradaFase {
  /** `negocios.fase`; `null` nos negócios que o CRM criou. */
  faseGravada: number | null | undefined;
  tem: TemDoNegocio;
}

/** A fase gravada, ou a derivada; vale a mais avançada, para a fase gravada atrasada nunca esconder o que o negócio já tem. */
export function fasePipeline({ faseGravada, tem }: EntradaFase): FasePipeline {
  const derivada = fasePipelineDerivada(tem);
  const gravada = fasePipelineDaGravada(faseGravada);
  return gravada !== null && numeroDaFase(gravada) > numeroDaFase(derivada) ? gravada : derivada;
}

/** A fase de uma coluna do quadro: Levantamento, Orçamento, Proposta e Contrato são a fase Negócio. */
export function faseDaColunaDoQuadro(coluna: ColunaQuadro): FasePipeline {
  return coluna === "porContactar" || coluna === "contactado" || coluna === "visita" ? coluna : "negocio";
}
