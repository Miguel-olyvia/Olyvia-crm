-- AI credit packages + invoices (plano | creditos) -- Fase 1, SEM Stripe
-- ============================================================
-- Esta migration introduz o modelo de dados para:
--   1. Catálogo de pacotes de créditos de IA (ai_credit_packages)
--   2. Saldo de créditos de IA por organização (organization_ai_credits)
--   3. Faturas de plano ou de créditos (invoices)
--
-- Deliberadamente SEM integração Stripe: não há checkout automático nesta
-- fase. Uma compra de créditos (ou de plano) fica registada como uma
-- fatura com status = 'pendente'. A transição de status para 'pago' só
-- deve acontecer mais tarde, através da futura Edge Function que recebe o
-- webhook do Stripe, correndo com service_role -- exatamente o mesmo
-- padrão de confiança já usado em
-- 20261110150000_billing_accounts_stripe_readiness.sql e
-- 20261111040000_add_organization_subscriptions_trial.sql (writes
-- sensíveis reservados a SECURITY DEFINER / service_role, nunca ao
-- cliente autenticado).
--
-- Regra de segurança deliberada: NENHUM membro de organização (incluindo
-- admins do lado do cliente) pode fazer UPDATE ao campo `status` de uma
-- fatura via RLS. Não existe, propositadamente, nenhuma policy de UPDATE
-- para o role `authenticated` na tabela `invoices` -- o default do RLS
-- (negar tudo o que não tem policy) já garante isto, mas fica aqui
-- documentado explicitamente para não ser "reencontrado" como bug no
-- futuro. Só o service_role (que faz bypass a RLS) poderá marcar uma
-- fatura como paga, e é essa transição que dispara o trigger que
-- credita `organization_ai_credits`.
--
-- `ai_credit_packages.cost_real` é o custo interno/margem administrativa
-- e NUNCA deve ser exposto ao cliente final. Como o RLS é ao nível da
-- linha (não da coluna), a proteção aqui é feita com GRANT ao nível da
-- coluna: o role `authenticated` recebe SELECT apenas nas colunas
-- públicas do catálogo, excluindo `cost_real`. Só o service_role tem
-- acesso à coluna `cost_real`.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ai_credit_packages -- catálogo de pacotes (dados fixos + seed)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_credit_packages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  credits    integer NOT NULL CHECK (credits > 0),
  cost_real  numeric(12,3) NOT NULL CHECK (cost_real >= 0),
  price_sale numeric(12,2) NOT NULL CHECK (price_sale >= 0),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_credit_packages IS
  'Catálogo de pacotes de créditos de IA disponíveis para compra. Dados fixos, geridos apenas via migration/service_role.';
COMMENT ON COLUMN public.ai_credit_packages.cost_real IS
  'Custo real interno do pacote (margem administrativa). NUNCA expor ao cliente final -- ver GRANT column-level abaixo.';
COMMENT ON COLUMN public.ai_credit_packages.price_sale IS
  'Preço de venda ao cliente, em EUR.';

ALTER TABLE public.ai_credit_packages ENABLE ROW LEVEL SECURITY;

-- Leitura pública dentro da app (qualquer utilizador autenticado) -- é o
-- catálogo de preços mostrado no ecrã de compra de créditos. Escrita só
-- via migration/service_role (sem policy de INSERT/UPDATE/DELETE para
-- authenticated).
CREATE POLICY "Authenticated can view credit packages"
  ON public.ai_credit_packages FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.ai_credit_packages FROM PUBLIC, anon, authenticated;
-- GRANT column-level: authenticated nunca recebe SELECT sobre cost_real.
GRANT SELECT (id, name, credits, price_sale, active, created_at)
  ON public.ai_credit_packages TO authenticated;
GRANT ALL ON public.ai_credit_packages TO service_role;

-- Seed dos 4 pacotes
INSERT INTO public.ai_credit_packages (name, credits, cost_real, price_sale, active)
VALUES
  ('Mini',     100,  0.246, 50,   true),
  ('Básico',   500,  1.23,  249,  true),
  ('Standard', 1000, 2.46,  450,  true),
  ('Pro',      5000, 12.32, 1000, true)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 2. organization_ai_credits -- saldo de créditos por organização
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_ai_credits (
  organization_id uuid PRIMARY KEY REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  balance_credits  integer NOT NULL DEFAULT 0 CHECK (balance_credits >= 0),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organization_ai_credits IS
  'Saldo atual de créditos de IA por organização. O saldo só é incrementado pelo trigger fn_credit_org_on_invoice_paid quando uma fatura de créditos passa a status=pago (service_role/futuro webhook Stripe). Nenhum cliente pode escrever aqui diretamente.';

ALTER TABLE public.organization_ai_credits ENABLE ROW LEVEL SECURITY;

-- Membros da organização só podem SELECT o seu próprio registo de saldo.
-- Mesmo padrão de "é membro ativo desta organização" usado em
-- organization_subscriptions_select (20261111040000).
CREATE POLICY "Org members can view their own ai credits balance"
  ON public.organization_ai_credits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.anew_memberships m
      WHERE m.organization_id = organization_ai_credits.organization_id
        AND m.user_id = (SELECT id FROM public.anew_users WHERE auth_user_id = auth.uid())
        AND m.status = 'active'
    )
  );

