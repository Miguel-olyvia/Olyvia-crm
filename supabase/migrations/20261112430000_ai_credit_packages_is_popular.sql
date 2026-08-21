-- ai_credit_packages: adicionar coluna is_popular (destaque no catálogo)
-- ============================================================
-- Adiciona uma flag simples de destaque comercial ("mais popular") ao
-- catálogo de pacotes de créditos de IA (ver
-- 20261112390000_ai_credits_packages_and_invoices.sql para o schema
-- original e as regras de segurança column-level já em vigor).
--
-- `is_popular` não é sensível (ao contrário de `cost_real`), por isso é
-- incluída no GRANT column-level de SELECT para `authenticated`, tal
-- como as restantes colunas públicas do catálogo. `cost_real` continua
-- deliberadamente excluída.
-- ============================================================

ALTER TABLE public.ai_credit_packages
  ADD COLUMN is_popular boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ai_credit_packages.is_popular IS
  'Flag de destaque comercial ("mais popular") no ecrã de compra de créditos. Não sensível -- incluída no GRANT column-level para authenticated.';

UPDATE public.ai_credit_packages
  SET is_popular = true
  WHERE name = 'Standard';

-- GRANT column-level: reemitir com a lista completa de colunas públicas
-- incluindo a nova `is_popular`. `cost_real` continua excluída -- só
-- service_role tem acesso a essa coluna (GRANT ALL já concedido em
-- 20261112390000_ai_credits_packages_and_invoices.sql).
GRANT SELECT (id, name, credits, price_sale, active, created_at, is_popular)
  ON public.ai_credit_packages TO authenticated;
