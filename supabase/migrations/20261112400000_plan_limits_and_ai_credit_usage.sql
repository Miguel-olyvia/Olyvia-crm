-- Plan limits catálogo + consumo mensal de créditos de IA + compra "à
-- vulso" de créditos (sem pacote fixo) -- Fase 2 do billing de IA.
-- ============================================================
-- Esta migration assenta em cima de:
--   - 20261111040000_add_organization_subscriptions_trial.sql
--     (organization_subscriptions.plan IN ('trial','starter','pro','enterprise'))
--   - 20261112390000_ai_credits_packages_and_invoices.sql
--     (ai_credit_packages, organization_ai_credits, invoices,
--      fn_credit_org_on_invoice_paid)
--
-- Introduz:
--   1. plan_limits -- catálogo de limites por plano (ex: quantos créditos
--      de IA cada plano inclui por mês).
--   2. organization_usage_counters -- consumo mensal real por organização,
--      por limit_type (começa só com 'ai_credits', mas é genérico).
--   3. invoices.credits_amount -- permite comprar uma quantidade
--      arbitrária de créditos (sem estar limitado aos 4 pacotes fixos de
--      ai_credit_packages), e ajusta a CHECK constraint + o trigger de
--      crédito para suportar as duas formas de compra.
--   4. fn_check_and_consume_ai_credits -- RPC SECURITY DEFINER (só
--      service_role) que verifica e consome créditos de IA de forma
--      atómica: primeiro o limite mensal do plano, depois o saldo
--      comprado (organization_ai_credits.balance_credits), tudo-ou-nada.
--   5. purge_old_usage_counters -- manutenção mensal via pg_cron, mesmo
--      padrão defensivo de 20261110270000_purge_old_account_changes.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1. plan_limits -- catálogo de limites por plano
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_limits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan           text NOT NULL,
  limit_type     text NOT NULL,
  limit_value    integer,
  reset_cadence  text NOT NULL DEFAULT 'monthly',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_limits_reset_cadence_check
    CHECK (reset_cadence IN ('monthly', 'none')),
  CONSTRAINT plan_limits_limit_value_check
    CHECK (limit_value IS NULL OR limit_value >= 0),
  CONSTRAINT plan_limits_plan_limit_type_key UNIQUE (plan, limit_type)
);

COMMENT ON TABLE public.plan_limits IS
  'Catálogo de limites por plano (ex: quantos créditos de IA cada plano inclui por mês). Dados de configuração de negócio, geridos apenas via migration/service_role -- sem policy de escrita para authenticated.';
COMMENT ON COLUMN public.plan_limits.limit_value IS
  'NULL = ilimitado para este plano/limit_type (ex: enterprise). Valor >=0 caso contrário.';
