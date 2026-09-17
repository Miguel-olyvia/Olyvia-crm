-- Plano 'internal' (sem teto em nada) + preenchimento automático de
-- organization_subscriptions para qualquer organização que hoje não
-- tenha nenhuma -- para que ligar o trigger de limite de leads (migration
-- seguinte) não bloqueie o trabalho da própria equipa/organizações de
-- teste, que hoje ficam sem nenhuma linha em organization_subscriptions
-- (ver 20261201300000, ponto 1).
-- ============================================================
-- 'internal' é distinto de 'enterprise' de propósito: enterprise tem os
-- números reais anunciados na página inicial (200 utilizadores / 5000
-- leads por mês) -- é um plano à venda, com teto real. 'internal' não é
-- vendido a ninguém, existe só para a organização não ficar bloqueada.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Permitir 'internal' nos dois CHECK constraints existentes
-- ------------------------------------------------------------
ALTER TABLE public.organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_plan_check;
ALTER TABLE public.organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_plan_check
    CHECK (plan IN ('trial', 'starter', 'pro', 'enterprise', 'internal'));

-- IF EXISTS: confirmado por leitura direta ao remoto (pg_constraint) que
-- plan_limits nunca teve uma constraint chamada plan_limits_plan_check --
-- só limit_value_check, pkey, plan_limit_type_key e reset_cadence_check
-- existem. O CHECK(plan IN (...)) desta tabela nunca chegou a ser criado
-- com esse nome (ou nome nenhum) no remoto, apesar de estar escrito na
-- migration original (20261112400000). IF EXISTS torna isto seguro nos
-- dois cenários possíveis, sem precisar de saber qual é o real.
ALTER TABLE public.plan_limits
  DROP CONSTRAINT IF EXISTS plan_limits_plan_check;
ALTER TABLE public.plan_limits
  ADD CONSTRAINT plan_limits_plan_check
    CHECK (plan IN ('trial', 'starter', 'pro', 'enterprise', 'internal'));

COMMENT ON CONSTRAINT organization_subscriptions_plan_check ON public.organization_subscriptions IS
  '''internal'' não é um plano à venda -- existe só para organizações da própria equipa/de teste terem uma subscrição válida (sem teto em nada), em vez de ficarem sem linha nenhuma em organization_subscriptions e bloqueadas pelas funções de verificação de limite.';

-- ------------------------------------------------------------
-- 2. plan_limits para 'internal' -- NULL em tudo (ilimitado)
-- ------------------------------------------------------------
INSERT INTO public.plan_limits (plan, limit_type, limit_value, reset_cadence)
VALUES
  ('internal', 'ai_credits', NULL, 'monthly'),
  ('internal', 'users',      NULL, 'none'),
  ('internal', 'leads',      NULL, 'monthly')
ON CONFLICT (plan, limit_type) DO NOTHING;

-- ------------------------------------------------------------
-- 3. Backfill: qualquer organização sem organization_subscriptions
--    passa a ter uma, plan='internal' -- dinâmico, sem nenhum id
--    codificado à mão, cobre as que existem hoje e continuaria a cobrir
--    quaisquer outras que apareçam antes desta migration correr.
-- ------------------------------------------------------------
INSERT INTO public.organization_subscriptions (organization_id, plan, status, created_by)
SELECT o.id, 'internal', 'active', o.created_by
FROM public.anew_organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_subscriptions s
  WHERE s.organization_id = o.id
)
ON CONFLICT (organization_id) DO NOTHING;

COMMENT ON TABLE public.organization_subscriptions IS
  'Uma linha por organização (organization_id UNIQUE). Toda organização passa a ter sempre uma linha aqui a partir desta migration -- as que não tinham nenhuma (work orgs criadas por rpc_create_organization_with_hierarchy, antes desta correção) foram preenchidas com plan=''internal'' pelo backfill acima. fn_check_and_consume_ai_credits/fn_check_and_consume_lead_quota/fn_check_user_seat_limit continuam a tratar a AUSÊNCIA de linha como bloqueado -- essa rede de segurança fica, só deixou de haver organizações órfãs no estado atual.';
