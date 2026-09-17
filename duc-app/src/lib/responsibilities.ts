import { supabase } from "./supabase";
import { fetchEffectiveStages, fetchOrgRoles } from "./ducConfig";
import { fetchOrgMembers } from "./members";
import type { StageRecipient } from "./ducSchema";
import type { TrackingEntry, DucVariant } from "./types";

/** Estado/privilégios de UMA etapa dentro de um DUC. */
export interface StageResponsibility {
  stageNo: number;
  title: string;
  /** Rótulo de função do schema (ex.: "Financeiro"). */
  responsibleLabel: string;
  /** Responsável atribuído (user Olyvia), quando definido. */
  assignedName: string | null;
  state: "pending" | "done" | "skipped";
  isCurrent: boolean;
  /** Quem é notificado nesta etapa (membros, funções, emails) — já legível. */
  notified: Array<{ kind: "member" | "role" | "email"; label: string }>;
}

/** Um DUC ativo com o mapa de responsabilidades/notificações por etapa. */
export interface DucResponsibility {
  ducId: string;
  ducNumber: string | null;
  clientName: string | null;
  variant: DucVariant;
  currentStage: number;
  stages: StageResponsibility[];
}

interface DucRow {
  id: string;
  duc_number: string | null;
  title: string | null;
  variant: DucVariant;
  current_stage: number;
  status: string;
  tracking: TrackingEntry[] | null;
}

/**
 * Mapa de responsabilidades e privilégios de notificação de todos os DUCs ativos
 * da organização: por etapa, quem está atribuído (assignee) e quem é notificado
 * (membros / funções / emails, resolvidos a partir da config da org). Serve a
 * vista "Responsabilidades" da área de notificações.
 */
export async function fetchStageResponsibilities(orgId: string): Promise<DucResponsibility[]> {
  if (!orgId) return [];

  const [{ data: ducs }, members, roles] = await Promise.all([
    supabase
      .from("anew_client_ducs")
      .select("id, duc_number, title, variant, current_stage, status, tracking")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .neq("status", "closed")
      .order("duc_number", { ascending: true })
      .limit(200),
    fetchOrgMembers(orgId),
    fetchOrgRoles(orgId),
  ]);

  const rows = (ducs ?? []) as DucRow[];
  if (rows.length === 0) return [];

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "Membro";
  const roleLabel = (key: string) => roles.find((r) => r.key === key)?.label ?? "Função";

  // Etapas efetivas por variante (config da org), com cache — o notify vive aqui.
  const stagesByVariant = new Map<DucVariant, Awaited<ReturnType<typeof fetchEffectiveStages>>>();
  const variants = Array.from(new Set(rows.map((r) => r.variant)));
  await Promise.all(
    variants.map(async (v) => stagesByVariant.set(v, await fetchEffectiveStages(orgId, v)))
  );

  const labelFor = (r: StageRecipient): { kind: "member" | "role" | "email"; label: string } => {
    if (r.type === "member") return { kind: "member", label: r.label ?? memberName(r.value) };
    if (r.type === "role") return { kind: "role", label: roleLabel(r.value) };
    return { kind: "email", label: r.value };
  };

  return rows.map((row) => {
    const eff = stagesByVariant.get(row.variant);
    const tracking = (row.tracking ?? []) as TrackingEntry[];
    const stages: StageResponsibility[] = (eff?.stages ?? []).map((s) => {
      const entry = tracking.find((t) => t.stage === s.no);
      return {
        stageNo: s.no,
        title: s.title.split(" — ")[0],
        responsibleLabel: s.responsible ?? "",
        assignedName: entry?.assigned_name ?? null,
        state: (entry?.state as StageResponsibility["state"]) ?? "pending",
        isCurrent: s.no === row.current_stage,
        notified: (s.notify?.recipients ?? []).map(labelFor),
      };
    });
    return {
      ducId: row.id,
      ducNumber: row.duc_number,
      clientName: row.title,
      variant: row.variant,
      currentStage: row.current_stage,
      stages,
    };
  });
}
