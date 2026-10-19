-- ============================================================
-- 20261224130000_neg_estado_so_por_funcao (M7)
-- ============================================================
-- O que faz: o estado de um negócio (estado, fase_perda, motivo_perda) só
--   muda pelas funções da página Pessoas. Um UPDATE directo pela API que
--   mexa nessas colunas é recusado (42501), mesmo a quem tem pessoas.edit;
--   e um INSERT directo de um negócio já ganho ou perdido também (42501).
--   - fn_negocios_preparar_insercao (nossa, trigger BEFORE INSERT): recusa
--     estado diferente de 'aberto' sem a variável.
--   - fn_negocios_guardar_alteracao (nossa, trigger BEFORE UPDATE): recusa a
--     mudança dessas colunas se a variável local app.neg_via_funcao não for
--     'on'.
--   - neg_perder_negocio, neg_anular_perda, neg_ganhar_negocio (nossas):
--     põem a variável a 'on' só à volta do seu UPDATE e voltam a 'off'.
--   Porquê variável e não grant por coluna: as funções são INVOKER, um grant
--   por coluna parti-las-ia também. O PostgREST não expõe set_config.
-- Só altera objectos NOSSOS, com as mesmas assinaturas. Não bloqueia
--   tabelas (CREATE OR REPLACE de funções). Nada da Mudelar (0 negócios).
-- NÃO altera: o lixo, o comercial, as políticas. Também service_role e
--   migrations passam a precisar da variável para criar ou mudar o estado.
-- A UI precisa de: mudar o estado só pelas RPC (já é o caso).
-- ATENÇÃO: o CONFERIR fixa o md5 de fn_negocios_preparar_insercao calculado
--   com o corpo da função em CRLF, como está neste ficheiro. Não reescrever
--   este ficheiro com outros fins de linha (sed -i, editores que convertam
--   para LF): o md5 deixa de bater e a migration aborta no CONFERIR.
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- Pré-condição: as versões a substituir são as lidas a 19/10.
DO $$
DECLARE
  v_txt text;
BEGIN
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_negocios_preparar_insercao()',   '400f73d541cca19a9da53b041dfdb952'),
              ('public.fn_negocios_guardar_alteracao()',   '352be32db57f86809f3d55a3c5c61688'),
              ('public.neg_perder_negocio(uuid,text,text)', 'e0dfe684fb17ad50991ecfcfe7a76bd2'),
              ('public.neg_anular_perda(uuid,text)',        '9f643cc49769d0ea04c3007902131542'),
              ('public.neg_ganhar_negocio(uuid,uuid,jsonb)', '3ce85296f5809ffac257793ec9fe9365')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: mudaram desde 19/10: %; nada feito.', v_txt;
  END IF;
END;
$$;

