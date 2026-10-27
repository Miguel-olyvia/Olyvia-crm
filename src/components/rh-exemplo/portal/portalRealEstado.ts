// Do estado REAL do processo de admissão (o texto que a Edge `convite-admissao` devolve) para o que a moldura da
// pré-visualização desenha: a etiqueta da «Ficha de admissão» e os quatro passos (Ficha, Aprovação do RH, Contrato, Acesso).
// Funções puras. Um estado que não se conhece não inventa um passo: todos ficam «por fazer» e a etiqueta cai em «a preencher».
import type { EtiquetaFicha, PassoPortal, SituacaoPasso } from "@/components/rh-exemplo/lib/portalEstado";

type Linha = readonly [SituacaoPasso, SituacaoPasso, SituacaoPasso, SituacaoPasso];

const PASSOS: readonly PassoPortal[] = ["ficha", "aprovacao", "contrato", "acesso"];

const POR_ESTADO: Readonly<Record<string, Linha>> = {
  convidada: ["atual", "falta", "falta", "falta"],
  em_preenchimento: ["atual", "falta", "falta", "falta"],
  devolvida: ["atual", "falta", "falta", "falta"],
  submetida: ["feito", "atual", "falta", "falta"],
  aprovada: ["feito", "feito", "atual", "falta"],
  a_aguardar_assinaturas: ["feito", "feito", "atual", "falta"],
  assinaturas_concluidas: ["feito", "feito", "feito", "atual"],
  a_aguardar_ativacao: ["feito", "feito", "feito", "atual"],
  concluida: ["feito", "feito", "feito", "feito"],
};

const TODOS_POR_FAZER: Linha = ["falta", "falta", "falta", "falta"];

const conhecido = (estado: string | null | undefined): estado is string =>
  typeof estado === "string" && Object.prototype.hasOwnProperty.call(POR_ESTADO, estado);

export function passosDoEstadoReal(estado: string | null | undefined): Array<{ passo: PassoPortal; situacao: SituacaoPasso }> {
  const linha = conhecido(estado) ? POR_ESTADO[estado] : TODOS_POR_FAZER;
  return PASSOS.map((passo, i) => ({ passo, situacao: linha[i] }));
}

export function etiquetaDoEstadoReal(estado: string | null | undefined): EtiquetaFicha {
  if (!conhecido(estado) || estado === "convidada" || estado === "em_preenchimento") return "a_preencher";
  if (estado === "devolvida") return "devolvida";
  return estado === "submetida" ? "submetida" : "aprovada";
}
