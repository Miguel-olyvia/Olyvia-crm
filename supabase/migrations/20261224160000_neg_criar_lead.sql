-- ============================================================
-- 20261224160000_neg_criar_lead (M4)
-- ============================================================
-- O que faz: funções NOVAS para criar a lead de uma pessoa a partir da
--   ficha, sem nunca duplicar uma lead em curso.
--   - neg_criar_lead (INVOKER): se a pessoa tem uma lead ABERTA nesta
--     organização (status fora de converted, rejected, lost, cancelled;
--     fn_neg_lead_aberta), incluindo uma encerrada pela abordagem
--     (closure_result preenchido, que se reabre com neg_reabrir_abordagem),
--     NÃO cria nada e devolve {criada:false, ja_existia:true, lead_id,
--     encerrada}. Com leads só convertidas ou mortas (ou nenhuma), cria uma
--     nova, CHAMANDO o rpc_create_lead_manual existente, sem o substituir, e
--     acrescentando as verificações que ele não faz: leads.create na
--     organização e comercial membro activo (não cliente). Serializado por
--     pessoa (o mesmo bloqueio consultivo de neg_ganhar_negocio).
--   - fn_neg_tem_lead_aberta (DEFINER mínimo, só devolve boolean): diz se a
--     pessoa tem uma lead aberta, mesmo que o chamador não a veja (âmbito
--     OWNED); só para quem tem leads.create e pessoas.view na organização,
--     com a página Pessoas activa e a pessoa ligada à organização (senão
--     NG008). Uma lead aberta que o chamador não vê dá NG016, sem revelar qual.
--   p_id: o rpc não aceita um id, por isso p_id NÃO fica guardado na lead;
--   um reenvio encontra a lead aberta criada pelo primeiro e devolve
--   ja_existia (idempotência pelo estado).
--   A lead nova consome a quota mensal (o trigger existente pode recusar com
--   'plan_limit_exceeded:leads', que a UI já traduz).
-- SÓ ACRESCENTA: nenhuma função, tabela ou política existente é alterada.
--   Não bloqueia tabelas. rpc_create_lead_manual é partilhado com a Mudelar e
--   só é CHAMADO; nada disto corre na Mudelar (D1: NG008).
-- Erros: NG008, NG003, NG009, 42501 (sem leads.create), NG016 (lead viva que
--   o chamador não vê).
-- A UI precisa de: o botão "Criar lead" na ficha; tratar ja_existia e
--   encerrada; regenerar os tipos.
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF to_regprocedure('public.fn_neg_tem_permissao_org(uuid,text)') IS NULL
     OR to_regprocedure('public.neg_criar_lead(uuid,uuid,uuid,uuid,text)') IS NOT NULL
     OR to_regprocedure('public.fn_neg_tem_lead_aberta(uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: faltam as auxiliares neg ou as funções já existem; nada feito.';
  END IF;
END;
$$;

-- A pessoa tem uma lead aberta (fn_neg_lead_aberta; com ou sem
-- closure_result) nesta organização, vista ou não pelo chamador. DEFINER:
-- só devolve o boolean.
CREATE FUNCTION public.fn_neg_tem_lead_aberta(p_organization_id uuid, p_entity_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Não é um oráculo: só para quem tem leads.create nesta organização e só
  -- em organizações com a página Pessoas activa (mesma mensagem para tudo).
  IF v_uid IS NULL OR p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT public.fn_neg_tem_permissao_org(p_organization_id, 'leads.create')
     OR NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.view')
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c
                    WHERE c.organization_id = p_organization_id)
     OR p_entity_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.anew_entity_org_links lk
                    WHERE lk.entity_id = p_entity_id AND lk.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.anew_leads l
    WHERE l.organization_id = p_organization_id AND l.entity_id = p_entity_id
      AND l.deleted_at IS NULL AND public.fn_neg_lead_aberta(l.status::text));
END;
$function$;

CREATE FUNCTION public.neg_criar_lead(
  p_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_assigned_to uuid DEFAULT NULL,
  p_source text DEFAULT 'manual')
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_source   text := btrim(COALESCE(p_source, 'manual'));
  v_comercial uuid;
  v_lead     public.anew_leads;
