/**
 * O limite anual de horas extra de uma pessoa é o «Horas anuais máximas» da aba Contrato (grupo «Tempo de trabalho»).
 * Sem esse valor na ficha vale o limite anual por omissão da organização. O limite por dia é regra da organização.
 */
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";

export function limiteAnualMin(ficha: FichaRh | undefined, omissaoMin: number): number {
  const vinculos = [...(ficha?.vinculos ?? [])].sort((a, b) => b.data_inicio.localeCompare(a.data_inicio));
  const vigente = vinculos.find((v) => v.estado === "activo") ?? vinculos[0];
  const horas = vigente?.horas_anuais_maximas;
  return typeof horas === "number" && horas > 0 ? Math.round(horas * 60) : omissaoMin;
}

export function useLimiteAnualMin(pessoaId: string, omissaoMin: number): number {
  return useEstadoRh((e) => limiteAnualMin(e.fichas[pessoaId], omissaoMin));
}
