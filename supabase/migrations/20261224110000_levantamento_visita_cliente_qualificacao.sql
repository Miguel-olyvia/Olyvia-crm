-- ============================================================
-- 20261224110000_levantamento_visita_cliente_qualificacao (M5)
-- ============================================================
-- O que faz:
--   - fn_levantamentos_validar_ligacoes (nossa) substituída: um levantamento
--     passa a aceitar a visita de um CLIENTE quando esse cliente é da mesma
--     pessoa e organização (visita sem lead, sem ausência nem férias). Antes
--     só aceitava visitas com lead da pessoa ou visitas "soltas". Tudo o
--     resto fica igual.
--   - CHECK de levantamento_respostas.seccao ganha 'qualificacao' (as
--     perguntas da aba Qualificação; tabela vazia hoje).
-- Só altera objectos NOSSOS. Bloqueia só levantamento_respostas (vazia).
-- NÃO altera: schedule_items, as visitas, os outros triggers dos
--   levantamentos, nada da Mudelar.
-- A UI precisa de: gravar as respostas da Qualificação com seccao
--   'qualificacao' (neg_guardar_levantamento, sem mudança de assinatura).
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '60s';

-- Bloqueio no início, com NOWAIT (10 tentativas, 250 ms).
DO $$
DECLARE
  v_tentativa int := 0;
BEGIN
  LOOP
    v_tentativa := v_tentativa + 1;
    BEGIN
      LOCK TABLE public.levantamento_respostas IN ACCESS EXCLUSIVE MODE NOWAIT;
      EXIT;
    EXCEPTION WHEN lock_not_available THEN
      IF v_tentativa >= 10 THEN
        RAISE EXCEPTION 'Tabela ocupada: voltar a tentar mais tarde (% tentativas).', v_tentativa
          USING ERRCODE = 'lock_not_available';
      END IF;
      PERFORM pg_sleep(0.25);
    END;
  END LOOP;
END;
$$;

-- Pré-condição: a versão a substituir é a lida a 19/10.
DO $$
BEGIN
  IF md5(pg_get_functiondef(to_regprocedure('public.fn_levantamentos_validar_ligacoes(uuid,uuid,uuid,uuid,uuid)')))
     IS DISTINCT FROM '8acab30b56b516736e85382f2754c87d' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: fn_levantamentos_validar_ligacoes mudou desde 19/10; nada feito.';
  END IF;
END;
$$;

ALTER TABLE public.levantamento_respostas
  DROP CONSTRAINT levantamento_respostas_seccao_check,
  ADD CONSTRAINT levantamento_respostas_seccao_check
    CHECK (seccao IN ('exterior', 'interior', 'area', 'necessidades', 'escolhas', 'qualificacao'));

