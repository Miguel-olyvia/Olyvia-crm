-- Stripe checkout readiness -- schema-only preparation, SEM chamadas Stripe
-- ainda. Mesmo espírito de 20261110150000_billing_accounts_stripe_readiness.sql:
-- isto só prepara o modelo de dados para que a integração real (Edge
-- Functions stripe-create-checkout-session / stripe-webhook, criadas na
-- mesma leva de trabalho que esta migration) fique pronta a ligar assim que
-- os secrets STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET forem configurados.
-- ============================================================
-- Feature-flag automática, não "big bang": enquanto STRIPE_SECRET_KEY não
-- estiver configurado nos secrets do Supabase, o fluxo continua a ser
-- exatamente o atual -- inserir uma linha em `invoices` com
-- status='pendente' (o mesmo que PlanoFaturacaoCard.tsx já faz hoje, agora
-- replicado dentro de stripe-create-checkout-session/index.ts como "modo
-- manual"). Nenhuma coluna nem tabela introduzida aqui é NOT NULL nem tem
-- efeito enquanto não for preenchida -- este ALTER/CREATE é 100% aditivo e
-- não altera nenhum comportamento existente por si só.
--
-- Introduz:
--   1. ai_credit_packages.stripe_price_id -- Price pré-criado no Stripe
--      Dashboard para um pacote (opcional; ver comentário na coluna).
--   2. invoices.stripe_checkout_session_id / stripe_payment_intent_id --
--      correlação com a Stripe Checkout Session/PaymentIntent que originou
--      o pagamento.
--   3. Índice único parcial em invoices.stripe_checkout_session_id -- o
--      Stripe pode reenviar o mesmo evento de webhook mais que uma vez
--      (retries são comportamento normal e documentado da Stripe); este
--      índice é a rede de segurança ao nível da BD para nunca processar a
--      mesma sessão de checkout duas vezes, mesmo que o webhook falhe em
--      ser idempotente por algum motivo (ver também a verificação de
--      status='pago' feita explicitamente em stripe-webhook/index.ts).
--   4. plan_pricing -- catálogo de preços mensais por plano, para o
--      checkout de upgrade de plano.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ai_credit_packages.stripe_price_id
-- ------------------------------------------------------------
-- Não fazia parte do catálogo original (20261112390000) porque nessa altura
-- não havia integração Stripe nenhuma. Necessário agora para que
-- stripe-create-checkout-session possa usar um Price fixo já criado no
-- Stripe Dashboard, quando existir, em vez de construir sempre um
-- `price_data` inline a partir de price_sale.
ALTER TABLE public.ai_credit_packages
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

COMMENT ON COLUMN public.ai_credit_packages.stripe_price_id IS
  'Price ID pré-criado no Stripe Dashboard para este pacote (ex: price_1AbC...). Opcional -- se NULL, stripe-create-checkout-session constrói um price_data inline a partir de price_sale, sem precisar de nada criado manualmente no Stripe. Só relevante quando STRIPE_SECRET_KEY estiver configurado. Não exposto a `authenticated` (GRANT column-level de 20261112390000 mantém-se sem alteração) -- só as Edge Functions com client service_role o leem.';

-- ------------------------------------------------------------
-- 2. invoices -- correlação com Stripe Checkout Session / PaymentIntent
-- ------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

COMMENT ON COLUMN public.invoices.stripe_checkout_session_id IS
  'ID da Stripe Checkout Session criada para esta fatura (cs_...), gravado por stripe-create-checkout-session no momento da criação. NULL para faturas do fluxo manual (Stripe não configurado) e para faturas antigas anteriores a esta migration. Usado por stripe-webhook para localizar a fatura correta em checkout.session.completed -- ver índice único abaixo.';
COMMENT ON COLUMN public.invoices.stripe_payment_intent_id IS
  'ID do PaymentIntent Stripe (pi_...) associado ao pagamento desta fatura, gravado por stripe-webhook quando checkout.session.completed é processado. Puramente informativo/auditoria -- não é usado para nenhuma lógica de correspondência (essa é feita por stripe_checkout_session_id).';

-- ------------------------------------------------------------
-- 3. Índice único parcial -- proteção contra reprocessar a mesma sessão
-- ------------------------------------------------------------
-- WHERE stripe_checkout_session_id IS NOT NULL: obrigatório porque a
-- esmagadora maioria das faturas (todo o histórico até agora, e todas as
-- do fluxo manual enquanto Stripe não estiver configurado) tem este campo
-- NULL -- um índice único "normal" bloquearia a segunda fatura NULL logo
-- na primeira inserção.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_stripe_checkout_session_id
  ON public.invoices (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- ------------------------------------------------------------
-- 4. plan_pricing -- catálogo de preços mensais por plano
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_pricing (
  plan            text PRIMARY KEY,
  price_eur       numeric(12,2),
  stripe_price_id text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_pricing_plan_check
    CHECK (plan IN ('trial', 'starter', 'pro', 'enterprise')),
  CONSTRAINT plan_pricing_price_eur_check
    CHECK (price_eur IS NULL OR price_eur >= 0)
);

COMMENT ON TABLE public.plan_pricing IS
  'Preço mensal (EUR) por plano, usado por stripe-create-checkout-session para o upgrade de plano via Stripe Checkout (mode=subscription). Dados de configuração de negócio, geridos apenas via migration/service_role -- mesmo padrão de plan_limits (20261112400000): sem policy de escrita para authenticated, um simples UPDATE basta para mudar valores, não precisa de nova migration.';
COMMENT ON COLUMN public.plan_pricing.price_eur IS
  'Preço mensal em EUR. NULL até o negócio definir o valor -- enquanto NULL, stripe-create-checkout-session recusa o upgrade para este plano com { error: "plan_pricing_not_configured" } em vez de criar uma fatura ou sessão de checkout com preço indefinido. Preencher com: UPDATE plan_pricing SET price_eur = ..., updated_at = now() WHERE plan = ...;';
COMMENT ON COLUMN public.plan_pricing.stripe_price_id IS
  'Price ID pré-criado no Stripe Dashboard para a subscrição mensal deste plano (ex: price_1AbC...). Opcional -- se NULL, o checkout usa um price_data inline (recurring, interval=month) calculado a partir de price_eur, sem precisar de nada criado manualmente no Stripe Dashboard.';

ALTER TABLE public.plan_pricing ENABLE ROW LEVEL SECURITY;

-- Leitura pública dentro da app (qualquer utilizador autenticado) -- a UI
-- de upgrade de plano precisa de mostrar os preços. Escrita só via
-- migration/service_role.
CREATE POLICY "Authenticated can view plan pricing"
  ON public.plan_pricing FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.plan_pricing FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.plan_pricing TO authenticated;
GRANT ALL ON public.plan_pricing TO service_role;

-- Seed: só 'starter' tem preço definido (valor já mencionado pelo negócio).
-- 'trial' fica NULL de propósito (não é um plano comprável via Stripe --
-- é atribuído automaticamente no signup, nunca via checkout). 'pro' e
-- 'enterprise' ficam NULL até o negócio decidir o preço -- ver comentário
-- em price_eur acima para o UPDATE necessário antes de ativar o upgrade
-- para esses planos via Stripe.
INSERT INTO public.plan_pricing (plan, price_eur)
VALUES
  ('trial',      NULL),
  ('starter',    79),
  ('pro',        NULL),
  ('enterprise', NULL)
ON CONFLICT (plan) DO NOTHING;
