-- =============================================================================
-- POR APLICAR — não foi feito db push. Rever antes de aplicar em produção.
-- Depende de: 20261213100000_um_so_contacto_primario_por_entidade.sql
-- =============================================================================
-- Um só email/telefone primário por entidade, garantido pela BD — "a última
-- alteração ganha" — seja qual for o caminho que escreve (book-slot,
-- pipeline-automation, execute-workflow e create-lead inserem is_primary=true
-- sem despromover os anteriores).
--
-- Não se cria índice único parcial: partiria esses caminhos (o INSERT do
-- novo primário falharia em vez de ganhar).
--
-- 1. Limpeza única dos dados: por entidade com mais de um primário, fica o
--    mais recente (ORDER BY created_at DESC, id DESC); os outros passam a
--    is_primary=false. Nenhuma linha é apagada; is_primary NULL não é tocado.
--    Leitura feita em 29/10/2026: emails 577 entidades / 828 linhas a
--    despromover; telefones 575 entidades / 833 linhas.
-- 2. Gatilho AFTER INSERT OR UPDATE OF is_primary ... WHEN (NEW.is_primary)
--    que despromove os restantes primários da mesma entidade.
-- 3. Verificação final: se ainda houver alguma entidade com mais de um
--    primário, a migração aborta inteira.
--
-- Interação com os gatilhos existentes (verificada em pg_trigger):
--   * trg_normalize_entity_email (BEFORE, lower(email)): corre nas linhas
--     despromovidas mas não muda nada — 0 emails em produção com maiúsculas.
--   * trg_check_email_unique_on_email_write: só verifica quando o email muda
--     (NEW.email IS DISTINCT FROM OLD.email); aqui só muda is_primary.
--   * trg_*_sync_*_search_text: são UPDATE OF email/phone_number, entity_id;
--     um UPDATE que só põe is_primary não os dispara.
--   * trg_audit_anew_entity_* (fn_generic_entity_audit): auditoria genérica
--     por linha; grava 1 linha em entity_audit_log por linha despromovida
--     (~1661 na limpeza, marcadas com app.audit_source abaixo). Respeita
--     app.audit_bypass: dentro de rpc_update_client, as despromoções feitas
--     pelo gatilho novo também não são auditadas (como o resto dessa RPC).
--     Erros de auditoria são engolidos e nunca bloqueiam o DML.
--
-- Sem recursão: as linhas despromovidas pelo gatilho têm
-- NEW.is_primary = false, por isso o WHEN não volta a disparar.
--
-- Limitação: dois INSERTs primários em simultâneo, em transações diferentes,
-- não se veem um ao outro e podem ficar os dois primários. Os caminhos da app
-- que importam (rpc_update_client, rpc_set_entity_primary_*) bloqueiam a
-- linha de anew_entities antes de escrever.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Limpeza dos primários duplicados
-- -----------------------------------------------------------------------------
-- Num bloco DO para o LOCK e o set_config local não dependerem de a CLI
-- abrir uma transação explícita à volta do ficheiro.
DO $$
BEGIN
  -- Impede que entrem novos primários duplicados entre a limpeza e a criação
  -- do gatilho. Bloqueia só escritas nestas duas tabelas até ao fim da
  -- transação; as leituras continuam.
  LOCK TABLE public.anew_entity_emails, public.anew_entity_phones
    IN SHARE ROW EXCLUSIVE MODE;

  -- Identifica as linhas de auditoria geradas por esta limpeza.
  PERFORM set_config('app.audit_source', 'migration_20261213110000_limpeza_primarios', true);

  WITH ordenados AS (
    SELECT id,
           row_number() OVER (PARTITION BY entity_id
                              ORDER BY created_at DESC, id DESC) AS rn
    FROM public.anew_entity_emails
    WHERE is_primary IS TRUE
  )
  UPDATE public.anew_entity_emails e
  SET is_primary = false
  FROM ordenados o
  WHERE e.id = o.id
    AND o.rn > 1;

  WITH ordenados AS (
    SELECT id,
           row_number() OVER (PARTITION BY entity_id
                              ORDER BY created_at DESC, id DESC) AS rn
    FROM public.anew_entity_phones
    WHERE is_primary IS TRUE
  )
  UPDATE public.anew_entity_phones p
  SET is_primary = false
  FROM ordenados o
  WHERE p.id = o.id
    AND o.rn > 1;

  PERFORM set_config('app.audit_source', '', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Gatilhos: o primário novo despromove os restantes da mesma entidade
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER: neste projeto, gatilhos INVOKER são bloqueados pela RLS
-- quando quem escreve é authenticated (o UPDATE às linhas antigas falharia ou
-- seria filtrado em silêncio).
CREATE OR REPLACE FUNCTION public.fn_trg_single_primary_entity_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.anew_entity_emails
  SET is_primary = false
  WHERE entity_id = NEW.entity_id
    AND id <> NEW.id
    AND is_primary IS TRUE;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_trg_single_primary_entity_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.anew_entity_phones
  SET is_primary = false
  WHERE entity_id = NEW.entity_id
    AND id <> NEW.id
    AND is_primary IS TRUE;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_trg_single_primary_entity_email() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_trg_single_primary_entity_phone() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_single_primary_entity_email ON public.anew_entity_emails;
CREATE TRIGGER trg_single_primary_entity_email
  AFTER INSERT OR UPDATE OF is_primary ON public.anew_entity_emails
  FOR EACH ROW
  WHEN (NEW.is_primary IS TRUE)
  EXECUTE FUNCTION public.fn_trg_single_primary_entity_email();

DROP TRIGGER IF EXISTS trg_single_primary_entity_phone ON public.anew_entity_phones;
CREATE TRIGGER trg_single_primary_entity_phone
  AFTER INSERT OR UPDATE OF is_primary ON public.anew_entity_phones
  FOR EACH ROW
  WHEN (NEW.is_primary IS TRUE)
  EXECUTE FUNCTION public.fn_trg_single_primary_entity_phone();

-- -----------------------------------------------------------------------------
-- 3. Verificação final — aborta a migração inteira se algo ficou mal
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_emails int;
  v_phones int;
BEGIN
  SELECT count(*) INTO v_emails FROM (
    SELECT entity_id FROM public.anew_entity_emails
    WHERE is_primary IS TRUE
    GROUP BY entity_id HAVING count(*) > 1
  ) d;

  SELECT count(*) INTO v_phones FROM (
    SELECT entity_id FROM public.anew_entity_phones
    WHERE is_primary IS TRUE
    GROUP BY entity_id HAVING count(*) > 1
  ) d;

  IF v_emails > 0 OR v_phones > 0 THEN
    RAISE EXCEPTION 'Ainda há entidades com vários primários (emails: %, telefones: %) — migração abortada',
      v_emails, v_phones;
  END IF;
END;
$$;
