-- ============================================================================
-- Uma marca de RELATÓRIO deixa de disparar uma escrita de DADOS
--
-- Base: definição VIVA de public.fn_mark_lead_pipeline_dirty obtida por
-- pg_get_functiondef em 22/09/2026 — NÃO o ficheiro
-- 20261130150000_pipeline_dirty_auto_lost_reason_and_timeline.sql, que é
-- anterior a correcções posteriores.
--
-- ---------------------------------------------------------------------------
-- O PROBLEMA
-- ---------------------------------------------------------------------------
-- O gatilho que reage a mudanças de sinal (contactos, negócios, orçamentos,
-- propostas, contratos) recalcula a etapa da lead e, quando a etapa nova é de
-- rejeição, marca a lead como perdida: escreve `lost_reason`, insere uma nota
-- "Lead perdida automaticamente pelo motor" na cronologia, e regista auditoria.
--
-- A condição que decide isso é:
--
--     IF v_new_stage.is_rejection OR v_new_stage.counts_as_lost THEN
--
-- `counts_as_lost` NÃO é uma propriedade de comportamento — é uma marca de
-- RELATÓRIO, usada para as métricas do funil saberem o que contar como perdido.
-- Usá-la aqui faz uma marca de contagem disparar escritas de dados visíveis ao
-- cliente.
--
-- Encontrado ao vivo: a etapa 2 "Contacted" da BMGest — o início do funil —
-- tinha `counts_as_lost = true` e `auto_advance = true`. A próxima lead que
-- entrasse em "Contacted" levaria um motivo de perda e uma nota a dizer
-- "Lead perdida automaticamente pelo motor — Estágio: Contacted". O utilizador
-- desligou a marca entretanto, mas a armadilha continua armada para qualquer
-- organização que a ligue — e a UI oferece-a como uma opção de contagem
-- inofensiva, sem avisar que tem este efeito.
--
-- ---------------------------------------------------------------------------
-- FACTOS VERIFICADOS AO VIVO
-- ---------------------------------------------------------------------------
--   F1. NENHUMA etapa, em NENHUMA organização, tem hoje `counts_as_lost = true`
--       e `is_rejection = false`:
--
--         SELECT ... FROM lead_workflow_stages
--          WHERE COALESCE(counts_as_lost,false) AND NOT COALESCE(is_rejection,false)
--         --> 0 linhas
--
--       Logo esta migração é, hoje, um NÃO-EVENTO: nenhuma lead muda de
--       comportamento. O que ela faz é impedir que volte a acontecer.
--
--   F2. O gatilho está em CINCO tabelas, todas a chamar a mesma função:
--         trg_deals_mark_lead_pipeline_dirty              (deals)
--         trg_quotes_mark_lead_pipeline_dirty             (quotes)
--         trg_proposals_mark_lead_pipeline_dirty          (proposals)
--         trg_client_contracts_mark_lead_pipeline_dirty   (client_contracts)
--         trg_entity_interactions_mark_lead_pipeline_dirty(entity_interactions)
--       Corrigir a função corrige as cinco. Nenhum gatilho é recriado aqui.
--
--   F3. `counts_as_lost` continua a ser lido por quem deve: as métricas e os
--       baldes do funil (journey_bucket_for_stage, resolve_stage_bucket,
--       simulate_lead_v2_bucket_changes). Esta migração não lhes toca — a marca
--       continua a fazer o que diz que faz, contar.
--
-- ---------------------------------------------------------------------------
-- DECISÕES
-- ---------------------------------------------------------------------------
--   D1. UMA linha muda, e nada mais:
--
--         -  IF v_new_stage.is_rejection OR v_new_stage.counts_as_lost THEN
--         +  IF v_new_stage.is_rejection THEN
--
--       Todo o resto do corpo é byte a byte o que estava vivo: a guarda
--       pg_trigger_depth(), o ciclo pelas leads da entidade, o
--       compute_lead_stage_v2, a exigência de auto_advance, o ramo ELSE que só
--       actualiza estado e etapa, o CONTINUE, o pipeline_dirty_at = now() final,
--       SECURITY DEFINER e search_path.
--
--   D2. `is_rejection` é o critério certo porque é o que significa "esta é a
--       etapa onde uma lead vai parar quando se perde". Uma etapa pode querer
--       CONTAR como perdida nas métricas sem SER o sítio onde as leads se
--       perdem; hoje o código confundia as duas coisas.
--
--   D3. NÃO se corrige nenhuma lead já afectada. Pela F1 não há nenhuma: a
--       única lead que passou por aqui foi pelo caminho legítimo (etapa
--       "Lost / Rejected" da BMGest, que é mesmo is_rejection).
-- ============================================================================

