-- Preenche plan_pricing.price_eur para os planos "pro" e "enterprise", que
-- ficaram a NULL desde a criação da tabela (20261112420000_stripe_checkout_readiness.sql).
-- Enquanto NULL, stripe-create-checkout-session recusa qualquer upgrade para
-- estes planos com { error: "plan_pricing_not_configured" }.
--
-- Valores alinhados com os já mostrados (hardcoded) na Landing page
-- (src/pages/Landing.tsx) para não haver divergência entre o preço anunciado
-- publicamente e o preço realmente cobrado no checkout.
UPDATE public.plan_pricing SET price_eur = 119, updated_at = now() WHERE plan = 'pro';
UPDATE public.plan_pricing SET price_eur = 199, updated_at = now() WHERE plan = 'enterprise';
