import { supabase } from "./supabase";
import {
  DUC_STAGES,
  fieldsForVariant,
  sectionsForVariant,
  stageAppliesToVariant,
  type DucStage,
} from "./ducSchema";
import type { DucVariant } from "./types";

/** Cópia profunda do template de raiz. */
export function baseStages(): DucStage[] {
  return JSON.parse(JSON.stringify(DUC_STAGES)) as DucStage[];
}

/**
 * Template de raiz já resolvido para uma variante — os campos/etapas específicos
 * da variante ficam incluídos e sem tags de variante (a config passa a ser a
 * fonte de verdade para essa organização).
 */
export function stagesForVariant(variant: DucVariant): DucStage[] {
  return baseStages()
    .filter((s) => stageAppliesToVariant(s, variant))
    .map((s) => ({
      ...s,
      fields: fieldsForVariant(s.fields, variant).map((f) => ({ ...f, variants: undefined })),
      itemSections: sectionsForVariant(s, variant),
    }));
}

export interface EffectiveConfig {
  stages: DucStage[];
  custom: boolean;
}

/** Etapas efetivas para uma organização: override guardado, ou template de raiz. */
export async function fetchEffectiveStages(
  orgId: string,
  variant: DucVariant
): Promise<EffectiveConfig> {
  // order+limit(1) em vez de maybeSingle(): se existir mais do que uma linha de
  // config para a org (ex. race no upsert), maybeSingle() devolveria erro e a
  // config personalizada deixaria de aplicar silenciosamente. Aqui usamos a mais
  // recente e registamos qualquer erro em vez de o engolir.
  const { data, error } = await supabase
    .from("anew_client_duc_configs")
    .select("config")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[DUC] erro a carregar config efetiva:", error);
  }
  const cfg = (data?.[0]?.config as { stages?: DucStage[] } | null) ?? null;
  if (cfg?.stages && Array.isArray(cfg.stages) && cfg.stages.length > 0) {
    return { stages: cfg.stages, custom: true };
  }
  return { stages: stagesForVariant(variant), custom: false };
}

export async function saveDucConfig(
  orgId: string,
  stages: DucStage[],
  userId: string | null
): Promise<string | null> {
  const { error } = await supabase.from("anew_client_duc_configs").upsert(
    {
      organization_id: orgId,
      config: { stages },
      updated_by: userId,
    },
    { onConflict: "organization_id" }
  );
  return error?.message ?? null;
}

/** Repõe o template de raiz (apaga o override da organização). */
export async function resetDucConfig(orgId: string): Promise<string | null> {
  const { error } = await supabase
    .from("anew_client_duc_configs")
    .delete()
    .eq("organization_id", orgId);
  return error?.message ?? null;
}
