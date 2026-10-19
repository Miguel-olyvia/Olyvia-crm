-- ============================================================
-- 20261224100000_negocio_eventos_lixo (M1)
-- ============================================================
-- O que faz: o histórico do negócio passa a registar a entrada no lixo
--   ('apagado') e o restauro ('restaurado').
--   - CHECK de negocio_eventos (tipo e coerente) alargados aos dois tipos;
--   - fn_negocios_registar_evento (nossa) substituída: além do evento de
--     estado de sempre, grava 'apagado'/'restaurado' quando deleted_at passa
--     de nulo para valor ou ao contrário (até dois eventos por UPDATE);
--   - trg_negocios_eventos passa a ouvir também deleted_at.
-- Só altera objectos NOSSOS (negocios, negocio_eventos, a função do trigger).
--   Bloqueia só estas duas tabelas (vazias hoje). Nada da Mudelar.
-- NÃO altera: auditoria genérica (não há em negocios, de propósito), RLS,
--   outras funções.
-- A UI precisa de: traduzir 'apagado' e 'restaurado' na linha do tempo do
--   negócio; regenerar os tipos.
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '60s';

-- Bloqueios no início, por ordem fixa, com NOWAIT (10 tentativas, 250 ms).
DO $$
DECLARE
  v_tentativa int := 0;
BEGIN
  LOOP
    v_tentativa := v_tentativa + 1;
    BEGIN
      LOCK TABLE public.negocios        IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      LOCK TABLE public.negocio_eventos IN ACCESS EXCLUSIVE MODE NOWAIT;
      EXIT;
    EXCEPTION WHEN lock_not_available THEN
      IF v_tentativa >= 10 THEN
        RAISE EXCEPTION 'Tabelas ocupadas: voltar a tentar mais tarde (% tentativas).', v_tentativa
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
  IF md5(pg_get_functiondef(to_regprocedure('public.fn_negocios_registar_evento()')))
     IS DISTINCT FROM '61f9986b39f40fb74a30d75a376959c8' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: fn_negocios_registar_evento mudou desde 19/10; nada feito.';
  END IF;
END;
$$;

ALTER TABLE public.negocio_eventos
  DROP CONSTRAINT negocio_eventos_tipo_check,
  ADD CONSTRAINT negocio_eventos_tipo_check
    CHECK (tipo IN ('perdeu', 'reabriu', 'ganhou', 'apagado', 'restaurado')),
  DROP CONSTRAINT negocio_eventos_coerente,
  ADD CONSTRAINT negocio_eventos_coerente
    CHECK (
      (tipo = 'perdeu' AND fase IS NOT NULL AND motivo IS NOT NULL)
      OR (tipo = 'ganhou' AND fase IS NULL AND motivo IS NULL)
      OR (tipo = 'reabriu')
      OR (tipo IN ('apagado', 'restaurado') AND fase IS NULL AND motivo IS NULL)
    );

