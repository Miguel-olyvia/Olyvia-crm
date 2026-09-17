-- RPC de leitura para o ecrã: consumo atual vs. teto de cada limite,
-- calculado sempre no servidor -- nunca o frontend a adivinhar "que mês é
-- agora" ou a resolver a organização de faturação sozinho.
-- ============================================================
-- Callable por `authenticated` (ao contrário das funções de
-- check-and-consume, que continuam só para service_role) -- esta só lê,
-- nunca escreve nem consome quota, e verifica que o chamador é membro
-- ativo da organização pedida antes de devolver qualquer número.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_get_plan_usage_summary(
  _organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_user_id uuid;
  v_is_member         boolean;
  v_billing_org_id    uuid;
  v_plan              text;
  v_status            text;
  v_trial_ends_at     timestamptz;
  v_limits            jsonb := '[]'::jsonb;
  v_row               record;
  v_period_start      date;
  v_used              integer;
  v_balance           integer;
  v_users_limit_value integer;
  v_active_seats      integer;
BEGIN
  IF _organization_id IS NULL THEN
    RETURN jsonb_build_object('error', 'organization_id_required');
  END IF;

  SELECT id INTO v_business_user_id
    FROM public.anew_users
    WHERE auth_user_id = auth.uid();

  IF v_business_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.anew_memberships m
    WHERE m.organization_id = _organization_id
      AND m.user_id = v_business_user_id
      AND m.status = 'active'
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RETURN jsonb_build_object('error', 'not_a_member');
  END IF;

  v_billing_org_id := public.resolve_billing_organization_id(_organization_id);

  SELECT plan, status, trial_ends_at
    INTO v_plan, v_status, v_trial_ends_at
    FROM public.organization_subscriptions
    WHERE organization_id = v_billing_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('plan', NULL, 'status', NULL, 'limits', '[]'::jsonb);
  END IF;

  -- Limites com contador (ai_credits, leads, proposals, quotes,
  -- contracts) -- mesmo cálculo de period_start das funções de
  -- check-and-consume, nunca um valor vindo do cliente.
  FOR v_row IN
    SELECT limit_type, limit_value, reset_cadence
    FROM public.plan_limits
    WHERE plan = v_plan
      AND limit_type IN ('ai_credits', 'leads', 'proposals', 'quotes', 'contracts')
  LOOP
    v_period_start := CASE
      WHEN v_row.reset_cadence = 'monthly' THEN date_trunc('month', now())::date
      ELSE DATE '0001-01-01'
    END;

    SELECT used_value INTO v_used
      FROM public.organization_usage_counters
      WHERE organization_id = v_billing_org_id
        AND limit_type = v_row.limit_type
        AND period_start = v_period_start;

    v_limits := v_limits || jsonb_build_object(
      'limit_type', v_row.limit_type,
      'limit_value', v_row.limit_value,
      'used_value', COALESCE(v_used, 0),
      'reset_cadence', v_row.reset_cadence
    );
  END LOOP;

  -- ai_credits tem também o saldo comprado -- acrescenta-se ao objeto já
  -- construído acima em vez de duplicar a entrada.
  SELECT balance_credits INTO v_balance
    FROM public.organization_ai_credits
    WHERE organization_id = v_billing_org_id;

  SELECT jsonb_agg(
    CASE WHEN elem->>'limit_type' = 'ai_credits'
      THEN elem || jsonb_build_object('balance_credits', COALESCE(v_balance, 0))
      ELSE elem
    END
  ) INTO v_limits
  FROM jsonb_array_elements(v_limits) elem;

  -- users: lotação, sem contador -- contagem ao vivo, mesmo cálculo de
  -- fn_check_user_seat_limit.
  SELECT limit_value INTO v_users_limit_value
    FROM public.plan_limits
    WHERE plan = v_plan AND limit_type = 'users';

  IF FOUND THEN
    SELECT count(*) INTO v_active_seats
      FROM public.anew_memberships m
      JOIN public.anew_organizations o ON o.id = m.organization_id
      WHERE m.status = 'active'
        AND public.resolve_billing_organization_id(o.id) = v_billing_org_id;

    v_limits := v_limits || jsonb_build_object(
      'limit_type', 'users',
      'limit_value', v_users_limit_value,
      'used_value', COALESCE(v_active_seats, 0),
      'reset_cadence', 'none'
    );
  END IF;

  RETURN jsonb_build_object(
    'plan', v_plan,
    'status', v_status,
    'trial_ends_at', v_trial_ends_at,
    'limits', v_limits
  );
END;
$$;

COMMENT ON FUNCTION public.fn_get_plan_usage_summary(uuid) IS
  'Leitura, para o ecrã: consumo atual vs. teto de cada limite (ai_credits, leads, users, proposals, quotes, contracts) da organização de faturação resolvida a partir de _organization_id. Nunca escreve nem consome quota -- só service_role pode fazer isso, via fn_check_and_consume_*. Verifica que o chamador é membro ativo de _organization_id antes de devolver qualquer número; devolve {"error": ...} em vez dos dados quando não é.';

REVOKE ALL ON FUNCTION public.fn_get_plan_usage_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_get_plan_usage_summary(uuid) TO authenticated, service_role;
