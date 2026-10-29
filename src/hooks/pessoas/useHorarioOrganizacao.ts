// O horário VERDADEIRO da organização (Configurações da Agenda › Horários): schedule_settings (hora de início e de fim, dias de trabalho, pausa de almoço)
// e os feriados próprios dela (schedule_holidays). Só leitura. Sem linha de horários a organização nunca os gravou: vale a omissão e `porOmissao` di-lo.
// Um erro de leitura não passa por «sem horário»: `isError` é verdadeiro e o ecrã di-lo.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { hhmm, HORARIO_POR_OMISSAO, type FeriadosOrg, type HorarioOrg } from "./horasLivresVisita";
import { useFontePessoas } from "./useFontePessoas";

export interface HorarioDaOrganizacao {
  horario: HorarioOrg;
  feriados: FeriadosOrg;
  /** A organização não tem horários gravados: está-se a usar a omissão (09:00 às 18:00, segunda a sexta). */
  porOmissao: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

const STALE_TIME_MS = 60_000;

export const horarioOrgQueryKey = (org: string | null) => ["neg-horario-organizacao", org] as const;

async function lerHorario(org: string): Promise<{ horario: HorarioOrg; feriados: FeriadosOrg; porOmissao: boolean }> {
  const [definicoes, feriados] = await Promise.all([
    supabase.from("schedule_settings")
      .select("working_hours_start, working_hours_end, working_days, lunch_window_start, lunch_window_end, lunch_duration_minutes")
      .eq("organization_id", org).maybeSingle(),
    supabase.from("schedule_holidays").select("holiday_date, is_recurring").eq("organization_id", org),
  ]);
  if (definicoes.error) throw definicoes.error;
  if (feriados.error) throw feriados.error;
  const datas = new Set<string>();
  const anuais = new Set<string>();
  for (const f of feriados.data ?? []) {
    if (typeof f.holiday_date !== "string") continue;
    if (f.is_recurring) anuais.add(f.holiday_date.slice(5, 10));
    else datas.add(f.holiday_date.slice(0, 10));
  }
  const s = definicoes.data;
  if (!s) return { horario: HORARIO_POR_OMISSAO, feriados: { datas, anuais }, porOmissao: true };
  const comAlmoco = s.lunch_window_start && s.lunch_window_end && (s.lunch_duration_minutes ?? 0) > 0;
  const horario: HorarioOrg = {
    inicio: hhmm(s.working_hours_start) || HORARIO_POR_OMISSAO.inicio,
    fim: hhmm(s.working_hours_end) || HORARIO_POR_OMISSAO.fim,
    dias: s.working_days ?? HORARIO_POR_OMISSAO.dias,
    almoco: comAlmoco ? { inicio: hhmm(s.lunch_window_start), fim: hhmm(s.lunch_window_end), minutos: s.lunch_duration_minutes ?? 0 } : null,
  };
  return { horario, feriados: { datas, anuais }, porOmissao: false };
}

export function useHorarioOrganizacao(): HorarioDaOrganizacao {
  const fonte = useFontePessoas();
  const org = fonte.modo === "real" ? fonte.organizationId : null;
  const consulta = useQuery({ queryKey: horarioOrgQueryKey(org), queryFn: () => lerHorario(org as string), enabled: org !== null, staleTime: STALE_TIME_MS });
  const d = consulta.data;
  return {
    horario: d?.horario ?? HORARIO_POR_OMISSAO,
    feriados: d?.feriados ?? { datas: new Set(), anuais: new Set() },
    porOmissao: d?.porOmissao ?? true,
    isLoading: org !== null && consulta.isLoading,
    isError: org !== null && consulta.isError,
    refetch: () => { void consulta.refetch(); },
  };
}