CREATE OR REPLACE FUNCTION public.fn_levantamentos_validar_ligacoes(
  p_organization_id uuid, p_entity_id uuid,
  p_feito_por uuid, p_visita_id uuid, p_negocio_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_visita record;
BEGIN
  -- Guarda de organização antes de qualquer leitura (mensagem genérica).
  PERFORM public.fn_levantamentos_exigir_organizacao(p_organization_id);

  IF p_feito_por IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.anew_memberships m
    WHERE m.user_id = p_feito_por
      AND m.organization_id = p_organization_id
      AND m.status = 'active'
      AND m.role_is_client IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Quem fez o levantamento tem de ser membro activo da organização.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_visita_id IS NOT NULL THEN
    SELECT s.organization_id, s.lead_id, s.contact_id, s.deal_id, s.client_id,
           s.time_off_type, s.vacation_id
      INTO v_visita
    FROM public.schedule_items s
    WHERE s.id = p_visita_id;

    IF NOT FOUND OR v_visita.organization_id IS DISTINCT FROM p_organization_id THEN
      RAISE EXCEPTION 'A visita indicada não existe nesta organização.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_visita.lead_id IS NOT NULL THEN
      -- Com lead, o lead tem de ser da pessoa do levantamento.
      IF NOT EXISTS (
        SELECT 1 FROM public.anew_leads l
        WHERE l.id = v_visita.lead_id
          AND l.entity_id = p_entity_id
      ) THEN
        RAISE EXCEPTION 'A visita indicada é de outra pessoa.'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF v_visita.client_id IS NOT NULL
          AND v_visita.time_off_type IS NULL
          AND v_visita.vacation_id IS NULL
          AND EXISTS (
            SELECT 1 FROM public.anew_clients c
            WHERE c.id = v_visita.client_id
              AND c.entity_id = p_entity_id
              AND c.organization_id = p_organization_id
          ) THEN
      -- Visita sem lead de um cliente que é esta pessoa: aceite.
      NULL;
    ELSIF v_visita.contact_id IS NOT NULL
       OR v_visita.deal_id IS NOT NULL
       OR v_visita.client_id IS NOT NULL
       OR v_visita.time_off_type IS NOT NULL
       OR v_visita.vacation_id IS NOT NULL THEN
      -- D5: sem lead só se aceita uma visita "solta" (sem contacto, negócio,
      -- cliente, ausência nem férias): nunca uma folga, umas férias ou uma
      -- reunião de outra pessoa.
      RAISE EXCEPTION 'A visita indicada é de outra pessoa ou não é uma visita.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_negocio_id IS NOT NULL THEN
    -- Negócio vivo, da mesma organização e pessoa e, com sessão, com
    -- pessoas.edit de quem liga sobre esse negócio (espelha negocios_update:
    -- chave org:*, org:assigned_to ou org:created_by). Uma só mensagem para
    -- "não existe", "é de outra pessoa", "está no lixo" e "sem acesso".
    IF NOT EXISTS (
      SELECT 1 FROM public.negocios n
      WHERE n.id = p_negocio_id
        AND n.organization_id = p_organization_id
        AND n.entity_id = p_entity_id
        AND n.deleted_at IS NULL
        AND (
          v_uid IS NULL
          OR (
            public.has_anew_permission(v_uid, 'pessoas.edit')
            AND EXISTS (
              SELECT 1
              FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
              WHERE k.scope_key = n.organization_id::text || ':*'
                 OR k.scope_key = n.organization_id::text || ':' || n.assigned_to::text
                 OR k.scope_key = n.organization_id::text || ':' || n.created_by::text
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'O negócio indicado não está disponível para ligar a este levantamento.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Serializa as ligações ao mesmo negócio: a segunda espera pelo fim da
    -- primeira e, com um snapshot novo, vê-a. Assim "já tem levantamento"
    -- dá esta mensagem e não o erro 23505 do UNIQUE (que mostraria o uuid).
    PERFORM pg_advisory_xact_lock(
      hashtextextended('levantamentos.negocio_id:' || p_negocio_id::text, 0));
    IF EXISTS (
      SELECT 1 FROM public.levantamentos l
      WHERE l.negocio_id = p_negocio_id
    ) THEN
      RAISE EXCEPTION 'Este negócio já tem um levantamento ligado.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_levantamentos_validar_ligacoes(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_levantamentos_validar_ligacoes(uuid, uuid, uuid, uuid, uuid) TO service_role;

-- CONFERIR
DO $$
DECLARE
  v_n int;
  v_txt text;
BEGIN
  -- 1. a restrição nova, validada
  SELECT count(*) INTO v_n
  FROM pg_constraint k
  WHERE k.conrelid = to_regclass('public.levantamento_respostas') AND k.convalidated
    AND k.conname::text = 'levantamento_respostas_seccao_check'
    AND pg_get_constraintdef(k.oid) LIKE '%qualificacao%'
    AND pg_get_constraintdef(k.oid) LIKE '%escolhas%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CONFERIR (1. levantamento_respostas_seccao_check)';
  END IF;

  -- 2. a função: DEFINER, search_path fixo, sem anon nem authenticated, com o ramo do cliente
  SELECT count(*) INTO v_n
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.fn_levantamentos_validar_ligacoes(uuid,uuid,uuid,uuid,uuid)')
    AND p.prosecdef
    AND array_to_string(p.proconfig, ',') = 'search_path=public, pg_temp'
    AND p.prosrc LIKE '%anew_clients%'
    AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CONFERIR (2. fn_levantamentos_validar_ligacoes)';
  END IF;

  -- 3. funções existentes de que depende, iguais (md5 lidos a 19/10)
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_levantamentos_exigir_organizacao(uuid)', '8d91040c105a1ba3aa59f2306a11ab08'),
              ('public.crm_scope_keys(text)',                     '6abb12e1d7a3db943630e8f8d7e15ca8'),
              ('public.has_anew_permission(uuid,text)',           '8f69ed134c7d20e080d8c5a4161a3151')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (3. funções existentes mudaram): %', v_txt;
  END IF;
END;
$$;

COMMIT;
