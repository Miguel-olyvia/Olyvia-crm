-- Portal: "O seu Comercial" passa a ser o responsável comercial do cliente
-- NA EMPRESA ATIVA, não quem carregou em "Enviar para o portal".
--
-- Antes, sem proposta, o portal caía no created_by da linha de
-- client_portal_users. Caso real (2026-09-23): inventario teste1, cliente da
-- Mudelar e da BMGest, via "Ricardo Belchior" na BMGest (quem enviou a venda
-- direta) quando o Resp. Comercial da lead é o Ricardo Paiagua.
--
-- Ordem (tudo dentro da organização pedida e da entidade do cliente nessa org):
--   1. Resp. Comercial da lead (anew_leads.assigned_to) — o que o CRM mostra
--   2. comercial da ficha de cliente (anew_clients.assigned_to)
--   3. comercial do documento mais recente (venda direta / negócio da proposta)
-- Quem enviou para o portal (client_portal_users.created_by) NUNCA conta.
--
-- SECURITY DEFINER porque o cliente do portal não lê anew_leads. Só responde
-- para a linha de portal do PRÓPRIO auth.uid() nessa organização, e devolve só
-- nome/email/telefone (via get_commercial_info, como o portal já fazia).

CREATE OR REPLACE FUNCTION public.get_portal_commercial(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid;
  v_client_id uuid;
  v_commercial uuid;
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT cpu.entity_id, cpu.client_id
    INTO v_entity_id, v_client_id
  FROM public.client_portal_users cpu
  WHERE cpu.auth_user_id = auth.uid()
    AND cpu.organization_id = p_organization_id
  ORDER BY cpu.updated_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 1. Resp. Comercial da lead
  IF v_entity_id IS NOT NULL THEN
    SELECT l.assigned_to INTO v_commercial
    FROM public.anew_leads l
    WHERE l.organization_id = p_organization_id
      AND l.entity_id = v_entity_id
      AND l.deleted_at IS NULL
      AND l.assigned_to IS NOT NULL
    ORDER BY l.updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- 2. Comercial da ficha de cliente
  IF v_commercial IS NULL THEN
    SELECT c.assigned_to INTO v_commercial
    FROM public.anew_clients c
    WHERE c.organization_id = p_organization_id
      AND c.deleted_at IS NULL
      AND c.assigned_to IS NOT NULL
      AND (c.id = v_client_id OR (v_entity_id IS NOT NULL AND c.entity_id = v_entity_id))
    ORDER BY (c.id = v_client_id) DESC, c.updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- 3. Comercial do documento mais recente
  IF v_commercial IS NULL AND v_entity_id IS NOT NULL THEN
    SELECT x.assigned_to INTO v_commercial
    FROM (
      SELECT ds.assigned_to, ds.created_at
      FROM public.direct_sales ds
      WHERE ds.organization_id = p_organization_id
        AND ds.entity_id = v_entity_id
        AND ds.deleted_at IS NULL
        AND ds.assigned_to IS NOT NULL
      UNION ALL
      SELECT d.assigned_to, p.created_at
      FROM public.proposals p
      JOIN public.deals d ON d.id = p.deal_id
      WHERE p.organization_id = p_organization_id
        AND p.entity_id = v_entity_id
        AND p.deleted_at IS NULL
        AND d.assigned_to IS NOT NULL
    ) x
    ORDER BY x.created_at DESC
    LIMIT 1;
  END IF;

  -- Nunca cair em quem carregou em "Enviar para o portal": sem comercial
  -- associado, o portal não mostra nenhum.
  IF v_commercial IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN public.get_commercial_info(v_commercial);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_portal_commercial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_portal_commercial(uuid) TO authenticated;
