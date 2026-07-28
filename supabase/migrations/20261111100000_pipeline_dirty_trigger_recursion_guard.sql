-- Fase 2 gap review of fn_mark_lead_pipeline_dirty (20261110570000):
--
-- (a) Spec para esta fase dizia "o campo é apenas anotado - a
--     reavaliação/reatribuição em bulk chega na Fase 3, não aqui", o que
--     sugeria remover a escrita imediata de status/workflow_stage_id quando
--     auto_advance = true. Investigado antes de tocar em código: a UI
--     (LeadWorkflowConfig.tsx:1109) rotula o switch como "Auto-avançar
--     quando as condições forem cumpridas" - texto incondicional, sem
--     qualquer referência a "depois de clicar em Guardar & Recalcular".
--     O texto de apoio (:1456) reforça: "Regras avançadas que movem leads
--     automaticamente entre estágios com base em condições." O botão
--     "Guardar & Recalcular" / recompute_leads_v2_buckets é uma ação
--     distinta - aplica retroativamente regras EDITADAS/pendentes a leads
--     já existentes, não a reação em tempo real a um novo deal/quote/
--     proposal/contract/interaction. A migração 20261110570000 já tinha
--     implementado o auto_advance imediato precisamente para cumprir esta
--     promessa da UI, com uma nota de verificação explícita (linhas 566-569)
--     a exigir confirmação "sem qualquer acção manual do utilizador".
--     Reduzir agora a trigger a "apenas anotar pipeline_dirty_at" quebraria
--     essa promessa já em produção. DECISÃO: mantém-se o comportamento
--     actual (escrita imediata de status/workflow_stage_id quando a nova
--     etapa resolvida tem auto_advance = true); só o caminho SEM
--     auto_advance continua a apenas marcar pipeline_dirty_at, que já
--     corresponde ao espírito da Fase 2 para esse caso.
--
-- (b) Guarda anti-recursão: confirmado por grep exaustivo aos triggers de
--     anew_leads (trg_lead_created é AFTER INSERT apenas; trg_audit_anew_leads
--     só escreve na tabela de audit log) que hoje NÃO existe nenhum caminho
--     que faça um UPDATE em anew_leads disparar de volta um INSERT/UPDATE em
--     deals/quotes/proposals/client_contracts/entity_interactions. Ou seja,
--     não há recursão activa a corrigir. Adiciona-se mesmo assim uma guarda
--     defensiva (pg_trigger_depth() > 1) por ser barata e alinhar
--     literalmente com o pedido do espec, documentando aqui que é hardening
--     preventivo e não a correcção de um bug reproduzido.

CREATE OR REPLACE FUNCTION public.fn_mark_lead_pipeline_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid;
  v_lead record;
  v_new_stage_id uuid;
  v_new_stage record;
BEGIN
  -- Guarda anti-recursão defensiva (ver nota (b) acima): esta função só
  -- escreve em anew_leads, e hoje nenhum trigger de anew_leads volta a
  -- disparar um INSERT/UPDATE em deals/quotes/proposals/client_contracts/
  -- entity_interactions, pelo que pg_trigger_depth() nunca deveria exceder 1
  -- nesta função. Mantém-se como salvaguarda caso essa cadeia de triggers
  -- mude no futuro.
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_entity_id := COALESCE(NEW.entity_id, OLD.entity_id);
  IF v_entity_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOR v_lead IN
    SELECT id, status, workflow_stage_id
    FROM public.anew_leads
    WHERE entity_id = v_entity_id AND deleted_at IS NULL
  LOOP
    v_new_stage_id := public.compute_lead_stage_v2(v_lead.id);

    IF v_new_stage_id IS NOT NULL AND v_new_stage_id IS DISTINCT FROM v_lead.workflow_stage_id THEN
      SELECT * INTO v_new_stage FROM public.lead_workflow_stages WHERE id = v_new_stage_id;

      IF v_new_stage.auto_advance THEN
        UPDATE public.anew_leads
        SET status = COALESCE(v_new_stage.default_status, v_new_stage.name),
            workflow_stage_id = v_new_stage.id,
            pipeline_dirty_at = NULL
        WHERE id = v_lead.id;
        CONTINUE;
      END IF;
    END IF;

    UPDATE public.anew_leads
    SET pipeline_dirty_at = now()
    WHERE id = v_lead.id;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Repetir o teste já documentado em 20261110570000 (estágio com
--    auto_advance=true + condição alcançável, ex. has_active_deal): criar/
--    actualizar um deal para uma lead elegível e confirmar que
--    anew_leads.status/workflow_stage_id continuam a mudar automaticamente,
--    sem qualquer acção manual - comportamento preservado, não alterado.
-- 2. Confirmar que leads cujo novo estágio resolvido NÃO tem auto_advance
--    continuam apenas com pipeline_dirty_at actualizado.
-- 3. pg_trigger_depth() > 1 não deve ser atingível em uso normal; não há
--    forma prática de testar a guarda em produção sem forçar uma cadeia de
--    triggers artificial - documentado como hardening, não como fix de bug
--    reproduzido.
