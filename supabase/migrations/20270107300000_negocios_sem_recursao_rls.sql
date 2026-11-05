-- ============================================================
-- 20270107300000_negocios_sem_recursao_rls
-- ============================================================
-- Problema (05/11/2026, «Não gravou: Miguel two»): criar um negócio dava
--   42P17 infinite recursion detected in policy for relation "negocios".
-- A policy negocios_insert verifica a pessoa (EXISTS em anew_entities) e a policy
-- anew_entities_ligada_select (20270106450000) verifica se a pessoa está ligada a um
-- negócio (EXISTS em negocios). Ler negocios dentro da RLS de anew_entities, que por sua
-- vez corre dentro da RLS de negocios, é recursão: o Postgres recusa o INSERT inteiro.
-- Toda a «Nova lead» (Pessoas e quadro de Negócios) ficava com a pessoa criada e sem negócio.
--
-- Correção: a pergunta «esta pessoa tem um negócio?» passa a ser uma função SECURITY DEFINER
-- (não aplica a RLS de negocios, por isso não volta a entrar nela). A policy fica igual em tudo
-- o resto. Não alarga a leitura: a primeira metade da policy só diz que a pessoa está ligada a
-- algum documento; quem a pode ler continua a ser decidido pela segunda metade (organização
-- visível, criador ou can_see_entity), que não muda.
-- Reversão (só como migration nova): repor a policy de 20270106450000 e DROP FUNCTION
-- public.fn_entidade_tem_negocio(uuid).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_entidade_tem_negocio(p_entity_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.negocios n WHERE n.entity_id = p_entity_id);
$function$;

REVOKE ALL ON FUNCTION public.fn_entidade_tem_negocio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_entidade_tem_negocio(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_entidade_tem_negocio(uuid) IS
  'A pessoa tem algum negócio (sem RLS de negocios). Usada em anew_entities_ligada_select para não haver recursão com negocios_insert (20270107300000).';

DROP POLICY IF EXISTS anew_entities_ligada_select ON public.anew_entities;
CREATE POLICY anew_entities_ligada_select ON public.anew_entities
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (id IN (SELECT public.fn_pessoas_entidades_equipa())
     OR EXISTS (SELECT 1 FROM public.client_contracts x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.direct_sales x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.quotes x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.proposals x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.deals x WHERE x.entity_id = anew_entities.id)
     OR public.fn_entidade_tem_negocio(anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.levantamentos x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.schedule_items x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.form_submissions x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.form_submissions x WHERE x.conflicting_entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.anew_leads x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.anew_clients x WHERE x.entity_id = anew_entities.id)
     OR EXISTS (SELECT 1 FROM public.anew_contacts x WHERE x.entity_id = anew_entities.id))
    AND (EXISTS (SELECT 1 FROM public.anew_entity_org_links l
                 WHERE l.entity_id = anew_entities.id
                   AND l.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))))
         OR created_by = public.current_business_user_id()
         OR public.can_see_entity(id, (SELECT auth.uid()))));
