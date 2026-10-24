// Os avisos da Frota do utilizador (notifications, kind='alert', type 'fleet_*'), criados pelo job diário
// fn_fleet_daily_alerts (vencimentos, revisões, multas por identificar, cartas a caducar). A barra lateral e o sino só
// mostram outros tipos, por isso o Hoje da Frota mostra-os, com ligação para a viatura e "dispensar".
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCachedAuthUser } from "@/lib/cachedAuth";
import { frotaKeys, tabela } from "./dados";

export interface AlertaFrota {
  id: string; type: string; title: string; message: string; priority: "low" | "medium" | "high" | "urgent"; link: string | null;
  data: { vehicle_id?: string; driver_id?: string } | null; entity_id: string | null; action_type: string | null; action_config: Record<string, unknown> | null; created_at: string;
}

/** O endereço de um aviso: a página do aviso (link) com a ficha da viatura aberta (?viatura=). */
export function rotaAlerta(a: Pick<AlertaFrota, "link" | "data">): string {
  const base = a.link || "/frota/hoje";
  const vid = a.data?.vehicle_id;
  return vid ? `${base}${base.includes("?") ? "&" : "?"}viatura=${encodeURIComponent(vid)}` : base;
}

export function useAlertasFrota(org: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: frotaKeys.alertas(org),
    queryFn: async (): Promise<AlertaFrota[]> => {
      const { data: u } = await getCachedAuthUser();
      if (!u.user) return [];
      const { data, error } = await tabela("notifications")
        .select("id, type, title, message, priority, link, data, entity_id, action_type, action_config, created_at")
        .eq("user_id", u.user.id).eq("organization_id", org).eq("kind", "alert").like("type", "fleet_%")
        .eq("is_dismissed", false).eq("is_resolved", false).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as AlertaFrota[];
    },
    enabled: !!org,
    staleTime: 60_000,
  });
  const dispensar = async (id: string): Promise<void> => {
    await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: string) => Promise<unknown> } } })
      .from("notifications").update({ is_dismissed: true }).eq("id", id);
    await qc.invalidateQueries({ queryKey: frotaKeys.alertas(org) });
  };
  return { alertas: q.data ?? [], dispensar };
}
