-- P3: Bulk update de stage de deals via RPC com SECURITY INVOKER
-- A RLS da tabela deals aplica-se automaticamente, cobrindo scopes OWNED/TEAM/ORG

CREATE OR REPLACE FUNCTION bulk_update_deal_stage(
  p_deal_ids uuid[],
  p_stage_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE deals
  SET stage_id   = p_stage_id,
      updated_at = now()
  WHERE id = ANY(p_deal_ids)
    AND deleted_at IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN json_build_object('updated', updated_count);
END;
$$;
