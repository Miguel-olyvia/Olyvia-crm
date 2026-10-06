import { supabase } from "@/integrations/supabase/client";
import type { AreaParaSugestao } from "@/lib/addresses/sugestaoFichaLocal";

const COLUNAS_DIAG =
  "id, diag_tipo_area, diag_m2_pavimento, diag_area_m2, diag_distancia_entrada, diag_mobilada, diag_portas_proteger, diag_local_cortes, diag_demolir_m2";

/** As medidas da visita (deal_needs.diag_*) das áreas do orçamento. Falha → []. */
export async function lerAreasDaVisita(needIds: string[]): Promise<AreaParaSugestao[]> {
  if (needIds.length === 0) return [];
  try {
    const { data, error } = await supabase.from("deal_needs").select(COLUNAS_DIAG).in("id", needIds);
    if (error) {
      console.warn("[SugestaoFichaLocal] medidas da visita não lidas:", error.message);
      return [];
    }
    return (data ?? []) as unknown as AreaParaSugestao[];
  } catch {
    return [];
  }
}

/** As necessidades (áreas) ligadas às linhas de um orçamento gravado. Falha → []. */
export async function needIdsDoOrcamento(quoteId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("quote_lines")
      .select("source_deal_need_id")
      .eq("quote_id", quoteId);
    if (error) return [];
    return [...new Set((data ?? []).map((l) => (l as { source_deal_need_id: string | null }).source_deal_need_id).filter((x): x is string => !!x))];
  } catch {
    return [];
  }
}
