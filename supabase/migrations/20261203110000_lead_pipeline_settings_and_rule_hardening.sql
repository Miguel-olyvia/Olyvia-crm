-- ============================================================================
-- Funil de Leads — layout do diagrama por organização + endurecimento do motor
-- de regras contra configuração inválida.
--
-- Duas partes independentes:
--   1. public.lead_pipeline_settings — tabela nova, uma linha por organização,
--      a guardar as posições dos nós do diagrama de workflow e a flag que
--      restringe as transições entre estágios.
--   2. public.stage_reached — passa a ignorar elementos estruturalmente
--      inválidos dentro de reached_when->'all'/'any' em vez de os avaliar
--      (hoje tornam o estágio PERMANENTEMENTE inalcançável).
--
-- Esta migração NÃO corrige dados. Nenhum UPDATE a lead_workflow_stages.
-- A limpeza do reached_when mal serializado é uma fase posterior, separada e
-- ainda não aprovada.
-- ============================================================================


-- ============================================================
-- PARTE 1 — public.lead_pipeline_settings
-- ============================================================
-- Padrão copiado de public.lead_qualification_rules
-- (20261110490000_lead_pipeline_rules_phase1.sql:60-115): PK = organization_id,
-- RLS scoped por get_user_visible_org_ids, trigger de updated_at, trigger de
-- auditoria genérico, grants explícitos.

CREATE TABLE IF NOT EXISTS public.lead_pipeline_settings (
  organization_id uuid NOT NULL PRIMARY KEY REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  stage_positions jsonb NOT NULL DEFAULT '{}'::jsonb,
  enforce_stage_transitions boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES public.anew_users(id),
  updated_by uuid NULL REFERENCES public.anew_users(id)
);

-- stage_positions tem de ser SEMPRE um mapa (objecto). Um array ou um escalar
-- gravado por engano quebraria qualquer leitor que faça jsonb_each. Validação
-- nova — não relaxa nada existente (a tabela é nova e está vazia).
ALTER TABLE public.lead_pipeline_settings
  DROP CONSTRAINT IF EXISTS lead_pipeline_settings_stage_positions_is_object;
ALTER TABLE public.lead_pipeline_settings
  ADD CONSTRAINT lead_pipeline_settings_stage_positions_is_object
  CHECK (jsonb_typeof(stage_positions) = 'object');

DROP TRIGGER IF EXISTS update_lead_pipeline_settings_updated_at ON public.lead_pipeline_settings;
CREATE TRIGGER update_lead_pipeline_settings_updated_at
  BEFORE UPDATE ON public.lead_pipeline_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.lead_pipeline_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_select_lead_pipeline_settings ON public.lead_pipeline_settings;
CREATE POLICY authenticated_select_lead_pipeline_settings
  ON public.lead_pipeline_settings
  FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())));

DROP POLICY IF EXISTS authenticated_insert_lead_pipeline_settings ON public.lead_pipeline_settings;
CREATE POLICY authenticated_insert_lead_pipeline_settings
  ON public.lead_pipeline_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())));

DROP POLICY IF EXISTS authenticated_update_lead_pipeline_settings ON public.lead_pipeline_settings;
CREATE POLICY authenticated_update_lead_pipeline_settings
  ON public.lead_pipeline_settings
  FOR UPDATE
  TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
  WITH CHECK (organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())));

DROP POLICY IF EXISTS authenticated_delete_lead_pipeline_settings ON public.lead_pipeline_settings;
CREATE POLICY authenticated_delete_lead_pipeline_settings
  ON public.lead_pipeline_settings
  FOR DELETE
  TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())));

REVOKE ALL ON public.lead_pipeline_settings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_pipeline_settings TO authenticated;
GRANT ALL ON public.lead_pipeline_settings TO service_role;

-- Auditoria: organization_id directo → Grupo A, o mesmo padrão aplicado à
-- tabela irmã lead_qualification_rules (confirmado ao vivo:
-- trg_audit_lead_qualification_rules -> fn_generic_entity_audit).
DROP TRIGGER IF EXISTS trg_audit_lead_pipeline_settings ON public.lead_pipeline_settings;
CREATE TRIGGER trg_audit_lead_pipeline_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.lead_pipeline_settings
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

COMMENT ON TABLE public.lead_pipeline_settings IS
  'Configuração do funil de leads por organização: layout do diagrama de workflow e política de transições. Uma linha por organização (PK = organization_id). Não contém regras — essas vivem em lead_workflow_stages.reached_when e lead_qualification_rules.';
COMMENT ON COLUMN public.lead_pipeline_settings.organization_id IS
  'Organização dona da configuração. PK e FK para anew_organizations; ON DELETE CASCADE.';
COMMENT ON COLUMN public.lead_pipeline_settings.stage_positions IS
  'Posições dos nós no editor visual do funil: {"<lead_workflow_stages.id>": {"x": <num>, "y": <num>}}. Puramente cosmético — não afecta a avaliação de regras. Estágios ausentes do mapa são posicionados automaticamente pelo frontend.';
