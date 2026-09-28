-- ============================================================================
-- Funil de Leads — as regras de etapa gravadas como STRINGS nuas não valem nada
--
-- Depende de:
--   20261203110000_lead_pipeline_settings_and_rule_hardening.sql  (stage_reached
--       endurecida: passou a descartar elementos que não são objectos)
--   20261110550000_rpc_save_lead_workflow_stages_add_rules.sql    (a RPC começou
--       a gravar reached_when — sem qualquer validação)
--
-- ---------------------------------------------------------------------------
-- O PROBLEMA, COMO SE MANIFESTA EM PRODUÇÃO
-- ---------------------------------------------------------------------------
-- `lead_workflow_stages.reached_when` é jsonb livre no formato {all:[...],
-- any:[...]}. O motor public.stage_reached só sabe avaliar elementos que sejam
-- OBJECTOS {"type": "...", "value": ...}: descarta em silêncio tudo o resto e,
-- se não sobrar nada em nenhuma das listas, cai no fallback que resolve a etapa
-- apenas pelo `status` literal da lead.
--
-- Na Mudelar (6293 das 7027 leads da base) as regras estão gravadas como
-- STRINGS nuas. A etapa "Contacted" é, literalmente:
--
--     {"all": ["has_contact_logged", "has_source"]}
--
-- Medido ao vivo, sem inventar nada:
--
--     SELECT public.stage_reached(
--              '{}'::jsonb,                                      -- lead sem NADA
--              '{"all": ["has_contact_logged", "has_source"]}'::jsonb,
--              'contacted', ARRAY['contacted']);                 --> TRUE
--
-- Uma lead sem contacto registado e sem origem é dada como tendo atingido a
-- etapa. A regra que o utilizador desenhou no editor não vale absolutamente
-- nada. Com a MESMA regra em objectos o resultado é FALSE — que é o correcto.
--
-- Nem o motor nem a RPC de gravação impedem isto: rpc_save_lead_workflow_stages
-- faz `reached_when = v_elem->'reached_when'` em cru, no INSERT e no UPDATE.
-- Entra o que vier.
--
-- ---------------------------------------------------------------------------
-- FACTOS VERIFICADOS AO VIVO ANTES DE ESCREVER ESTE FICHEIRO (tudo leitura:
-- pg_get_functiondef / pg_trigger / pg_proc.proacl / SELECTs de contagem)
-- ---------------------------------------------------------------------------
--
--   F1. CATÁLOGO DE `type` VÁLIDOS — extraído da definição VIVA de
--       public.evaluate_condition (não de nenhum ficheiro de migração), com
--
--         regexp_matches(pg_get_functiondef(oid), E'\n    WHEN ''([a-z_]+)''', 'g')
--
--       A indentação de 4 espaços é o que separa os WHEN do CASE EXTERIOR
--       (`CASE p_condition->>'type'`) dos WHEN do CASE ANINHADO dentro de
--       'qualification_is' (`CASE p_condition->>'value'` → WHEN 'mql' / 'sql',
--       indentados a 6). Uma regexp ingénua sobre "WHEN '...'" traria 'mql' e
--       'sql' como se fossem tipos — não são, são VALORES. São 25 tipos:
--
--         has_assignee                  has_source
--         has_contact_logged            has_scheduled_visit
--         has_active_deal               has_active_quote
--         has_active_proposal           has_signed_contract
--         qualification_is              last_contact_is_negative
--         last_contact_is_positive      last_contact_result_is
--         has_call_answered             has_email_sent
--         has_deal_won                  has_visit_done
--         has_quote_open                has_quote_sent
--         has_quote_accepted            has_proposal_open
--         has_proposal_sent             has_proposal_accepted
--         has_needs_assessment_done     days_since_created_gt
--         days_since_last_contact_gt
--
--       Estes 25 são também, um a um, os do catálogo do editor
--       (src/components/leads/workflow/conditionCatalog.ts, 26 linhas = 24
--       tipos + qualification_is desdobrado em mql/sql).
--
--   F2. INVENTÁRIO EXACTO dos elementos de all/any em toda a tabela (52 linhas
--       com organização + 9 linhas globais). 40 elementos são strings e TODOS
--       pertencem à Mudelar; BMGest, Gromicho e nike só têm objectos:
--
--         string has_assignee ...................... 5      -> tipo válido
--         string has_contact_logged ................ 6      -> tipo válido
--         string has_source ........................ 5      -> tipo válido
--         string has_quote_open .................... 3      -> tipo válido
--         string has_proposal_open ................. 3      -> tipo válido
--         string has_signed_contract ............... 2      -> tipo válido
--         string has_visit_scheduled ............... 5      -> LEGADO (D2)
--         string has_deal_open ..................... 3      -> LEGADO (D3)
--         string has_qualification_mql ............. 4      -> DESCARTADO (D4)
--         string has_qualification_sql ............. 3      -> DESCARTADO (D4)
--         string last_contact_result:bf4bfb1e-... .. 1      -> LEGADO (D5)
--
--   F3. DISTRIBUIÇÃO por etapa da Mudelar (strings + objectos no mesmo array):
--         stage_order 2 contacted ....... all: 2 strings,  0 objectos
--         stage_order 3 visit_scheduled . all: 3 strings,  0 objectos
--         stage_order 4 qualified ....... all: 5 strings,  0 objectos
--         stage_order 5 negotiation ..... all: 9 strings,  6 objectos  (MISTO)
--         stage_order 6 converted ....... all: 10 strings, 7 objectos  (MISTO)
--                                         any: 10 strings, 0 objectos
--         stage_order 7 rejected ........ any: 1 string,   0 objectos
--
--   F4. SINAIS REAIS — public.evaluate_lead_signals_v2 produz exactamente as
--       chaves que evaluate_condition lê. NÃO existe sinal `has_visit_scheduled`
--       nem `has_deal_open`; existem `has_scheduled_visit` e `has_active_deal`.
--       E `has_active_deal` é calculado como
--           deals WHERE deleted_at IS NULL AND closed_at IS NULL
--                   AND lost_reason IS NULL
--       ou seja: literalmente "tem deal em aberto". Os dois nomes legados têm
--       equivalente exacto (ver D2 e D3).
--
--   F5. CRÍTICO — `has_qualification_mql` e `has_qualification_sql` SÃO chaves
--       de sinal, mas saem ambas da MESMA coluna `anew_leads.qualification_type`:
--           'has_qualification_mql', COALESCE(l.qualification_type = 'mql', false)
--           'has_qualification_sql', COALESCE(l.qualification_type = 'sql', false)
--       São mutuamente exclusivas: nunca podem ser verdade ao mesmo tempo. E as
--       etapas 5 e 6 da Mudelar têm as DUAS na mesma lista `all`. Traduzi-las
--       para {"type":"qualification_is","value":"mql"} + {"...":"sql"} tornaria
--       essas duas etapas INALCANÇÁVEIS para sempre. Ver D4.
--
--   F6. FORMAS de reached_when hoje (61 linhas no total):
--         SQL NULL ....................  3  (+9 linhas com organization_id NULL)
--         jsonb 'null' ................ 28
--         '{}' ........................ 10
--         objecto com conteúdo ........ 11  (6 na Mudelar, 5 já canónicos)
--       Para public.stage_reached, NULL, 'null' e '{}' são rigorosamente a mesma
--       coisa: nenhuma condição utilizável → fallback por status.
--
--   F7. O FRONTEND JÁ DESCARTA as strings, mas SEM as traduzir
--       (conditionCatalog.ts → sanitizeConditions/normalizeRule). Consequência:
--       bastava alguém abrir uma etapa da Mudelar no editor e gravar para as
--       regras legadas serem apagadas de vez. Traduzir na base ANTES disso é o
--       que salva a intenção original do utilizador.
--
--   F8. A tabela lead_workflow_stages tem UM ÚNICO trigger não interno —
--       update_lead_workflow_stages_updated_at (BEFORE UPDATE, updated_at).
--       Não há trigger de auditoria: o UPDATE em massa desta migração mexe em
--       updated_at e mais nada.
--
--   F9. rpc_save_lead_workflow_stages tem exactamente 1 overload,
--       (uuid, jsonb), owner postgres, ACL {postgres, authenticated,
--       service_role} = EXECUTE, PUBLIC revogado. Por isso CREATE OR REPLACE
--       SEM DROP, e os GRANT/REVOKE são reafirmados tal como estão.
--
--   F10. Flags do motor: lead_pipeline_settings tem sequential_flow = false na
--        Mudelar e true na BMGest. Nenhuma flag é tocada aqui.
--
-- ---------------------------------------------------------------------------
-- DECISÕES
-- ---------------------------------------------------------------------------
--   D1. A lista de tipos válidos fica HARDCODED dentro de
--       fn_normalize_lead_rule. Não pode ser lida de pg_get_functiondef em
--       runtime: a função tem de ser IMMUTABLE (é chamada dentro de queries e
--       comparada com valores gravados) e ler o catálogo não é imutável. Para
--       não haver lista inventada nem lista a apodrecer, a migração inclui um
--       GUARDA que, no momento em que é aplicada, volta a extrair os WHEN da
--       definição VIVA de evaluate_condition e rebenta se algum tipo hardcoded
--       já não existir lá (gerar-se-iam regras que o avaliador não entende).
--       Tipos novos que apareçam em evaluate_condition e não estejam aqui só
--       dão WARNING — não há como isso corromper dados, apenas strings legadas
--       desses tipos ficariam por converter.
--
--   D2. "has_visit_scheduled" -> {"type": "has_scheduled_visit"}.
--       Nome legado invertido. Confirmado em F2 (aparece 5x, só na Mudelar) e
--       em F4 (o sinal real chama-se has_scheduled_visit e o tipo existe no
--       CASE vivo). É um rename puro, sem mudança de semântica.
--
--   D3. "has_deal_open" -> {"type": "has_active_deal"}.
--       Confirmado em F2 (3x) e F4: has_active_deal É "deal em aberto"
--       (closed_at IS NULL AND lost_reason IS NULL). Rename puro.
--
--   D4. "has_qualification_mql" e "has_qualification_sql" -> DESCARTADAS
--       (7 elementos ao todo). Existe tradução aparente
--       ({"type":"qualification_is","value":"mql"|"sql"}) e mesmo assim NÃO se
--       faz, por causa de F5: as duas strings convivem na mesma lista `all` nas
--       etapas 5 e 6 da Mudelar e a coluna de origem é uma só, logo a regra
--       traduzida exigiria MQL *e* SQL ao mesmo tempo e nenhuma lead voltaria a
--       chegar a "negotiation" ou "converted". Descartar é o único
--       comportamento que não parte nada: mantém-se o statu quo dessa condição
--       (que hoje já não é avaliada) e as restantes condições da etapa passam a
--       valer. Quem quiser exigir qualificação volta a pô-la pelo editor, que
--       oferece "Qualificação = MQL" e "= SQL" em linhas separadas. As 7
--       strings são listadas no relatório da Parte 2, por etapa.
--
--   D5. "last_contact_result:<uuid>" ->
--       {"type":"last_contact_result_is","value":"<uuid>"}. O uuid é validado
--       por regexp; se não for um uuid, descarta-se e reporta-se (hoje o único
--       caso real é bf4bfb1e-909b-4984-a1e8-ea72df7b895b, na etapa "rejected"
--       da Mudelar, e é um uuid válido).
--
--   D6. Elementos que JÁ são objectos passam intactos, byte a byte — mesmo que
--       o `type` seja desconhecido. Esta migração corrige o formato legado, não
--       julga regras que o editor escreveu.
--
--   D7. A forma canónica de saída é sempre {"all": [...], "any": [...]} com as
--       duas chaves presentes (é o que o editor grava) e elementos EXACTAMENTE
--       iguais são deduplicados dentro de cada lista, preservando a ordem da
--       primeira ocorrência. A deduplicação é semanticamente neutra (AND e OR
--       são idempotentes) e é necessária porque as etapas 5 e 6 da Mudelar são
--       mistas: as strings convertidas ficariam duplicadas dos objectos que já
--       lá estão.
--
--   D8. Se depois da conversão as duas listas ficarem vazias, devolve-se NULL —
--       o que o editor e o motor tratam como "sem regra". Isto normaliza
--       também jsonb 'null' e '{}' para NULL (F6): mudança cosmética, sem
--       qualquer efeito no motor, que já os tratava a todos por igual.
--
--   D9. Guarda-se o estado anterior em
--       public.lead_workflow_stages_rules_backup_20261204 antes do UPDATE, com
--       RLS ligada e sem políticas (invisível via PostgREST). Sem isto não há
--       volta atrás. O SQL de reversão está no fim do ficheiro.
--
--  D10. NÃO se recalcula nenhuma lead. Nada de recompute_leads_v2_buckets.
--
-- ---------------------------------------------------------------------------
-- IMPACTO — LER ANTES DE APLICAR
-- ---------------------------------------------------------------------------
-- Esta migração MUDA COMPORTAMENTO a sério. Regras que hoje não fazem nada
-- passam a ser avaliadas: 6 etapas da Mudelar (2 a 7) deixam de ser resolvidas
-- pelo status literal e passam a exigir mesmo os sinais configurados. Leads que
-- hoje aparecem numa etapa podem deixar de lá caber.
--
-- O recálculo NÃO é feito aqui de propósito. A normalização corrige apenas os
-- dados de CONFIGURAÇÃO; correr recompute_leads_v2_buckets (ou equivalente)
-- sobre 6293 leads é uma decisão separada, do utilizador, depois de olhar para
-- as regras normalizadas no editor e confirmar que são as que quer. Até esse
-- recálculo, as leads ficam onde estão.
--
-- Linhas afectadas pelo UPDATE (contadas ao vivo, 44 de 61):
--   Mudelar .... 9  (6 regras reais + 3 '{}'  -> NULL)   <- a única com impacto real
--   BMGest .... 19  (0 regras reais; 12 'null' + 7 '{}' -> NULL, cosmético)
--   nike ...... 10  (0 regras reais; 10 'null'          -> NULL, cosmético)
--   Gromicho ... 6  (0 regras reais;  6 'null'          -> NULL, cosmético)
--   Intactas ... 5  (as regras que já estavam em objectos)
-- ============================================================================

