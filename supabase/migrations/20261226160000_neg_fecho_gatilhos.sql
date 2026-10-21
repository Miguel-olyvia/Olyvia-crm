-- ============================================================
-- 20261226160000_neg_fecho_gatilhos  (Fase N, migration F)
-- ============================================================
-- *** SÓ SE APLICA COM AUTORIZAÇÃO EXPRESSA DO UTILIZADOR, FORA DA HORA DE
-- *** PONTA. Cria gatilhos em DUAS TABELAS PARTILHADAS COM A MUDELAR:
-- *** proposals e client_contracts.
-- Frase para pedir a autorização (desenho, 16.1): «Para a Mudelar não muda
-- nada nos dados nem no comportamento; há um bloqueio curto nessas tabelas
-- durante a aplicação». Bloqueio SHARE ROW EXCLUSIVE com NOWAIT, até 10
-- tentativas de 0,5 s; sem ele, aborta sem fazer nada.
--
-- Desenho: vault ficheiros/crm/negocios-fecho-por-tipo-desenho.md (v4),
--   secções 8, 9 e 16.1 (linha F).
--
-- O que faz
--   Dois gatilhos de restrição adiados (DEFERRABLE INITIALLY DEFERRED), que
--   correm no fim da transacção (COMMIT):
--     trg_negocios_fecho_proposta  em proposals
--     trg_negocios_fecho_contrato  em client_contracts
--   AFTER UPDATE OF status, negocio_id, com
--   WHEN (NEW.negocio_id IS NOT NULL AND (status ou negocio_id mudou)).
--   Por serem adiados, vêem o substituto (replaced_by_contract_id), o estado
--   final de republish_proposal_snapshot e as partes assinadas, e correm
--   depois de trg_contract_signed_convert_to_client (que não muda).
--   Cada um chama fn_neg_decidir_negocio (migration D) com o estado antes e
--   depois; essa função relê o documento e é idempotente.
--   Todo o corpo corre dentro de BEGIN ... EXCEPTION: um erro fica em
--   workflow_execution_log (action_type 'trigger:negocio_fecho', status
--   'error') e não faz falhar o aceite, a recusa ou a assinatura do cliente.
--   As duas funções têm SET lock_timeout = '2s' ao nível da função: se o
--   negócio estiver bloqueado por outra transacção mais de 2 s, o erro
--   (lock_not_available) é apanhado pelo WHEN OTHERS e registado, e o
--   documento grava na mesma.
--   LIMITES (por desenho):
--   - WHEN OTHERS NÃO apanha query_canceled: se o statement_timeout da sessão
--     disparar durante a decisão (no COMMIT), o COMMIT do documento FALHA e
--     tem de ser repetido. O lock_timeout de 2 s existe para que a espera por
--     bloqueios não chegue lá.
--   - Uma decisão que falhe (erro registado) não se refaz sozinha. «Fechar
--     agora» (neg_reavaliar_negocio) só repara GANHOS (um positivo decisivo
--     com prova num negócio aberto); uma PERDA que falhou não tem reparação
--     automática: dá-se como perdido à mão, a partir do registo de erros.
--   Escrevem só em negocios e negocio_eventos (e, com a conversão automática,
--   em anew_clients/anew_leads, como o gatilho de contratos já faz).
--   Nada se faz para INSERT (os documentos nascem em rascunho) nem para
--   UPDATE para negocio_id nulo.
--
-- MONITORIZAÇÃO (a ter à mão ANTES de ligar a bandeira FECHO_V4_ATIVO, só leitura, só nike):
--   as decisões que falharam ficam sem reparação para PERDAS, e ninguém as vê
--   se ninguém olhar o registo. Consulta (contagem por dia e por tipo de erro):
--     SELECT date_trunc('day', created_at) AS dia, source_entity, execution_data->>'sqlstate' AS sqlstate, count(*)
--     FROM public.workflow_execution_log
--     WHERE action_type = 'trigger:negocio_fecho' AND status = 'error'
--     GROUP BY 1, 2, 3 ORDER BY 1 DESC;
--   O mesmo vale para 'trigger:negocio_conversao' (conversão em cliente que falhou)
--   e 'trigger:negocio_heranca' (migration E). Um aviso no próprio negócio para
--   uma decisão falhada pede um código de alerta novo (CHECK de negocios, migration B
--   já aplicada) e o seu texto no ecrã: fica como decisão por tomar, não está aqui.
--   Também não há gatilho em INSERT: um documento criado já em estado final
--   (proposta aceite, contrato assinado) com negocio_id nunca é decidido.
--
-- Impacto na Mudelar (medido a 20/10, contagens agregadas): 0 documentos com
--   negocio_id e 0 linhas de configuração: o WHEN é falso em todos os UPDATE
--   da Mudelar, nenhum evento fica na fila e a função nem é chamada.
--
-- O que o ecrã tem de fazer junto
--   Marca de alerta na Lista e no Quadro de Pessoas (negocios.alerta_codigo);
--   na ficha, o histórico com origem, canal e prova; ler os ganhos e perdas
--   automáticos (decisao_origem_*). Nenhuma alteração nas páginas de
--   orçamentos, propostas, contratos nem no portal.
--
-- Pré-condição: a migration D e a E aplicadas como escritas (md5 do corpo);
--   os gatilhos anteriores de proposals e client_contracts são os de 20/10.
-- Reversão: fora da pasta das migrations
--   (reversoes/R_20261226160000_neg_fecho_gatilhos.sql). Também partilhada:
--   exige a mesma autorização. Os estados e eventos já escritos ficam.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- Pré-condição
DO $pre$
DECLARE
  v_txt text;
