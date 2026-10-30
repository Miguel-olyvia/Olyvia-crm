-- Portal do cliente (30/10/2026): «O seu Comercial» passa a mostrar o comercial do negócio.
--
-- O problema: get_portal_commercial (20261204180000, reaplicada em 20261206120000) resolve o comercial pela lead, pela ficha de cliente e
-- pelo documento mais recente (venda direta ou proposta de um deal). Os negócios do fluxo da Emylia não têm lead nem deal: o comercial está
-- em negocios.assigned_to. Para um cliente só com negócios da Emylia (o negócio 1011 da nike) a função devolvia NULL e o portal dizia
-- «Informação do comercial indisponível.».
--
-- O que muda (só se acrescenta um passo; o resto do corpo fica igual): primeiro passo, o comercial do negócio vivo mais recente desta
-- pessoa nesta organização (negocios.assigned_to). Se não houver, segue como antes (lead, ficha de cliente, documento). A função continua
-- a só responder à conta de portal que a chama (auth.uid()), para a sua própria organização e pessoa, e a devolver só nome, email e telefone
-- do comercial (get_commercial_info_internal).
--
-- O que muda para a Mudelar: nada nos clientes sem negócios em negocios (a ordem dos outros passos não muda). Esta migration só se aplica
-- à RH.
SET lock_timeout = '5s';

DO $guarda$
DECLARE v_falta text;
BEGIN
  SELECT string_agg(x.t || '.' || x.c, ', ') INTO v_falta
    FROM (VALUES ('negocios','organization_id'), ('negocios','entity_id'), ('negocios','assigned_to'), ('negocios','deleted_at'),
                 ('negocios','created_at'), ('client_portal_users','auth_user_id'), ('client_portal_users','entity_id')) AS x(t, c)
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_schema = 'public' AND k.table_name = x.t AND k.column_name = x.c);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltam colunas de que get_portal_commercial depende: %', v_falta;
  END IF;
END
$guarda$;

CREATE OR REPLACE FUNCTION public.get_portal_commercial(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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

  -- 0. Comercial do negócio mais recente desta pessoa (os negócios da Emylia não têm lead nem deal)
  IF v_entity_id IS NOT NULL THEN
    SELECT n.assigned_to INTO v_commercial
    FROM public.negocios n
    WHERE n.organization_id = p_organization_id
      AND n.entity_id = v_entity_id
      AND n.deleted_at IS NULL
      AND n.assigned_to IS NOT NULL
    -- um negócio perdido só conta se não houver aberto nem ganho (a conta nunca fica sem comercial)
    ORDER BY (n.estado = 'perdido'), n.created_at DESC, n.id
    LIMIT 1;
  END IF;

  -- 1. Resp. Comercial da lead
  IF v_commercial IS NULL AND v_entity_id IS NOT NULL THEN
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

  IF v_commercial IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN public.get_commercial_info_internal(v_commercial);
END;
$function$;

-- Privilégios como antes (o CREATE OR REPLACE conserva-os; reafirmam-se para não depender de um ACL desviado): só utilizadores com sessão, nunca anon.
REVOKE ALL ON FUNCTION public.get_portal_commercial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_portal_commercial(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_portal_commercial(uuid) IS 'Portal do cliente: o comercial da empresa ativa da conta de portal. 1) o do negócio mais recente da pessoa (negocios.assigned_to), 2) o da lead, 3) o da ficha de cliente, 4) o do documento mais recente. Só responde à conta que chama (auth.uid()). 20270101420000 (antes 20261204180000, 20261206120000).';

-- Verificação final: authenticated pode, anon não, e a função de que depende continua fechada às contas de portal.
DO $verifica$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.get_portal_commercial(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_portal_commercial(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_portal_commercial ficou com os privilégios errados.';
  END IF;
END
$verifica$;