-- ============================================================
-- PARTE 1 — fn_normalize_lead_rule
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_normalize_lead_rule(p_rule jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  -- Catálogo VIVO de evaluate_condition, ver F1/D1. O guarda a seguir a esta
  -- função confirma-o contra pg_get_functiondef no momento da aplicação.
  c_types constant text[] := ARRAY[
    'has_assignee', 'has_source', 'has_contact_logged', 'has_scheduled_visit',
    'has_active_deal', 'has_active_quote', 'has_active_proposal',
    'has_signed_contract', 'qualification_is', 'last_contact_is_negative',
    'last_contact_is_positive', 'last_contact_result_is', 'has_call_answered',
    'has_email_sent', 'has_deal_won', 'has_visit_done', 'has_quote_open',
    'has_quote_sent', 'has_quote_accepted', 'has_proposal_open',
    'has_proposal_sent', 'has_proposal_accepted', 'has_needs_assessment_done',
    'days_since_created_gt', 'days_since_last_contact_gt'
  ];
  -- Renames legados (D2, D3). Posição a posição: de[i] -> para[i].
  c_legacy_from constant text[] := ARRAY['has_visit_scheduled', 'has_deal_open'];
  c_legacy_to   constant text[] := ARRAY['has_scheduled_visit', 'has_active_deal'];
  c_prefix      constant text   := 'last_contact_result:';
  c_uuid_re     constant text   :=
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

  v_key   text;
  v_list  jsonb;
  v_out   jsonb := '{}'::jsonb;
BEGIN
  -- Só um objecto pode ser uma regra. NULL, jsonb 'null', arrays, escalares →
  -- "sem regra" (D8).
  IF p_rule IS NULL OR jsonb_typeof(p_rule) <> 'object' THEN
    RETURN NULL;
  END IF;

  FOREACH v_key IN ARRAY ARRAY['all', 'any']
  LOOP
    SELECT COALESCE(jsonb_agg(d.norm ORDER BY d.ord), '[]'::jsonb)
      INTO v_list
      FROM (
        -- D7: dedup exacto, ordem da primeira ocorrência.
        SELECT c.norm, min(c.ord) AS ord
          FROM (
            SELECT
              e.ord,
              CASE
                -- D6 — objecto entra tal e qual.
                WHEN jsonb_typeof(e.elem) = 'object' THEN e.elem

                -- Números, booleanos, nulls, arrays aninhados: não há nada a
                -- salvar.
                WHEN jsonb_typeof(e.elem) <> 'string' THEN NULL

                -- D5 — "last_contact_result:<uuid>"
                WHEN left(e.elem #>> '{}', char_length(c_prefix)) = c_prefix THEN
                  CASE
                    WHEN substring(e.elem #>> '{}' FROM char_length(c_prefix) + 1)
                         ~ c_uuid_re
                      THEN jsonb_build_object(
                             'type',  'last_contact_result_is',
                             'value', substring(e.elem #>> '{}'
                                                FROM char_length(c_prefix) + 1))
                    ELSE NULL
                  END

                -- D2/D3 aplicados antes da validação, e só depois se exige que
                -- o nome final exista mesmo no CASE de evaluate_condition.
                WHEN COALESCE(
                       c_legacy_to[array_position(c_legacy_from, e.elem #>> '{}')],
                       e.elem #>> '{}') = ANY (c_types)
                  THEN jsonb_build_object(
                         'type',
                         COALESCE(
                           c_legacy_to[array_position(c_legacy_from, e.elem #>> '{}')],
                           e.elem #>> '{}'))

                -- Tudo o resto (inclui has_qualification_mql/sql, D4) cai fora.
                -- Não é silencioso: a Parte 2 desta migração lista-o.
                ELSE NULL
              END AS norm
              FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(p_rule -> v_key) = 'array'
                          THEN p_rule -> v_key
                          ELSE '[]'::jsonb
                     END
                   ) WITH ORDINALITY AS e(elem, ord)
          ) c
         WHERE c.norm IS NOT NULL
         GROUP BY c.norm
      ) d;

    v_out := v_out || jsonb_build_object(v_key, v_list);
  END LOOP;

  -- D8 — nada utilizável → "sem regra".
  IF v_out = '{"all": [], "any": []}'::jsonb THEN
    RETURN NULL;
  END IF;

  RETURN v_out;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_normalize_lead_rule(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_normalize_lead_rule(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_normalize_lead_rule(jsonb) TO service_role;

COMMENT ON FUNCTION public.fn_normalize_lead_rule(jsonb) IS
  'Normaliza lead_workflow_stages.reached_when para a forma canónica '
  '{all:[{type,...}], any:[...]}: objectos passam intactos, strings legadas são '
  'convertidas em {"type": X} quando X é um type reconhecido por '
  'evaluate_condition (com os renames has_visit_scheduled->has_scheduled_visit e '
  'has_deal_open->has_active_deal, e "last_contact_result:<uuid>"-> '
  'last_contact_result_is), e o que não é recuperável é descartado. Devolve NULL '
  'quando não sobra nenhuma condição. Migração 20261204040000.';

-- ── GUARDA (D1): a lista hardcoded acima tem de continuar a ser um
--    subconjunto do CASE VIVO de evaluate_condition. Extrai-se outra vez aqui,
--    no momento da aplicação, a partir de pg_get_functiondef.
DO $guard$
DECLARE
  c_hardcoded constant text[] := ARRAY[
    'has_assignee', 'has_source', 'has_contact_logged', 'has_scheduled_visit',
    'has_active_deal', 'has_active_quote', 'has_active_proposal',
    'has_signed_contract', 'qualification_is', 'last_contact_is_negative',
    'last_contact_is_positive', 'last_contact_result_is', 'has_call_answered',
    'has_email_sent', 'has_deal_won', 'has_visit_done', 'has_quote_open',
    'has_quote_sent', 'has_quote_accepted', 'has_proposal_open',
    'has_proposal_sent', 'has_proposal_accepted', 'has_needs_assessment_done',
    'days_since_created_gt', 'days_since_last_contact_gt'
  ];
  v_live    text[];
  v_missing text[];
  v_extra   text[];
BEGIN
  SELECT array_agg(m[1] ORDER BY m[1])
    INTO v_live
    FROM (
      SELECT regexp_matches(pg_get_functiondef(p.oid),
                            E'\n    WHEN ''([a-z_]+)''', 'g') AS m
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'evaluate_condition'
    ) s;

  IF v_live IS NULL OR array_length(v_live, 1) IS NULL THEN
    RAISE EXCEPTION
      'Não foi possível extrair os type de public.evaluate_condition — '
      'a função mudou de forma e fn_normalize_lead_rule não pode ser confiada.';
  END IF;

  SELECT array_agg(t ORDER BY t) INTO v_missing
    FROM unnest(c_hardcoded) AS t WHERE NOT (t = ANY (v_live));

  SELECT array_agg(t ORDER BY t) INTO v_extra
    FROM unnest(v_live) AS t WHERE NOT (t = ANY (c_hardcoded));

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'fn_normalize_lead_rule geraria condições que evaluate_condition não '
      'reconhece: %. Actualizar a lista antes de aplicar.', v_missing;
  END IF;

  IF v_extra IS NOT NULL THEN
    RAISE WARNING
      'evaluate_condition já tem type que fn_normalize_lead_rule desconhece: %. '
      'Strings legadas desses tipos seriam descartadas.', v_extra;
  END IF;

  RAISE NOTICE 'GUARDA: % type confirmados contra a definição viva de evaluate_condition.',
    array_length(v_live, 1);
END;
$guard$;

-- ── AUTO-TESTE: casos reais desta base, mais os limites. Falha ruidosamente.
--    Comparações com IS DISTINCT FROM de propósito: com `<>`, um NULL indevido
--    devolvido pela função dava NULL na condição e o teste passava calado.
DO $selftest$
BEGIN
  -- Mudelar, etapa 2 "contacted" — o caso que motivou a migração.
  IF public.fn_normalize_lead_rule('{"all": ["has_contact_logged", "has_source"]}'::jsonb)
     IS DISTINCT FROM '{"all": [{"type": "has_contact_logged"}, {"type": "has_source"}], "any": []}'::jsonb THEN
    RAISE EXCEPTION 'AUTO-TESTE 1 falhou: conversão de strings simples.';
  END IF;

  -- E o efeito prático: a regra passa a ser avaliada mesmo.
  IF public.stage_reached(
       '{}'::jsonb,
       public.fn_normalize_lead_rule('{"all": ["has_contact_logged", "has_source"]}'::jsonb),
       'contacted', ARRAY['contacted']) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'AUTO-TESTE 2 falhou: a regra normalizada continua a dar a etapa por atingida.';
  END IF;

  -- D2 / D3 — renames legados.
  IF public.fn_normalize_lead_rule('{"all": ["has_visit_scheduled", "has_deal_open"]}'::jsonb)
     IS DISTINCT FROM '{"all": [{"type": "has_scheduled_visit"}, {"type": "has_active_deal"}], "any": []}'::jsonb THEN
    RAISE EXCEPTION 'AUTO-TESTE 3 falhou: renames legados.';
  END IF;

  -- D5 — resultado de contacto.
  IF public.fn_normalize_lead_rule(
       '{"any": ["last_contact_result:bf4bfb1e-909b-4984-a1e8-ea72df7b895b"]}'::jsonb)
     IS DISTINCT FROM '{"all": [], "any": [{"type": "last_contact_result_is", "value": "bf4bfb1e-909b-4984-a1e8-ea72df7b895b"}]}'::jsonb THEN
    RAISE EXCEPTION 'AUTO-TESTE 4 falhou: last_contact_result:<uuid>.';
  END IF;

  IF public.fn_normalize_lead_rule('{"any": ["last_contact_result:nao-e-uuid"]}'::jsonb) IS NOT NULL THEN
    RAISE EXCEPTION 'AUTO-TESTE 5 falhou: uuid inválido devia ser descartado.';
  END IF;

  -- D4 — qualificação descartada.
  IF public.fn_normalize_lead_rule('{"all": ["has_qualification_mql", "has_qualification_sql"]}'::jsonb)
     IS NOT NULL THEN
    RAISE EXCEPTION 'AUTO-TESTE 6 falhou: strings de qualificação deviam ser descartadas.';
  END IF;

  -- D6 / D7 — objectos intactos e dedup entre string convertida e objecto igual.
  IF public.fn_normalize_lead_rule(
       '{"all": ["has_visit_scheduled", {"type": "has_scheduled_visit"}], "any": []}'::jsonb)
     IS DISTINCT FROM '{"all": [{"type": "has_scheduled_visit"}], "any": []}'::jsonb THEN
    RAISE EXCEPTION 'AUTO-TESTE 7 falhou: dedup de condição repetida.';
  END IF;

  -- Regra já canónica não muda (idempotência).
  IF public.fn_normalize_lead_rule(
       '{"all": [{"type": "has_assignee"}], "any": [{"type": "has_scheduled_visit"}]}'::jsonb)
     IS DISTINCT FROM '{"all": [{"type": "has_assignee"}], "any": [{"type": "has_scheduled_visit"}]}'::jsonb THEN
    RAISE EXCEPTION 'AUTO-TESTE 8 falhou: regra canónica foi alterada.';
  END IF;

  -- D8 — vazios.
  IF public.fn_normalize_lead_rule(NULL) IS NOT NULL
     OR public.fn_normalize_lead_rule('null'::jsonb) IS NOT NULL
     OR public.fn_normalize_lead_rule('{}'::jsonb) IS NOT NULL
     OR public.fn_normalize_lead_rule('{"all": [], "any": []}'::jsonb) IS NOT NULL
     OR public.fn_normalize_lead_rule('{"all": "has_assignee"}'::jsonb) IS NOT NULL
     OR public.fn_normalize_lead_rule('[1,2]'::jsonb) IS NOT NULL THEN
    RAISE EXCEPTION 'AUTO-TESTE 9 falhou: regra vazia/malformada devia dar NULL.';
  END IF;

  RAISE NOTICE 'AUTO-TESTE: 9 casos OK.';
END;
$selftest$;

-- ============================================================
-- PARTE 2 — relatório + cópia de segurança + normalização dos dados
-- ============================================================

-- ── 2.1 Relatório ANTES de tocar em nada. Quem aplica a migração TEM de ver
--    o que foi convertido e, sobretudo, o que foi descartado.
DO $relatorio$
DECLARE
  r              record;
  v_conv_total   integer := 0;
  v_desc_total   integer := 0;
  v_linhas       integer := 0;
BEGIN
  RAISE NOTICE '===========================================================';
  RAISE NOTICE 'NORMALIZAÇÃO DE reached_when — relatório PRÉ-UPDATE';
  RAISE NOTICE '===========================================================';

  FOR r IN
    WITH elementos AS (
      SELECT
        s.id,
        COALESCE(o.name, '(sem organização)') AS org,
        s.stage_order,
        s.name        AS etapa,
        s.is_active,
        b.k           AS lista,
        e.elem
        FROM public.lead_workflow_stages s
        LEFT JOIN public.anew_organizations o ON o.id = s.organization_id
        CROSS JOIN LATERAL (VALUES ('all'), ('any')) AS b(k)
        CROSS JOIN LATERAL jsonb_array_elements(
               CASE WHEN jsonb_typeof(s.reached_when -> b.k) = 'array'
                    THEN s.reached_when -> b.k
                    ELSE '[]'::jsonb
               END) AS e(elem)
       WHERE s.reached_when IS NOT NULL
    ),
    classificado AS (
      -- O teste de "convertível" usa a PRÓPRIA função, elemento a elemento:
      -- nada de lógica duplicada que possa divergir dela.
      SELECT
        elementos.*,
        public.fn_normalize_lead_rule(
          jsonb_build_object('all', jsonb_build_array(elem))) IS NULL AS descartado
        FROM elementos
    )
    SELECT
      org, stage_order, etapa, is_active, lista,
      count(*) FILTER (WHERE jsonb_typeof(elem) = 'object')                     AS objectos,
      count(*) FILTER (WHERE jsonb_typeof(elem) <> 'object')                    AS legado,
      count(*) FILTER (WHERE jsonb_typeof(elem) <> 'object' AND NOT descartado) AS convertidos,
      count(*) FILTER (WHERE descartado)                                        AS descartados,
      COALESCE(string_agg(DISTINCT elem #>> '{}', ', ') FILTER (WHERE descartado), '') AS texto_descartado
      FROM classificado
     GROUP BY org, stage_order, etapa, is_active, lista
    HAVING count(*) FILTER (WHERE jsonb_typeof(elem) <> 'object') > 0
     ORDER BY org, stage_order, etapa, lista
  LOOP
    v_conv_total := v_conv_total + r.convertidos;
    v_desc_total := v_desc_total + r.descartados;

    RAISE NOTICE '[%] etapa %/% (%) lista "%": % legado(s) -> % convertido(s), % descartado(s)%',
      r.org, r.stage_order, r.etapa,
      CASE WHEN r.is_active THEN 'activa' ELSE 'inactiva' END,
      r.lista, r.legado, r.convertidos, r.descartados,
      CASE WHEN r.descartados > 0
           THEN ' :: DESCARTADO -> ' || r.texto_descartado
           ELSE '' END;
  END LOOP;

  RAISE NOTICE '-----------------------------------------------------------';
  RAISE NOTICE 'TOTAL: % elemento(s) legado(s) convertido(s), % descartado(s).',
    v_conv_total, v_desc_total;

  -- Lista agregada do que se perde, com contagem, para não ficar diluído nas
  -- linhas acima.
  FOR r IN
    WITH elementos AS (
      SELECT e.elem
        FROM public.lead_workflow_stages s
        CROSS JOIN LATERAL (VALUES ('all'), ('any')) AS b(k)
        CROSS JOIN LATERAL jsonb_array_elements(
               CASE WHEN jsonb_typeof(s.reached_when -> b.k) = 'array'
                    THEN s.reached_when -> b.k
                    ELSE '[]'::jsonb
               END) AS e(elem)
       WHERE s.reached_when IS NOT NULL
    )
    SELECT elem #>> '{}' AS texto, count(*) AS n
      FROM elementos
     WHERE public.fn_normalize_lead_rule(
             jsonb_build_object('all', jsonb_build_array(elem))) IS NULL
     GROUP BY 1
     ORDER BY 2 DESC, 1
  LOOP
    RAISE NOTICE 'DESCARTADO (% ocorrência(s)): "%"', r.n, r.texto;
  END LOOP;

  SELECT count(*) INTO v_linhas
    FROM public.lead_workflow_stages
   WHERE reached_when IS NOT NULL
     AND reached_when IS DISTINCT FROM public.fn_normalize_lead_rule(reached_when);

  RAISE NOTICE '-----------------------------------------------------------';
  RAISE NOTICE 'Linhas de lead_workflow_stages que vão mudar: %', v_linhas;

  FOR r IN
    SELECT COALESCE(o.name, '(sem organização)') AS org,
           count(*) AS n,
           count(*) FILTER (WHERE jsonb_typeof(s.reached_when) = 'object'
                              AND s.reached_when <> '{}'::jsonb) AS regras_reais
      FROM public.lead_workflow_stages s
      LEFT JOIN public.anew_organizations o ON o.id = s.organization_id
     WHERE s.reached_when IS NOT NULL
       AND s.reached_when IS DISTINCT FROM public.fn_normalize_lead_rule(s.reached_when)
     GROUP BY 1
     ORDER BY 1
  LOOP
    RAISE NOTICE '  % : % linha(s), das quais % com regra com conteúdo.',
      r.org, r.n, r.regras_reais;
  END LOOP;

  RAISE NOTICE '===========================================================';
END;
$relatorio$;

-- ── 2.2 Cópia de segurança do estado anterior (D9).
CREATE TABLE IF NOT EXISTS public.lead_workflow_stages_rules_backup_20261204 (
  stage_id           uuid PRIMARY KEY,
  reached_when_antes jsonb,
  normalizado_em     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_workflow_stages_rules_backup_20261204
  ENABLE ROW LEVEL SECURITY;

-- Sem políticas: nem anon nem authenticated a vêem via PostgREST. É uma tabela
-- de suporte à reversão, não faz parte da API.
REVOKE ALL ON public.lead_workflow_stages_rules_backup_20261204 FROM PUBLIC, anon, authenticated;
GRANT ALL  ON public.lead_workflow_stages_rules_backup_20261204 TO service_role;

COMMENT ON TABLE public.lead_workflow_stages_rules_backup_20261204 IS
  'Cópia do reached_when ANTES da normalização feita pela migração '
  '20261204040000 (strings legadas -> objectos {type,...}). Existe só para '
  'permitir voltar atrás; o SQL de reversão está no fim dessa migração. PODE SER '
  'REMOVIDA (DROP TABLE) assim que a correcção estiver validada em produção.';

COMMENT ON COLUMN public.lead_workflow_stages_rules_backup_20261204.reached_when_antes IS
  'Valor literal de lead_workflow_stages.reached_when antes do UPDATE.';

INSERT INTO public.lead_workflow_stages_rules_backup_20261204
  (stage_id, reached_when_antes)
SELECT s.id, s.reached_when
  FROM public.lead_workflow_stages s
 WHERE s.reached_when IS NOT NULL
   AND s.reached_when IS DISTINCT FROM public.fn_normalize_lead_rule(s.reached_when)
ON CONFLICT (stage_id) DO NOTHING;

-- ── 2.3 O UPDATE. Só toca nas linhas que mudam mesmo (evita bater em
--    updated_at de linhas já canónicas, F8).
UPDATE public.lead_workflow_stages
   SET reached_when = public.fn_normalize_lead_rule(reached_when)
 WHERE reached_when IS NOT NULL
   AND reached_when IS DISTINCT FROM public.fn_normalize_lead_rule(reached_when);

-- ── 2.4 Verificação pós-UPDATE: não pode sobrar um único elemento que não seja
--    objecto, e tudo tem de estar guardado no backup.
DO $verifica$
DECLARE
  v_sobras  integer;
  v_backup  integer;
BEGIN
  SELECT count(*) INTO v_sobras
    FROM public.lead_workflow_stages s
    CROSS JOIN LATERAL (VALUES ('all'), ('any')) AS b(k)
    CROSS JOIN LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(s.reached_when -> b.k) = 'array'
                THEN s.reached_when -> b.k
                ELSE '[]'::jsonb
           END) AS e(elem)
   WHERE s.reached_when IS NOT NULL
     AND jsonb_typeof(e.elem) <> 'object';

  IF v_sobras > 0 THEN
    RAISE EXCEPTION 'Restaram % elemento(s) não-objecto em reached_when depois da normalização.', v_sobras;
  END IF;

  SELECT count(*) INTO v_backup
    FROM public.lead_workflow_stages_rules_backup_20261204;

  RAISE NOTICE 'PÓS-UPDATE: 0 elementos legados restantes; % linha(s) guardadas em '
               'lead_workflow_stages_rules_backup_20261204.', v_backup;
  RAISE NOTICE 'NENHUMA lead foi recalculada (decisão D10). As leads ficam onde estão '
               'até alguém correr o recálculo de propósito.';
END;
$verifica$;

-- ============================================================
-- PARTE 3 — a RPC de gravação passa a validar
-- ============================================================
-- Base: definição VIVA obtida por pg_get_functiondef (F9), NÃO o ficheiro
-- 20261110550000. Mudam DOIS pontos, ambos o mesmo defeito:
--
--   INSERT:  v_elem->'reached_when'
--         -> public.fn_normalize_lead_rule(v_elem->'reached_when')
--   UPDATE:  reached_when = v_elem->'reached_when'
--         -> reached_when = public.fn_normalize_lead_rule(v_elem->'reached_when')
--
-- Tudo o resto é byte a byte o que lá estava: app.audit_bypass, a exigência de
-- current_business_user_id(), o scoping por get_user_visible_org_ids, a
-- validação de p_stages como array, matching_statuses a cair para ARRAY[name],
-- qualification_hint limitado a mql/sql/none, id NULL -> INSERT, a ordem do
-- array a definir stage_order, o soft-delete das etapas ausentes, o diff de
-- auditoria campo a campo, o RETURN QUERY final, SECURITY DEFINER, search_path
-- e ACL.
--
-- Efeito: o que vier bem entra igual; o que vier em formato legado é
-- normalizado em vez de ficar lixo; o que for irrecuperável não entra. Payload
-- sem a chave, ou com null, continua a dar "sem regra" — agora sempre como SQL
-- NULL e nunca como jsonb 'null'.

CREATE OR REPLACE FUNCTION public.rpc_save_lead_workflow_stages(p_organization_id uuid, p_stages jsonb)
 RETURNS SETOF lead_workflow_stages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor        uuid;
  v_elem         jsonb;
  v_order        integer := 0;
  v_id           uuid;
  v_before       public.lead_workflow_stages;
  v_after        public.lead_workflow_stages;
  v_seen_ids     uuid[] := ARRAY[]::uuid[];
  v_row_diff     jsonb;
  v_stage_diffs  jsonb := '{}'::jsonb;
  v_any_change   boolean := false;
  v_matching     text[];
  v_qual_hint    text;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_stages IS NULL OR jsonb_typeof(p_stages) <> 'array' THEN
    RAISE EXCEPTION 'p_stages deve ser um array JSON' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- ── Walk the payload in order; order in the array == new stage_order ─────
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_stages)
  LOOP
    v_order := v_order + 1;
    v_id := NULLIF(v_elem->>'id', '')::uuid;

    IF jsonb_typeof(v_elem->'matching_statuses') = 'array' THEN
      v_matching := ARRAY(SELECT jsonb_array_elements_text(v_elem->'matching_statuses'));
    ELSE
      v_matching := ARRAY[v_elem->>'name'];
    END IF;

    v_qual_hint := v_elem->>'qualification_hint';
    IF v_qual_hint NOT IN ('mql', 'sql') THEN
      v_qual_hint := 'none';
    END IF;

    IF v_id IS NULL THEN
      -- ── CREATE ──────────────────────────────────────────────────────────
      INSERT INTO public.lead_workflow_stages
        (organization_id, name, label, color, stage_order,
         is_final, is_conversion, is_rejection, default_status, created_by,
         matching_statuses, reached_when, auto_advance, qualification_hint,
         counts_as_qualified, counts_as_negotiation, counts_as_converted, counts_as_lost)
      VALUES
        (p_organization_id,
         v_elem->>'name',
         v_elem->>'label',
         COALESCE(v_elem->>'color', '#6366f1'),
         v_order,
         COALESCE((v_elem->>'is_final')::boolean, false),
         COALESCE((v_elem->>'is_conversion')::boolean, false),
         COALESCE((v_elem->>'is_rejection')::boolean, false),
         NULLIF(v_elem->>'default_status', ''),
         v_actor,
         v_matching,
         public.fn_normalize_lead_rule(v_elem->'reached_when'),
         COALESCE((v_elem->>'auto_advance')::boolean, false),
         v_qual_hint,
         COALESCE((v_elem->>'counts_as_qualified')::boolean, false),
         COALESCE((v_elem->>'counts_as_negotiation')::boolean, false),
         COALESCE((v_elem->>'counts_as_converted')::boolean, false),
         COALESCE((v_elem->>'counts_as_lost')::boolean, false))
      RETURNING * INTO v_after;

      v_stage_diffs := v_stage_diffs || jsonb_build_object(
        v_after.id::text, jsonb_build_object(
          'operation',       'created',
          'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.name)),
          'label',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.label)),
          'color',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.color)),
          'stage_order',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.stage_order)),
          'is_final',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.is_final)),
          'is_conversion',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.is_conversion)),
          'is_rejection',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.is_rejection)),
          'default_status',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.default_status)),
          'matching_statuses', jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.matching_statuses)),
          'reached_when',    jsonb_build_object('old', NULL, 'new', v_after.reached_when),
          'auto_advance',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.auto_advance)),
          'qualification_hint', jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.qualification_hint)),
          'counts_as_qualified', jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.counts_as_qualified)),
          'counts_as_negotiation', jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.counts_as_negotiation)),
          'counts_as_converted', jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.counts_as_converted)),
          'counts_as_lost', jsonb_build_object('old', NULL, 'new', to_jsonb(v_after.counts_as_lost))
        )
      );
      v_any_change := true;
      v_seen_ids := array_append(v_seen_ids, v_after.id);

    ELSE
      -- ── UPDATE (only if it belongs to this org and something changed) ───
      SELECT * INTO v_before
      FROM public.lead_workflow_stages
      WHERE id = v_id AND organization_id = p_organization_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Estágio % não encontrado nesta organização', v_id
          USING ERRCODE = 'no_data_found';
      END IF;

      v_seen_ids := array_append(v_seen_ids, v_id);

      UPDATE public.lead_workflow_stages SET
        label           = COALESCE(v_elem->>'label', label),
        color           = COALESCE(v_elem->>'color', color),
        stage_order     = v_order,
        is_final        = COALESCE((v_elem->>'is_final')::boolean, is_final),
        is_conversion   = COALESCE((v_elem->>'is_conversion')::boolean, is_conversion),
        is_rejection    = COALESCE((v_elem->>'is_rejection')::boolean, is_rejection),
        default_status  = NULLIF(v_elem->>'default_status', ''),
        matching_statuses = v_matching,
        reached_when    = public.fn_normalize_lead_rule(v_elem->'reached_when'),
        auto_advance    = COALESCE((v_elem->>'auto_advance')::boolean, false),
        qualification_hint = v_qual_hint,
        counts_as_qualified = COALESCE((v_elem->>'counts_as_qualified')::boolean, false),
        counts_as_negotiation = COALESCE((v_elem->>'counts_as_negotiation')::boolean, false),
        counts_as_converted = COALESCE((v_elem->>'counts_as_converted')::boolean, false),
        counts_as_lost = COALESCE((v_elem->>'counts_as_lost')::boolean, false),
        updated_at      = now()
      WHERE id = v_id
      RETURNING * INTO v_after;

      v_row_diff := '{}'::jsonb;
      IF v_before.label IS DISTINCT FROM v_after.label THEN
        v_row_diff := v_row_diff || jsonb_build_object('label',
          jsonb_build_object('old', to_jsonb(v_before.label), 'new', to_jsonb(v_after.label)));
      END IF;
      IF v_before.color IS DISTINCT FROM v_after.color THEN
        v_row_diff := v_row_diff || jsonb_build_object('color',
          jsonb_build_object('old', to_jsonb(v_before.color), 'new', to_jsonb(v_after.color)));
      END IF;
      IF v_before.stage_order IS DISTINCT FROM v_after.stage_order THEN
        v_row_diff := v_row_diff || jsonb_build_object('stage_order',
          jsonb_build_object('old', to_jsonb(v_before.stage_order), 'new', to_jsonb(v_after.stage_order)));
      END IF;
      IF v_before.is_final IS DISTINCT FROM v_after.is_final THEN
        v_row_diff := v_row_diff || jsonb_build_object('is_final',
          jsonb_build_object('old', to_jsonb(v_before.is_final), 'new', to_jsonb(v_after.is_final)));
      END IF;
      IF v_before.is_conversion IS DISTINCT FROM v_after.is_conversion THEN
        v_row_diff := v_row_diff || jsonb_build_object('is_conversion',
          jsonb_build_object('old', to_jsonb(v_before.is_conversion), 'new', to_jsonb(v_after.is_conversion)));
      END IF;
      IF v_before.is_rejection IS DISTINCT FROM v_after.is_rejection THEN
        v_row_diff := v_row_diff || jsonb_build_object('is_rejection',
          jsonb_build_object('old', to_jsonb(v_before.is_rejection), 'new', to_jsonb(v_after.is_rejection)));
      END IF;
      IF v_before.default_status IS DISTINCT FROM v_after.default_status THEN
        v_row_diff := v_row_diff || jsonb_build_object('default_status',
          jsonb_build_object('old', to_jsonb(v_before.default_status), 'new', to_jsonb(v_after.default_status)));
      END IF;
      IF v_before.matching_statuses IS DISTINCT FROM v_after.matching_statuses THEN
        v_row_diff := v_row_diff || jsonb_build_object('matching_statuses',
          jsonb_build_object('old', to_jsonb(v_before.matching_statuses), 'new', to_jsonb(v_after.matching_statuses)));
      END IF;
      IF v_before.reached_when IS DISTINCT FROM v_after.reached_when THEN
        v_row_diff := v_row_diff || jsonb_build_object('reached_when',
          jsonb_build_object('old', v_before.reached_when, 'new', v_after.reached_when));
      END IF;
      IF v_before.auto_advance IS DISTINCT FROM v_after.auto_advance THEN
        v_row_diff := v_row_diff || jsonb_build_object('auto_advance',
          jsonb_build_object('old', to_jsonb(v_before.auto_advance), 'new', to_jsonb(v_after.auto_advance)));
      END IF;
      IF v_before.qualification_hint IS DISTINCT FROM v_after.qualification_hint THEN
        v_row_diff := v_row_diff || jsonb_build_object('qualification_hint',
          jsonb_build_object('old', to_jsonb(v_before.qualification_hint), 'new', to_jsonb(v_after.qualification_hint)));
      END IF;
      IF v_before.counts_as_qualified IS DISTINCT FROM v_after.counts_as_qualified THEN
        v_row_diff := v_row_diff || jsonb_build_object('counts_as_qualified',
          jsonb_build_object('old', to_jsonb(v_before.counts_as_qualified), 'new', to_jsonb(v_after.counts_as_qualified)));
      END IF;
      IF v_before.counts_as_negotiation IS DISTINCT FROM v_after.counts_as_negotiation THEN
        v_row_diff := v_row_diff || jsonb_build_object('counts_as_negotiation',
          jsonb_build_object('old', to_jsonb(v_before.counts_as_negotiation), 'new', to_jsonb(v_after.counts_as_negotiation)));
      END IF;
      IF v_before.counts_as_converted IS DISTINCT FROM v_after.counts_as_converted THEN
        v_row_diff := v_row_diff || jsonb_build_object('counts_as_converted',
          jsonb_build_object('old', to_jsonb(v_before.counts_as_converted), 'new', to_jsonb(v_after.counts_as_converted)));
      END IF;
      IF v_before.counts_as_lost IS DISTINCT FROM v_after.counts_as_lost THEN
        v_row_diff := v_row_diff || jsonb_build_object('counts_as_lost',
          jsonb_build_object('old', to_jsonb(v_before.counts_as_lost), 'new', to_jsonb(v_after.counts_as_lost)));
      END IF;

      IF v_row_diff <> '{}'::jsonb THEN
        v_stage_diffs := v_stage_diffs || jsonb_build_object(
          v_after.id::text, jsonb_build_object('operation', 'updated') || v_row_diff
        );
        v_any_change := true;
      END IF;
    END IF;
  END LOOP;

  -- ── Soft-delete active stages of this org that were dropped from payload ──
  FOR v_before IN
    SELECT * FROM public.lead_workflow_stages
    WHERE organization_id = p_organization_id
      AND is_active = true
      AND NOT (id = ANY (v_seen_ids))
  LOOP
    UPDATE public.lead_workflow_stages
    SET is_active = false, updated_at = now()
    WHERE id = v_before.id;

    v_stage_diffs := v_stage_diffs || jsonb_build_object(
      v_before.id::text, jsonb_build_object(
        'operation', 'deactivated',
        'is_active', jsonb_build_object('old', to_jsonb(true), 'new', to_jsonb(false)),
        'label',     jsonb_build_object('old', to_jsonb(v_before.label), 'new', to_jsonb(v_before.label))
      )
    );
    v_any_change := true;
  END LOOP;

  IF v_any_change THEN
    PERFORM public.fn_manual_audit_log(
      'lead_workflow_stages', p_organization_id, p_organization_id, 'UPDATE',
      jsonb_build_object('lead_workflow_stages', v_stage_diffs), 'web_app'
    );
  END IF;

  RETURN QUERY
  SELECT * FROM public.lead_workflow_stages
  WHERE organization_id = p_organization_id AND is_active = true
  ORDER BY stage_order;
