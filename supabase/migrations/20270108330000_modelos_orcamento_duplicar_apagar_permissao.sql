-- ============================================================
-- 20270108330000_modelos_orcamento_duplicar_apagar_permissao
-- ============================================================
-- O que faz (auditoria de permissões 05/11, P1.6):
--   1. duplicate_quote_template (SECURITY DEFINER) só verificava a organização: qualquer membro duplicava modelos pela API.
--      Passa a exigir quote_templates.duplicate (o botão do ecrã, QuoteModels.tsx) ou quote_templates.create na organização.
--   2. A política de DELETE de quote_templates deixava o criador apagar o SEU modelo sem quote_templates.delete
--      («OR created_by = eu»). Passa a deixá-lo só enquanto o modelo está VAZIO (sem linhas em quote_template_items): é o caso
--      da reversão do QuoteBuilder («Guardar como modelo», QuoteBuilder.tsx:906), que cria o modelo, falha a inserir as linhas e
--      apaga o modelo acabado de criar. Com linhas, apagar exige quote_templates.delete, como o ecrã (QuoteModels.tsx:341).
-- Papéis verificados antes (05/11): só super_admin e system_admin têm quote_templates.*; ambos têm create/duplicate/delete.
--   (testescope_vendas_senior, sem membros, só tem quotes.create: continua a poder criar modelos e a reversão continua a funcionar.)
-- Função reescrita a partir de pg_get_functiondef (viva, 05/11/2026); política a partir de pg_policies (viva). Sem tabelas nem colunas.
-- ============================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.duplicate_quote_template(p_template_id uuid, p_org_id uuid, p_user_id uuid, p_new_name text, p_new_codigo text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_source          public.quote_templates%ROWTYPE;
  v_new_id          uuid;
  v_caller_anew_id  uuid;
BEGIN
  -- ── Authorization (skipped only for genuine service_role/no-JWT callers) ──
  IF auth.uid() IS NOT NULL THEN
    IF p_org_id IS NULL
       OR p_org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    THEN
      RAISE EXCEPTION 'Not authorized for this organization'
        USING ERRCODE = '42501';
    END IF;

    SELECT au.id INTO v_caller_anew_id
    FROM public.anew_users au
    WHERE au.auth_user_id = auth.uid();

    IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_caller_anew_id THEN
      RAISE EXCEPTION 'Actor mismatch'
        USING ERRCODE = '42501';
    END IF;

    -- 20270108330000: duplicar um modelo exige quote_templates.duplicate (o que o ecrã pede, QuoteModels.tsx) ou
    -- quote_templates.create na organização de destino (ou numa acima; o admin de sistema passa).
    IF NOT (public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'quote_templates.duplicate', p_org_id)
            OR public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'quote_templates.create', p_org_id)) THEN
      RAISE EXCEPTION 'Sem permissao para duplicar modelos de orcamento'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_source
  FROM public.quote_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  -- The source template must itself belong to the org being duplicated into
  -- (org-level templates only; global templates have organization_id NULL
  -- and are duplicatable into any org the caller is scoped to).
  IF v_source.organization_id IS NOT NULL AND v_source.organization_id IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'Template does not belong to this organization'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NOT NULL THEN
    PERFORM public.set_audit_context(p_user_id, 'web_app');
  END IF;

  INSERT INTO public.quote_templates (
    name, codigo, description, active, created_by, organization_id
  )
  VALUES (
    COALESCE(NULLIF(p_new_name, ''), v_source.name || ' (Copy)'),
    COALESCE(NULLIF(p_new_codigo, ''), v_source.codigo || '_copy_' || EXTRACT(EPOCH FROM clock_timestamp())::bigint::text),
    v_source.description,
    v_source.active,
    COALESCE(p_user_id, v_source.created_by),
    p_org_id
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.quote_template_items (
    template_id, product_id, default_qt, required, ordem,
    service_id, item_type, default_attributes, bundle_id
  )
  SELECT
    v_new_id, product_id, default_qt, required, ordem,
    service_id, item_type, default_attributes, bundle_id
  FROM public.quote_template_items
  WHERE template_id = p_template_id;

  RETURN v_new_id::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_quote_template_tem_linhas(p_template_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20270108330000: o modelo tem linhas? SECURITY DEFINER porque a política de leitura de quote_template_items consulta
  -- quote_templates e, chamada de dentro de uma política de quote_templates, daria recursão infinita na RLS.
  SELECT EXISTS (SELECT 1 FROM public.quote_template_items i WHERE i.template_id = p_template_id)
$function$;

REVOKE ALL ON FUNCTION public.fn_quote_template_tem_linhas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_quote_template_tem_linhas(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can delete quote templates" ON public.quote_templates;
CREATE POLICY "Users can delete quote templates" ON public.quote_templates
  FOR DELETE TO authenticated
  USING (
    (organization_id IN ( SELECT get_user_visible_org_ids(auth.uid()) AS get_user_visible_org_ids))
    AND (
      ( SELECT has_anew_permission(( SELECT auth.uid() AS uid), 'quote_templates.delete'::text) AS has_anew_permission)
      OR (
        created_by = ( SELECT current_business_user_id() AS current_business_user_id)
        AND NOT public.fn_quote_template_tem_linhas(id)
      )
    )
  );