-- ── GUARDA: a função tem de existir e ser a que esperamos.
DO $guarda$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_mark_lead_pipeline_dirty';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'public.fn_mark_lead_pipeline_dirty() não existe.';
  END IF;

  IF position('v_new_stage.is_rejection OR v_new_stage.counts_as_lost' in v_def) = 0 THEN
    RAISE EXCEPTION
      'A condição esperada não está na função viva — ela mudou desde a análise. '
      'Rever antes de aplicar, para não reverter correcções posteriores.';
  END IF;

  RAISE NOTICE 'GUARDA: função viva confirmada, com a condição a corrigir.';
END;
$guarda$;

-- ── AVISO se alguma organização depende hoje do comportamento antigo (F1).
DO $aviso$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT COALESCE(o.name, '(global)') AS org, s.name, s.label
      FROM public.lead_workflow_stages s
      LEFT JOIN public.anew_organizations o ON o.id = s.organization_id
     WHERE s.is_active
       AND COALESCE(s.counts_as_lost, false)
       AND NOT COALESCE(s.is_rejection, false)
  LOOP
    v_n := v_n + 1;
    RAISE WARNING
      'A etapa "%" (%) de [%] contava como perdida sem ser etapa de rejeição: '
      'deixa de marcar leads como perdidas. Se era isso que se queria, marcar '
      'a etapa como "é rejeição".', r.label, r.name, r.org;
  END LOOP;

  IF v_n = 0 THEN
    RAISE NOTICE 'Nenhuma etapa depende do comportamento antigo — mudança sem efeito nos dados de hoje.';
  END IF;
END;
$aviso$;

-- ── A função, com a única linha alterada (D1).
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
  v_lost_interaction_id uuid;
BEGIN
  -- Guarda anti-recursão defensiva (ver nota (b) em 20261111100000): esta
  -- função escreve em anew_leads e, desde esta migração, também insere em
  -- entity_interactions (ver nota acima) — o que agora ativa esta guarda na
  -- prática para essa reentrada, além de continuar como salvaguarda para
  -- qualquer outra cadeia de triggers futura.
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_entity_id := COALESCE(NEW.entity_id, OLD.entity_id);
  IF v_entity_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOR v_lead IN
    SELECT id, status, workflow_stage_id, lost_reason, organization_id, root_organization_id
    FROM public.anew_leads
    WHERE entity_id = v_entity_id AND deleted_at IS NULL
  LOOP
    v_new_stage_id := public.compute_lead_stage_v2(v_lead.id);

    IF v_new_stage_id IS NOT NULL AND v_new_stage_id IS DISTINCT FROM v_lead.workflow_stage_id THEN
      SELECT * INTO v_new_stage FROM public.lead_workflow_stages WHERE id = v_new_stage_id;

      IF v_new_stage.auto_advance THEN
        -- 20261204120000: era `is_rejection OR counts_as_lost`. `counts_as_lost`
        -- é uma marca de RELATÓRIO — dizia às métricas o que contar como
        -- perdido — e não devia disparar escritas de dados. Com ela aqui, uma
        -- etapa como "Contacted" marcada para contagem punha motivo de perda e
        -- uma nota "Lead perdida automaticamente" em leads que ninguém perdeu.
        IF v_new_stage.is_rejection THEN
          UPDATE public.anew_leads
          SET status = COALESCE(v_new_stage.default_status, v_new_stage.name),
              workflow_stage_id = v_new_stage.id,
              pipeline_dirty_at = NULL,
              lost_reason = COALESCE(v_lead.lost_reason, 'Motivo automático — regra do motor: ' || v_new_stage.label)
          WHERE id = v_lead.id;

          INSERT INTO public.entity_interactions
            (entity_id, organization_id, root_organization_id, interaction_type,
             notes, created_by, interaction_at)
          VALUES
            (v_entity_id, v_lead.organization_id, v_lead.root_organization_id, 'note',
             'Lead perdida automaticamente pelo motor — Estágio: ' || v_new_stage.label, NULL, now())
          RETURNING id INTO v_lost_interaction_id;

          PERFORM public.fn_manual_audit_log(
            'entity_interactions',
            v_entity_id,
            v_lead.organization_id,
            'INSERT',
            jsonb_build_object('entity_interactions', jsonb_build_object(
              'id',               jsonb_build_object('old', NULL, 'new', to_jsonb(v_lost_interaction_id)),
              'interaction_type', jsonb_build_object('old', NULL, 'new', to_jsonb('note'::text)),
              'notes',            jsonb_build_object('old', NULL, 'new', to_jsonb('Lead perdida automaticamente pelo motor — Estágio: ' || v_new_stage.label))
            )),
            'web_app'
          );
        ELSE
          UPDATE public.anew_leads
          SET status = COALESCE(v_new_stage.default_status, v_new_stage.name),
              workflow_stage_id = v_new_stage.id,
              pipeline_dirty_at = NULL
          WHERE id = v_lead.id;
        END IF;
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

