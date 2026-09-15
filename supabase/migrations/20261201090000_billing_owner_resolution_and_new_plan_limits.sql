-- Resolução do dono de faturação (utilizador-raiz) + funções de verificação
-- para os dois limites de plano que faltam (leads, utilizadores) --
-- prontidão, sem ligar nada ainda. Mesmo espírito de
-- 20261112420000_stripe_checkout_readiness.sql: isto só prepara o motor;
-- nenhum comportamento existente muda com esta migration por si só.
-- ============================================================
-- Contexto (ver artefacto "Rota Crítica", secção Limites):
--   1. Uma organização pode ser criada de duas formas. A primeira
--      (signup, create_initial_organization) fica sempre com uma linha em
--      organization_subscriptions. As seguintes (work orgs adicionais via
--      rpc_create_organization_with_hierarchy) NÃO ficam -- nascem sem
--      plano nenhum, e org_has_active_access() (20261111040000), que
--      devia apanhar isso, nunca é chamada em lado nenhum do código.
--   2. Decisão tomada: o plano não pertence a uma organização, pertence a
--      uma PESSOA -- o utilizador auto-registado que arrancou a conta
--      (anew_users.created_by IS NULL). Qualquer organização que essa
--      pessoa crie, ou que utilizadores criados por ela venham a criar,
--      conta para o mesmo plano.
--   3. Isto aplica-se já aos créditos de IA em produção (não só aos
--      limites novos) -- sem isto, a mesma conta com duas work orgs conta
--      os créditos de IA em duplicado, um saldo por organização.
--
-- O que esta migration NÃO faz, deliberadamente:
--   - Não semeia nenhum valor em plan_limits para 'leads'/'users' -- os
--     números reais ainda não foram decididos (mesmo caso de
--     plan_pricing.price_eur para pro/enterprise, hoje NULL). Enquanto
--     não houver linha em plan_limits para um destes limit_type, as
--     funções abaixo bloqueiam por omissão (nunca ilimitado por acidente)
--     -- ver o mesmo princípio já documentado em
--     fn_check_and_consume_ai_credits.
--   - Não liga nenhum trigger a anew_leads nem chama nada a partir de
--     create-user. Leads são criados por duas vias diferentes (a função
--     create-lead E um insert direto do cliente em AnewLeads.tsx) -- ligar
--     a função abaixo antes de decidir os números bloquearia a criação de
--     leads para toda a gente assim que esta migration fosse aplicada.
--     Isso fica para uma migration seguinte, já com os valores definidos.
-- ============================================================

