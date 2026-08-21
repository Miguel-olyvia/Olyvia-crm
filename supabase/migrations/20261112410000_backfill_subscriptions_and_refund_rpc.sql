-- Backfill de organization_subscriptions para organizações já existentes +
-- RPC fn_refund_ai_credits.
-- ============================================================
-- Esta migration assenta em cima de:
--   - 20261111040000_add_organization_subscriptions_trial.sql
--     (organization_subscriptions, sem backfill nenhum -- organizações
--     criadas antes desta tabela existir não têm nenhuma linha aqui)
--   - 20261112400000_plan_limits_and_ai_credit_usage.sql
--     (fn_check_and_consume_ai_credits trata a AUSÊNCIA de linha em
--     organization_subscriptions como "sem subscrição ativa" -> bloqueado)
--   - supabase/functions/_shared/aiCredits.ts
--     (refundAiCredits() já chama fn_refund_ai_credits(_organization_id,
--     _amount), que ainda não existe na BD -- criada agora)
--
-- Introduz:
--   1. Backfill de organization_subscriptions para todas as organizações
--      (anew_organizations) que ainda não têm linha nesta tabela --
--      evita que a wiring do bloqueio de créditos de IA (20261112400000)
--      corte de imediato o acesso de TODOS os clientes atuais no dia em
--      que for aplicada.
--   2. fn_refund_ai_credits -- RPC SECURITY DEFINER (só service_role) que
--      reverte (aproximadamente) um débito anterior de
--      fn_check_and_consume_ai_credits, para quando a chamada de IA
--      correspondente falha depois de o crédito já ter sido consumido.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Backfill de organization_subscriptions
-- ------------------------------------------------------------
-- NOTA DE NEGÓCIO / SEGURANÇA DE ROLLOUT: plan='enterprise' + status='active'
-- + trial_ends_at=NULL é um VALOR DE PARTIDA DELIBERADAMENTE PERMISSIVO
-- (enterprise tem limit_value NULL em plan_limits para 'ai_credits', ou
-- seja, sem bloqueio) -- garante que nenhuma organização já existente fica
-- bloqueada no dia em que fn_check_and_consume_ai_credits passar a ser
-- chamada a sério pelas Edge Functions de IA. NÃO é uma decisão de pricing
-- real: o negócio deve depois corrigir o `plan` (e o `status`) de cada
-- organização para o valor comercialmente correto com um simples
--   UPDATE organization_subscriptions SET plan = '...', status = '...'
--   WHERE organization_id = '...';
-- -- não precisa de nova migration para isso, tal como já documentado para
-- plan_limits em 20261112400000.
--
-- anew_organizations.id é a PK (confirmado em
-- 20260615130000_baseline_new_database.sql) -- é a coluna correta para
-- popular organization_subscriptions.organization_id.
--
-- WHERE ... NOT IN (SELECT organization_id FROM organization_subscriptions)
-- torna esta migration idempotente: só insere para organizações que ainda
-- não têm linha (nunca duplica nem sobrescreve uma subscrição já existente,
-- por exemplo uma criada por register-company para uma organização nova
-- entretanto).
INSERT INTO organization_subscriptions (
  organization_id, plan, status, trial_ends_at, current_period_end, created_at, updated_at
)
SELECT
  o.id, 'enterprise', 'active', NULL, NULL, now(), now()
FROM anew_organizations o
WHERE o.id NOT IN (SELECT organization_id FROM organization_subscriptions);