COMMENT ON FUNCTION public.fn_mark_lead_pipeline_dirty() IS
  'Recalcula a etapa das leads de uma entidade quando um sinal muda (contactos, '
  'negócios, orçamentos, propostas, contratos) e, se a etapa nova for de '
  'rejeição e tiver auto_advance, marca a lead como perdida com motivo e nota '
  'na cronologia. Desde 20261204120000 só `is_rejection` dispara isso: '
  '`counts_as_lost` é uma marca de relatório e não deve escrever dados.';

-- ── AUTO-TESTE: a condição ficou como queríamos.
DO $autoteste$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_mark_lead_pipeline_dirty';

  IF position('v_new_stage.counts_as_lost' in v_def) > 0 THEN
    RAISE EXCEPTION 'AUTO-TESTE 1 falhou: counts_as_lost ainda decide a marcação de perdida.';
  END IF;

  IF position('IF v_new_stage.is_rejection THEN' in v_def) = 0 THEN
    RAISE EXCEPTION 'AUTO-TESTE 2 falhou: a condição por is_rejection não está presente.';
  END IF;

  -- O ramo ELSE (avanço normal, sem marcar perdida) tem de continuar lá.
  IF position('pipeline_dirty_at = NULL' in v_def) = 0
     OR position('pipeline_dirty_at = now()' in v_def) = 0 THEN
    RAISE EXCEPTION 'AUTO-TESTE 3 falhou: o corpo perdeu ramos que tinha.';
  END IF;

  -- A guarda anti-recursão é o que impede a nota de se replicar sem fim.
  IF position('pg_trigger_depth() > 1' in v_def) = 0 THEN
    RAISE EXCEPTION 'AUTO-TESTE 4 falhou: a guarda anti-recursão desapareceu.';
  END IF;

  RAISE NOTICE 'AUTO-TESTE: 4 verificações OK.';
  RAISE NOTICE 'NENHUMA LEAD FOI ALTERADA. Os 5 gatilhos que usam esta função não '
               'foram recriados — continuam a apontar para ela.';
END;
$autoteste$;

-- ============================================================
-- Reversão (NÃO executada aqui)
-- ============================================================
-- Repor a condição anterior, mantendo tudo o resto:
--
--   CREATE OR REPLACE FUNCTION public.fn_mark_lead_pipeline_dirty() ...
--   (o mesmo corpo acima, com a linha
--        IF v_new_stage.is_rejection THEN
--    de volta a
--        IF v_new_stage.is_rejection OR v_new_stage.counts_as_lost THEN )
--
-- ============================================================
-- Verificação sugerida DEPOIS de aplicar (não executada)
-- ============================================================
-- 1. Marcar uma etapa intermédia como "conta como perdida", registar um
--    contacto que leve uma lead até lá, e confirmar que ela NÃO ganha
--    lost_reason nem nota "Lead perdida automaticamente".
-- 2. Confirmar que a etapa de rejeição continua a marcar: registar um
--    resultado negativo numa organização cuja etapa de rejeição tenha regra, e
--    ver o motivo e a nota aparecerem.
