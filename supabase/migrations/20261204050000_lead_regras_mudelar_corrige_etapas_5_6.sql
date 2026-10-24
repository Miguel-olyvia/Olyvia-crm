-- ============================================================================
-- Funil de Leads (Mudelar) — as etapas 5 e 6 ficam logicamente impossíveis
-- depois da normalização, e ligar o fluxo sequencial
--
-- Depende de:
--   20261204040000_lead_rules_normaliza_e_valida.sql   (cria
--       public.fn_normalize_lead_rule e converte as strings nuas de
--       reached_when em objectos {"type": ...}) — TEM de estar aplicada antes,
--       há um GUARDA que rebenta se não estiver.
--   20261203130000_lead_stage_sequential_engine.sql    (adiciona
--       lead_pipeline_settings.sequential_flow, default false, sem ligar
--       nenhuma organização)
--   20261203110000_lead_pipeline_settings_and_rule_hardening.sql (stage_reached
--       endurecida e lead_pipeline_settings)
--
-- ---------------------------------------------------------------------------
-- O PROBLEMA, COMO SE MANIFESTA EM PRODUÇÃO
-- ---------------------------------------------------------------------------
-- Enquanto as regras da Mudelar estavam gravadas como STRINGS nuas, o motor
-- public.stage_reached deitava-as fora e resolvia as etapas pelo `status`
-- literal da lead. Ninguém deu por isso, mas isso também quer dizer que as
-- regras das etapas 5 e 6 NUNCA foram avaliadas — e são impossíveis de cumprir.
--
-- A 040000 corrige o FORMATO (strings -> objectos). Não corrige, nem podia, o
-- CONTEÚDO: era normalização, não reinterpretação da intenção do utilizador.
-- No momento em que a 040000 for aplicada, essas duas etapas passam a ser
-- avaliadas a sério e ficam inalcançáveis:
--
--   * "negotiation" exige, em `all` e todas ao mesmo tempo: responsável, origem,
--     contacto registado, visita agendada, negócio em aberto, orçamento em
--     aberto e proposta em aberto.
--   * "converted" exige tudo o que "negotiation" exige MAIS contrato assinado —
--     também em `all`. Uma lead ganha tem contrato assinado e já NÃO tem
--     orçamento nem proposta em aberto (fecharam ao converter). Logo NENHUMA
--     lead chegaria alguma vez a "converted". O funil da Mudelar ficaria sem
--     conversões.
--
-- ---------------------------------------------------------------------------
-- FACTOS VERIFICADOS AO VIVO ANTES DE ESCREVER ESTE FICHEIRO
-- ---------------------------------------------------------------------------
--
--   F1. A 040000 ainda NÃO está aplicada: a última versão em
--       supabase_migrations.schema_migrations é 20261204030000. Esta migração
--       corre logo a seguir a ela, na mesma leva.
--
--   F2. Organização Mudelar = '3242e925-da26-459a-8258-be04d904e355'.
--
--   F3. Estado VIVO de lead_workflow_stages.reached_when, hoje (strings e
--       objectos misturados no mesmo array — ver F3 da 040000):
--
--       stage_order 5, name 'negotiation':
--         all: ["has_assignee", "has_source", "has_contact_logged",
--               "has_visit_scheduled", "has_deal_open", "has_quote_open",
--               "has_proposal_open", "has_qualification_sql",
--               "has_qualification_mql",
--               {"type":"has_assignee"}, {"type":"has_source"},
--               {"type":"has_contact_logged"}, {"type":"has_scheduled_visit"},
--               {"type":"has_active_quote"}, {"type":"has_active_proposal"}]
--         any: []
--
--       stage_order 6, name 'converted':
--         all: as 9 strings acima + "has_signed_contract", mais os 6 objectos
--              acima + {"type":"has_signed_contract"}
--         any: as mesmas 10 strings outra vez
--
--       Depois da 040000 estas duas ficam em objectos canónicos e deduplicados,
--       mas o `all` continua a exigir tudo em conjunto. É esse o defeito.
--
--   F4. Existem etapas INACTIVAS na Mudelar que colidem por nome e por ordem:
--       'callback_scheduled' em stage_order 3 e 'proposal' em stage_order 6,
--       ambas com is_active = false. Por isso a identificação das etapas alvo
--       é SEMPRE organization_id + is_active = true + name, com o stage_order
--       confirmado a seguir. Ver D6.
--
--   F5. lead_pipeline_settings tem linha para a Mudelar, hoje com
--       sequential_flow = false. A BMGest já tem true.
--
--   F6. Semântica de public.stage_reached(p_signals, p_rule, p_status,
--       p_matching_statuses), lida da definição viva: `all` é AND, `any` é OR,
--       uma lista VAZIA não impõe nada (`NOT v_has_all OR v_all_true`), e só se
--       as DUAS ficarem vazias é que cai no fallback por status literal. Logo
--       {"all": [], "any": [A, B, C]} é exactamente "A ou B ou C" e
--       {"all": [A], "any": []} é exactamente "A".
--
-- ---------------------------------------------------------------------------
-- DECISÕES
-- ---------------------------------------------------------------------------
--   D1. As regras novas são EXACTAMENTE as aprovadas pelo utilizador. Nada é
--       inventado, nada é acrescentado por iniciativa desta migração:
--
--       etapa 5 'negotiation'  ->  {"all": [],
--                                   "any": [{"type": "has_active_deal"},
--                                           {"type": "has_active_quote"},
--                                           {"type": "has_active_proposal"},
--                                           {"type": "has_quote_open"},
--                                           {"type": "has_proposal_open"}]}
--         "Está em negociação quem tem negócio, orçamento OU proposta em
--          aberto." Os cinco estão em `any`, logo basta um.
--
--       etapa 6 'converted'    ->  {"all": [{"type": "has_signed_contract"}],
--                                   "any": []}
--         "Ganhou quem tem contrato assinado." Uma condição e mais nada.
--
--       Tudo o que estava nas regras antigas e não aparece acima é largado de
--       propósito: responsável, origem, contacto registado, visita agendada e
--       qualificação deixam de ser exigidos para negociar ou ganhar. Era esse
--       o excesso que tornava as etapas impossíveis.
--
--   D2. Os valores novos são escritos passados por
--       public.fn_normalize_lead_rule(...) em vez de literais. Assim o que fica
--       gravado é bit a bit o que a RPC rpc_save_lead_workflow_stages gravaria
--       se o utilizador desenhasse a mesma regra no editor (mesma forma
--       canónica, mesma ordem, mesma deduplicação). Não há forma de esta
--       migração e o editor divergirem.
--
--   D3. sequential_flow passa a true SÓ na Mudelar. É o que faz o motor
--       percorrer o fluxo um passo de cada vez em vez de saltar para o
--       stage_order mais alto que bate — sem isto, com "converted" a depender
--       apenas do contrato assinado, uma lead com contrato saltaria directamente
--       para a etapa 6 sem passar pelas do meio e as acções dessas etapas nunca
--       correriam. A BMGest já tem true e NÃO é tocada. Nenhuma outra
--       organização é tocada.
--
--   D4. Cópia de segurança em DUAS tabelas novas, uma por cada coisa alterada:
--         public.lead_workflow_stages_rules_backup_20261204_etapas56
--         public.lead_pipeline_settings_backup_20261204_etapas56
--       Duas tabelas em vez de meter o organization_id dentro de uma coluna
--       chamada stage_id: são entidades diferentes, com chaves diferentes, e
--       uma coluna `stage_id` a guardar o id de uma organização seria uma
--       mentira que só se descobria ao tentar reverter. Ambas com RLS ligada e
--       sem políticas (invisíveis via PostgREST), como a da 040000.
--
--   D5. NÃO se recalcula NENHUMA lead. Nada de recompute_leads_v2_buckets.
--       Esta migração altera apenas CONFIGURAÇÃO. Mudar a regra de "converted"
--       e ligar o fluxo sequencial muda onde 6293 leads da Mudelar caem: esse
--       recálculo é uma decisão separada, do utilizador, depois de olhar para
--       as regras no editor. Até lá as leads ficam onde estão.
--
--   D6. As etapas são identificadas por organization_id + is_active = true +
--       name, nunca por id fixo (um id colado num ficheiro não sobrevive a uma
--       base reconstruída), e o stage_order é CONFIRMADO, não usado para
--       procurar. O filtro is_active = true é obrigatório por causa de F4.
--
--   D7. Idempotência no que é razoável: CREATE TABLE IF NOT EXISTS e
--       ON CONFLICT DO NOTHING nos backups (uma segunda passagem não estraga a
--       fotografia original). Os UPDATE em si correm uma vez — é uma migração.
--
-- ---------------------------------------------------------------------------
-- IMPACTO — LER ANTES DE APLICAR
-- ---------------------------------------------------------------------------
-- Linhas afectadas: 2 em lead_workflow_stages (Mudelar, etapas activas 5 e 6)
-- e 1 em lead_pipeline_settings (Mudelar). Mais nada. Nenhuma outra etapa,
-- nenhuma outra organização, nada em lead_stage_actions.
--
-- Comportamento: "negotiation" e "converted" passam de inalcançáveis a
-- alcançáveis, e a Mudelar passa a avançar o funil passo a passo. Enquanto não
-- houver recálculo (D5), nada disto mexe nas leads já classificadas.
-- ============================================================================


