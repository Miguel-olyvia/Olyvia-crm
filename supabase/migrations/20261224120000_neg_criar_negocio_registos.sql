-- ============================================================
-- 20261224120000_neg_criar_negocio_registos (M6)
-- ============================================================
-- O que faz: neg_criar_negocio (nossa) substituída com a mesma assinatura e
--   o mesmo retorno. p_registos[].tipo passa a aceitar também 'orcamento',
--   'proposta' e 'contrato' (além de 'contacto' e 'visita'). Um contrato
--   sem orçamento nem proposta (NG014) vai para "recusados" como o NG004,
--   em vez de abortar a criação. O resto é igual à versão de 19/10.
-- Só altera uma função NOSSA. Não bloqueia tabelas. Nada da Mudelar.
-- NÃO altera: neg_ligar_registo (é ela que valida cada ligação), tabelas,
--   políticas.
-- A UI precisa de: poder enviar orçamentos, propostas e contratos por ligar
--   em p_registos ao criar o negócio; mostrar os recusados.
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- Pré-condição: a versão a substituir é a lida a 19/10.
DO $$
BEGIN
  IF md5(pg_get_functiondef(to_regprocedure('public.neg_criar_negocio(uuid,uuid,uuid,text,text,uuid,jsonb,uuid,uuid,boolean)')))
     IS DISTINCT FROM '9fff1279a7ae61d9fac46076ed73a22e' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: neg_criar_negocio mudou desde 19/10; nada feito.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.neg_criar_negocio(
  p_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_titulo text,
  p_notas text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_registos jsonb DEFAULT '[]'::jsonb,
  p_levantamento_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_reabrir_abordagem boolean DEFAULT false)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_titulo     text := btrim(p_titulo);
  v_notas      text := NULLIF(btrim(p_notas), '');
  v_registos   jsonb := COALESCE(p_registos, '[]'::jsonb);
  v_lead       public.anew_leads;
  v_existente  public.negocios;
  v_reg        record;
  v_ligados    jsonb := '[]'::jsonb;
  v_recusados  jsonb := '[]'::jsonb;
  v_n          int;
