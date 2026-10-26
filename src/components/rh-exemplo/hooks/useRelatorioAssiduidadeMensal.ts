/**
 * O relatório mensal de assiduidade de uma pessoa, delegando ao hook real que
 * lê em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useRelatorioAssiduidadeMensal as useRelatorioAssiduidadeMensalReal } from "@/hooks/useRelatorioAssiduidadeMensal";

export type {
  ObraHoras,
  EstadoDiaRelatorio,
  IntervaloRelatorio,
  DiaRelatorioMensal,
  TotaisRelatorioMensal,
  RelatorioAssiduidadeMensal,
} from "@/hooks/useRelatorioAssiduidadeMensal";

export function useRelatorioAssiduidadeMensal(
  pessoaId: string | undefined,
  ano: number,
  mes: number,
) {
  return useRelatorioAssiduidadeMensalReal(pessoaId, ano, mes);
}