CREATE OR REPLACE FUNCTION public.fn_negocios_registar_evento()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_tipo        text;
  v_fase        text;
  v_motivo      text;
  v_motivo_reab text;
  v_lixo        text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'perdido' THEN
      v_tipo := 'perdeu';  v_fase := NEW.fase_perda;  v_motivo := NEW.motivo_perda;
    ELSIF NEW.estado = 'ganho' THEN
      v_tipo := 'ganhou';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
      IF NEW.estado = 'perdido' THEN
        v_tipo := 'perdeu';  v_fase := NEW.fase_perda;  v_motivo := NEW.motivo_perda;
      ELSIF NEW.estado = 'ganho' THEN
        v_tipo := 'ganhou';
      ELSE
        -- Reabrir: guarda a perda desfeita (nula se vinha de ganho) e a
        -- razão, se a função de reabrir a deixou na variável local.
        v_tipo := 'reabriu'; v_fase := OLD.fase_perda; v_motivo := OLD.motivo_perda;
        v_motivo_reab := NULLIF(btrim(current_setting('app.negocio_motivo_reabertura', true)), '');
        PERFORM set_config('app.negocio_motivo_reabertura', '', true);
      END IF;
    ELSIF NEW.estado = 'perdido'
          AND (NEW.fase_perda IS DISTINCT FROM OLD.fase_perda
               OR NEW.motivo_perda IS DISTINCT FROM OLD.motivo_perda) THEN
      -- Correcção da fase ou do motivo de uma perda já registada.
      v_tipo := 'perdeu';  v_fase := NEW.fase_perda;  v_motivo := NEW.motivo_perda;
    END IF;

    -- Lixo: só a passagem vivo <-> lixo (o valor é escrito pela base).
    IF (OLD.deleted_at IS NULL) IS DISTINCT FROM (NEW.deleted_at IS NULL) THEN
      v_lixo := CASE WHEN NEW.deleted_at IS NOT NULL THEN 'apagado' ELSE 'restaurado' END;
    END IF;
  END IF;

  -- Estado primeiro, lixo depois. Não engole erros: sem evento, sem alteração.
  IF v_tipo IS NOT NULL THEN
    INSERT INTO public.negocio_eventos
      (negocio_id, organization_id, root_organization_id, tipo, fase, motivo,
       motivo_reabertura, created_by)
    VALUES
      (NEW.id, NEW.organization_id, NEW.root_organization_id, v_tipo, v_fase, v_motivo,
       v_motivo_reab, public.fn_negocios_actor());
  END IF;

  IF v_lixo IS NOT NULL THEN
    INSERT INTO public.negocio_eventos
      (negocio_id, organization_id, root_organization_id, tipo, created_by)
    VALUES
      (NEW.id, NEW.organization_id, NEW.root_organization_id, v_lixo, public.fn_negocios_actor());
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_negocios_registar_evento() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_negocios_registar_evento() TO service_role;

CREATE OR REPLACE TRIGGER trg_negocios_eventos
  AFTER INSERT OR UPDATE OF estado, fase_perda, motivo_perda, deleted_at ON public.negocios
  FOR EACH ROW EXECUTE FUNCTION public.fn_negocios_registar_evento();

-- CONFERIR
DO $$
DECLARE
  v_n int;
BEGIN
  -- 1. as duas restrições novas, validadas
  SELECT count(*) INTO v_n
  FROM pg_constraint k
  WHERE k.conrelid = to_regclass('public.negocio_eventos') AND k.convalidated
    AND ((k.conname::text = 'negocio_eventos_tipo_check'
          AND pg_get_constraintdef(k.oid) LIKE '%restaurado%')
      OR (k.conname::text = 'negocio_eventos_coerente'
          AND pg_get_constraintdef(k.oid) LIKE '%apagado%'));
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'CONFERIR (1. restrições de negocio_eventos): obtido %, esperado 2', v_n;
  END IF;

  -- 2. o trigger ouve deleted_at e está activo
  SELECT count(*) INTO v_n
  FROM pg_trigger t
  WHERE t.tgrelid = to_regclass('public.negocios') AND t.tgname::text = 'trg_negocios_eventos'
    AND t.tgenabled::text = 'O'
    AND pg_get_triggerdef(t.oid) LIKE '%UPDATE OF estado, fase_perda, motivo_perda, deleted_at%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CONFERIR (2. trg_negocios_eventos sem deleted_at)';
  END IF;

  -- 3. a função é a nova (grava 'apagado'): DEFINER, search_path fixo, sem anon
  --    nem authenticated, continua a ler a razão da reabertura
  SELECT count(*) INTO v_n
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.fn_negocios_registar_evento()')
    AND p.prosecdef
    AND array_to_string(p.proconfig, ',') = 'search_path=public, pg_temp'
    AND p.prosrc LIKE '%app.negocio_motivo_reabertura%'
    AND p.prosrc LIKE '%''apagado''%'
    AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CONFERIR (3. fn_negocios_registar_evento)';
  END IF;

  -- 4. função existente de que depende, igual (md5 lido a 19/10)
  IF md5(pg_get_functiondef(to_regprocedure('public.fn_negocios_actor()')))
     IS DISTINCT FROM '26296535afef27c393ab0c932995e3cb' THEN
    RAISE EXCEPTION 'CONFERIR (4. fn_negocios_actor mudou)';
  END IF;
END;
$$;

COMMIT;