BEGIN
  v_txt := (SELECT string_agg(e.sig, ', ')
            FROM (VALUES
              ('public.fn_neg_decidir_negocio(text,uuid,text,text,uuid,uuid)', 'd9797069dbb62d528db82c82c7cb90a3'),
              ('public.fn_neg_validar_documento()',                           'fd29bd86c165515859231c08d02f5d14')
            ) AS e(sig, h)
            WHERE pg_catalog.to_regprocedure(e.sig) IS NULL
               OR (SELECT md5(replace(p.prosrc, chr(13), '')) FROM pg_catalog.pg_proc p
                   WHERE p.oid = pg_catalog.to_regprocedure(e.sig)) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: as migrations D e E não estão aplicadas como escritas: %; nada feito.', v_txt;
  END IF;

  IF md5(pg_catalog.pg_get_functiondef('public.fn_contract_signed_convert_to_client()'::regprocedure))
       <> '1bdad2e0c91aec1f7be3c6d1bfe1ace7' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: fn_contract_signed_convert_to_client mudou desde 20/10; nada feito.';
  END IF;

  -- Gatilhos anteriores (os que não são trg_negocios_*) iguais aos de 20/10.
  v_txt := (SELECT string_agg(e.tbl, ', ')
            FROM (VALUES
              ('public.proposals',        '0aa2521eee9076b407dd804d5c00f80b'),
              ('public.client_contracts', 'de46dd654e0f939a4302d93c800db00b')
            ) AS e(tbl, h)
            WHERE (SELECT md5(string_agg(t.tgname::text || ':' || md5(pg_catalog.pg_get_triggerdef(t.oid)), ','
                                         ORDER BY t.tgname::text))
                   FROM pg_catalog.pg_trigger t
                   WHERE t.tgrelid = e.tbl::regclass AND NOT t.tgisinternal
                     AND t.tgname::text NOT LIKE 'trg\_negocios\_%') IS DISTINCT FROM e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: os gatilhos mudaram desde 20/10 em: %; nada feito.', v_txt;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
             WHERE t.tgname::text IN ('trg_negocios_fecho_proposta', 'trg_negocios_fecho_contrato'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                WHERE p.pronamespace = 'public'::regnamespace
                  AND p.proname IN ('fn_neg_fecho_proposta_trg', 'fn_neg_fecho_contrato_trg')) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: os gatilhos ou funções de decisão já existem; nada feito.';
  END IF;
END
$pre$;

-- Bloqueio curto das duas tabelas: NOWAIT, até 10 tentativas.
DO $bloqueio$
DECLARE
  v_i int;
BEGIN
  FOR v_i IN 1..10 LOOP
    BEGIN
      LOCK TABLE public.proposals, public.client_contracts IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      RETURN;
    EXCEPTION WHEN lock_not_available THEN
      PERFORM pg_sleep(0.5);
    END;
  END LOOP;
  RAISE EXCEPTION 'BLOQUEIO: as tabelas partilhadas estão ocupadas (10 tentativas); nada feito. Tentar fora da hora de ponta.';
END
$bloqueio$;

CREATE FUNCTION public.fn_neg_fecho_proposta_trg()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  SET lock_timeout = '2s'
AS $function$
BEGIN
  BEGIN
    PERFORM public.fn_neg_decidir_negocio('proposta', NEW.id, OLD.status, NEW.status,
                                          OLD.negocio_id, NEW.negocio_id);
  EXCEPTION WHEN OTHERS THEN
    -- Nunca faz falhar o COMMIT do documento: regista e segue.
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message, execution_data
      ) VALUES (
        'proposal', NEW.id, 'negocio', NEW.negocio_id,
        'trigger:negocio_fecho', 'error', SQLERRM,
        jsonb_build_object('sqlstate', SQLSTATE, 'status_antes', OLD.status,
                           'status_depois', NEW.status, 'negocio_antes', OLD.negocio_id)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;
  RETURN NULL;
END;
$function$;

CREATE FUNCTION public.fn_neg_fecho_contrato_trg()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  SET lock_timeout = '2s'
AS $function$
BEGIN
  BEGIN
    PERFORM public.fn_neg_decidir_negocio('contrato', NEW.id, OLD.status, NEW.status,
                                          OLD.negocio_id, NEW.negocio_id);
  EXCEPTION WHEN OTHERS THEN
    -- Nunca faz falhar o COMMIT do documento: regista e segue.
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message, execution_data
      ) VALUES (
        'contract', NEW.id, 'negocio', NEW.negocio_id,
        'trigger:negocio_fecho', 'error', SQLERRM,
        jsonb_build_object('sqlstate', SQLSTATE, 'status_antes', OLD.status,
                           'status_depois', NEW.status, 'negocio_antes', OLD.negocio_id)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_fecho_proposta_trg() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_fecho_contrato_trg() FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER trg_negocios_fecho_proposta
  AFTER UPDATE OF status, negocio_id ON public.proposals
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.negocio_id IS NOT NULL
        AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.negocio_id IS DISTINCT FROM NEW.negocio_id))
  EXECUTE FUNCTION public.fn_neg_fecho_proposta_trg();

