import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PipelineLink {
  id: string;
  lead_id: string | null;
  deal_id: string | null;
  proposal_id: string | null;
  quote_id: string | null;
  contract_id: string | null;
  client_id: string | null;
  organization_id: string;
  root_organization_id: string | null;
  status: string;
}

type EntityType = "lead" | "deal" | "proposal" | "quote" | "contract" | "client";

const COLUMN_MAP: Record<EntityType, string> = {
  lead: "lead_id",
  deal: "deal_id",
  proposal: "proposal_id",
  quote: "quote_id",
  contract: "contract_id",
  client: "client_id",
};

async function queryPipelineLinks(col: string, entityId: string, selectFields = "*") {
  return await (supabase.from("pipeline_links") as any)
    .select(selectFields)
    .eq(col, entityId)
    .eq("status", "active")
    .maybeSingle();
}

export function usePipelineLinks(entityType: EntityType, entityId: string | null) {
  const [pipelineLink, setPipelineLink] = useState<PipelineLink | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchLink = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const col = COLUMN_MAP[entityType];
      const { data } = await queryPipelineLinks(col, entityId);
      setPipelineLink(data as PipelineLink | null);
    } catch (err) {
      console.error("Failed to fetch pipeline link:", err);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    fetchLink();
  }, [fetchLink]);

  const createOrUpdateLink = useCallback(async (
    updates: Partial<PipelineLink>,
    organizationId: string,
    rootOrganizationId?: string | null
  ) => {
    if (!entityId) return null;
    
    const col = COLUMN_MAP[entityType];
    
    const { data: existing } = await queryPipelineLinks(col, entityId, "id");

    if (existing) {
      const { data, error } = await (supabase.from("pipeline_links") as any)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select()
        .single();
      if (!error) setPipelineLink(data as PipelineLink);
      return data;
    } else {
      const { data, error } = await (supabase.from("pipeline_links") as any)
        .insert({
          [col]: entityId,
          organization_id: organizationId,
          root_organization_id: rootOrganizationId || organizationId,
          ...updates,
        })
        .select()
        .single();
      if (!error) setPipelineLink(data as PipelineLink);
      return data;
    }
  }, [entityType, entityId]);

  return { pipelineLink, loading, refetch: fetchLink, createOrUpdateLink };
}