BEGIN
  -- 1. Valores
  IF p_id IS NULL OR v_source = '' OR char_length(v_source) > 50 THEN
    RAISE EXCEPTION 'Valor inválido: identificador ou origem (1 a 50 caracteres).' USING ERRCODE = 'NG009';
  END IF;

  -- 2. Configuração (D1), permissão, pessoa visível
  PERFORM public.fn_neg_exigir_config(p_organization_id);
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'leads.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar leads nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);

  -- 3. Comercial: o indicado ou quem cria; membro activo e não cliente.
  v_comercial := COALESCE(p_assigned_to, public.fn_neg_actor());
  IF v_comercial IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.anew_memberships m
       WHERE m.user_id = v_comercial AND m.organization_id = p_organization_id
         AND m.status = 'active' AND m.role_is_client IS NOT TRUE) THEN
    RAISE EXCEPTION 'Valor inválido: o comercial tem de ser membro activo da organização.'
      USING ERRCODE = 'NG009';
  END IF;

  -- 4. Uma pessoa de cada vez (mesma chave de neg_ganhar_negocio).
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'neg_pessoa:' || p_organization_id::text || ':' || p_entity_id::text, 0));

  -- 5. Lead aberta visível (em curso ou encerrada reabrível): não se duplica;
  --    devolve-a (a em curso primeiro). Convertidas e mortas não contam.
  SELECT l.* INTO v_lead
  FROM public.anew_leads l
  WHERE l.organization_id = p_organization_id AND l.entity_id = p_entity_id
    AND l.deleted_at IS NULL AND public.fn_neg_lead_aberta(l.status::text)
  ORDER BY (l.closure_result IS NULL) DESC, l.created_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'criada', false, 'ja_existia', true, 'mudou', false, 'lead_id', v_lead.id,
      'encerrada', v_lead.closure_result IS NOT NULL);
  END IF;

  -- 6. Lead aberta que o chamador não vê: recusa sem dizer qual.
  IF public.fn_neg_tem_lead_aberta(p_organization_id, p_entity_id) THEN
    RAISE EXCEPTION 'A pessoa já tem uma lead.' USING ERRCODE = 'NG016';
  END IF;

  -- 7. Criar pela função existente (sem e-mail nem telefone: a pessoa já os tem).
  SELECT r.* INTO v_lead
  FROM public.rpc_create_lead_manual(
    p_organization_id,
    public.resolve_root_organization_id(p_organization_id),
    p_entity_id,
    false,
    '{}'::jsonb,
    NULL::text,
    NULL::text,
    v_source,
    NULL::uuid,
    NULL::uuid,
    v_comercial) AS r;

  -- O rpc deixa a auditoria genérica desligada até ao fim da transacção.
  PERFORM set_config('app.audit_bypass', 'off', true);

  RETURN jsonb_build_object(
    'criada', true, 'ja_existia', false, 'mudou', true, 'lead_id', v_lead.id,
    'encerrada', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_tem_lead_aberta(uuid, uuid)             FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.neg_criar_lead(uuid, uuid, uuid, uuid, text)  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_tem_lead_aberta(uuid, uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_criar_lead(uuid, uuid, uuid, uuid, text) TO authenticated;

-- CONFERIR
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. funções novas: assinatura, DEFINER só a auxiliar, search_path fixo,
  --    sem anon, com authenticated
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_tem_lead_aberta(uuid,uuid)', true),
              ('public.neg_criar_lead(uuid,uuid,uuid,uuid,text)', false)
            ) AS e(sig, definer)
            LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.sig)
            WHERE p.oid IS NULL
               OR p.prosecdef <> e.definer
               OR array_to_string(p.proconfig, ',') IS DISTINCT FROM 'search_path=public, pg_temp'
               OR has_function_privilege('anon', p.oid, 'EXECUTE')
               OR has_function_privilege('service_role', p.oid, 'EXECUTE')
               OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
               OR p.prosrc NOT LIKE '%fn_neg_lead_aberta(l.status::text)%');
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (1. funções novas): falha em %', v_txt;
  END IF;

  -- 1b. a regra: só uma lead aberta (status fora destes quatro) bloqueia a criação
  IF public.fn_neg_lead_aberta('converted') OR public.fn_neg_lead_aberta('rejected')
     OR public.fn_neg_lead_aberta('lost') OR public.fn_neg_lead_aberta('cancelled')
     OR NOT public.fn_neg_lead_aberta('new') OR NOT public.fn_neg_lead_aberta(NULL) THEN
    RAISE EXCEPTION 'CONFERIR (1b. fn_neg_lead_aberta não segue a regra)';
  END IF;

  -- 2. funções existentes chamadas, iguais (md5 lidos a 19/10)
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.rpc_create_lead_manual(uuid,uuid,uuid,boolean,jsonb,text,text,text,uuid,uuid,uuid)', '337ac02106ee8fe7a4a8a937160a2a0b'),
              ('public._fn_leads_creation_critical_writes(uuid,uuid,uuid,uuid,boolean,jsonb,text,text,text,text,uuid,uuid,uuid)', '2ebdfe35141147df83112cb0663934d1'),
              ('public.fn_lead_org_in_scope(uuid,uuid)',        '48f452ddff78a972dcc7106465dcabcd'),
              ('public.fn_enforce_lead_monthly_quota()',        '0341131150420c0925b28f29eb757f9c'),
              ('public.resolve_root_organization_id(uuid)',     '0fd01d82d04202e94fecbc638af746a0'),
              ('public.get_user_crm_org_ids(uuid)',             '29782031244dd3b0842ca43b271e2bf1'),
              ('public.crm_scope_keys(text)',                   '6abb12e1d7a3db943630e8f8d7e15ca8'),
              ('public.has_anew_permission(uuid,text)',         '8f69ed134c7d20e080d8c5a4161a3151'),
              ('public.fn_neg_tem_permissao_org(uuid,text)',    '05943a6cfb0382a07322870262170c8d'),
              ('public.fn_neg_exigir_config(uuid)',             '566f127b4f3cea295f04c916e366cd5d'),
              ('public.fn_neg_exigir_pessoa(uuid,uuid)',        '4dbbe481640899b70e05dc3d5ea2f4c5'),
              ('public.fn_neg_lead_aberta(text)',               'cb988326544ed75840624bfb78e55b7f'),
              ('public.fn_neg_actor()',                         '01c906dd40875e72a5e63bdc10200359')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (2. funções existentes mudaram): %', v_txt;
  END IF;

  -- 3. a permissão leads.create existe
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = 'leads.create') THEN
    RAISE EXCEPTION 'CONFERIR (3. falta a permissão leads.create)';
  END IF;
END;
$$;

COMMIT;