-- ------------------------------------------------------------
-- 1. resolve_billing_organization_id -- o utilizador-raiz, traduzido de
--    volta para a organização que efetivamente tem o plano
-- ------------------------------------------------------------
-- organization_ai_credits/organization_subscriptions/plan_limits continuam
-- todos chaveados por organization_id (não se mexe em nenhuma chave
-- primária nem FK existente) -- só se passa a resolver, antes de ler ou
-- escrever, qual É essa organização: sobe anew_organizations.created_by ->
-- anew_users.created_by, recursivamente, até encontrar o utilizador-raiz
-- (created_by IS NULL), e devolve a organização que ESSE utilizador criou
-- no signup (a única com organization_subscriptions.created_by = ele).
--
-- Falha sempre para o lado seguro: qualquer resolução inconclusiva (sem
-- created_by, sem subscrição correspondente, cadeia longa de mais)
-- devolve a própria organização de entrada -- nunca um erro, e nunca pior
-- do que o comportamento de hoje para o caso comum (uma só organização).
CREATE OR REPLACE FUNCTION public.resolve_billing_organization_id(
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_walk_user_id   uuid;
  v_next_creator   uuid;
  v_root_user_id   uuid;
  v_billing_org_id uuid;
  v_depth          integer := 0;
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT created_by INTO v_walk_user_id
    FROM public.anew_organizations
    WHERE id = p_organization_id;

  IF v_walk_user_id IS NULL THEN
    -- Organização sem criador registado -- nada a resolver, mantém o
    -- comportamento de hoje.
    RETURN p_organization_id;
  END IF;

  -- Sobe a cadeia de "quem criou quem" até ao utilizador-raiz. Limite de
  -- profundidade é só uma rede de segurança contra um ciclo que um bug
  -- futuro possa introduzir -- esta cadeia nunca deve legitimamente passar
  -- de um punhado de saltos.
  LOOP
    v_depth := v_depth + 1;
    IF v_depth > 50 THEN
      RAISE WARNING 'resolve_billing_organization_id: cadeia created_by excedeu 50 saltos para a organização % -- a devolver a própria organização', p_organization_id;
      RETURN p_organization_id;
    END IF;

    SELECT created_by INTO v_next_creator
      FROM public.anew_users
      WHERE id = v_walk_user_id;

    IF v_next_creator IS NULL THEN
      v_root_user_id := v_walk_user_id;
      EXIT;
    END IF;

    v_walk_user_id := v_next_creator;
  END LOOP;

  SELECT organization_id INTO v_billing_org_id
    FROM public.organization_subscriptions
    WHERE created_by = v_root_user_id
    ORDER BY created_at ASC
    LIMIT 1;

  RETURN COALESCE(v_billing_org_id, p_organization_id);
END;
$$;

COMMENT ON FUNCTION public.resolve_billing_organization_id(uuid) IS
  'Dado o id de qualquer organização, devolve a organização que efetivamente tem o plano/faturação: sobe anew_organizations.created_by -> anew_users.created_by até ao utilizador-raiz (created_by IS NULL) e devolve a organização de signup desse utilizador (organization_subscriptions.created_by = ele). Nunca falha -- devolve a própria organização de entrada sempre que a resolução for inconclusiva, para nunca regredir o comportamento de hoje no caso comum de uma só organização.';

REVOKE ALL ON FUNCTION public.resolve_billing_organization_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_billing_organization_id(uuid) TO service_role;

-- ------------------------------------------------------------
-- 2. fn_check_and_consume_ai_credits -- retrofit para resolver a
--    organização de faturação antes de ler/escrever qualquer contador
-- ------------------------------------------------------------
-- Lógica idêntica à de 20261112400000 (mesma ordem de locks, mesmo
-- tudo-ou-nada, mesmo "ausência = bloqueado") -- a ÚNICA mudança é
-- resolver _organization_id para v_billing_org_id logo no início, e usar
-- v_billing_org_id em todas as leituras/escritas de
-- organization_subscriptions / organization_usage_counters /
-- organization_ai_credits. Sem isto, a mesma conta com duas work orgs
-- (ex: criadas por rpc_create_organization_with_hierarchy) contava
-- créditos de IA em duplicado -- um saldo por organização, em vez de um
-- saldo por conta.
CREATE OR REPLACE FUNCTION public.fn_check_and_consume_ai_credits(
  _organization_id uuid,
  _amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_billing_org_id       uuid;
  v_plan                 text;
  v_status               text;
  v_trial_ends_at        timestamptz;
  v_limit_value          integer;
  v_period_start         date := date_trunc('month', now())::date;
  v_used_value           integer;
  v_balance              integer;
  v_remaining_plan       integer;
  v_needed_from_balance  integer;
  v_source               text;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'fn_check_and_consume_ai_credits: _amount deve ser positivo (recebido %)', _amount;
  END IF;

  v_billing_org_id := public.resolve_billing_organization_id(_organization_id);

  -- 1. Plano ativo da organização de faturação. Sem linha, sem status
  --    ativo, ou trial expirado -> bloqueado por defeito.
  SELECT plan, status, trial_ends_at
    INTO v_plan, v_status, v_trial_ends_at
    FROM public.organization_subscriptions
    WHERE organization_id = v_billing_org_id;

  IF NOT FOUND
     OR v_status NOT IN ('trialing', 'active')
     OR (v_trial_ends_at IS NOT NULL AND v_trial_ends_at <= now()) THEN
    RETURN jsonb_build_object('blocked', true, 'reason', 'no_active_subscription');
  END IF;

  -- 2. Limite de ai_credits configurado para este plano.
  SELECT limit_value INTO v_limit_value
    FROM public.plan_limits
    WHERE plan = v_plan AND limit_type = 'ai_credits';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('blocked', true, 'reason', 'no_plan_limit_configured');
  END IF;

  -- 3. Garante e trava (FOR UPDATE) a linha de consumo do mês corrente,
  --    já na organização de faturação -- serializa concorrência por conta,
  --    não por work org isolada.
  INSERT INTO public.organization_usage_counters (organization_id, limit_type, period_start, used_value)
  VALUES (v_billing_org_id, 'ai_credits', v_period_start, 0)
  ON CONFLICT (organization_id, limit_type, period_start) DO NOTHING;

  SELECT used_value INTO v_used_value
    FROM public.organization_usage_counters
    WHERE organization_id = v_billing_org_id
      AND limit_type = 'ai_credits'
      AND period_start = v_period_start
    FOR UPDATE;

  -- 4. Plano ilimitado (limit_value NULL): incrementa só para reporting.
  IF v_limit_value IS NULL THEN
    UPDATE public.organization_usage_counters
      SET used_value = used_value + _amount, updated_at = now()
      WHERE organization_id = v_billing_org_id
        AND limit_type = 'ai_credits'
        AND period_start = v_period_start;

    RETURN jsonb_build_object('blocked', false, 'source', 'plan');
  END IF;

  -- 5. Quanto ainda cabe no limite mensal do plano.
  v_remaining_plan := GREATEST(v_limit_value - v_used_value, 0);

  IF v_remaining_plan >= _amount THEN
    UPDATE public.organization_usage_counters
      SET used_value = used_value + _amount, updated_at = now()
      WHERE organization_id = v_billing_org_id
        AND limit_type = 'ai_credits'
        AND period_start = v_period_start;

    RETURN jsonb_build_object('blocked', false, 'source', 'plan');
  END IF;

  -- 6. O plano não chega -- tenta cobrir o resto com o saldo comprado,
  --    também já na organização de faturação (mesma ordem de locks:
  --    counters sempre antes de credits).
  v_needed_from_balance := _amount - v_remaining_plan;

  SELECT balance_credits INTO v_balance
    FROM public.organization_ai_credits
    WHERE organization_id = v_billing_org_id
    FOR UPDATE;

  IF NOT FOUND THEN
    v_balance := 0;
  END IF;

  IF v_balance < v_needed_from_balance THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'reason', 'limit_exceeded',
      'limit_value', v_limit_value,
      'used_value', v_used_value,
      'balance_credits', v_balance
    );
  END IF;

  -- 7. Cobre com o plano até ao teto + o resto do saldo comprado.
  UPDATE public.organization_usage_counters
    SET used_value = used_value + v_remaining_plan, updated_at = now()
    WHERE organization_id = v_billing_org_id
      AND limit_type = 'ai_credits'
      AND period_start = v_period_start;

  UPDATE public.organization_ai_credits
    SET balance_credits = balance_credits - v_needed_from_balance, updated_at = now()
    WHERE organization_id = v_billing_org_id;

  v_source := CASE WHEN v_remaining_plan = 0 THEN 'balance' ELSE 'plan+balance' END;

  RETURN jsonb_build_object('blocked', false, 'source', v_source);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_check_and_consume_ai_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_and_consume_ai_credits(uuid, integer) TO service_role;

-- ------------------------------------------------------------
-- 3. fn_check_and_consume_lead_quota -- pronta, ainda não ligada a
--    nenhum trigger (ver nota no cabeçalho desta migration)
-- ------------------------------------------------------------
-- Mesmo desenho de fn_check_and_consume_ai_credits (organização de
-- faturação resolvida primeiro, lock da linha do mês corrente, ausência
-- de plan_limits = bloqueado) -- mais simples porque não há saldo
-- comprado para leads, só o teto mensal do plano. Consome sempre 1 (um
-- lead de cada vez); parâmetro de quantidade omitido de propósito para
-- não sugerir que se pode "comprar" leads em lote como os créditos de IA.
CREATE OR REPLACE FUNCTION public.fn_check_and_consume_lead_quota(
  _organization_id uuid
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
    WHERE plan = v_plan AND limit_type = 'leads';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('blocked', true, 'reason', 'no_plan_limit_configured');
  END IF;

  -- reset_cadence decide o "balde" onde o consumo se acumula: 'monthly'
  -- -> o mês corrente, calculado sempre no servidor (date_trunc('month',
  -- now()) usa o relógio do Postgres, nunca o do browser/PC do
  -- utilizador -- imune a alguém adiantar a hora do computador para
  -- "renovar" o limite mais cedo); 'none' -> um único balde fixo para
  -- sempre (ex: o teto de leads do trial, que não deve recarregar todos
  -- os meses -- usa uma data-sentinela fora do calendário real para nunca
  -- colidir com um period_start mensal genuíno).
  v_period_start := CASE
    WHEN v_reset_cadence = 'monthly' THEN date_trunc('month', now())::date
    ELSE DATE '0001-01-01'
  END;

  INSERT INTO public.organization_usage_counters (organization_id, limit_type, period_start, used_value)
  VALUES (v_billing_org_id, 'leads', v_period_start, 0)
  ON CONFLICT (organization_id, limit_type, period_start) DO NOTHING;

  SELECT used_value INTO v_used_value
    FROM public.organization_usage_counters
    WHERE organization_id = v_billing_org_id
      AND limit_type = 'leads'
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
      AND limit_type = 'leads'
      AND period_start = v_period_start;

  RETURN jsonb_build_object('blocked', false);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_check_and_consume_lead_quota(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_and_consume_lead_quota(uuid) TO service_role;

-- ------------------------------------------------------------
-- 4. fn_check_user_seat_limit -- pronta, ainda não chamada por create-user
-- ------------------------------------------------------------
-- Diferente dos dois anteriores: utilizadores são uma LOTAÇÃO, não um
-- consumo mensal -- sem reset_cadence='monthly', sem contador em
-- organization_usage_counters. Conta membros ativos em QUALQUER
-- organização que resolva para a mesma organização de faturação (não só
-- _organization_id), para que o teto seja da conta, não de uma work org
-- isolada.
--
-- NOTA DE DESEMPENHO: esta contagem percorre anew_organizations inteira
-- para encontrar quais resolvem para a mesma faturação -- aceitável à
-- escala de hoje (poucas work orgs por conta); se isso deixar de ser
-- verdade, materializar a organização de faturação numa coluna em vez de
-- a recalcular aqui.
CREATE OR REPLACE FUNCTION public.fn_check_user_seat_limit(
  _organization_id uuid
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
  v_active_seats   integer;
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

  SELECT limit_value INTO v_limit_value
    FROM public.plan_limits
    WHERE plan = v_plan AND limit_type = 'users';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('blocked', true, 'reason', 'no_plan_limit_configured');
  END IF;

  IF v_limit_value IS NULL THEN
    RETURN jsonb_build_object('blocked', false);
  END IF;

  SELECT count(*) INTO v_active_seats
    FROM public.anew_memberships m
    JOIN public.anew_organizations o ON o.id = m.organization_id
    WHERE m.status = 'active'
      AND public.resolve_billing_organization_id(o.id) = v_billing_org_id;

  IF v_active_seats >= v_limit_value THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'reason', 'limit_exceeded',
      'limit_value', v_limit_value,
      'used_value', v_active_seats
    );
  END IF;

  RETURN jsonb_build_object('blocked', false, 'used_value', v_active_seats, 'limit_value', v_limit_value);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_check_user_seat_limit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_user_seat_limit(uuid) TO service_role;

-- ------------------------------------------------------------
-- 5. Seed plan_limits (leads, users) -- números já publicados na página
--    inicial (src/pages/Landing.tsx), não inventados aqui
-- ------------------------------------------------------------
-- users: lotação (reset_cadence='none') para todos os planos -- nunca há
-- "/month" na página inicial para utilizadores, só para leads.
-- leads: trial é um teto único para o período todo do trial (reset_cadence
-- ='none', "50 leads (trial)" sem "/month"); starter/pro/enterprise
-- resetam todos os meses (reset_cadence='monthly', "N leads/month").
INSERT INTO public.plan_limits (plan, limit_type, limit_value, reset_cadence)
VALUES
  ('trial',      'users', 3,    'none'),
  ('starter',    'users', 20,   'none'),
  ('pro',        'users', 70,   'none'),
  ('enterprise', 'users', 200,  'none'),
  ('trial',      'leads', 50,   'none'),
  ('starter',    'leads', 200,  'monthly'),
  ('pro',        'leads', 1000, 'monthly'),
  ('enterprise', 'leads', 5000, 'monthly')
ON CONFLICT (plan, limit_type) DO NOTHING;
