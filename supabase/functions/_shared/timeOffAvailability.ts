// Quem tem ausencia (ferias, baixa, falta) a cobrir um dia, para o tirar da
// lista de candidatos a uma visita nesse dia.
//
// Regra: itens de quadros schedule_boards com board_type = 'time_off', do
// utilizador (anew_users.id, o mesmo que schedule_resources.user_id), com
// status <> 'cancelled' e approval_status distinto de 'rejected'. Contam
// pendentes, aprovadas e 'clarification_requested' (e NULL); so rejeitadas e
// canceladas ficam de fora. Da MESMA organizacao, que sobrepoem o dia.
//
// Dois tipos de ferias: so all_day=true tira o candidato desse dia por
// completo; all_day=false ou nulo (inicio e fim com horas) so o tira se se
// sobrepuser ao intervalo pedido [hora, hora + duracao]. Sem intervalo pedido,
// o candidato com ferias com horas fica (tem horas livres no dia). all_day
// nulo conta como ferias COM HORAS, nunca como dia inteiro, alinhado com a
// migration 20261214100000_ferias_tiram_recurso_da_atribuicao.
//
// Uma so consulta para todos os candidatos. Chamar com o cliente service role:
// as ausencias dos colegas podem nao ser visiveis pela RLS de quem pede, e o
// resultado e so um conjunto de ids. O organization_id e obrigatorio (lanca
// erro se faltar) e aplica-se ao item e ao quadro ligado. Nao usa o orgScoped:
// esse helper chama .eq() logo a seguir a .from(), o que o supabase-js real nao
// permite (o filtro so existe depois do .select()); aqui aplica-se o padrao
// equivalente, com .eq("organization_id", ...) depois do select.

// Contrato minimo do query builder que esta consulta usa.
interface TimeOffClient {
  from(table: string): TimeOffQuery;
}

interface TimeOffQuery extends PromiseLike<{
  data: Array<{
    user_id: string | null;
    all_day: boolean | null;
    start_datetime: string;
    end_datetime: string;
  }> | null;
  error: { message: string } | null;
}> {
  select(columns: string): TimeOffQuery;
  eq(column: string, value: string): TimeOffQuery;
  neq(column: string, value: string): TimeOffQuery;
  in(column: string, values: string[]): TimeOffQuery;
  lte(column: string, value: string): TimeOffQuery;
  gte(column: string, value: string): TimeOffQuery;
  or(filters: string): TimeOffQuery;
}

export interface RequestedRange {
  startIso: string;
  endIso: string;
}

function overlapsRequested(
  item: { start_datetime: string; end_datetime: string },
  range: RequestedRange | null | undefined,
): boolean {
  if (!range) return false;
  const reqStart = new Date(range.startIso).getTime();
  const reqEnd = new Date(range.endIso).getTime();
  const offStart = new Date(item.start_datetime).getTime();
  const offEnd = new Date(item.end_datetime).getTime();
  return reqStart < offEnd && offStart < reqEnd;
}

/**
 * @param dayStartIso inicio do dia local, em ISO UTC
 * @param dayEndIso fim do dia local, em ISO UTC (inclusivo)
 * @param requestedRange hora pedida + duracao, em ISO UTC; null/omitido quando
 *   o pedido nao tem hora
 * @returns ids (anew_users.id) dos candidatos indisponiveis nesse dia/hora
 * @throws se organizationId faltar ou se a consulta falhar: um erro engolido
 *   deixaria passar, sem aviso, candidatos que estao de ferias.
 */
export async function findUserIdsOnTimeOff(
  supabase: unknown,
  organizationId: string | null | undefined,
  userIds: string[],
  dayStartIso: string,
  dayEndIso: string,
  requestedRange?: RequestedRange | null,
): Promise<Set<string>> {
  if (!organizationId) {
    throw new Error("findUserIdsOnTimeOff: organizationId is required");
  }
  if (userIds.length === 0) return new Set();

  const { data, error } = await (supabase as TimeOffClient)
    .from("schedule_items")
    .select("user_id, all_day, start_datetime, end_datetime, schedule_boards!inner(board_type, organization_id)")
    .eq("organization_id", organizationId)
    .eq("schedule_boards.board_type", "time_off")
    .eq("schedule_boards.organization_id", organizationId)
    .in("user_id", userIds)
    .neq("status", "cancelled")
    .or("approval_status.is.null,approval_status.neq.rejected")
    .lte("start_datetime", dayEndIso)
    .gte("end_datetime", dayStartIso);

  if (error) {
    throw new Error(`findUserIdsOnTimeOff: ${error.message}`);
  }

  const onTimeOff = new Set<string>();
  for (const item of data ?? []) {
    if (!item.user_id) continue;
    if (item.all_day === true || overlapsRequested(item, requestedRange)) {
      onTimeOff.add(item.user_id);
    }
  }
  return onTimeOff;
}
