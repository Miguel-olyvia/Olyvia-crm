-- 26/11/2026 (Rúben: «Sim, configura»): o chat da Olyvia (ai-assistant) dava 402 «no_plan_limit_configured» na Mudelar.
-- fn_check_and_consume_ai_credits procura o limite 'ai_credits' do plano da subscrição; as organizações internas (Mudelar, Nike…) têm a
-- subscrição 'internal', que já tinha todos os outros limites ilimitados (quotes, proposals, contracts, users) mas não esta linha.
-- Mesmo caso e mesma solução de 20270104650000_plan_limits_internal_users.sql: junta a linha, ilimitada como as outras do plano
-- (o consumo continua a contar em organization_usage_counters, para relatório). Não altera linhas existentes nem outros planos.
-- Reversão: DELETE FROM public.plan_limits WHERE plan = 'internal' AND limit_type = 'ai_credits';

INSERT INTO public.plan_limits (plan, limit_type, limit_value, reset_cadence)
VALUES ('internal', 'ai_credits', NULL, 'monthly')
ON CONFLICT (plan, limit_type) DO NOTHING;

DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.plan_limits WHERE plan = 'internal' AND limit_type = 'ai_credits';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'plan_limits(internal, ai_credits): esperava-se 1 linha e há %.', v_n;
  END IF;
END $$;