END;
$function$;

-- ACL reafirmada (CREATE OR REPLACE preserva-a; isto é só para o ficheiro ser
-- auto-suficiente numa reconstrução do zero — ver F9).
REVOKE ALL ON FUNCTION public.rpc_save_lead_workflow_stages(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_save_lead_workflow_stages(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_save_lead_workflow_stages(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.rpc_save_lead_workflow_stages(uuid, jsonb) IS
  'Grava o funil de etapas de uma organização (ordem do array = stage_order, '
  'id NULL = criação, etapas ausentes = soft-delete). Desde 20261204040000, '
  'reached_when passa por public.fn_normalize_lead_rule: formato legado é '
  'convertido, o irrecuperável não entra.';

-- ============================================================
-- Reversão (NÃO executada aqui)
-- ============================================================
-- Repor as regras exactamente como estavam antes desta migração:
--
--   UPDATE public.lead_workflow_stages s
--      SET reached_when = b.reached_when_antes
--     FROM public.lead_workflow_stages_rules_backup_20261204 b
--    WHERE b.stage_id = s.id;
--
-- E, para voltar a aceitar lixo na gravação, repor a versão anterior da RPC a
-- partir de pg_get_functiondef guardado ou do ficheiro
-- 20261110550000_rpc_save_lead_workflow_stages_add_rules.sql (atenção: esse
-- ficheiro é anterior a correcções posteriores — preferir sempre a definição
-- viva guardada antes de aplicar).
--
-- Depois de validada a correcção:
--   DROP TABLE public.lead_workflow_stages_rules_backup_20261204;
--
-- ============================================================
-- Verificação sugerida DEPOIS de aplicar (não executada)
-- ============================================================
-- 1. Regras normalizadas da Mudelar:
--      SELECT stage_order, name, reached_when
--        FROM public.lead_workflow_stages
--       WHERE organization_id = '3242e925-da26-459a-8258-be04d904e355'
--         AND is_active = true ORDER BY stage_order;
--
-- 2. O defeito de origem, agora fechado:
--      SELECT public.stage_reached('{}'::jsonb, reached_when, 'contacted',
--                                  matching_statuses)
--        FROM public.lead_workflow_stages
--       WHERE organization_id = '3242e925-da26-459a-8258-be04d904e355'
--         AND name = 'contacted';                          --> false (era true)
--
-- 3. Abrir o editor do funil (Leads → Configuração → Fluxo) na Mudelar e
--    confirmar que as checkboxes das etapas 2 a 7 aparecem MARCADAS — antes
--    apareciam todas vazias, porque o frontend descartava as strings.
--
-- 4. Só depois, e como decisão própria, recalcular as leads.