BEGIN
  IF p_id IS NULL OR v_titulo IS NULL OR v_titulo = '' OR char_length(v_titulo) > 200
     OR char_length(v_notas) > 5000 THEN
    RAISE EXCEPTION 'Valor inválido: identificador, título (1 a 200) ou notas (até 5000).' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_typeof(v_registos) <> 'array' THEN
    RAISE EXCEPTION 'Valor inválido: registos.' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_array_length(v_registos) > 100 OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_registos) AS e(valor)
       WHERE jsonb_typeof(e.valor) <> 'object'
          OR (e.valor ->> 'tipo') IS NULL
          OR (e.valor ->> 'tipo') NOT IN ('contacto', 'visita', 'orcamento', 'proposta', 'contrato')
          OR (e.valor ->> 'id') IS NULL
          OR (e.valor ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'Valor inválido: registos (até 100; tipo contacto, visita, orcamento, proposta ou contrato; id uuid).'
      USING ERRCODE = 'NG009';
  END IF;

  PERFORM public.fn_neg_exigir_config(p_organization_id);
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);

  -- Reenvio do mesmo id: devolve-o como está, antes de qualquer outra regra.
  SELECT n.* INTO v_existente FROM public.negocios n WHERE n.id = p_id;
  IF FOUND THEN
    IF v_existente.organization_id <> p_organization_id OR v_existente.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
    END IF;
    RETURN jsonb_build_object('negocio_id', p_id, 'mudou', false, 'ligados', '[]'::jsonb,
                              'recusados', '[]'::jsonb, 'lead_escolhida', NULL);
  END IF;

  -- A lead aberta a que o negócio corresponde (só informação; não se altera).
  SELECT * INTO v_lead FROM public.fn_neg_escolher_lead(p_organization_id, p_entity_id, p_lead_id, 'aberta');
  IF v_lead.id IS NOT NULL AND v_lead.closure_result IS NOT NULL
     AND NOT COALESCE(p_reabrir_abordagem, false) THEN
    RAISE EXCEPTION 'A abordagem desta pessoa está encerrada.' USING ERRCODE = 'NG002';
  END IF;

  -- Criar (RLS negocios_insert: pessoas.create na organização, pessoa ligada,
  -- comercial membro activo). Corrida com outro reenvio: devolve-o como está.
  INSERT INTO public.negocios (id, organization_id, entity_id, titulo, notas, assigned_to)
  VALUES (p_id, p_organization_id, p_entity_id, v_titulo, v_notas, p_assigned_to)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    SELECT n.* INTO v_existente FROM public.negocios n WHERE n.id = p_id;
    IF NOT FOUND OR v_existente.organization_id <> p_organization_id
       OR v_existente.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
    END IF;
    RETURN jsonb_build_object('negocio_id', p_id, 'mudou', false, 'ligados', '[]'::jsonb,
                              'recusados', '[]'::jsonb, 'lead_escolhida', NULL);
  END IF;

  -- Ligações (exigem pessoas.edit: NG001 aborta tudo; NG004 e NG014 vão
  -- para recusados).
  FOR v_reg IN
    SELECT e.valor ->> 'tipo' AS tipo, (e.valor ->> 'id')::uuid AS id
    FROM jsonb_array_elements(v_registos) AS e(valor)
    UNION ALL
    SELECT 'levantamento', p_levantamento_id WHERE p_levantamento_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.neg_ligar_registo(p_id, v_reg.tipo, v_reg.id);
      v_ligados := v_ligados || jsonb_build_object('tipo', v_reg.tipo, 'id', v_reg.id);
    EXCEPTION WHEN SQLSTATE 'NG004' OR SQLSTATE 'NG014' THEN
      v_recusados := v_recusados || jsonb_build_object('tipo', v_reg.tipo, 'id', v_reg.id);
    END;
  END LOOP;

  IF v_lead.id IS NOT NULL AND v_lead.closure_result IS NOT NULL THEN
    PERFORM public.fn_neg_mudar_abordagem(
      p_organization_id, p_entity_id, v_lead.id, NULL, NULL, 'Reaberta ao criar um negócio');
  END IF;

  RETURN jsonb_build_object('negocio_id', p_id, 'mudou', true, 'ligados', v_ligados,
                            'recusados', v_recusados,
                            'lead_escolhida', CASE WHEN public.fn_neg_lead_aberta(v_lead.status::text)
                                                   THEN v_lead.id END);
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_criar_negocio(uuid, uuid, uuid, text, text, uuid, jsonb, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_criar_negocio(uuid, uuid, uuid, text, text, uuid, jsonb, uuid, uuid, boolean) TO authenticated;

-- CONFERIR
DO $$
DECLARE
  v_n int;
  v_txt text;
BEGIN
  -- 1. assinatura, INVOKER, search_path fixo, sem anon, com authenticated, aceita os tipos novos
  SELECT count(*) INTO v_n
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.neg_criar_negocio(uuid,uuid,uuid,text,text,uuid,jsonb,uuid,uuid,boolean)')
    AND NOT p.prosecdef
    AND array_to_string(p.proconfig, ',') = 'search_path=public, pg_temp'
    AND p.prosrc LIKE '%''contrato''%'
    AND p.prosrc LIKE '%NG014%'
    AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CONFERIR (1. neg_criar_negocio)';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
      WHERE s.nspname = 'public' AND p.proname = 'neg_criar_negocio') <> 1 THEN
    RAISE EXCEPTION 'CONFERIR (1b. mais de uma neg_criar_negocio)';
  END IF;

  -- 2. funções nossas que chama, iguais (md5 lidos a 19/10)
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.neg_ligar_registo(uuid,text,uuid)',                      '5ed5cf7c02dffd6d4943a98b7b10d0e8'),
              ('public.fn_neg_exigir_config(uuid)',                             '566f127b4f3cea295f04c916e366cd5d'),
              ('public.fn_neg_exigir_pessoa(uuid,uuid)',                        '4dbbe481640899b70e05dc3d5ea2f4c5'),
              ('public.fn_neg_escolher_lead(uuid,uuid,uuid,text)',              'c90baaf27ba54677161e4bc94c1b5895'),
              ('public.fn_neg_mudar_abordagem(uuid,uuid,uuid,text,text,text)',  'ad65ef03cf301444914f4a9dcf4f864b'),
              ('public.fn_neg_lead_aberta(text)',                               'cb988326544ed75840624bfb78e55b7f')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (2. funções de que depende mudaram): %', v_txt;
  END IF;
END;
$$;

COMMIT;