-- BEFORE INSERT: igual à versão de 19/10 mais a guarda do estado: um negócio
-- nasce aberto (neg_criar_negocio insere sempre aberto).
CREATE OR REPLACE FUNCTION public.fn_negocios_preparar_insercao()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.estado IS DISTINCT FROM 'aberto'
     AND COALESCE(current_setting('app.neg_via_funcao', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Um negócio é criado aberto; o estado só muda pelas acções da página Pessoas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  NEW.root_organization_id := public.resolve_root_organization_id(NEW.organization_id);

  IF NEW.created_by IS NULL THEN
    NEW.created_by := public.fn_negocios_actor();
  END IF;

  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.deleted_at := NULL;
  NEW.deleted_by := NULL;
  NEW.perdido_em := CASE WHEN NEW.estado = 'perdido' THEN now() END;
  NEW.ganho_em   := CASE WHEN NEW.estado = 'ganho'   THEN now() END;

  RETURN NEW;
END;
$function$;

-- BEFORE UPDATE: igual à versão de 19/10 mais o passo 1b.
CREATE OR REPLACE FUNCTION public.fn_negocios_guardar_alteracao()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_limpa_criador   boolean := public.fn_negocios_ref_utilizador_apagado(OLD.created_by, NEW.created_by);
  v_limpa_comercial boolean := public.fn_negocios_ref_utilizador_apagado(OLD.assigned_to, NEW.assigned_to);
  v_limpa_apagador  boolean := public.fn_negocios_ref_utilizador_apagado(OLD.deleted_by, NEW.deleted_by);
  v_ignorar         text[]  := ARRAY['created_by', 'assigned_to', 'deleted_by', 'updated_at'];
BEGIN
  -- 1. Imutáveis (created_by só pode ir a NULL se o utilizador foi apagado)
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Não é possível mudar o identificador de um negócio.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Não é possível mudar a organização de um negócio.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
    RAISE EXCEPTION 'Não é possível mudar a pessoa de um negócio.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by AND NOT v_limpa_criador THEN
    RAISE EXCEPTION 'Não é possível mudar quem criou um negócio.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 1b. O estado só muda pelas funções da página Pessoas.
  IF (NEW.estado IS DISTINCT FROM OLD.estado
      OR NEW.fase_perda IS DISTINCT FROM OLD.fase_perda
      OR NEW.motivo_perda IS DISTINCT FROM OLD.motivo_perda)
     AND COALESCE(current_setting('app.neg_via_funcao', true), '') <> 'on' THEN
    RAISE EXCEPTION 'O estado do negócio só muda pelas acções da página Pessoas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 2. No lixo: só o restauro, ou a limpeza de um utilizador apagado
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NOT NULL
     AND ((to_jsonb(NEW) - v_ignorar) IS DISTINCT FROM (to_jsonb(OLD) - v_ignorar)
          OR (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NOT v_limpa_comercial)
          OR (NEW.deleted_by IS DISTINCT FROM OLD.deleted_by AND NOT v_limpa_apagador)) THEN
    RAISE EXCEPTION 'Este negócio está no lixo: tem de ser restaurado antes de ser alterado.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 3. Comercial novo tem de ser membro activo (só quando muda para alguém)
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     AND NEW.assigned_to IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.anew_memberships m
       WHERE m.user_id = NEW.assigned_to
         AND m.organization_id = NEW.organization_id
         AND m.status = 'active'
     ) THEN
    RAISE EXCEPTION 'O comercial tem de ser membro activo da organização do negócio.'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.root_organization_id := OLD.root_organization_id;
  NEW.created_at := OLD.created_at;

  -- 4. Datas de estado: now() ao entrar no estado, mantidas enquanto lá
  --    fica, limpas ao sair.
  NEW.perdido_em := CASE
    WHEN NEW.estado <> 'perdido' THEN NULL
    WHEN OLD.estado = 'perdido'  THEN OLD.perdido_em
    ELSE now() END;
  NEW.ganho_em := CASE
    WHEN NEW.estado <> 'ganho' THEN NULL
    WHEN OLD.estado = 'ganho'  THEN OLD.ganho_em
    ELSE now() END;

  -- 5. Lixo: só a passagem vivo <-> lixo conta; o valor é sempre da base.
  IF (OLD.deleted_at IS NULL) IS DISTINCT FROM (NEW.deleted_at IS NULL) THEN
    PERFORM public.fn_negocios_exigir_permissao_lixo(
      OLD.organization_id, OLD.assigned_to, OLD.created_by);

    IF NEW.deleted_at IS NOT NULL THEN
      NEW.deleted_at := now();
      NEW.deleted_by := public.fn_negocios_actor();
    ELSE
      NEW.deleted_by := NULL;
    END IF;
  ELSE
    NEW.deleted_at := OLD.deleted_at;
    NEW.deleted_by := CASE WHEN v_limpa_apagador THEN NULL ELSE OLD.deleted_by END;
  END IF;

  RETURN NEW;
END;
$function$;

-- Perder (ou corrigir a fase/motivo de uma perda). Ganho não se perde.
CREATE OR REPLACE FUNCTION public.neg_perder_negocio(p_negocio_id uuid, p_fase text, p_motivo text)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg    public.negocios;
  v_motivo text := btrim(p_motivo);
BEGIN
  IF p_fase IS NULL OR p_fase NOT IN
     ('lead', 'contacto', 'visita', 'levantamento', 'orcamento', 'proposta', 'contrato') THEN
    RAISE EXCEPTION 'Valor inválido: fase da perda.' USING ERRCODE = 'NG009';
  END IF;
  IF v_motivo IS NULL OR v_motivo = '' OR char_length(v_motivo) > 1000 THEN
    RAISE EXCEPTION 'Valor inválido: motivo da perda (1 a 1000 caracteres).' USING ERRCODE = 'NG009';
  END IF;

  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto', 'perdido']);

  IF v_neg.estado = 'perdido' AND v_neg.fase_perda = p_fase AND v_neg.motivo_perda = v_motivo THEN
    RETURN jsonb_build_object('mudou', false, 'estado', 'perdido');
  END IF;

  PERFORM set_config('app.neg_via_funcao', 'on', true);
  UPDATE public.negocios n
  SET estado = 'perdido', fase_perda = p_fase, motivo_perda = v_motivo
  WHERE n.id = v_neg.id;
  PERFORM set_config('app.neg_via_funcao', 'off', true);

  RETURN jsonb_build_object('mudou', true, 'estado', 'perdido');
END;
$function$;

-- Anular a perda (reabrir). A razão vai para o evento 'reabriu'.
CREATE OR REPLACE FUNCTION public.neg_anular_perda(p_negocio_id uuid, p_motivo_reabertura text)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg    public.negocios;
  v_motivo text := btrim(p_motivo_reabertura);
BEGIN
  IF v_motivo IS NULL OR v_motivo = '' OR char_length(v_motivo) > 1000 THEN
    RAISE EXCEPTION 'Valor inválido: razão da reabertura (1 a 1000 caracteres).' USING ERRCODE = 'NG009';
  END IF;

  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto', 'perdido']);

  IF v_neg.estado = 'aberto' THEN
    RETURN jsonb_build_object('mudou', false, 'estado', 'aberto');
  END IF;

  PERFORM set_config('app.negocio_motivo_reabertura', v_motivo, true);
  PERFORM set_config('app.neg_via_funcao', 'on', true);
  UPDATE public.negocios n
  SET estado = 'aberto', fase_perda = NULL, motivo_perda = NULL
  WHERE n.id = v_neg.id;
  PERFORM set_config('app.neg_via_funcao', 'off', true);
  PERFORM set_config('app.negocio_motivo_reabertura', '', true);

  RETURN jsonb_build_object('mudou', true, 'estado', 'aberto');
END;
$function$;

-- Ganhar: igual à versão de 19/10, com a variável à volta do UPDATE.
CREATE OR REPLACE FUNCTION public.neg_ganhar_negocio(
  p_negocio_id uuid,
  p_lead_id uuid DEFAULT NULL,
  p_client_data jsonb DEFAULT '{}'::jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg        public.negocios;
  v_momento    text;
  v_mudou      boolean := false;
  v_lead       public.anew_leads;
  v_client_id  uuid;
  v_client_org uuid;
  v_conversao  text;
  v_outras     int;
BEGIN
  IF p_client_data IS NOT NULL AND jsonb_typeof(p_client_data) <> 'object' THEN
    RAISE EXCEPTION 'Valor inválido: dados do cliente.' USING ERRCODE = 'NG009';
  END IF;

  -- 1. Negócio editável, aberto ou já ganho (perdido: reabrir primeiro).
  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto', 'ganho']);
  v_momento := public.fn_neg_exigir_config(v_neg.organization_id);

  IF v_neg.estado = 'aberto' THEN
    -- 2. Regra da organização (leituras sob RLS).
    IF v_momento = 'proposta_aceite' AND NOT EXISTS (
         SELECT 1 FROM public.proposals pr
         WHERE pr.negocio_id = v_neg.id AND pr.status = 'accepted'
           AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE) THEN
      RAISE EXCEPTION 'O ganho desta organização exige proposta aceite ligada ao negócio.' USING ERRCODE = 'NG006';
    END IF;
    IF v_momento = 'contrato_assinado' AND NOT EXISTS (
         SELECT 1 FROM public.client_contracts cc
         WHERE cc.negocio_id = v_neg.id AND cc.status IN ('signed', 'assinado')
           AND cc.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'O ganho desta organização exige contrato assinado ligado ao negócio.' USING ERRCODE = 'NG006';
    END IF;

    -- 3. Ganho antes da conversão (escrita própria antes do bypass de auditoria).
    PERFORM set_config('app.neg_via_funcao', 'on', true);
    UPDATE public.negocios n SET estado = 'ganho' WHERE n.id = v_neg.id;
    PERFORM set_config('app.neg_via_funcao', 'off', true);
    v_mudou := true;
  END IF;

  -- 4. Conversão de UMA lead aberta, serializada por pessoa.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'neg_pessoa:' || v_neg.organization_id::text || ':' || v_neg.entity_id::text, 0));

  SELECT * INTO v_lead FROM public.fn_neg_escolher_lead(
    v_neg.organization_id, v_neg.entity_id, p_lead_id, 'aberta');

  IF v_lead.id IS NOT NULL
     AND (v_lead.status = 'converted' OR v_lead.converted_to_client_id IS NOT NULL) THEN
    -- Lead indicada já convertida: não se chama o rpc.
    v_conversao := 'ja_convertida';
    v_client_id := v_lead.converted_to_client_id;

  ELSIF v_lead.id IS NOT NULL AND public.fn_neg_lead_aberta(v_lead.status::text) THEN
    -- D5: leads.convert com âmbito sobre esta lead (como as políticas).
    IF NOT (public.has_anew_permission(auth.uid(), 'leads.convert')
            AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('leads.convert')) AS k(scope_key)
                        WHERE k.scope_key = v_lead.organization_id::text || ':*'
                           OR k.scope_key = v_lead.organization_id::text || ':' || v_lead.assigned_to::text
                           OR k.scope_key = v_lead.organization_id::text || ':' || v_lead.created_by::text)) THEN
      RAISE EXCEPTION 'Sem permissão para converter a lead.' USING ERRCODE = 'NG007';
    END IF;

    SELECT c.id, c.organization_id INTO v_client_id, v_client_org
    FROM public.rpc_convert_lead_to_client(
      v_lead.id, COALESCE(p_client_data, '{}'::jsonb), NULL::uuid, NULL::uuid, NULL::uuid) AS c;
    IF v_client_org IS DISTINCT FROM v_neg.organization_id THEN
      RAISE EXCEPTION 'A conversão desta lead não é possível nesta organização.' USING ERRCODE = 'NG012';
    END IF;
    v_conversao := 'feita';
    v_mudou := true;

  ELSE
    -- Sem lead aberta, ou a indicada está fechada (rejeitada, perdida,
    -- cancelada): não converte; só se a pessoa já for cliente desta organização.
    SELECT c.id INTO v_client_id
    FROM public.anew_clients c
    WHERE c.organization_id = v_neg.organization_id AND c.entity_id = v_neg.entity_id
      AND c.deleted_at IS NULL
    ORDER BY c.created_at ASC
    LIMIT 1;
    IF v_client_id IS NOT NULL THEN
      v_conversao := 'ja_cliente';
    ELSE
      SELECT l.* INTO v_lead
      FROM public.anew_leads l
      WHERE l.organization_id = v_neg.organization_id AND l.entity_id = v_neg.entity_id
        AND l.deleted_at IS NULL AND l.converted_to_client_id IS NOT NULL
      ORDER BY l.converted_at DESC NULLS LAST, l.created_at DESC
      LIMIT 1;
      IF v_lead.id IS NULL THEN
        RAISE EXCEPTION 'A pessoa não tem lead aberta para converter.' USING ERRCODE = 'NG015';
      END IF;
      v_conversao := 'ja_convertida';
      v_client_id := v_lead.converted_to_client_id;
    END IF;
  END IF;

  -- Cliente já existente tem de ser desta organização (lido sob RLS).
  IF v_conversao = 'ja_convertida' THEN
    SELECT c.organization_id INTO v_client_org
    FROM public.anew_clients c
    WHERE c.id = v_client_id;
    IF v_client_org IS DISTINCT FROM v_neg.organization_id THEN
      RAISE EXCEPTION 'A conversão desta lead não é possível nesta organização.' USING ERRCODE = 'NG012';
    END IF;
  END IF;

  SELECT count(*)::int INTO v_outras
  FROM public.anew_leads l
  WHERE l.organization_id = v_neg.organization_id AND l.entity_id = v_neg.entity_id
    AND l.deleted_at IS NULL
    AND l.id IS DISTINCT FROM v_lead.id
    AND public.fn_neg_lead_aberta(l.status::text);

  -- 5. O rpc de conversão deixa a auditoria genérica desligada até ao fim da transacção.
  PERFORM set_config('app.audit_bypass', 'off', true);

  RETURN jsonb_build_object('mudou', v_mudou, 'estado', 'ganho', 'conversao', v_conversao,
                            'lead_id', v_lead.id, 'client_id', v_client_id,
                            'outras_leads_abertas', v_outras);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_negocios_preparar_insercao() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_negocios_preparar_insercao() TO service_role;
