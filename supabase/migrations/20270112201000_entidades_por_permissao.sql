-- ============================================================
-- 20270112201000 entidades_por_permissao (correções do bloco B da auditoria de permissões, B1 / Negócios F3)
-- (a versão pedida 20270112200000 já existe em origin/feat/estudio-projeto: ec_depois_do_plano_e_equipas; usa-se a seguinte livre)
-- ============================================================
-- Problema: a policy anew_entities_ligada_select deixa ler a ficha ligada a um documento «que a própria pessoa consegue ler (a RLS
--   desse documento decide)» (20270106450000). Em 20270107300000, para acabar com a recursão negocios <-> anew_entities, o ramo dos
--   negócios passou a fn_entidade_tem_negocio(id), SECURITY DEFINER: deixou de aplicar a RLS de negocios e passou a perguntar só
--   «esta pessoa tem algum negócio?». Resultado: qualquer membro ativo da organização, sem permissão nenhuma, lia as fichas de todos
--   os clientes com negócio (nomes, emails, telefones, notas). Prova (ramo RH, 9/11/2026): utilizador com perfil vazio lia 25 fichas,
--   14 delas só por este ramo.
-- Correção: o ramo dos negócios passa a ser «a ficha de um negócio que eu consigo ler», com o critério de neg_ler_negocios (a mesma
--   leitura que o ecrã do Negócio usa, e lerDadosDasLeads lê as fichas dos negócios que ela devolveu):
--     * só-executar (sem pessoas.view, com negocios.obra.executar): os negócios onde trabalha (fn_neg_ids_do_tecnico);
--     * com pessoas.view (perfil, Papel no Negócio ou administrador, fn_cat_pode): fn_neg_ambito_tudo -> todos os da organização;
--       senão o âmbito de pessoas.view (dono = assigned_to/created_by) mais as obras onde tem tarefas (fn_neg_ids_com_tarefa);
--     * sem nenhuma das duas: nenhum.
--   Calculado uma vez por consulta numa função SECURITY DEFINER STABLE (fn_neg_entidades_legiveis): não aplica a RLS de negocios,
--   por isso não volta a haver recursão com negocios_insert. O resto da policy fica igual (texto vivo de 9/11/2026).
--   Os outros ramos (equipa, contratos, vendas diretas, orçamentos, propostas, deals, levantamentos, agenda, formulários,
--   leads/clientes/contactos antigos) não mudam: aplicam a RLS do documento.
-- Sem tabelas nem colunas novas. fn_entidade_tem_negocio fica (deixa de ser usada pela policy).
-- Reversão (só como migration nova): repor a policy de 20270107300000 e DROP FUNCTION public.fn_neg_entidades_legiveis().
-- ============================================================
SET lock_timeout = '5s';

DO $g$ BEGIN
  IF (SELECT md5(qual) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'anew_entities'
        AND policyname = 'anew_entities_ligada_select') IS DISTINCT FROM '4fa3ad337bd3d39d1c10ec53875733bb' THEN
    RAISE EXCEPTION 'anew_entities_ligada_select mudou desde a leitura (9/11/2026); rever antes de aplicar';
  END IF;
  IF md5(pg_get_functiondef('public.neg_ler_negocios(uuid)'::regprocedure)) <> '17e37e654423d324e80328b47e8f698d'
     OR md5(pg_get_functiondef('public.fn_neg_so_execucao(uuid,text)'::regprocedure)) <> 'bdde5e5e6021cddb5dc8ade04cb4847e'
     OR md5(pg_get_functiondef('public.fn_neg_ids_do_tecnico(uuid)'::regprocedure)) <> 'fc1df11d065bdce7acd88680cb5f11a0'
     OR md5(pg_get_functiondef('public.fn_neg_ambito_tudo(uuid,text)'::regprocedure)) <> '94c54ce0764fb1180c3b00f92bfcfe5a' THEN
    RAISE EXCEPTION 'O critério de leitura de neg_ler_negocios mudou desde a leitura (9/11/2026); rever antes de aplicar';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION public.fn_neg_entidades_legiveis()
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 20270112201000: as fichas (entity_id) dos negócios que o utilizador da sessão lê, com o critério de neg_ler_negocios.
-- Só para a policy anew_entities_ligada_select (sem RLS de negocios: sem recursão com negocios_insert).
DECLARE
  v_org     uuid;
  v_chaves  text[];
  v_tarefas uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  FOR v_org IN SELECT DISTINCT o FROM public.get_user_visible_org_ids(auth.uid()) AS o WHERE o IS NOT NULL LOOP
    IF public.fn_neg_so_execucao(v_org, 'pessoas.view') THEN
      RETURN QUERY
        SELECT n.entity_id FROM public.negocios n
        WHERE n.organization_id = v_org AND n.entity_id IS NOT NULL AND n.id = ANY (public.fn_neg_ids_do_tecnico(v_org));
    ELSIF public.fn_cat_pode(v_org, 'pessoas.view') THEN
      IF public.fn_neg_ambito_tudo(v_org, 'pessoas.view') THEN
        RETURN QUERY
          SELECT n.entity_id FROM public.negocios n
          WHERE n.organization_id = v_org AND n.entity_id IS NOT NULL;
      ELSE
        v_chaves := public.crm_scope_keys('pessoas.view');
        v_tarefas := public.fn_neg_ids_com_tarefa(v_org);
        RETURN QUERY
          SELECT n.entity_id FROM public.negocios n
          WHERE n.organization_id = v_org AND n.entity_id IS NOT NULL
            AND (public.fn_ambito_casa(v_chaves, n.organization_id, ARRAY[n.assigned_to, n.created_by])
                 OR n.id = ANY (v_tarefas));
      END IF;
    END IF;
  END LOOP;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_entidades_legiveis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_entidades_legiveis() TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_neg_entidades_legiveis() IS
  'As fichas dos negócios que o utilizador lê (critério de neg_ler_negocios). Usada em anew_entities_ligada_select (20270112201000).';

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
     OR id IN (SELECT public.fn_neg_entidades_legiveis())
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