-- ============================================================
-- PARTE 1 — guardas
-- ============================================================

-- ── 1.1 Sem a 040000 aplicada esta migração não faz sentido nenhum: as regras
--    ainda estariam em strings nuas e fn_normalize_lead_rule, que é como os
--    valores novos são escritos (D2), nem sequer existe.
DO $guarda_dependencia$
BEGIN
  IF to_regprocedure('public.fn_normalize_lead_rule(jsonb)') IS NULL THEN
    RAISE EXCEPTION
      'public.fn_normalize_lead_rule(jsonb) não existe — aplicar primeiro a '
      'migração 20261204040000_lead_rules_normaliza_e_valida.sql. Esta migração '
      'corrige o CONTEÚDO das regras e pressupõe o FORMATO já normalizado.';
  END IF;

  IF to_regprocedure('public.stage_reached(jsonb, jsonb, text, text[])') IS NULL THEN
    RAISE EXCEPTION
      'public.stage_reached(jsonb, jsonb, text, text[]) não existe com esta '
      'assinatura — a prova funcional desta migração não pode ser feita.';
  END IF;

  RAISE NOTICE 'GUARDA: fn_normalize_lead_rule e stage_reached presentes.';
END;
$guarda_dependencia$;

-- ── 1.2 As duas etapas alvo têm de existir EXACTAMENTE uma vez cada, activas, e
--    na ordem esperada (D6, F4).
DO $guarda_etapas$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  v_n           integer;
  v_stage_order integer;
