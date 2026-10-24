// As visitas e o levantamento de um negócio DERIVAM dos registos da pessoa que estão ligados a ele (nada se copia, nunca há fonte dupla). Um negócio
// de exemplo antigo, sem registos ligados, continua a mostrar o que trazia. Funções puras.
import { paraLevantamentoNegocio } from "./levantamento";
import type { LevantamentoNegocio, NegocioMes, VisitaNegocio } from "./negocioMetas";
import type { LevantamentoPessoa, RegistosDaPessoa } from "./registosTipos";
import { visitasDoNegocio } from "./visitasNegocio";

/** As visitas do negócio: as dos registos ligados a ele; sem nenhuma ligada, as que o negócio de exemplo trazia. */
export const visitasDerivadas = (negocio: NegocioMes, ligados: RegistosDaPessoa): VisitaNegocio[] =>
  ligados.visitas.length > 0 ? [...ligados.visitas] : visitasDoNegocio(negocio);

/** O levantamento de um registo, em texto para o ler (um levantamento ligado está feito). `rotulo` devolve o nome visível de uma divisão, trabalho ou unidade. */
export function levantamentoDoRegisto(
  l: LevantamentoPessoa, rotulo: (grupo: "room" | "work" | "unit", chave: string) => string,
): LevantamentoNegocio {
  return paraLevantamentoNegocio({ data: l.data, feitoPor: l.feitoPor, estado: "feito", linhas: l.rascunho.linhas, observacoes: l.rascunho.observacoes }, rotulo);
}

/**
 * O levantamento do negócio: o do registo ligado mais recente; sem nenhum, o que o negócio de exemplo trazia (`undefined` se não traz).
 * Com registos ligados o do negócio antigo não se junta.
 */
export function levantamentoDerivado(
  negocio: NegocioMes, ligados: RegistosDaPessoa, rotulo: (grupo: "room" | "work" | "unit", chave: string) => string,
): LevantamentoNegocio | undefined {
  const maisRecente = [...ligados.levantamentos].sort((a, b) => b.data.localeCompare(a.data))[0];
  return maisRecente ? levantamentoDoRegisto(maisRecente, rotulo) : negocio.levantamento;
}
