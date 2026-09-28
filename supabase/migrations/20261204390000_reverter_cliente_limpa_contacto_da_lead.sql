-- Reverter cliente para lead: a lead tem de voltar a aparecer na lista.
--
-- rpc_convert_lead_to_client grava anew_leads.converted_to_contact_id com o
-- contacto de origem. A reversao repunha status, converted_to_client_id,
-- converted_at, converted_by e status_before_conversion, mas deixava
-- converted_to_contact_id preenchido. A lista de leads filtra
-- converted_to_contact_id IS NULL, por isso a lead revertida desaparecia.
--
-- Alem disso, a conversao escreve anew_contacts.converted_to_client_id (e
-- converted_at) em todos os contactos da entidade na organizacao. Ao apagar o
-- cliente, esses contactos ficavam a apontar para um cliente inexistente (nao ha
-- FK nessa coluna).
--
-- Esta migracao parte das definicoes AO VIVO (pg_get_functiondef, 2026-09-25).
-- Assinaturas, SECURITY DEFINER, search_path, verificacoes de permissao e de
-- organizacao ficam exatamente iguais. CREATE OR REPLACE preserva os grants.
--
-- 1. rpc_revert_client_to_lead: limpa converted_to_contact_id na lead e os
--    ponteiros dos contactos da mesma organizacao para o cliente revertido.
-- 2. purge_entity_facet (ramo 'client'): apagar definitivamente um cliente
--    deixava o mesmo residuo em anew_contacts. Limpa-o, na mesma organizacao.
--    A lead continua a nao voltar ao funil neste caminho (purgar nao e reverter).

CREATE OR REPLACE FUNCTION public.rpc_revert_client_to_lead(p_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor   uuid;
  v_client  public.anew_clients;
  v_lead    public.anew_leads;
  v_estado  text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_client FROM public.anew_clients WHERE id = p_client_id FOR UPDATE;
  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'Cliente nao encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- SECURITY: nunca confiar no id enviado pelo cliente para decidir o ambito.
  -- Reconfere-se sobre a organizacao gravada no proprio registo, com o mesmo
  -- criterio das outras operacoes deste modulo.
  IF NOT (
    public.is_system_admin(auth.uid())
    OR v_client.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Cliente fora do ambito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador nao encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- A lead de origem. Sem ela nao ha nada a repor: este cliente nao veio de
  -- lead nenhuma (foi criado a mao, por contrato, ou veio da migracao).
  SELECT * INTO v_lead
  FROM public.anew_leads
  WHERE converted_to_client_id = p_client_id
    AND deleted_at IS NULL
  ORDER BY converted_at DESC NULLS LAST
  LIMIT 1;

  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'Este cliente nao veio de nenhuma lead, por isso nao ha conversao para desfazer'
      USING ERRCODE = 'no_data_found';
  END IF;

  v_estado := COALESCE(NULLIF(v_lead.status_before_conversion, ''), 'negotiation');

  -- 1. A lead primeiro: enquanto apontar ao cliente, a base recusa apaga-lo.
  --    converted_to_contact_id tambem tem de ficar a NULL: a lista de leads
  --    filtra por ele, e sem isto a lead revertida nao voltava a aparecer.
  UPDATE public.anew_leads
  SET status                   = v_estado,
      converted_to_client_id   = NULL,
      converted_to_contact_id  = NULL,
      converted_at             = NULL,
      converted_by             = NULL,
      status_before_conversion = NULL
  WHERE id = v_lead.id;

  -- 1b. Os contactos que a conversao marcou com este cliente deixam de apontar
  --     para ele (o cliente vai ser apagado e a coluna nao tem FK). O estado do
  --     contacto nao se mexe: continua inactive, como estava.
  UPDATE public.anew_contacts
  SET converted_to_client_id = NULL,
      converted_at           = NULL
  WHERE converted_to_client_id = p_client_id
    AND organization_id = v_client.organization_id;

  -- 2. A entidade deixa de ter papel de cliente, e volta a ter o de lead.
  DELETE FROM public.anew_entity_roles
  WHERE organization_id = v_client.organization_id
    AND entity_id = v_client.entity_id
    AND role = 'client';

  UPDATE public.anew_entity_roles
  SET status = 'active', deleted_at = NULL, deleted_by = NULL
  WHERE organization_id = v_client.organization_id
    AND entity_id = v_client.entity_id
    AND role = 'lead';

  -- 3. So agora se apaga o cliente. Nada fica orfao: contratos, propostas,
  --    orcamentos, negocios e acessos ao portal estao presos a entidade.
  DELETE FROM public.anew_clients WHERE id = p_client_id;

  RETURN jsonb_build_object(
    'lead_id', v_lead.id,
    'entity_id', v_client.entity_id,
    'status', v_estado,
    'estado_anterior_conhecido', v_lead.status_before_conversion IS NOT NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.purge_entity_facet(p_kind text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid; v_org_id uuid; v_role text;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind NOT IN ('lead','contact','client') THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind;
  END IF;
  v_role := p_kind;

  IF p_kind = 'lead' THEN
    SELECT entity_id, organization_id INTO v_entity_id, v_org_id FROM public.anew_leads WHERE id = p_id;
  ELSIF p_kind = 'contact' THEN
    SELECT entity_id, organization_id INTO v_entity_id, v_org_id FROM public.anew_contacts WHERE id = p_id;
  ELSE
    SELECT entity_id, organization_id INTO v_entity_id, v_org_id FROM public.anew_clients WHERE id = p_id;
  END IF;

  IF v_org_id IS NULL THEN
    -- Row not found (or already gone): nothing to purge, do not leak.
    RETURN FALSE;
  END IF;

  IF NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(v_actor, 'organizations.delete') THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind = 'lead' THEN
    DELETE FROM public.anew_leads WHERE id = p_id;
  ELSIF p_kind = 'contact' THEN
    DELETE FROM public.anew_contacts WHERE id = p_id;
  ELSE
    UPDATE public.anew_leads SET converted_to_client_id = NULL WHERE converted_to_client_id = p_id;
    -- Os contactos marcados com este cliente nao podem ficar a apontar para um
    -- cliente que deixa de existir (a coluna nao tem FK).
    UPDATE public.anew_contacts
    SET converted_to_client_id = NULL,
        converted_at           = NULL
    WHERE converted_to_client_id = p_id
      AND organization_id = v_org_id;
    DELETE FROM public.anew_clients WHERE id = p_id;
  END IF;

  IF v_entity_id IS NOT NULL THEN
    DELETE FROM public.anew_entity_roles
      WHERE entity_id = v_entity_id AND organization_id = v_org_id AND role = v_role;
    INSERT INTO public.anew_entity_history(entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
    VALUES (v_entity_id, 'purged', v_role, p_id::text, NULL, v_actor,
            jsonb_build_object('kind', p_kind, 'id', p_id, 'organization_id', v_org_id));
  END IF;

  RETURN TRUE;
END;
$function$;