CREATE CONSTRAINT TRIGGER trg_negocios_fecho_contrato
  AFTER UPDATE OF status, negocio_id ON public.client_contracts
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.negocio_id IS NOT NULL
        AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.negocio_id IS DISTINCT FROM NEW.negocio_id))
  EXECUTE FUNCTION public.fn_neg_fecho_contrato_trg();

COMMENT ON FUNCTION public.fn_neg_fecho_proposta_trg() IS
  'Pessoas, Fase N: gatilho adiado de proposals; chama fn_neg_decidir_negocio. Um erro vai para workflow_execution_log (trigger:negocio_fecho) e nunca faz falhar o COMMIT. 20261226160000.';
COMMENT ON FUNCTION public.fn_neg_fecho_contrato_trg() IS
  'Pessoas, Fase N: gatilho adiado de client_contracts; chama fn_neg_decidir_negocio. Um erro vai para workflow_execution_log (trigger:negocio_fecho) e nunca faz falhar o COMMIT. 20261226160000.';

-- CONFERIR
DO $conferir$
DECLARE
  v_n   int;
  v_txt text;
BEGIN
  -- 1. Os dois gatilhos: de restrição, adiados, activos, só UPDATE, com WHEN.
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
  WHERE NOT t.tgisinternal
    AND t.tgconstraint <> 0
    AND t.tgdeferrable AND t.tginitdeferred
    AND t.tgenabled::text = 'O'
    AND t.tgqual IS NOT NULL
    AND ((t.tgrelid = 'public.proposals'::regclass AND t.tgname::text = 'trg_negocios_fecho_proposta'
          AND p.proname::text = 'fn_neg_fecho_proposta_trg')
      OR (t.tgrelid = 'public.client_contracts'::regclass AND t.tgname::text = 'trg_negocios_fecho_contrato'
          AND p.proname::text = 'fn_neg_fecho_contrato_trg'));
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'CONFERIR: % de 2 gatilhos de decisão adiados e correctos', v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
             WHERE t.tgname::text IN ('trg_negocios_fecho_proposta', 'trg_negocios_fecho_contrato')
               AND pg_catalog.pg_get_triggerdef(t.oid) NOT LIKE '%AFTER UPDATE OF status, negocio_id ON%') THEN
    RAISE EXCEPTION 'CONFERIR: os gatilhos de decisão não são AFTER UPDATE OF status, negocio_id';
  END IF;

  -- 2. Funções: DEFINER, search_path fixo, lock_timeout de 2 s, dono postgres,
  --    sem EXECUTE para ninguém.
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('fn_neg_fecho_proposta_trg', 'fn_neg_fecho_contrato_trg')
    AND p.prosecdef
    AND p.proconfig = ARRAY['search_path=public, pg_temp', 'lock_timeout=2s']::text[]
    AND pg_catalog.pg_get_userbyid(p.proowner)::text = 'postgres'
    AND NOT pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'CONFERIR: % de 2 funções de gatilho com a forma esperada', v_n;
  END IF;

  -- 3. Os gatilhos anteriores ficaram intactos.
  v_txt := (SELECT string_agg(e.tbl, ', ')
            FROM (VALUES
              ('public.proposals',        '0aa2521eee9076b407dd804d5c00f80b'),
              ('public.client_contracts', 'de46dd654e0f939a4302d93c800db00b')
            ) AS e(tbl, h)
            WHERE (SELECT md5(string_agg(t.tgname::text || ':' || md5(pg_catalog.pg_get_triggerdef(t.oid)), ','
                                         ORDER BY t.tgname::text))
                   FROM pg_catalog.pg_trigger t
                   WHERE t.tgrelid = e.tbl::regclass AND NOT t.tgisinternal
                     AND t.tgname::text NOT LIKE 'trg\_negocios\_%') IS DISTINCT FROM e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: os gatilhos anteriores mudaram em: %', v_txt;
  END IF;

  -- 4. Fora da nike não há documentos com negócio nem configuração: o WHEN é
  --    falso para todos os UPDATE da Mudelar.
  SELECT (SELECT count(*) FROM public.proposals p WHERE p.negocio_id IS NOT NULL
            AND p.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33'::uuid)
       + (SELECT count(*) FROM public.client_contracts c WHERE c.negocio_id IS NOT NULL
            AND c.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33'::uuid)
       + (SELECT count(*) FROM public.negocio_workflow_config c
            WHERE c.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33'::uuid)
    INTO v_n;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % documento(s) ou configuração(ões) fora da nike', v_n;
  END IF;
END
$conferir$;

COMMIT;