-- ------------------------------------------------------------
-- 2. fn_refund_ai_credits -- reversão (aproximada) de um débito anterior
-- ------------------------------------------------------------
-- Contraparte simétrica de fn_check_and_consume_ai_credits (20261112400000),
-- chamada por refundAiCredits() em supabase/functions/_shared/aiCredits.ts
-- quando checkAndConsumeAiCredits() já consumiu créditos (blocked: false)
-- mas a chamada de IA subsequente falhou (erro do gateway/provider) -- o
-- crédito já foi debitado antes de callAiGateway() sequer ser invocada, por
-- isso é preciso devolvê-lo.
--
-- APROXIMAÇÃO DELIBERADA: esta função NÃO rasteia a proveniência exacta do
-- débito original (não sabe se aquele débito específico veio do plano, do
-- saldo comprado, ou de ambos -- fn_check_and_consume_ai_credits não deixa
-- esse detalhe registado por chamada). Em vez disso, aplica a mesma regra
-- de prioridade em sentido inverso: devolve primeiro ao contador mensal do
-- plano (organization_usage_counters.used_value, até ao mínimo de 0) e só
-- credita a organization_ai_credits.balance_credits a diferença que não
-- coube aí. Isto é aceitável para o caso de uso (reembolso por falha de
-- uma chamada de IA), não é uma operação financeira crítica -- na prática
-- tende a devolver exactamente de onde veio, porque o mês corrente é o
-- mesmo em que o débito ocorreu.
--
-- ORDEM DE LOCK: igual à de fn_check_and_consume_ai_credits -- primeiro
-- SELECT ... FOR UPDATE na linha de organization_usage_counters do mês
-- corrente, só depois (se necessário) na linha de organization_ai_credits.
-- Manter esta ordem em todos os caminhos evita deadlocks entre chamadas
-- concorrentes de débito e reembolso para a mesma organização.
--
-- GRANT: só service_role pode executar -- nunca deve ser chamada
-- diretamente pelo cliente (authenticated/anon), só pelas Edge Functions
-- que já chamam fn_check_and_consume_ai_credits.
CREATE OR REPLACE FUNCTION public.fn_refund_ai_credits(
  _organization_id uuid,
  _amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start        date := date_trunc('month', now())::date;
  v_used_value          integer;
  v_refund_from_plan     integer;
  v_refund_to_balance    integer;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'fn_refund_ai_credits: _amount deve ser positivo (recebido %)', _amount;
  END IF;

  -- 1. Lock da linha de consumo do mês corrente (mesma ordem de
  --    fn_check_and_consume_ai_credits: counters antes de credits). Se não
  --    existir linha (nunca houve débito registado este mês para esta
  --    organização), não há nada para devolver ao plano -- tudo vai para o
  --    saldo comprado.
  SELECT used_value INTO v_used_value
    FROM public.organization_usage_counters
    WHERE organization_id = _organization_id
      AND limit_type = 'ai_credits'
      AND period_start = v_period_start
    FOR UPDATE;

  IF NOT FOUND THEN
    v_used_value := 0;
  END IF;

  -- 2. Nunca deixa used_value negativo: devolve no máximo o que estava
  --    consumido.
  v_refund_from_plan := LEAST(_amount, v_used_value);
  v_refund_to_balance := _amount - v_refund_from_plan;

  IF v_refund_from_plan > 0 THEN
    UPDATE public.organization_usage_counters
      SET used_value = used_value - v_refund_from_plan, updated_at = now()
      WHERE organization_id = _organization_id
        AND limit_type = 'ai_credits'
        AND period_start = v_period_start;
  END IF;

  -- 3. Diferença (_amount que não coube no contador do plano) vai para o
  --    saldo comprado. Lock explícito da linha antes do upsert, para
  --    manter a mesma ordem de lock (counters já travado acima, credits
  --    agora) mesmo quando a linha já existe.
  IF v_refund_to_balance > 0 THEN
    PERFORM 1 FROM public.organization_ai_credits
      WHERE organization_id = _organization_id
      FOR UPDATE;

    INSERT INTO public.organization_ai_credits (organization_id, balance_credits, updated_at)
    VALUES (_organization_id, v_refund_to_balance, now())
    ON CONFLICT (organization_id) DO UPDATE
      SET balance_credits = public.organization_ai_credits.balance_credits + EXCLUDED.balance_credits,
          updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'refunded_from_plan', v_refund_from_plan,
    'refunded_to_balance', v_refund_to_balance
  );
END;
$$;

-- Chamável só por service_role -- nunca pelo cliente autenticado/anónimo.
REVOKE ALL ON FUNCTION public.fn_refund_ai_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_refund_ai_credits(uuid, integer) TO service_role;
