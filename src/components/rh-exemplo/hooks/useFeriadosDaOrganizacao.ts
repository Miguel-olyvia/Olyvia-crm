/**
 * Os feriados da organizacao (`schedule_holidays`), delegando ao hook real que le de Supabase. Servem os mapas de ausencias
 * da organizacao (Mes e Ano), que passam a pintar os feriados em vez de os tratar como dias normais.
 */
import { useFeriadosDaOrganizacao as useFeriadosDaOrganizacaoReal } from "@/hooks/useFeriadosDaOrganizacao";

export type { FeriadosDaOrganizacao } from "@/hooks/useFeriadosDaOrganizacao";

export function useFeriadosDaOrganizacao() {
  return useFeriadosDaOrganizacaoReal();
}
