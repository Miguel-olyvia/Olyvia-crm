/**
 * O relatório mensal de assiduidade de uma pessoa, delegando ao hook real que
 * lê em Supabase.
 *
 * CONVENÇÃO DE MÊS: os ecrãs de /rh-exemplo falam sempre em meses 1-12 (o mês do fecho da folha, no Processamento); o hook real
 * conta de 0 a 11. ESTA é a única conversão (`mes - 1`): quem chama NUNCA converte. `intervalo` é o da folha (de, ate inclusivos);
 * sem ele, o mês de calendário.
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
  intervalo?: { de: string; ate: string },
) {
  return useRelatorioAssiduidadeMensalReal(pessoaId, ano, mes - 1, intervalo);
}