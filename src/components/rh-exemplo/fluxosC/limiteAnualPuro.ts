/**
 * A regra pura do limite anual de horas extra de uma pessoa: o «Horas anuais máximas» do vínculo vigente
 * (`pessoas_vinculos.horas_anuais_maximas`); sem ele vale a omissão da organização. Sem hooks nem base, para o
 * store em memória das horas extra a poder usar sem arrastar a ligação à base.
 */
import type { PessoaVinculo } from "@/components/rh-exemplo/tipos";

/** Do vínculo só interessa o que decide qual vigora e o seu máximo anual. */
export type VinculoParaLimite = Pick<PessoaVinculo, "data_inicio" | "estado" | "horas_anuais_maximas">;

export function limiteAnualMin(
  ficha: { vinculos?: readonly VinculoParaLimite[] } | null | undefined,
  omissaoMin: number,
): number {
  const vinculos = [...(ficha?.vinculos ?? [])].sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));
  const vigente = vinculos.find((v) => v.estado === "activo") ?? vinculos[0];
  const horas = vigente?.horas_anuais_maximas;
  return typeof horas === "number" && horas > 0 ? Math.round(horas * 60) : omissaoMin;
}