COMMENT ON COLUMN public.plan_limits.reset_cadence IS
  '''monthly'' = o consumo (organization_usage_counters) reinicia todos os meses. ''none'' = reservado para limites futuros sem reset periódico (ainda não usado por nenhum limit_type atual).';

ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

-- Leitura pública dentro da app (qualquer utilizador autenticado) -- é o
-- catálogo de limites mostrado, por exemplo, no ecrã de plano/consumo.
-- Escrita só via migration/service_role.
CREATE POLICY "Authenticated can view plan limits"
  ON public.plan_limits FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.plan_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.plan_limits TO authenticated;
GRANT ALL ON public.plan_limits TO service_role;

-- Seed: limite de créditos de IA por plano (limit_type='ai_credits').
-- NOTA DE NEGÓCIO: estes valores (trial=20, starter=500, pro=2000,
-- enterprise=ilimitado) são um PONTO DE PARTIDA plausível, não uma decisão
-- final de pricing -- ajustar livremente depois pelo negócio (basta um
-- UPDATE a esta tabela, não precisa de nova migration para mudar valores).
INSERT INTO public.plan_limits (plan, limit_type, limit_value, reset_cadence)
VALUES
  ('trial',      'ai_credits', 20,   'monthly'),
  ('starter',    'ai_credits', 500,  'monthly'),
  ('pro',        'ai_credits', 2000, 'monthly'),
  ('enterprise', 'ai_credits', NULL, 'monthly')
ON CONFLICT (plan, limit_type) DO NOTHING;

-- ------------------------------------------------------------
-- 2. organization_usage_counters -- consumo mensal real por organização
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_usage_counters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  limit_type      text NOT NULL,
  period_start    date NOT NULL,
  used_value      integer NOT NULL DEFAULT 0 CHECK (used_value >= 0),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_usage_counters_org_type_period_key
    UNIQUE (organization_id, limit_type, period_start)
);

COMMENT ON TABLE public.organization_usage_counters IS
  'Consumo mensal real por organização e limit_type (começa só com ''ai_credits''). period_start é o 1º dia do mês (date_trunc(''month'', now())::date). Só é escrito pela RPC SECURITY DEFINER fn_check_and_consume_ai_credits ou por service_role -- nenhum cliente autenticado escreve aqui diretamente.';

CREATE INDEX IF NOT EXISTS idx_organization_usage_counters_org
  ON public.organization_usage_counters (organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_usage_counters_period_start
  ON public.organization_usage_counters (period_start);

ALTER TABLE public.organization_usage_counters ENABLE ROW LEVEL SECURITY;

-- SELECT: membros ativos da organização veem o seu próprio consumo --
-- mesmo padrão de "é membro ativo desta organização" usado em
-- organization_ai_credits (20261112390000).
CREATE POLICY "Org members can view their own usage counters"
  ON public.organization_usage_counters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.anew_memberships m
      WHERE m.organization_id = organization_usage_counters.organization_id
        AND m.user_id = (SELECT id FROM public.anew_users WHERE auth_user_id = auth.uid())
        AND m.status = 'active'
    )
  );

-- Deliberadamente SEM policy de INSERT/UPDATE/DELETE para authenticated:
-- o consumo só pode ser incrementado através da RPC SECURITY DEFINER
-- fn_check_and_consume_ai_credits (chamável só por service_role) ou
-- diretamente por service_role. Isto evita que um cliente falsifique o
-- seu próprio consumo (ex: zerar used_value para voltar a ter créditos).
REVOKE ALL ON public.organization_usage_counters FROM PUBLIC, anon;
GRANT SELECT ON public.organization_usage_counters TO authenticated;
GRANT ALL ON public.organization_usage_counters TO service_role;

-- ------------------------------------------------------------
-- 3. invoices.credits_amount -- compra "à vulso" de créditos
-- ------------------------------------------------------------
-- Até aqui, uma fatura do tipo 'creditos' só podia referenciar um dos 4
-- pacotes fixos (package_id). Passa agora a poder, em alternativa,
-- especificar uma quantidade customizável de créditos (credits_amount),
-- nunca as duas ao mesmo tempo.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS credits_amount integer;

COMMENT ON COLUMN public.invoices.credits_amount IS
  'Quantidade de créditos de IA para compra "à vulso" (sem pacote fixo). Mutuamente exclusivo com package_id -- ver invoices_package_id_matches_type_check. NULL quando a fatura usa um pacote fixo (package_id) ou é do tipo ''plano''.';

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_credits_amount_check
  CHECK (credits_amount IS NULL OR credits_amount > 0);

-- Substitui a CHECK antiga (que obrigava sempre package_id em faturas de
-- créditos) por uma que aceita OU package_id OU credits_amount -- nunca os
-- dois em simultâneo, e pelo menos um dos dois quando type='creditos'.
-- Faturas de type='plano' continuam sem nenhum dos dois.
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_package_id_matches_type_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_package_id_matches_type_check
  CHECK (
    (type = 'plano' AND package_id IS NULL AND credits_amount IS NULL)
    OR (
      type = 'creditos' AND (
        (package_id IS NOT NULL AND credits_amount IS NULL)
        OR (package_id IS NULL AND credits_amount IS NOT NULL)
      )
    )
  );

-- ------------------------------------------------------------
-- 4. fn_credit_org_on_invoice_paid -- passa a suportar credits_amount
-- ------------------------------------------------------------
-- Mesma função/trigger de 20261112390000: dispara quando uma fatura do
-- tipo 'creditos' transita para status='pago' (só service_role/futuro
-- webhook Stripe). Agora suporta as duas formas de compra: pacote fixo
-- (package_id -> vai buscar ai_credit_packages.credits) ou quantidade à
-- vulso (credits_amount -> credita diretamente esse valor).
CREATE OR REPLACE FUNCTION public.fn_credit_org_on_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits integer;
BEGIN
  -- Só atua em faturas de créditos que acabaram de passar a 'pago'
  -- (evita reprocessar em updates repetidos ou noutros campos).
  IF NEW.type = 'creditos'
     AND NEW.status = 'pago'
     AND (OLD.status IS DISTINCT FROM 'pago') THEN

    IF NEW.package_id IS NOT NULL THEN
      SELECT credits INTO v_credits
      FROM public.ai_credit_packages
      WHERE id = NEW.package_id;

      IF v_credits IS NULL THEN
        RAISE EXCEPTION 'invoice % marcada como paga mas package_id % não corresponde a um pacote válido', NEW.id, NEW.package_id;
      END IF;
    ELSIF NEW.credits_amount IS NOT NULL THEN
      -- Compra "à vulso": credita diretamente a quantidade pedida, sem
      -- olhar para o catálogo de pacotes fixos.
      v_credits := NEW.credits_amount;
    ELSE
      -- Não deveria ser possível chegar aqui -- invoices_package_id_matches_type_check
      -- já garante que uma fatura de créditos tem sempre um dos dois.
      RAISE EXCEPTION 'invoice % marcada como paga do tipo creditos mas não tem package_id nem credits_amount', NEW.id;
    END IF;

    INSERT INTO public.organization_ai_credits (organization_id, balance_credits, updated_at)
    VALUES (NEW.organization_id, v_credits, now())
    ON CONFLICT (organization_id) DO UPDATE
      SET balance_credits = public.organization_ai_credits.balance_credits + EXCLUDED.balance_credits,
          updated_at = now();

    -- Regista o momento do pagamento, se ainda não vier preenchido pelo caller.
    IF NEW.paid_at IS NULL THEN
      NEW.paid_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_credit_org_on_invoice_paid() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_credit_org_on_invoice_paid() TO service_role;
-- Trigger trg_credit_org_on_invoice_paid já existe (20261112390000) e
-- aponta para esta função por nome -- não precisa de ser recriado.

-- ------------------------------------------------------------
-- 5. fn_check_and_consume_ai_credits -- RPC crítica de billing/segurança
-- ------------------------------------------------------------
-- Verifica se uma organização pode consumir `_amount` créditos de IA e,
-- se puder, consome-os de imediato (verificação + consumo são atómicos:
-- não existe um "check" separado do "consume", precisamente para evitar
-- que dois pedidos concorrentes verifiquem "ainda há espaço" ao mesmo
-- tempo e ambos avancem, ultrapassando o limite -- race condition
-- classuca de billing/rate-limiting).
--
-- Ordem de consumo: 1) limite mensal do plano (plan_limits.limit_value
-- para limit_type='ai_credits', consumo acumulado em
-- organization_usage_counters); 2) se o plano não chegar, o resto sai do
-- saldo comprado (organization_ai_credits.balance_credits). Operação
-- tudo-ou-nada: se a soma de ambos não cobrir _amount, NADA é alterado.
--
-- SEGURANÇA CONTRA RACE CONDITIONS: esta função faz
-- `SELECT ... FOR UPDATE` na linha de organization_usage_counters do mês
-- corrente e, quando necessário, também na linha de
-- organization_ai_credits da organização, ANTES de decidir se bloqueia ou
-- não. Estes locks ficam retidos até ao fim da transação do caller (uma
-- chamada RPC única = uma transação implícita), pelo que uma segunda
-- chamada concorrente para a mesma organização espera pela primeira antes
-- de ler used_value/balance_credits -- garante serialização por
-- organização e elimina a janela de corrida "check-then-act". A ordem de
-- lock (counters sempre antes de credits) é fixa em todos os caminhos do
-- código, para nunca criar deadlocks entre chamadas concorrentes.
--
-- "Plano ativo": trata a AUSÊNCIA de linha em organization_subscriptions,
-- bem como um status fora de ('trialing','active') ou um trial já
-- expirado, como bloqueado por defeito (nunca assume ilimitado) -- mesma
-- noção de "acesso ativo" já usada em org_has_active_access
-- (20261111040000), aplicada aqui à letra ao consumo de créditos.
-- Do mesmo modo, a ausência de uma linha em plan_limits para o plano da
-- organização é tratada como bloqueado (nunca ilimitado por omissão) --
-- só limit_value explicitamente NULL é que significa ilimitado.
--
-- GRANT: só service_role pode executar -- esta função nunca deve ser
-- chamada diretamente pelo cliente (authenticated/anon), só por uma Edge
-- Function/backend que decide se um pedido de IA pode avançar.
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
  v_plan               text;
  v_status              text;
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

  -- 1. Plano ativo da organização. Sem linha, sem status ativo, ou trial
  --    expirado -> bloqueado por defeito (nunca ilimitado por omissão).
  SELECT plan, status, trial_ends_at
    INTO v_plan, v_status, v_trial_ends_at
    FROM public.organization_subscriptions
    WHERE organization_id = _organization_id;

  IF NOT FOUND
     OR v_status NOT IN ('trialing', 'active')
     OR (v_trial_ends_at IS NOT NULL AND v_trial_ends_at <= now()) THEN
    RETURN jsonb_build_object('blocked', true, 'reason', 'no_active_subscription');
  END IF;

  -- 2. Limite de ai_credits configurado para este plano. Sem linha em
  --    plan_limits -> bloqueado (configuração em falta, nunca ilimitado).
  SELECT limit_value INTO v_limit_value
    FROM public.plan_limits
    WHERE plan = v_plan AND limit_type = 'ai_credits';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('blocked', true, 'reason', 'no_plan_limit_configured');
  END IF;

  -- 3. Garante que existe a linha de consumo do mês corrente e trava-a
  --    (FOR UPDATE) -- serializa chamadas concorrentes à mesma organização.
  INSERT INTO public.organization_usage_counters (organization_id, limit_type, period_start, used_value)
  VALUES (_organization_id, 'ai_credits', v_period_start, 0)
  ON CONFLICT (organization_id, limit_type, period_start) DO NOTHING;

  SELECT used_value INTO v_used_value
    FROM public.organization_usage_counters
    WHERE organization_id = _organization_id
      AND limit_type = 'ai_credits'
      AND period_start = v_period_start
    FOR UPDATE;

  -- 4. Plano ilimitado (limit_value NULL, ex: enterprise): incrementa o
  --    contador só para efeitos de reporting, nunca bloqueia.
  IF v_limit_value IS NULL THEN
    UPDATE public.organization_usage_counters
      SET used_value = used_value + _amount, updated_at = now()
      WHERE organization_id = _organization_id
        AND limit_type = 'ai_credits'
        AND period_start = v_period_start;

    RETURN jsonb_build_object('blocked', false, 'source', 'plan');
  END IF;

  -- 5. Quanto ainda cabe no limite mensal do plano.
  v_remaining_plan := GREATEST(v_limit_value - v_used_value, 0);

  IF v_remaining_plan >= _amount THEN
    UPDATE public.organization_usage_counters
      SET used_value = used_value + _amount, updated_at = now()
      WHERE organization_id = _organization_id
        AND limit_type = 'ai_credits'
        AND period_start = v_period_start;

    RETURN jsonb_build_object('blocked', false, 'source', 'plan');
  END IF;

  -- 6. O plano não chega -- tenta cobrir o resto com o saldo comprado.
  --    Lock da linha de saldo (mesma ordem em todos os caminhos: counters
  --    sempre antes de credits, para nunca haver deadlock entre chamadas).
  v_needed_from_balance := _amount - v_remaining_plan;

  SELECT balance_credits INTO v_balance
    FROM public.organization_ai_credits
    WHERE organization_id = _organization_id
    FOR UPDATE;

  IF NOT FOUND THEN
    -- Organização nunca comprou créditos -> saldo 0.
    v_balance := 0;
  END IF;

  IF v_balance < v_needed_from_balance THEN
    -- Tudo-ou-nada: nada foi alterado (só locks foram tomados), por isso
    -- é seguro devolver bloqueado sem precisar de desfazer nada.
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
    WHERE organization_id = _organization_id
      AND limit_type = 'ai_credits'
      AND period_start = v_period_start;

  UPDATE public.organization_ai_credits
    SET balance_credits = balance_credits - v_needed_from_balance, updated_at = now()
    WHERE organization_id = _organization_id;

  v_source := CASE WHEN v_remaining_plan = 0 THEN 'balance' ELSE 'plan+balance' END;

  RETURN jsonb_build_object('blocked', false, 'source', v_source);
END;
$$;

-- Chamável só por service_role -- nunca pelo cliente autenticado/anónimo.
REVOKE ALL ON FUNCTION public.fn_check_and_consume_ai_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_and_consume_ai_credits(uuid, integer) TO service_role;

-- ------------------------------------------------------------
-- 6. Manutenção mensal: purga de organization_usage_counters antigos
-- ------------------------------------------------------------
-- Mesmo padrão defensivo de purge_old_account_changes()
-- (20261110270000): SECURITY DEFINER, search_path fixo, REVOKE ALL, e
-- agendamento via pg_cron dentro de um DO block que verifica primeiro se
-- a extensão está instalada, para nunca falhar esta migration em
-- ambientes sem pg_cron.
--
-- Janela de retenção: 12 meses. organization_usage_counters é reporting
-- de consumo mensal, não é um registo fiscal/legal como invoices -- 12
-- meses (um ciclo anual completo) é suficiente para qualquer análise de
-- consumo histórico razoável, sem crescer a tabela indefinidamente.
--
-- Agendamento: dia 1 de cada mês às 03:30 -- depois de purge-login-attempts
-- (03:00) e purge-otp-codes (03:15) de 20261105020000_data_retention_policy.sql,
-- e depois de purge-account-changes (03:20) de 20261110270000 -- espaçado
-- dos jobs diários existentes e coerente com a cadência mensal deste job.
CREATE OR REPLACE FUNCTION "public"."purge_old_usage_counters"()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  DELETE FROM "public"."organization_usage_counters"
  WHERE "period_start" < (date_trunc('month', now()) - interval '12 months')::date;
$$;

REVOKE ALL ON FUNCTION "public"."purge_old_usage_counters"() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purge-usage-counters')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-usage-counters');

    PERFORM cron.schedule(
      'purge-usage-counters',
      '30 3 1 * *',
      $cron$SELECT public.purge_old_usage_counters()$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron registration is best-effort; never fail the migration.
  NULL;
END;
$$;
