// Regra 16: os feriados vinham só da API externa (Nager.Date) para o
// calendário os mostrar riscados ao cliente -- nunca ficavam gravados em
// schedule_holidays, que é a única tabela que get_resource_available_slots/
// get_month_availability consultam a sério para decidir os horários.
// Resultado: um feriado aparecia riscado no ecrã, mas continuava a deixar
// marcar. Confirmado ao vivo (24/09): 25/12/2026 devolvia os 15 horários
// normais, e schedule_holidays não tinha nenhuma linha para 2026.
//
// Este helper garante que, antes de qualquer RPC de disponibilidade correr,
// os feriados do país/ano pedido já estão gravados (globais, organization_id
// NULL -- mesmo padrão das linhas de 2025 já existentes, partilhadas entre
// organizações do mesmo país).
const SYSTEM_CREATED_BY = '00000000-0000-0000-0000-000000000000';

interface NagerHoliday {
  date: string;
  localName: string;
  name: string;
  fixed: boolean;
}

export async function ensureHolidaysPersisted(
  supabase: any,
  countryCode: string,
  years: number[],
): Promise<void> {
  const uniqueYears = Array.from(new Set(years));

  for (const year of uniqueYears) {
    try {
      // Conta só feriados públicos globais (organization_id NULL, is_custom
      // false) -- um bloqueio manual de uma organização (is_custom true,
      // com organization_id próprio) não prova que os feriados públicos já
      // foram importados para este ano. Confundir os dois foi o que fez a
      // primeira tentativa desta correcção continuar sem efeito: havia um
      // bloqueio manual de 2026 já na tabela, e a verificação parava aí.
      const { count } = await supabase
        .from('schedule_holidays')
        .select('id', { count: 'exact', head: true })
        .eq('country_code', countryCode)
        .eq('is_custom', false)
        .is('organization_id', null)
        .gte('holiday_date', `${year}-01-01`)
        .lte('holiday_date', `${year}-12-31`);

      if ((count ?? 0) > 0) continue; // já gravado (importado antes, ou seed original)

      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`);
      if (!res.ok) {
        console.error(`[ensureHolidays] Nager API error for ${countryCode}/${year}: ${res.status}`);
        continue;
      }
      const holidays: NagerHoliday[] = await res.json();
      if (!Array.isArray(holidays) || holidays.length === 0) continue;

      const rows = holidays.map(h => ({
        name: h.localName || h.name,
        holiday_date: h.date,
        country_code: countryCode,
        organization_id: null,
        is_recurring: h.fixed,
        is_custom: false,
        created_by: SYSTEM_CREATED_BY,
      }));

      const { error: insertError } = await supabase.from('schedule_holidays').insert(rows);
      if (insertError) {
        console.error(`[ensureHolidays] failed to persist ${countryCode}/${year}:`, insertError);
      } else {
        console.log(`[ensureHolidays] persisted ${rows.length} holidays for ${countryCode}/${year}`);
      }
    } catch (e) {
      console.error(`[ensureHolidays] unexpected error for ${countryCode}/${year}:`, e);
    }
  }
}