REVOKE ALL ON FUNCTION public.fn_negocios_guardar_alteracao() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_negocios_guardar_alteracao() TO service_role;
REVOKE ALL ON FUNCTION public.neg_perder_negocio(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.neg_anular_perda(uuid, text)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.neg_ganhar_negocio(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_perder_negocio(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_anular_perda(uuid, text)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_ganhar_negocio(uuid, uuid, jsonb) TO authenticated;

-- CONFERIR
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. assinaturas, DEFINER só no trigger, search_path fixo, sem anon,
  --    authenticated só nas públicas, todas com app.neg_via_funcao
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_negocios_preparar_insercao()', true),
              ('public.fn_negocios_guardar_alteracao()', true),
              ('public.neg_perder_negocio(uuid,text,text)', false),
              ('public.neg_anular_perda(uuid,text)', false),
              ('public.neg_ganhar_negocio(uuid,uuid,jsonb)', false)
            ) AS e(sig, definer)
            LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.sig)
            WHERE p.oid IS NULL
               OR p.prosecdef <> e.definer
               OR array_to_string(p.proconfig, ',') IS DISTINCT FROM 'search_path=public, pg_temp'
               OR p.prosrc NOT LIKE '%app.neg_via_funcao%'
               OR has_function_privilege('anon', p.oid, 'EXECUTE')
               OR has_function_privilege('authenticated', p.oid, 'EXECUTE') = e.definer);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (1. funções): falha em %', v_txt;
  END IF;

  -- 2. os dois triggers continuam activos e com estas funções
  IF (SELECT count(*) FROM pg_trigger t
      WHERE t.tgrelid = to_regclass('public.negocios') AND t.tgenabled::text = 'O'
        AND ((t.tgname::text = 'trg_00_negocios_guardar_alteracao'
              AND t.tgfoid = to_regprocedure('public.fn_negocios_guardar_alteracao()'))
          OR (t.tgname::text = 'trg_00_negocios_preparar_insercao'
              AND t.tgfoid = to_regprocedure('public.fn_negocios_preparar_insercao()')))) <> 2 THEN
    RAISE EXCEPTION 'CONFERIR (2. triggers de negocios)';
  END IF;

  -- 2b. a guarda do INSERT ficou: a função é exactamente a desta migration
  IF md5(pg_get_functiondef(to_regprocedure('public.fn_negocios_preparar_insercao()')))
     IS DISTINCT FROM '8bb6cc9c238067c8c0a009c227a2d523' THEN
    RAISE EXCEPTION 'CONFERIR (2b. fn_negocios_preparar_insercao não é a desta migration)';
  END IF;

  -- 3. funções existentes de que dependem, iguais (md5 lidos a 19/10)
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_negocios_ref_utilizador_apagado(uuid,uuid)',            '6e45bfff81ab95e812b44d126cc3d75a'),
              ('public.fn_negocios_exigir_permissao_lixo(uuid,uuid,uuid)',        'd25d294c90a76ac1d863a8cbaeb97edb'),
              ('public.fn_negocios_actor()',                                      '26296535afef27c393ab0c932995e3cb'),
              ('public.fn_neg_negocio_editavel(uuid,text[])',                     '05b8dd6fd7e952c1d02dadff8e529f25'),
              ('public.fn_neg_escolher_lead(uuid,uuid,uuid,text)',                'c90baaf27ba54677161e4bc94c1b5895'),
              ('public.rpc_convert_lead_to_client(uuid,jsonb,uuid,uuid,uuid)',    'c03719b805fbdcda023efb53e7f2c8e8'),
              ('public.crm_scope_keys(text)',                                     '6abb12e1d7a3db943630e8f8d7e15ca8'),
              ('public.has_anew_permission(uuid,text)',                           '8f69ed134c7d20e080d8c5a4161a3151')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (3. funções existentes mudaram): %', v_txt;
  END IF;
END;
$$;

COMMIT;