BEGIN
  -- etapa 5
  SELECT count(*), min(s.stage_order)
    INTO v_n, v_stage_order
    FROM public.lead_workflow_stages s
   WHERE s.organization_id = c_org
     AND s.is_active = true
     AND s.name = 'negotiation';

  IF v_n <> 1 THEN
    RAISE EXCEPTION
      'Esperava exactamente 1 etapa activa "negotiation" na Mudelar, encontrei %.', v_n;
  END IF;
  IF v_stage_order <> 5 THEN
    RAISE EXCEPTION
      'A etapa activa "negotiation" da Mudelar está em stage_order % e não 5 — '
      'o funil foi reordenado desde a análise; rever antes de aplicar.', v_stage_order;
  END IF;

  -- etapa 6
  SELECT count(*), min(s.stage_order)
    INTO v_n, v_stage_order
    FROM public.lead_workflow_stages s
   WHERE s.organization_id = c_org
     AND s.is_active = true
     AND s.name = 'converted';

  IF v_n <> 1 THEN
    RAISE EXCEPTION
      'Esperava exactamente 1 etapa activa "converted" na Mudelar, encontrei %.', v_n;
  END IF;
  IF v_stage_order <> 6 THEN
    RAISE EXCEPTION
      'A etapa activa "converted" da Mudelar está em stage_order % e não 6 — '
      'o funil foi reordenado desde a análise; rever antes de aplicar.', v_stage_order;
  END IF;

  RAISE NOTICE 'GUARDA: etapas activas 5/negotiation e 6/converted da Mudelar localizadas.';
