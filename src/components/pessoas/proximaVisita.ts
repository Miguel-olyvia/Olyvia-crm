// A «Próxima visita» do Resumo da ficha e o contador da aba Visitas. Funções puras.
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import { ordenarVisitas } from "@/components/negocio-metas/visitasNegocio";
import type { ResumoPessoa } from "./pessoasTipos";

/**
 * A próxima visita da pessoa: a primeira, por ordem cronológica, que está Por fazer (nem feita nem cancelada) e é de hoje em diante.
 * Uma por fazer que já passou, ou sem dia, não é «a próxima»: aparece na aba Visitas.
 */
export function proximaVisitaDaPessoa(visitas: readonly VisitaPessoa[], hoje: string): VisitaPessoa | undefined {
  return (ordenarVisitas(visitas) as VisitaPessoa[]).find((v) => v.estado === "porFazer" && v.data !== "" && v.data >= hoje);
}

/** As visitas que não estão canceladas: o número da aba Visitas. */
export const contarVisitasAtivas = (visitas: readonly VisitaPessoa[]): number => visitas.filter((v) => v.estado !== "cancelada").length;

/** As visitas que a ficha mostra: uma pessoa perdida não tem visitas à vista (o Resumo e a aba dizem o mesmo). */
export const visitasDaFicha = (resumo: ResumoPessoa): readonly VisitaPessoa[] => (resumo.pessoa.perdida ? [] : resumo.registos.visitas);
