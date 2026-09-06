import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import { extractLeadContactInfo } from "@/utils/leadContactInfo";
import { classifyAgendaItems, type AgendaSections } from "@/lib/agenda/classify";
import {
  getAgendaQueryRange,
  getDayWindow,
  isSameLocalDay,
  shiftDays,
  type DayWindow,
} from "@/lib/agenda/dayWindow";
import { getItemType, getLeadId } from "@/lib/agenda/itemType";
import { selectItemsForOwners } from "@/lib/agenda/ownership";
import type { AgendaEntityRef, AgendaItem, AgendaItemRow } from "@/lib/agenda/types";

/**
 * Colunas lidas de `schedule_items`.
 *
 * `duration_minutes` é GENERATED STORED na base: lê-se, nunca se calcula aqui.
 * O embed dos assignees é obrigatório — é por ele que passa 99% da atribuição
 * real (ver `src/lib/agenda/ownership.ts`).
 */
const AGENDA_SELECT = `
  id,
  title,
  description,
  status,
  start_datetime,
  end_datetime,
  duration_minutes,
  all_day,
  location,
  client_id,
  contact_id,
  deal_id,
  user_id,
  metadata,
  board:schedule_boards(id, name, color),
  assignees:schedule_item_assignees(
    resource:schedule_resources(user_id)
  )
`;

export interface UseMyDayResult {
  /** Dia visível (referência local). */
  day: Date;
  window: DayWindow;
  isToday: boolean;
  goToPreviousDay: () => void;
  goToNextDay: () => void;
  goToToday: () => void;
  sections: AgendaSections<AgendaItem>;
  totalCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const EMPTY_SECTIONS: AgendaSections<AgendaItem> = { overdue: [], timed: [], allDay: [] };

/**
 * Resolve os nomes das entidades associadas aos itens.
 *
 * Falhar aqui não pode esconder a agenda: sem permissão de leads ou de
 * clientes o utilizador continua a ter direito a ver o seu dia, só sem o nome
 * da entidade. Por isso os erros só ficam em `console.warn`.
 */
async function resolveEntities(rows: AgendaItemRow[]): Promise<Map<string, AgendaEntityRef>> {
  const byItemId = new Map<string, AgendaEntityRef>();

  const leadIds = new Set<string>();
  const clientIds = new Set<string>();
  for (const row of rows) {
    const leadId = getLeadId(row);
    if (leadId) leadIds.add(leadId);
    else if (row.client_id) clientIds.add(row.client_id);
  }

  const leadNames = new Map<string, string>();
  if (leadIds.size > 0) {
    const { data, error } = await supabase
      .from("anew_leads")
      .select("id, field_values, entity:anew_entities(display_name)")
      .in("id", Array.from(leadIds));
    if (error) console.warn("[useMyDay] leads por resolver:", error.message);
    (data ?? []).forEach((lead: any) => {
      const displayName = lead?.entity?.display_name as string | undefined;
      const name = displayName?.trim() || extractLeadContactInfo(lead?.field_values).name;
      if (lead?.id && name) leadNames.set(lead.id, name);
    });
  }

  const clientNames = new Map<string, string>();
  if (clientIds.size > 0) {
    const { data, error } = await supabase
      .from("anew_clients")
      .select("id, entity:anew_entities!anew_clients_entity_id_fkey(display_name)")
      .in("id", Array.from(clientIds));
    if (error) console.warn("[useMyDay] clientes por resolver:", error.message);
    (data ?? []).forEach((client: any) => {
      const name = (client?.entity?.display_name as string | undefined)?.trim();
      if (client?.id && name) clientNames.set(client.id, name);
    });
  }

  for (const row of rows) {
    const leadId = getLeadId(row);
    if (leadId) {
      const name = leadNames.get(leadId);
      if (name) byItemId.set(row.id, { kind: "lead", id: leadId, name });
      continue;
    }
    if (row.client_id) {
      const name = clientNames.get(row.client_id);
      if (name) byItemId.set(row.id, { kind: "client", id: row.client_id, name });
    }
  }

  return byItemId;
}

/**
 * "O Meu Dia" — leitura pura da agenda de um dia. NÃO escreve nada.
 *
 * Toda a decisão (janela, união de donos, classificação, ordenação) vive em
 * `src/lib/agenda/`, em funções puras testadas. Aqui fica só o acesso a dados.
 */
export function useMyDay(): UseMyDayResult {
  const { activeCompany } = useCompany();
  const {
    anewUserId,
    loading: scopeLoading,
  } = usePermissionScope();

  const [day, setDay] = useState<Date>(() => new Date());
  const [rows, setRows] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // As Atividades sao a agenda PESSOAL de cada um: mostram o que e seu, e mais
  // nada. Nao ha ambito aqui de proposito -- a visao de equipa e da organizacao
  // vive nos Agendamentos, que existem para isso. Ter as duas paginas a mostrar
  // conjuntos diferentes conforme uma permissao era a origem da confusao.
  const ownerIds = anewUserId ? [anewUserId] : [];
  const dayWindow = useMemo(() => getDayWindow(day), [day]);
  const organizationId = activeCompany?.id ?? null;

  useEffect(() => {
    if (scopeLoading) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      if (!organizationId || !anewUserId) {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      try {
        const range = getAgendaQueryRange(dayWindow);
        const { data, error: queryError } = await supabase
          .from("schedule_items")
          .select(AGENDA_SELECT)
          .eq("organization_id", organizationId)
          .gte("start_datetime", range.fromIso)
          .lte("start_datetime", range.toIso)
          .order("start_datetime", { ascending: true });

        if (queryError) throw queryError;

        const fetched = (data ?? []) as unknown as AgendaItemRow[];
        const scoped = selectItemsForOwners(fetched, ownerIds);

        const entities = await resolveEntities(scoped);
        if (cancelled) return;

        setRows(
          scoped.map((row) => ({
            ...row,
            itemType: getItemType(row),
            entity: entities.get(row.id) ?? null,
          }))
        );
      } catch (err: any) {
        if (cancelled) return;
        console.error("[useMyDay] falha a ler a agenda:", err);
        setError(err?.message ?? String(err));
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, anewUserId, dayWindow, scopeLoading, reloadToken]);

  const sections = useMemo(
    () => (rows.length === 0 ? EMPTY_SECTIONS : classifyAgendaItems(rows, dayWindow)),
    [rows, dayWindow]
  );

  const goToPreviousDay = useCallback(() => setDay((current) => shiftDays(current, -1)), []);
  const goToNextDay = useCallback(() => setDay((current) => shiftDays(current, 1)), []);
  const goToToday = useCallback(() => setDay(new Date()), []);
  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  return {
    day,
    window: dayWindow,
    isToday: isSameLocalDay(day, new Date()),
    goToPreviousDay,
    goToNextDay,
    goToToday,
    sections,
    totalCount: sections.overdue.length + sections.timed.length + sections.allDay.length,
    loading: loading || scopeLoading,
    error,
    refresh,
  };
}