END;
$guarda_etapas$;

-- ── 1.3 A linha de definições da Mudelar tem de existir — esta migração faz
--    UPDATE, não INSERT (F5).
DO $guarda_settings$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  v_n   integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM public.lead_pipeline_settings
   WHERE organization_id = c_org;

  IF v_n <> 1 THEN
    RAISE EXCEPTION
      'Esperava 1 linha em lead_pipeline_settings para a Mudelar, encontrei %. '
      'Esta migração actualiza a linha existente e não a cria.', v_n;
  END IF;

  RAISE NOTICE 'GUARDA: lead_pipeline_settings da Mudelar presente.';
END;
$guarda_settings$;


-- ============================================================
-- PARTE 2 — relatório PRÉ-UPDATE
-- ============================================================
-- Quem aplica a migração TEM de ver o que está lá antes de ser substituído.

DO $relatorio$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  r     record;
  v_seq boolean;
BEGIN
  RAISE NOTICE '===========================================================';
  RAISE NOTICE 'MUDELAR — etapas 5 e 6: estado ANTES do UPDATE';
  RAISE NOTICE '===========================================================';

  FOR r IN
    SELECT s.stage_order, s.name, s.reached_when,
           jsonb_array_length(
             CASE WHEN jsonb_typeof(s.reached_when -> 'all') = 'array'
                  THEN s.reached_when -> 'all' ELSE '[]'::jsonb END) AS n_all,
           jsonb_array_length(
             CASE WHEN jsonb_typeof(s.reached_when -> 'any') = 'array'
                  THEN s.reached_when -> 'any' ELSE '[]'::jsonb END) AS n_any
      FROM public.lead_workflow_stages s
     WHERE s.organization_id = c_org
       AND s.is_active = true
       AND s.name IN ('negotiation', 'converted')
     ORDER BY s.stage_order
  LOOP
    RAISE NOTICE 'etapa %/% : % condição(ões) em "all", % em "any"',
      r.stage_order, r.name, r.n_all, r.n_any;
    RAISE NOTICE '    reached_when ANTES = %', COALESCE(r.reached_when::text, '(NULL)');
  END LOOP;

  SELECT sequential_flow INTO v_seq
    FROM public.lead_pipeline_settings
   WHERE organization_id = c_org;

  RAISE NOTICE '-----------------------------------------------------------';
  RAISE NOTICE 'sequential_flow ANTES = %', v_seq;
  RAISE NOTICE '===========================================================';
END;
$relatorio$;


-- ============================================================
-- PARTE 3 — cópias de segurança (D4)
-- ============================================================