COMMENT ON COLUMN public.lead_pipeline_settings.enforce_stage_transitions IS
  'Quando true, a lead só pode mudar para um estágio ligado ao actual no diagrama. Quando false (default), qualquer transição é permitida — comportamento histórico.';
COMMENT ON COLUMN public.lead_pipeline_settings.created_by IS 'anew_users.id de quem criou a configuração.';
COMMENT ON COLUMN public.lead_pipeline_settings.updated_by IS 'anew_users.id de quem alterou a configuração pela última vez.';


-- ============================================================
-- PARTE 2 — public.stage_reached: tolerância a regras mal formadas
-- ============================================================
-- PROBLEMA (confirmado ao vivo nesta base de dados):
--   lead_workflow_stages.reached_when guarda {"all":[...],"any":[...]} onde
--   cada elemento devia ser um objecto {"type": "..."}. Em 8 estágios de 2
--   organizações os elementos foram gravados como STRINGS (30 em 'all', 12 em
--   'any'), p.ex. {"all": ["has_contact_logged", "has_source"]}.
--
--   public.evaluate_condition(p_condition, p_signals, p_lead_status) faz
--   p_condition->>'type'. Num escalar string isso devolve NULL, o CASE cai no
--   ELSE e devolve false. Como o array NÃO fica vazio, o fallback
--   `p_lead_status = ANY(p_matching)` nunca é alcançado e o estágio fica
--   PERMANENTEMENTE inalcançável — o funil do cliente morre em silêncio.
--
-- OBJECTIVO: qualquer cliente pode desenhar os seus estágios e regras;
-- configuração inválida nunca pode matar o funil.
--
-- ALTERAÇÕES (3, todas defensivas):
--   (a) p_rule->'all' / ->'any' só são aceites se jsonb_typeof = 'array'.
--       Qualquer outra coisa (objecto, escalar, null) é tratada como array
--       vazio em vez de rebentar. Hoje jsonb_array_length()/
--       jsonb_array_elements() sobre um não-array levanta excepção e aborta a
--       query inteira do dashboard. Nenhuma linha em produção tem esta forma
--       neste momento — é puro cinto de segurança.
--   (b) Elementos cujo jsonb_typeof(elem) <> 'object' são FILTRADOS antes da
--       avaliação. Um não-objecto não é uma condição em nenhuma versão do
--       motor: é serialização partida, não intenção do utilizador.
--   (c) Se, DEPOIS do filtro, ambos os arrays ficarem vazios, aplica-se o
--       fallback já existente `p_lead_status = ANY(p_matching)`. É isto que
--       devolve a vida aos 8 estágios afectados: passam a comportar-se como
--       se não tivessem regra, ou seja, resolvem por status literal.
--
-- DECISÃO DELIBERADA — NÃO se filtram objectos com `type` desconhecido:
--   1. Mudaria semântica real: hoje um `type` desconhecido dentro de 'all'
--      devolve false e BLOQUEIA o estágio. Filtrá-lo faria o estágio passar a
--      ser alcançado. Falso-positivo (lead avança sem cumprir o critério) é
--      pior do que falso-negativo.
--   2. Obrigaria a duplicar aqui a lista de tipos de evaluate_condition. Ao
--      acrescentar um tipo novo lá e esquecer a whitelist aqui, a condição
--      passaria a ser silenciosamente ignorada — exactamente o bug perigoso
--      do ponto 1, mas escondido.
--   3. Um `type` desconhecido é sintacticamente uma condição válida (pode ser
--      de uma versão mais recente do motor, ou um typo visível no editor).
--      Um não-objecto nunca o é. A distinção estrutural é objectiva; a
--      semântica não é, e pertence à validação no editor/API, não ao motor.
--   Confirmado ao vivo: 0 elementos são objectos sem chave `type`, por isso
--   esta decisão não deixa nenhum caso real por resolver.
--
-- Base: definição VIVA obtida com
--   SELECT pg_get_functiondef('public.stage_reached(jsonb,jsonb,text,text[])'::regprocedure)
-- (regra do projecto: nunca reconstruir a partir de migração antiga).
-- Preservados tal e qual: assinatura, RETURNS boolean, LANGUAGE plpgsql,
-- IMMUTABLE, SECURITY DEFINER, SET search_path TO 'public'.
--
-- public.evaluate_condition NÃO é alterada por esta migração.

CREATE OR REPLACE FUNCTION public.stage_reached(p_signals jsonb, p_rule jsonb, p_lead_status text, p_matching text[])
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_all_raw jsonb;
  v_any_raw jsonb;
  v_all jsonb;
  v_any jsonb;
  v_cond jsonb;
  v_all_true boolean := true;
  v_any_true boolean := false;
  v_has_all boolean := false;
  v_has_any boolean := false;
