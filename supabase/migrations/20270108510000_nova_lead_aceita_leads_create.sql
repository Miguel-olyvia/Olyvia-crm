-- ============================================================
-- 20270108510000_nova_lead_aceita_leads_create
-- ============================================================
-- Só permissões (P2 da auditoria de 05/11/2026, ponto P5 do grupo A).
-- O botão «Nova lead» pede leads.create, mas a gravação (INSERT em anew_entities + neg_criar_negocio -> INSERT em negocios)
-- só aceitava pessoas.create. Passa a aceitar também leads.create, mas SÓ para criar uma lead nova:
--   · anew_entities: uma pessoa (type = 'person'), ainda lead (client_since nulo), viva, criada por quem grava
--     (created_by = eu), sem responsável ou com ele próprio como responsável (atribuir a outro continua a ser
--     neg_atribuir_pessoa, com leads.assign), numa organização em que tem leads.create (na própria ou numa acima);
--   · negocios: o PRIMEIRO negócio dessa lead (a pessoa foi criada por quem grava, ainda é lead e não tem negócio nenhum).
-- Tudo o resto fica como estava: pessoas.create continua a valer para tudo o que já valia (ninguém perde acesso), e um
-- negócio novo para uma pessoa que já existe continua a pedir pessoas.create.
-- Parte das policies VIVAS (pg_policies); se alguém as mudou entretanto, a migração pára sem mexer.
-- ============================================================

DO $guarda$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) INTO v_md5
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'anew_entities' AND policyname = 'anew_entities_org_member_insert';
  IF v_md5 IS DISTINCT FROM '5b0c51d90d10ac30be85dbba46197fe3' THEN
    RAISE EXCEPTION 'anew_entities_org_member_insert mudou desde a leitura (md5 %): rever antes de aplicar', v_md5;
  END IF;
  SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) INTO v_md5
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'negocios' AND policyname = 'negocios_insert';
  IF v_md5 IS DISTINCT FROM '36c74ce5bc51c08df1504ca1dcdff3f0' THEN
    RAISE EXCEPTION 'negocios_insert mudou desde a leitura (md5 %): rever antes de aplicar', v_md5;
  END IF;
END
$guarda$;

-- As organizações visíveis em que quem está na sessão tem leads.create (na própria ou numa acima).
CREATE OR REPLACE FUNCTION public.fn_neg_orgs_criar_lead()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20270108510000: a «Nova lead» com leads.create (ver anew_entities_org_member_insert).
  SELECT o.org_id
  FROM public.get_user_visible_org_ids(auth.uid()) AS o(org_id)
  WHERE auth.uid() IS NOT NULL
    AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'leads.create', o.org_id)
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_orgs_criar_lead() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_orgs_criar_lead() TO authenticated;

-- O primeiro negócio de uma lead que quem está na sessão acabou de criar, com leads.create nessa organização.
-- SECURITY DEFINER: lê negocios e anew_entities sem passar pela RLS (sem recursão na policy de negocios).
CREATE OR REPLACE FUNCTION public.fn_neg_negocio_de_lead_nova(p_organization_id uuid, p_entity_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20270108510000: a «Nova lead» com leads.create (ver negocios_insert).
  SELECT auth.uid() IS NOT NULL AND p_organization_id IS NOT NULL AND p_entity_id IS NOT NULL
    AND public.has_anew_permission_in_org_or_ancestor(auth.uid(), 'leads.create', p_organization_id)
    AND p_organization_id IN (SELECT public.get_user_crm_org_ids(auth.uid()))
    AND EXISTS (SELECT 1 FROM public.anew_entities e
                WHERE e.id = p_entity_id
                  AND e.organization_id = p_organization_id
                  AND e.deleted_at IS NULL
                  AND e.client_since IS NULL
                  AND e.created_by IS NOT NULL
                  AND e.created_by = public.current_business_user_id())
    AND NOT EXISTS (SELECT 1 FROM public.negocios n WHERE n.entity_id = p_entity_id)
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_negocio_de_lead_nova(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_negocio_de_lead_nova(uuid, uuid) TO authenticated;

-- anew_entities: o ramo de pessoas.create fica igual; acrescenta-se o ramo da lead nova com leads.create.
ALTER POLICY anew_entities_org_member_insert ON public.anew_entities
  WITH CHECK (
    (((organization_id IN (SELECT get_user_visible_org_ids((SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))
      AND (organization_id IN (SELECT fn_pessoas_orgs_com_permissao('pessoas.create'::text) AS fn_pessoas_orgs_com_permissao)))
     OR ((organization_id IS NULL) AND (SELECT fn_pessoas_tem_permissao('pessoas.create'::text) AS fn_pessoas_tem_permissao)))
    OR ((type = 'person'::text)
        AND (client_since IS NULL)
        AND (deleted_at IS NULL)
        AND (organization_id IN (SELECT fn_neg_orgs_criar_lead() AS fn_neg_orgs_criar_lead))
        AND (created_by IS NOT NULL)
        AND (created_by = (SELECT current_business_user_id() AS current_business_user_id))
        AND ((assigned_to IS NULL) OR (assigned_to = (SELECT current_business_user_id() AS current_business_user_id))))
  );

-- negocios: «pessoas.create (com âmbito)» passa a «pessoas.create (com âmbito) OU o primeiro negócio da lead nova»;
-- as outras condições (organização do CRM, autor, pessoa viva, comercial membro ativo) ficam iguais.
ALTER POLICY negocios_insert ON public.negocios
  WITH CHECK (
    ((( SELECT has_anew_permission(( SELECT auth.uid() AS uid), 'pessoas.create'::text) AS has_anew_permission)
      AND (EXISTS ( SELECT 1
                    FROM unnest(( SELECT crm_scope_keys('pessoas.create'::text) AS crm_scope_keys)) k(scope_key)
                    WHERE starts_with(k.scope_key, ((negocios.organization_id)::text || ':'::text)))))
     OR fn_neg_negocio_de_lead_nova(negocios.organization_id, negocios.entity_id))
    AND (organization_id IN ( SELECT get_user_crm_org_ids(( SELECT auth.uid() AS uid)) AS get_user_crm_org_ids))
    AND ((created_by IS NULL) OR (created_by = ( SELECT COALESCE(( SELECT au.id
           FROM anew_users au
          WHERE (au.auth_user_id = ( SELECT auth.uid() AS uid))
         LIMIT 1), current_business_user_id()) AS "coalesce")))
    AND (EXISTS ( SELECT 1
           FROM anew_entities e
          WHERE ((e.id = negocios.entity_id) AND (e.organization_id = negocios.organization_id) AND (e.deleted_at IS NULL))))
    AND ((assigned_to IS NULL) OR (EXISTS ( SELECT 1
           FROM anew_memberships m
          WHERE ((m.user_id = negocios.assigned_to) AND (m.organization_id = negocios.organization_id) AND (m.status = 'active'::text)))))
  );
