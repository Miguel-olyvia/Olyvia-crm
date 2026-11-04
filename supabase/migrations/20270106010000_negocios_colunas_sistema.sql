-- ============================================================
-- 20270106010000_negocios_colunas_sistema
-- ============================================================
-- O que faz (Lote A, item 3): a política negocios_update deixa qualquer utilizador com pessoas.edit (no âmbito) fazer UPDATE direto
--   (PostgREST) ao negócio. O gatilho fn_negocios_guardar_alteracao só protegia estado, fase_perda, motivo_perda, fecho e alerta_codigo.
--   Passam também a ser só do sistema, numa escrita DIRETA (current_user = authenticated/anon):
--     fase, anulado_em/por/motivo/origem, fatura_numero/em/paga, recibo_numero/em, venda_direta, fluxo_emylia.
--   Quem as escreve hoje são RPCs SECURITY DEFINER (neg_guardar_negocio, neg_registar_fatura, neg_validar_pagamento,
--   neg_anular_contrato, fn_neg_emitir_ec_se_pronta): dentro delas current_user é o dono (postgres) e passam.
--   Exceção: neg_criar_negocio é INVOKER (corre como authenticated) e faz INSERT com fase = 0 e depois
--   UPDATE fase = fn_neg_fase_derivada(...). Por isso a fase aceita-se numa escrita direta só se for exatamente a fase derivada
--   (fn_neg_fase_derivada, também INVOKER, com a mesma RLS que neg_criar_negocio vê): não se consegue pôr uma fase falsa.
--   No INSERT direto: fase só NULL/0, e as outras colunas com os valores por omissão (false / NULL).
--   app.neg_via_funcao = 'on' (só o põem funções da base, na própria transação) também passa, como no gatilho existente.
-- NÃO bloqueado: assigned_to. O ecrã Pessoas (src/hooks/pessoas/useEscritasNegocio.ts, editar → colunasDaEdicao) muda o comercial
--   por UPDATE direto e não há RPC para isso; bloquear partia o ecrã. Fica reportado.
-- Gatilho novo, INVOKER (como fn_direct_sales_guard_system_columns): o existente é SECURITY DEFINER e lá current_user é sempre o dono.
-- Sem tabelas nem colunas novas.
-- ============================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_negocios_guardar_colunas_sistema()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_blocked text[] := ARRAY[]::text[];
BEGIN
  -- 20270106010000: só pedidos diretos do PostgREST. Dentro de uma RPC SECURITY DEFINER o current_user é o dono e passa.
  IF current_user NOT IN ('authenticated', 'anon')
     OR COALESCE(current_setting('app.neg_via_funcao', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.fase IS NOT NULL AND NEW.fase <> 0             THEN v_blocked := v_blocked || 'fase'::text; END IF;
    IF NEW.anulado_em IS NOT NULL                         THEN v_blocked := v_blocked || 'anulado_em'::text; END IF;
    IF NEW.anulado_por IS NOT NULL                        THEN v_blocked := v_blocked || 'anulado_por'::text; END IF;
    IF NEW.anulado_motivo IS NOT NULL                     THEN v_blocked := v_blocked || 'anulado_motivo'::text; END IF;
    IF NEW.anulado_origem IS NOT NULL                     THEN v_blocked := v_blocked || 'anulado_origem'::text; END IF;
    IF NEW.fatura_numero IS NOT NULL                      THEN v_blocked := v_blocked || 'fatura_numero'::text; END IF;
    IF NEW.fatura_em IS NOT NULL                          THEN v_blocked := v_blocked || 'fatura_em'::text; END IF;
    IF COALESCE(NEW.fatura_paga, false)                   THEN v_blocked := v_blocked || 'fatura_paga'::text; END IF;
    IF NEW.recibo_numero IS NOT NULL                      THEN v_blocked := v_blocked || 'recibo_numero'::text; END IF;
    IF NEW.recibo_em IS NOT NULL                          THEN v_blocked := v_blocked || 'recibo_em'::text; END IF;
    IF COALESCE(NEW.venda_direta, false)                  THEN v_blocked := v_blocked || 'venda_direta'::text; END IF;
    IF COALESCE(NEW.fluxo_emylia, false)                  THEN v_blocked := v_blocked || 'fluxo_emylia'::text; END IF;
  ELSE
    IF NEW.fase IS DISTINCT FROM OLD.fase
       AND NEW.fase IS DISTINCT FROM public.fn_neg_fase_derivada(NEW.id, NEW.organization_id)
                                                          THEN v_blocked := v_blocked || 'fase'::text; END IF;
    IF NEW.anulado_em IS DISTINCT FROM OLD.anulado_em     THEN v_blocked := v_blocked || 'anulado_em'::text; END IF;
    IF NEW.anulado_por IS DISTINCT FROM OLD.anulado_por   THEN v_blocked := v_blocked || 'anulado_por'::text; END IF;
    IF NEW.anulado_motivo IS DISTINCT FROM OLD.anulado_motivo THEN v_blocked := v_blocked || 'anulado_motivo'::text; END IF;
    IF NEW.anulado_origem IS DISTINCT FROM OLD.anulado_origem THEN v_blocked := v_blocked || 'anulado_origem'::text; END IF;
    IF NEW.fatura_numero IS DISTINCT FROM OLD.fatura_numero THEN v_blocked := v_blocked || 'fatura_numero'::text; END IF;
    IF NEW.fatura_em IS DISTINCT FROM OLD.fatura_em       THEN v_blocked := v_blocked || 'fatura_em'::text; END IF;
    IF NEW.fatura_paga IS DISTINCT FROM OLD.fatura_paga   THEN v_blocked := v_blocked || 'fatura_paga'::text; END IF;
    IF NEW.recibo_numero IS DISTINCT FROM OLD.recibo_numero THEN v_blocked := v_blocked || 'recibo_numero'::text; END IF;
    IF NEW.recibo_em IS DISTINCT FROM OLD.recibo_em       THEN v_blocked := v_blocked || 'recibo_em'::text; END IF;
    IF NEW.venda_direta IS DISTINCT FROM OLD.venda_direta THEN v_blocked := v_blocked || 'venda_direta'::text; END IF;
    IF NEW.fluxo_emylia IS DISTINCT FROM OLD.fluxo_emylia THEN v_blocked := v_blocked || 'fluxo_emylia'::text; END IF;
  END IF;

  IF array_length(v_blocked, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Estes campos do negócio só mudam pelas acções da página Pessoas e do Financeiro: %',
      array_to_string(v_blocked, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;


DROP TRIGGER IF EXISTS trg_00_negocios_guardar_colunas_sistema ON public.negocios;
CREATE TRIGGER trg_00_negocios_guardar_colunas_sistema
  BEFORE INSERT OR UPDATE ON public.negocios
  FOR EACH ROW EXECUTE FUNCTION public.fn_negocios_guardar_colunas_sistema();