-- Sem policy de INSERT/UPDATE/DELETE para authenticated: o saldo só é
-- escrito pelo trigger (SECURITY DEFINER) ou diretamente por service_role.
REVOKE ALL ON public.organization_ai_credits FROM PUBLIC, anon;
GRANT SELECT ON public.organization_ai_credits TO authenticated;
GRANT ALL ON public.organization_ai_credits TO service_role;

-- ------------------------------------------------------------
-- 3. invoices -- faturas de plano ou de créditos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  type            text NOT NULL,
  package_id      uuid REFERENCES public.ai_credit_packages(id),
  amount          numeric(12,2) NOT NULL CHECK (amount >= 0),
  status          text NOT NULL DEFAULT 'pendente',
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  paid_at         timestamptz,
  CONSTRAINT invoices_type_check
    CHECK (type IN ('plano', 'creditos')),
  CONSTRAINT invoices_status_check
    CHECK (status IN ('pendente', 'pago', 'cancelado')),
  -- package_id só faz sentido (e é obrigatório) quando type='creditos';
  -- faturas de 'plano' não têm pacote de créditos associado.
  CONSTRAINT invoices_package_id_matches_type_check
    CHECK (
      (type = 'creditos' AND package_id IS NOT NULL)
      OR (type = 'plano' AND package_id IS NULL)
    )
);

COMMENT ON TABLE public.invoices IS
  'Faturas de plano ou de créditos de IA. status=pendente é o único valor que um membro de organização pode inserir. A transição para pago/cancelado é reservada a service_role (futuro webhook Stripe) -- não existe propositadamente nenhuma policy de UPDATE para authenticated nesta tabela; o default-deny do RLS cobre isso.';
COMMENT ON COLUMN public.invoices.status IS
  'pendente | pago | cancelado. Só service_role pode alterar este campo (sem policy de UPDATE para authenticated -- ver comentário da tabela).';

CREATE INDEX IF NOT EXISTS idx_invoices_organization_id ON public.invoices (organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices (status);
CREATE INDEX IF NOT EXISTS idx_invoices_package_id ON public.invoices (package_id) WHERE package_id IS NOT NULL;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- SELECT: membros ativos da organização veem as faturas da sua própria organização.
CREATE POLICY "Org members can view their own invoices"
  ON public.invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.anew_memberships m
      WHERE m.organization_id = invoices.organization_id
        AND m.user_id = (SELECT id FROM public.anew_users WHERE auth_user_id = auth.uid())
        AND m.status = 'active'
    )
  );

-- INSERT: membros ativos da organização podem criar uma fatura da sua
-- própria organização, mas só com status='pendente' e paid_at NULL --
-- nunca podem inserir já como paga.
CREATE POLICY "Org members can insert pending invoices for their org"
  ON public.invoices FOR INSERT
  WITH CHECK (
    status = 'pendente'
    AND paid_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.anew_memberships m
      WHERE m.organization_id = invoices.organization_id
        AND m.user_id = (SELECT id FROM public.anew_users WHERE auth_user_id = auth.uid())
        AND m.status = 'active'
    )
  );

-- Deliberadamente SEM policy de UPDATE nem DELETE para authenticated:
-- nenhum membro de organização (nem admin do cliente) pode alterar ou
-- apagar uma fatura, em particular o campo status. Só service_role
-- (bypassa RLS) poderá marcar uma fatura como 'pago' ou 'cancelado',
-- através da futura Edge Function do webhook Stripe.
REVOKE ALL ON public.invoices FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

-- ------------------------------------------------------------
-- 4. Trigger: fatura de créditos paga -> credita organization_ai_credits
-- ------------------------------------------------------------
-- Dispara quando uma fatura do tipo 'creditos' transita para
-- status='pago' (feito por service_role/futuro webhook Stripe, nunca
-- pelo cliente -- ver secção 3). Faz upsert em organization_ai_credits,
-- incrementando balance_credits pela quantidade de créditos do pacote
-- associado. SECURITY DEFINER para garantir a escrita independentemente
-- do caller (embora service_role já faça bypass a RLS).
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

    SELECT credits INTO v_credits
    FROM public.ai_credit_packages
    WHERE id = NEW.package_id;

    IF v_credits IS NULL THEN
      RAISE EXCEPTION 'invoice % marcada como paga mas package_id % não corresponde a um pacote válido', NEW.id, NEW.package_id;
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

DROP TRIGGER IF EXISTS trg_credit_org_on_invoice_paid ON public.invoices;
CREATE TRIGGER trg_credit_org_on_invoice_paid
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_credit_org_on_invoice_paid();
