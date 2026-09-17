-- Limites de propostas, orçamentos e contratos -- mesmo padrão de leads
-- (trial único, starter/pro/enterprise mensais), mas SEM deduplicação por
-- entidade: ao contrário de leads/clientes, uma proposta é sempre um
-- documento novo, mesmo que seja a 3ª proposta para o mesmo cliente --
-- deve contar 3, não 1. Por isso usam uma função genérica em vez de
-- fn_check_and_consume_lead_quota.
-- ============================================================
-- Emails (o 4º limite anunciado na página inicial) fica de fora
-- deliberadamente: não há uma tabela única de "emails enviados" para pôr
-- um trigger -- o envio acontece dentro de várias Edge Functions
-- (send-quote-email, send-proposal-email, trigger-email-template,
-- process-scheduled-emails...), cada uma teria de chamar a verificação
-- explicitamente. Isso é uma mudança maior, a fazer à parte, com revisão
-- própria -- não em cima de um trigger de tabela como os outros três.
-- ============================================================

-- ------------------------------------------------------------
-- 1. fn_check_and_consume_simple_quota -- genérica, sem deduplicação
-- ------------------------------------------------------------
-- Mesmo desenho de fn_check_and_consume_lead_quota, menos o passo de
-- organization_counted_entities -- serve qualquer limit_type onde cada
-- novo registo é sempre uma unidade nova de consumo, nunca a mesma
-- identidade a reaparecer.
CREATE OR REPLACE FUNCTION public.fn_check_and_consume_simple_quota(
  _organization_id uuid,
  _limit_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_billing_org_id uuid;
  v_plan           text;
  v_status         text;
  v_trial_ends_at  timestamptz;
  v_limit_value    integer;
  v_reset_cadence  text;
  v_period_start   date;
  v_used_value     integer;
BEGIN
  v_billing_org_id := public.resolve_billing_organization_id(_organization_id);

  SELECT plan, status, trial_ends_at
    INTO v_plan, v_status, v_trial_ends_at
    FROM public.organization_subscriptions
    WHERE organization_id = v_billing_org_id;

  IF NOT FOUND
     OR v_status NOT IN ('trialing', 'active')
     OR (v_trial_ends_at IS NOT NULL AND v_trial_ends_at <= now()) THEN
    RETURN jsonb_build_object('blocked', true, 'reason', 'no_active_subscription');
  END IF;

  SELECT limit_value, reset_cadence INTO v_limit_value, v_reset_cadence
    FROM public.plan_limits
    WHERE plan = v_plan AND limit_type = _limit_type;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('blocked', true, 'reason', 'no_plan_limit_configured');
  END IF;

  -- Mesma regra de sempre: 'monthly' usa o mês corrente calculado no
  -- servidor (imune ao relógio do PC do utilizador); 'none' usa uma
  -- data-sentinela fixa (teto único, ex: o trial).
  v_period_start := CASE
    WHEN v_reset_cadence = 'monthly' THEN date_trunc('month', now())::date
    ELSE DATE '0001-01-01'
  END;

  INSERT INTO public.organization_usage_counters (organization_id, limit_type, period_start, used_value)
  VALUES (v_billing_org_id, _limit_type, v_period_start, 0)
  ON CONFLICT (organization_id, limit_type, period_start) DO NOTHING;

  SELECT used_value INTO v_used_value
    FROM public.organization_usage_counters
    WHERE organization_id = v_billing_org_id
      AND limit_type = _limit_type
      AND period_start = v_period_start
    FOR UPDATE;

  IF v_limit_value IS NOT NULL AND v_used_value >= v_limit_value THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'reason', 'limit_exceeded',
      'limit_value', v_limit_value,
      'used_value', v_used_value
    );
  END IF;

  UPDATE public.organization_usage_counters
    SET used_value = used_value + 1, updated_at = now()
    WHERE organization_id = v_billing_org_id
      AND limit_type = _limit_type
      AND period_start = v_period_start;

  RETURN jsonb_build_object('blocked', false);
END;
$$;

COMMENT ON FUNCTION public.fn_check_and_consume_simple_quota(uuid, text) IS
  'Verificação genérica de quota (proposals, quotes, contracts -- qualquer limit_type sem deduplicação por identidade). Resolve sempre a organização de faturação primeiro (resolve_billing_organization_id). Para leads/clientes usar fn_check_and_consume_lead_quota, que deduplica por entity_id.';

REVOKE ALL ON FUNCTION public.fn_check_and_consume_simple_quota(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_and_consume_simple_quota(uuid, text) TO service_role;

-- ------------------------------------------------------------
-- 2. Seed plan_limits -- números já publicados na página inicial
-- ------------------------------------------------------------
INSERT INTO public.plan_limits (plan, limit_type, limit_value, reset_cadence)
VALUES
  ('trial',      'proposals', 30,  'none'),
  ('starter',    'proposals', 100, 'monthly'),
  ('pro',        'proposals', 250, 'monthly'),
  ('enterprise', 'proposals', 500, 'monthly'),
  ('trial',      'quotes',    30,  'none'),
  ('starter',    'quotes',    100, 'monthly'),
  ('pro',        'quotes',    250, 'monthly'),
  ('enterprise', 'quotes',    500, 'monthly'),
  ('trial',      'contracts', 30,  'none'),
  ('starter',    'contracts', 100, 'monthly'),
  ('pro',        'contracts', 250, 'monthly'),
  ('enterprise', 'contracts', 300, 'monthly')
ON CONFLICT (plan, limit_type) DO NOTHING;

-- 'internal' (equipa/teste) sem teto em nada, mesmo padrão dos outros
-- limit_type já cobertos para este plano em 20261201310000.
INSERT INTO public.plan_limits (plan, limit_type, limit_value, reset_cadence)
VALUES
  ('internal', 'proposals', NULL, 'monthly'),
  ('internal', 'quotes',    NULL, 'monthly'),
  ('internal', 'contracts', NULL, 'monthly')
ON CONFLICT (plan, limit_type) DO NOTHING;

-- ------------------------------------------------------------
-- 3. Triggers BEFORE INSERT -- proposals, quotes, client_contracts
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_proposal_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.fn_check_and_consume_simple_quota(NEW.organization_id, 'proposals');
  IF (v_result->>'blocked')::boolean THEN
    RAISE EXCEPTION 'plan_limit_exceeded:proposals (%)', v_result->>'reason'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_proposal_quota ON public.proposals;
CREATE TRIGGER trg_enforce_proposal_quota
  BEFORE INSERT ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_proposal_quota();

CREATE OR REPLACE FUNCTION public.fn_enforce_quote_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.fn_check_and_consume_simple_quota(NEW.organization_id, 'quotes');
  IF (v_result->>'blocked')::boolean THEN
    RAISE EXCEPTION 'plan_limit_exceeded:quotes (%)', v_result->>'reason'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_quote_quota ON public.quotes;
CREATE TRIGGER trg_enforce_quote_quota
  BEFORE INSERT ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_quote_quota();

CREATE OR REPLACE FUNCTION public.fn_enforce_contract_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.fn_check_and_consume_simple_quota(NEW.organization_id, 'contracts');
  IF (v_result->>'blocked')::boolean THEN
    RAISE EXCEPTION 'plan_limit_exceeded:contracts (%)', v_result->>'reason'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_contract_quota ON public.client_contracts;
CREATE TRIGGER trg_enforce_contract_quota
  BEFORE INSERT ON public.client_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_contract_quota();