BEGIN
  -- (a) Só um array é uma lista de condições. Tudo o resto → vazio.
  v_all_raw := CASE WHEN jsonb_typeof(p_rule -> 'all') = 'array' THEN p_rule -> 'all' ELSE '[]'::jsonb END;
  v_any_raw := CASE WHEN jsonb_typeof(p_rule -> 'any') = 'array' THEN p_rule -> 'any' ELSE '[]'::jsonb END;

  -- (b) Descarta elementos que não são objectos (strings, números, null,
  --     arrays aninhados). evaluate_condition não os consegue interpretar e
  --     devolveria sempre false, bloqueando o estágio para sempre.
  SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
    INTO v_all
    FROM jsonb_array_elements(v_all_raw) AS e
   WHERE jsonb_typeof(e) = 'object';

  SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
    INTO v_any
    FROM jsonb_array_elements(v_any_raw) AS e
   WHERE jsonb_typeof(e) = 'object';

  -- (c) Sem condições utilizáveis → regra vazia → resolve por status literal.
  --     Idêntico ao comportamento original para reached_when NULL ou {}.
  IF jsonb_array_length(v_all) = 0 AND jsonb_array_length(v_any) = 0 THEN
    RETURN p_matching IS NOT NULL AND p_lead_status = ANY(p_matching);
  END IF;

  -- A partir daqui a lógica é exactamente a da versão viva.
  FOR v_cond IN SELECT * FROM jsonb_array_elements(v_all)
  LOOP
    v_has_all := true;
    IF NOT public.evaluate_condition(v_cond, p_signals, p_lead_status) THEN
      v_all_true := false;
    END IF;
  END LOOP;

  FOR v_cond IN SELECT * FROM jsonb_array_elements(v_any)
  LOOP
    v_has_any := true;
    IF public.evaluate_condition(v_cond, p_signals, p_lead_status) THEN
      v_any_true := true;
    END IF;
  END LOOP;

  RETURN (NOT v_has_all OR v_all_true) AND (NOT v_has_any OR v_any_true);
END;
$function$;

-- Reafirma os privilégios exactos da versão viva (postgres/authenticated/
-- service_role = EXECUTE, sem PUBLIC). CREATE OR REPLACE já preserva a ACL
-- existente; isto garante o mesmo resultado numa base de dados reconstruída
-- do zero, onde o default seria EXECUTE para PUBLIC.
REVOKE ALL ON FUNCTION public.stage_reached(jsonb, jsonb, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_reached(jsonb, jsonb, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stage_reached(jsonb, jsonb, text, text[]) TO service_role;

COMMENT ON FUNCTION public.stage_reached(jsonb, jsonb, text, text[]) IS
  'Avalia se uma lead atingiu um estágio do funil. p_rule = lead_workflow_stages.reached_when no formato {"all":[{"type":...}],"any":[{"type":...}]}. Elementos que não sejam objectos são ignorados; se não sobrar nenhuma condição utilizável, resolve pelo fallback de status literal (p_lead_status = ANY(p_matching)). Configuração inválida degrada para o comportamento por status em vez de tornar o estágio inalcançável.';


-- ============================================================
-- Notas de verificação (não executadas)
-- ============================================================
-- 1. Tabela nova:
--      SELECT * FROM public.lead_pipeline_settings;                    -- vazia
--      SELECT polname, polcmd FROM pg_policy
--       WHERE polrelid = 'public.lead_pipeline_settings'::regclass;    -- 4 políticas
--      SELECT relrowsecurity FROM pg_class
--       WHERE oid = 'public.lead_pipeline_settings'::regclass;         -- true
--
-- 2. Motor de regras — os 8 estágios com elementos string em reached_when
--    voltam a ser alcançáveis pelo fallback de status:
--      SELECT s.organization_id, s.name, s.matching_statuses, s.reached_when,
--             public.stage_reached('{}'::jsonb, s.reached_when, s.name, s.matching_statuses)
--        FROM public.lead_workflow_stages s
--       WHERE s.reached_when IS NOT NULL
--         AND EXISTS (
--               SELECT 1
--                 FROM jsonb_array_elements(COALESCE(s.reached_when->'all','[]'::jsonb)
--                                        || COALESCE(s.reached_when->'any','[]'::jsonb)) e
--                WHERE jsonb_typeof(e) <> 'object');
--    Antes: false para todos. Depois: true quando name ∈ matching_statuses.
--
-- 3. Não regressão nas regras bem formadas (test_e2e_stage, e os estágios
--    'qualified'/'negotiation' da org 30844c8c-…): os elementos são todos
--    objectos, o filtro não remove nada e o resultado é bit a bit o mesmo.
--
-- 4. Chamadores de stage_reached (inalterados, assinatura idêntica):
--    compute_lead_stage_v2, compute_lead_furthest_progress_stage_v2,
--    simulate_lead_v2_bucket_changes, simulate_lead_workflow_stage_rules.
--    Nenhum índice, coluna gerada ou vista depende da função (pg_depend vazio),
--    por isso o CREATE OR REPLACE não força reindexação nem revalidação.