-- ── 3.1 Regras das etapas.
CREATE TABLE IF NOT EXISTS public.lead_workflow_stages_rules_backup_20261204_etapas56 (
  stage_id           uuid PRIMARY KEY,
  reached_when_antes jsonb,
  alterado_em        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_workflow_stages_rules_backup_20261204_etapas56
  ENABLE ROW LEVEL SECURITY;

-- Sem políticas: nem anon nem authenticated a vêem via PostgREST. É uma tabela
-- de suporte à reversão, não faz parte da API.
REVOKE ALL ON public.lead_workflow_stages_rules_backup_20261204_etapas56 FROM PUBLIC, anon, authenticated;
GRANT ALL  ON public.lead_workflow_stages_rules_backup_20261204_etapas56 TO service_role;

COMMENT ON TABLE public.lead_workflow_stages_rules_backup_20261204_etapas56 IS
  'Cópia do reached_when das etapas activas 5 (negotiation) e 6 (converted) da '
  'Mudelar ANTES da correcção feita pela migração 20261204050000 (as regras '
  'exigiam tudo em conjunto e eram impossíveis de cumprir). Existe só para '
  'permitir voltar atrás; o SQL de reversão está no fim dessa migração. PODE SER '
  'REMOVIDA (DROP TABLE) assim que a correcção estiver validada em produção.';

COMMENT ON COLUMN public.lead_workflow_stages_rules_backup_20261204_etapas56.reached_when_antes IS
  'Valor literal de lead_workflow_stages.reached_when antes do UPDATE.';

INSERT INTO public.lead_workflow_stages_rules_backup_20261204_etapas56
  (stage_id, reached_when_antes)
SELECT s.id, s.reached_when
  FROM public.lead_workflow_stages s
 WHERE s.organization_id = '3242e925-da26-459a-8258-be04d904e355'
   AND s.is_active = true
   AND s.name IN ('negotiation', 'converted')
ON CONFLICT (stage_id) DO NOTHING;

-- ── 3.2 Flag do funil. Tabela separada de propósito (D4): a chave aqui é a
--    organização, não uma etapa.
CREATE TABLE IF NOT EXISTS public.lead_pipeline_settings_backup_20261204_etapas56 (
  organization_id      uuid PRIMARY KEY,
  sequential_flow_antes boolean,
  alterado_em          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_pipeline_settings_backup_20261204_etapas56
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.lead_pipeline_settings_backup_20261204_etapas56 FROM PUBLIC, anon, authenticated;
GRANT ALL  ON public.lead_pipeline_settings_backup_20261204_etapas56 TO service_role;

COMMENT ON TABLE public.lead_pipeline_settings_backup_20261204_etapas56 IS
  'Cópia de lead_pipeline_settings.sequential_flow da Mudelar ANTES de a '
  'migração 20261204050000 o ligar. Tabela separada da cópia das regras porque a '
  'chave é a organização e não uma etapa. Existe só para permitir voltar atrás; '
  'o SQL de reversão está no fim dessa migração. PODE SER REMOVIDA (DROP TABLE) '
  'assim que a correcção estiver validada em produção.';

COMMENT ON COLUMN public.lead_pipeline_settings_backup_20261204_etapas56.sequential_flow_antes IS
  'Valor de lead_pipeline_settings.sequential_flow antes do UPDATE.';

INSERT INTO public.lead_pipeline_settings_backup_20261204_etapas56
  (organization_id, sequential_flow_antes)
SELECT p.organization_id, p.sequential_flow
  FROM public.lead_pipeline_settings p
 WHERE p.organization_id = '3242e925-da26-459a-8258-be04d904e355'
ON CONFLICT (organization_id) DO NOTHING;


-- ============================================================
-- PARTE 4 — as alterações
-- ============================================================

-- ── 4.1 Etapa 5 "negotiation": em negociação quem tem negócio, orçamento OU
--    proposta em aberto (D1). Tudo em `any` — basta uma.
UPDATE public.lead_workflow_stages
   SET reached_when = public.fn_normalize_lead_rule(
         '{"all": [],
           "any": [{"type": "has_active_deal"},
                   {"type": "has_active_quote"},
                   {"type": "has_active_proposal"},
                   {"type": "has_quote_open"},
                   {"type": "has_proposal_open"}]}'::jsonb)
 WHERE organization_id = '3242e925-da26-459a-8258-be04d904e355'
   AND is_active = true
   AND name = 'negotiation'
   AND stage_order = 5;

-- ── 4.2 Etapa 6 "converted": ganhou quem tem contrato assinado (D1).
UPDATE public.lead_workflow_stages
   SET reached_when = public.fn_normalize_lead_rule(
         '{"all": [{"type": "has_signed_contract"}],
           "any": []}'::jsonb)
 WHERE organization_id = '3242e925-da26-459a-8258-be04d904e355'
   AND is_active = true
   AND name = 'converted'
   AND stage_order = 6;

-- ── 4.3 Fluxo sequencial ligado na Mudelar (D3). Só nesta organização.
UPDATE public.lead_pipeline_settings
   SET sequential_flow = true
 WHERE organization_id = '3242e925-da26-459a-8258-be04d904e355';


-- ============================================================
-- PARTE 5 — verificação pós-UPDATE
-- ============================================================
-- Comparações com IS DISTINCT FROM de propósito: com `<>`, um NULL indevido
-- daria NULL na condição e o teste passava calado.

DO $verifica$
DECLARE
  c_org constant uuid := '3242e925-da26-459a-8258-be04d904e355';
  c_esperado_5 constant jsonb :=
    '{"all": [], "any": [{"type": "has_active_deal"}, {"type": "has_active_quote"}, {"type": "has_active_proposal"}, {"type": "has_quote_open"}, {"type": "has_proposal_open"}]}'::jsonb;
  c_esperado_6 constant jsonb :=
    '{"all": [{"type": "has_signed_contract"}], "any": []}'::jsonb;
  v_regra_5 jsonb;
  v_regra_6 jsonb;
  v_match_6 text[];
  v_seq     boolean;
  v_backup_regras   integer;
  v_backup_settings integer;
BEGIN
  SELECT s.reached_when INTO v_regra_5
    FROM public.lead_workflow_stages s
   WHERE s.organization_id = c_org AND s.is_active = true
     AND s.name = 'negotiation' AND s.stage_order = 5;

  SELECT s.reached_when, s.matching_statuses INTO v_regra_6, v_match_6
    FROM public.lead_workflow_stages s
   WHERE s.organization_id = c_org AND s.is_active = true
     AND s.name = 'converted' AND s.stage_order = 6;

  IF v_regra_5 IS DISTINCT FROM c_esperado_5 THEN
    RAISE EXCEPTION 'Etapa 5 "negotiation" não ficou com a regra esperada. Ficou: %',
      COALESCE(v_regra_5::text, '(NULL)');
  END IF;

  IF v_regra_6 IS DISTINCT FROM c_esperado_6 THEN
    RAISE EXCEPTION 'Etapa 6 "converted" não ficou com a regra esperada. Ficou: %',
      COALESCE(v_regra_6::text, '(NULL)');
  END IF;

  SELECT sequential_flow INTO v_seq
    FROM public.lead_pipeline_settings
   WHERE organization_id = c_org;

  IF v_seq IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'sequential_flow da Mudelar não ficou a true (ficou %).', v_seq;
  END IF;

  -- ── Prova funcional. O `status` passado NÃO pode coincidir com
  --    matching_statuses: se coincidisse, e a regra por algum motivo ficasse
  --    vazia, o fallback por status literal devolvia true e mascarava a falha.
  --    Usa-se um status que não existe em lado nenhum.
  --
  --    Etapa 6 — lead sem nada: não ganhou.
  IF public.stage_reached('{}'::jsonb, v_regra_6,
                          '__status_inexistente__', v_match_6) IS DISTINCT FROM false THEN
    RAISE EXCEPTION
      'PROVA 1 falhou: lead vazia é dada como "converted" com a regra nova.';
  END IF;

  --    Etapa 6 — lead com contrato assinado: ganhou.
  IF public.stage_reached('{"has_signed_contract": true}'::jsonb, v_regra_6,
                          '__status_inexistente__', v_match_6) IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'PROVA 2 falhou: lead com contrato assinado NÃO é dada como "converted" — '
      'a etapa continua inalcançável.';
  END IF;

  --    Etapa 5 — lead vazia não está em negociação; basta um negócio em aberto
  --    para estar (o `any` é mesmo um OU).
  IF public.stage_reached('{}'::jsonb, v_regra_5,
                          '__status_inexistente__', ARRAY['negotiation']) IS DISTINCT FROM false THEN
    RAISE EXCEPTION
      'PROVA 3 falhou: lead vazia é dada como "negotiation" com a regra nova.';
  END IF;

  IF public.stage_reached('{"has_active_deal": true}'::jsonb, v_regra_5,
                          '__status_inexistente__', ARRAY['negotiation']) IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'PROVA 4 falhou: lead com negócio em aberto NÃO é dada como "negotiation".';
  END IF;

  SELECT count(*) INTO v_backup_regras
    FROM public.lead_workflow_stages_rules_backup_20261204_etapas56;
  SELECT count(*) INTO v_backup_settings
    FROM public.lead_pipeline_settings_backup_20261204_etapas56;

  RAISE NOTICE '===========================================================';
  RAISE NOTICE 'PÓS-UPDATE: etapa 5 "negotiation" = %', v_regra_5::text;
  RAISE NOTICE 'PÓS-UPDATE: etapa 6 "converted"   = %', v_regra_6::text;
  RAISE NOTICE 'PÓS-UPDATE: sequential_flow da Mudelar = %', v_seq;
  RAISE NOTICE 'PROVAS: 4 casos OK (etapa 6 exige mesmo contrato assinado; '
               'etapa 5 basta um sinal em aberto).';
  RAISE NOTICE 'BACKUP: % etapa(s) em lead_workflow_stages_rules_backup_20261204_etapas56, '
               '% linha(s) em lead_pipeline_settings_backup_20261204_etapas56.',
               v_backup_regras, v_backup_settings;
  RAISE NOTICE '-----------------------------------------------------------';
  RAISE NOTICE 'NENHUMA lead foi recalculada (decisão D5). Nada de '
               'recompute_leads_v2_buckets aqui. As leads ficam onde estão até '
               'alguém correr o recálculo de propósito.';
  RAISE NOTICE '===========================================================';
END;
$verifica$;


-- ============================================================
-- Reversão (NÃO executada aqui)
-- ============================================================
-- 1. Repor as regras das duas etapas exactamente como estavam:
--
--      UPDATE public.lead_workflow_stages s
--         SET reached_when = b.reached_when_antes
--        FROM public.lead_workflow_stages_rules_backup_20261204_etapas56 b
--       WHERE b.stage_id = s.id;
--
--    (Atenção: o valor reposto é o que estava ANTES desta migração, ou seja já
--     normalizado pela 040000 se esta correu antes — que é o caso. Para voltar
--     ao formato legado em strings é preciso ir à reversão da 040000.)
--
-- 2. Repor a flag do funil:
--
--      UPDATE public.lead_pipeline_settings p
--         SET sequential_flow = b.sequential_flow_antes
--        FROM public.lead_pipeline_settings_backup_20261204_etapas56 b
--       WHERE b.organization_id = p.organization_id;
--
-- 3. Depois de validada a correcção, as cópias deixam de ser precisas:
--
--      DROP TABLE public.lead_workflow_stages_rules_backup_20261204_etapas56;
--      DROP TABLE public.lead_pipeline_settings_backup_20261204_etapas56;
--
-- ============================================================
-- Verificação sugerida DEPOIS de aplicar (não executada)
-- ============================================================
-- 1. As regras como ficaram:
--      SELECT stage_order, name, reached_when
--        FROM public.lead_workflow_stages
--       WHERE organization_id = '3242e925-da26-459a-8258-be04d904e355'
--         AND is_active = true ORDER BY stage_order;
--
-- 2. A flag:
--      SELECT organization_id, sequential_flow FROM public.lead_pipeline_settings;
--      -- Mudelar e BMGest a true; mais ninguém.
--
-- 3. Abrir o editor do funil (Leads -> Configuração -> Fluxo) na Mudelar e
--    confirmar que "Negociação" mostra 5 condições em "qualquer uma" e
--    "Convertido" mostra 1 condição em "todas".
--
-- 4. Só depois, e como decisão própria, recalcular as leads.
