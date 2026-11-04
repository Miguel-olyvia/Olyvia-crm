-- ============================================================
-- 20270106030000_documentos_negocio_permissao_direta
-- ============================================================
-- O que faz (Lote A, item 5): as políticas de quotes / proposals / client_contracts deixam escrever diretamente (PostgREST) com
--   quotes.edit / proposals.edit / client_contracts.edit (e .create/.delete). Num documento LIGADO a um negócio isso contornava as
--   permissões finas do negócio (as que neg_guardar_negocio pede). fn_neg_validar_documento só corre quando muda negocio_id.
--   Gatilho novo, INVOKER, BEFORE INSERT/UPDATE/DELETE nas três tabelas: numa escrita DIRETA (current_user = authenticated,
--   chamada pelo próprio pedido: pg_trigger_depth() = 1, e sem app.neg_via_funcao) sobre um documento com negocio_id,
--   exige na organização do documento (fn_cat_pode: papel na organização, Papel no Negócio ou system admin):
--     quotes            : decisão (estado de/para aceite/rejeitado/recusado/perdido, accepted_at, lost_reason) -> negocios.proposta.decidir
--                         passagem a 'enviado'                                                                -> negocios.proposta.enviar
--                         o resto, INSERT e DELETE                                                             -> negocios.orcamento.editar
--     proposals         : decisão (status de/para accepted/rejected, accepted_at, rejected_at, rejection_*, ou etapa
--                         de/para uma etapa is_won/is_lost)                                                    -> negocios.proposta.decidir
--                         o resto (envio, condições/terms, validade), INSERT e DELETE                           -> negocios.proposta.enviar
--     client_contracts  : tudo                                                                                 -> negocios.contrato.editar
--   (as mesmas fronteiras que neg_guardar_negocio usa: orçamento / envio / decisão do cliente / contrato).
--   Não toca: RPCs SECURITY DEFINER (current_user = dono), service_role (portal do cliente, execute-workflow), escritas em
--   cascata de outros gatilhos (pg_trigger_depth() > 1), ligar/desligar por neg_ligar_registo / neg_desligar_registo
--   (app.neg_via_funcao, já validado por fn_neg_validar_documento), documentos sem negócio, e só viewed_at.
--   Ecrãs afetados quando o documento é de um negócio: Propostas/Orçamentos/Contratos (escritas diretas) e o guia do negócio
--   (responderProposta.ts: aceitar/recusar pede agora negocios.proposta.decidir; useEscritasNegocio.guardarCondicoes pede
--   negocios.proposta.enviar).
-- Sem tabelas nem colunas novas.
-- ============================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_neg_documento_exigir_permissao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_novo    jsonb;
  v_velho   jsonb;
  v_neg     uuid;
  v_org     uuid;
  v_codigo  text;
  v_ignorar text[] := ARRAY['updated_at', 'search_text', 'viewed_at'];
  v_decisao_q text[] := ARRAY['aceite', 'rejeitado', 'recusado', 'perdido'];
  v_decisao_p text[] := ARRAY['accepted', 'rejected'];
BEGIN
  -- 20270106030000: só a escrita direta do PostgREST, no próprio pedido.
  IF current_user <> 'authenticated'
     OR pg_trigger_depth() > 1
     OR COALESCE(current_setting('app.neg_via_funcao', true), '') = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_novo  := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_velho := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_neg   := COALESCE(NULLIF(v_velho->>'negocio_id', ''), NULLIF(v_novo->>'negocio_id', ''))::uuid;
  IF v_neg IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'UPDATE' AND (v_novo - v_ignorar) = (v_velho - v_ignorar) THEN
    RETURN NEW;
  END IF;
  v_org := COALESCE(NULLIF(v_velho->>'organization_id', ''), NULLIF(v_novo->>'organization_id', ''))::uuid;

  IF TG_TABLE_NAME = 'client_contracts' THEN
    v_codigo := 'negocios.contrato.editar';

  ELSIF TG_TABLE_NAME = 'quotes' THEN
    IF TG_OP = 'UPDATE'
       AND (((v_novo->>'estado') IS DISTINCT FROM (v_velho->>'estado')
             AND ((v_novo->>'estado') = ANY (v_decisao_q) OR (v_velho->>'estado') = ANY (v_decisao_q)))
            OR (v_novo->'accepted_at') IS DISTINCT FROM (v_velho->'accepted_at')
            OR (v_novo->'lost_reason') IS DISTINCT FROM (v_velho->'lost_reason')) THEN
      v_codigo := 'negocios.proposta.decidir';
    ELSIF TG_OP = 'UPDATE' AND (v_novo->>'estado') = 'enviado' AND (v_velho->>'estado') IS DISTINCT FROM 'enviado'
          AND ((v_novo - v_ignorar) - ARRAY['estado', 'enviado_em']) = ((v_velho - v_ignorar) - ARRAY['estado', 'enviado_em']) THEN
      v_codigo := 'negocios.proposta.enviar';
    ELSE
      v_codigo := 'negocios.orcamento.editar';
    END IF;

  ELSE -- proposals
    IF TG_OP = 'UPDATE'
       AND (((v_novo->>'status') IS DISTINCT FROM (v_velho->>'status')
             AND ((v_novo->>'status') = ANY (v_decisao_p) OR (v_velho->>'status') = ANY (v_decisao_p)))
            OR (v_novo->'accepted_at') IS DISTINCT FROM (v_velho->'accepted_at')
            OR (v_novo->'rejected_at') IS DISTINCT FROM (v_velho->'rejected_at')
            OR (v_novo->'rejection_reason') IS DISTINCT FROM (v_velho->'rejection_reason')
            OR (v_novo->'rejection_reason_id') IS DISTINCT FROM (v_velho->'rejection_reason_id')
            OR (v_novo->'rejection_reason_code') IS DISTINCT FROM (v_velho->'rejection_reason_code')
            OR (v_novo->'rejection_notes') IS DISTINCT FROM (v_velho->'rejection_notes')
            OR ((v_novo->>'stage_id') IS DISTINCT FROM (v_velho->>'stage_id')
                AND EXISTS (SELECT 1 FROM public.proposal_workflow_stages s
                            WHERE s.id IN (NULLIF(v_novo->>'stage_id', '')::uuid, NULLIF(v_velho->>'stage_id', '')::uuid)
                              AND (s.is_won OR s.is_lost)))) THEN
      v_codigo := 'negocios.proposta.decidir';
    ELSE
      v_codigo := 'negocios.proposta.enviar';
    END IF;
  END IF;

  IF NOT public.fn_cat_pode(v_org, v_codigo) THEN
    RAISE EXCEPTION 'Sem permissão (%): este documento é de um negócio e só se altera com essa permissão.', v_codigo
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS trg_negocios_21_doc_permissao ON public.quotes;
CREATE TRIGGER trg_negocios_21_doc_permissao
  BEFORE INSERT OR UPDATE OR DELETE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.fn_neg_documento_exigir_permissao();

DROP TRIGGER IF EXISTS trg_negocios_21_doc_permissao ON public.proposals;
CREATE TRIGGER trg_negocios_21_doc_permissao
  BEFORE INSERT OR UPDATE OR DELETE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.fn_neg_documento_exigir_permissao();

DROP TRIGGER IF EXISTS trg_negocios_21_doc_permissao ON public.client_contracts;
CREATE TRIGGER trg_negocios_21_doc_permissao
  BEFORE INSERT OR UPDATE OR DELETE ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_neg_documento_exigir_permissao();
