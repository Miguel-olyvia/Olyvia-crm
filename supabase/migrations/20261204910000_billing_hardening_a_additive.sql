
-- Endurecimento da faturação, PARTE A (aditiva): tudo resolve pelo
-- UTILIZADOR-RAIZ PAGADOR, nunca por uma organização isolada.
-- ============================================================
-- ATENÇÃO -- ESTA PARTE NÃO SAI SOZINHA. É SÓ ADITIVA (colunas, tabelas e
-- funções novas, funções substituídas com o mesmo contrato, triggers), mas o
-- código novo depende dela e a parte B (20261204920000) depende do código novo.
--
-- ORDEM SEGURA DE PUBLICAÇÃO (não saltar passos):
--   1. Esta migration A (db push).
--   2. Edge Function stripe-webhook, IMEDIATAMENTE seguida de
--      stripe-create-checkout-session e stripe-create-portal-session (as três
--      falam o mesmo contrato: invoices.target_plan, stripe_webhook_events,
--      credits_credited / credited_organization_id, estado 'expired').
--   3. As restantes Edge Functions.
--   4. O frontend novo (PlanoFaturacaoCard lê por fn_get_billing_overview, que
--      é criada aqui, e deixa de inserir faturas pelo browser).
--   5. SÓ DEPOIS a parte B (restritiva).
-- Publicar o código novo ANTES desta A falha em fn_get_billing_overview e em
-- invoices.target_plan. Esta A NÃO parte o frontend antigo.
--
-- Contrato com o webhook Stripe:
--   * fn_revoke_invoice_credits é o ÚNICO escritor de invoices.refunded_at e
--     retira exactamente invoices.credits_credited da organização
--     invoices.credited_organization_id (ambas preenchidas por
--     fn_credit_org_on_invoice_paid quando credita).
--   * stripe_webhook_events.claimed_at: o webhook reclama linhas 'processing'
--     com mais de 5 minutos.
--   * organization_subscriptions.status passa a aceitar 'expired'
--     (fn_expire_trials existe aqui; o agendamento diário vai na parte B).
--
-- created_by (raiz do pagador): trg_protect_created_by só deixa postgres /
-- service_role (e RPCs SECURITY DEFINER, que correm como o dono) alterar
-- created_by em anew_users e anew_organizations; qualquer outro papel recebe
-- uma excepção. Único fluxo legítimo de alteração posterior encontrado:
-- bootstrap_org_creator (baseline, SECURITY DEFINER) troca
-- anew_organizations.created_by de auth.uid() para o id de anew_users; há uma
-- excepção estreita para esse mesmo caso. Nenhum fluxo altera
-- anew_users.created_by depois do INSERT.
-- NÃO foi adicionado trigger de INSERT que force created_by: ver relatório
-- (self-registration insere created_by NULL de propósito; finalize_user_profile
-- insere p_actor_id; auto_link_tenant_creator grava auth.uid()).
--
-- Papel 'client': a isenção de lugares usa APENAS o papel global (code='client',
-- organization_id IS NULL, is_system). Esta migration falha se existir um papel
-- global 'client' que não seja is_system.
--
-- Seat trigger: uma organização sem NENHUMA linha em organization_subscriptions
-- (work orgs novas, sem dono ligado) não é bloqueada -- é removido quando a
-- migration de dados ligar a propriedade. Organizações COM linha expirada /
-- past_due / acima do limite continuam a bloquear.
--
-- Funções novas nesta parte ficam só para service_role já aqui (não existem no
-- frontend antigo). Os REVOKE de funções/tabelas já existentes ficam na B.
--
-- Funções substituídas (versão mais recente lida antes de cada uma):
--   fn_refund_ai_credits(uuid,integer)  <- 20261112410000
--   fn_credit_org_on_invoice_paid()     <- 20261112400000
--   fn_check_user_seat_limit(uuid)      <- 20261201300000
--   fn_get_plan_usage_summary(uuid)     <- 20261201350000
--   resolve_billing_organization_id(uuid) <- 20261201300000 (só a ordenação)
--
-- Forward-only e re-executável. Não toca em nenhuma base local.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Funções auxiliares e de contagem de lugares
-- ------------------------------------------------------------

-- Organizações que resolvem para uma dada organização de faturação. Percorre
-- anew_organizations (mesma nota de desempenho de 20261201300000: aceitável
-- com poucas work orgs por conta).
CREATE OR REPLACE FUNCTION public.fn_list_billing_organization_ids(
  _billing_org uuid
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id
    FROM public.anew_organizations o
    WHERE _billing_org IS NOT NULL
      AND public.resolve_billing_organization_id(o.id) = _billing_org;
$$;

COMMENT ON FUNCTION public.fn_list_billing_organization_ids(uuid) IS
  'Ids das organizações cuja organização de faturação resolvida é _billing_org (inclui a própria). Só service_role / funções SECURITY DEFINER.';

-- resolve_billing_organization_id -- igual a 20261201300000; muda só a
-- ordenação para ser determinista (created_at, id). O fallback para a
-- própria organização mantém-se (decisão pendente de medição).
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
  v_root_user_id   uuid;
  v_billing_org_id uuid;
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_root_user_id := public.resolve_root_payer_user_id(p_organization_id);

  IF v_root_user_id IS NULL THEN
    RETURN p_organization_id;
  END IF;

  SELECT organization_id INTO v_billing_org_id
    FROM public.organization_subscriptions
    WHERE created_by = v_root_user_id
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

  RETURN COALESCE(v_billing_org_id, p_organization_id);
END;
$$;

CREATE INDEX IF NOT EXISTS idx_organization_subscriptions_created_by_created_at
  ON public.organization_subscriptions (created_by, created_at);

-- Papel global 'client' (contas de portal). Só o papel de sistema global
-- isenta lugares: um papel de organização com code='client' não conta.
CREATE OR REPLACE FUNCTION public.fn_billing_client_role_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id
    FROM public.anew_roles r
    WHERE r.code = 'client'
      AND r.organization_id IS NULL
      AND r.is_system IS TRUE
    ORDER BY r.created_at ASC NULLS LAST, r.id ASC
    LIMIT 1;
$$;

COMMENT ON FUNCTION public.fn_billing_client_role_id() IS
  'Id do papel global de sistema code=client (contas de portal), ou NULL se não existir. Única fonte da isenção de lugares.';

-- O seed do papel 'client' não está em nenhuma migration (foi criado fora).
-- Falha alto se existir um papel global 'client' que não seja is_system --
-- nesse caso a isenção nunca se aplicaria e os contactos de portal
-- passariam a ocupar lugares. Sem nenhum papel 'client': só aviso.
DO $do$
BEGIN
  IF public.fn_billing_client_role_id() IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.anew_roles WHERE code = 'client' AND organization_id IS NULL) THEN
      RAISE EXCEPTION 'billing_hardening: existe um papel global client mas is_system não é true; corrigir antes de aplicar (senão as contas de portal ocupariam lugares)';
    ELSE
      RAISE WARNING 'billing_hardening: não existe papel global de sistema client; nenhuma membership será isenta de lugares';
    END IF;
  END IF;
END;
$do$;

-- Lugares ocupados numa conta: utilizadores DISTINTOS com membership activa
-- e papel diferente do papel global client, em qualquer organização que
-- resolva para esta organização de faturação. _exclude_user opcional: exclui
-- esse utilizador da contagem (usado pelo trigger).
CREATE OR REPLACE FUNCTION public.fn_count_billing_seats(
  _billing_org uuid,
  _exclude_user uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(DISTINCT m.user_id)::integer
    FROM public.anew_memberships m
    WHERE m.status = 'active'
      AND m.role_id IS DISTINCT FROM public.fn_billing_client_role_id()
      AND m.user_id IS DISTINCT FROM _exclude_user
      AND m.organization_id IN (SELECT public.fn_list_billing_organization_ids(_billing_org));
$$;

COMMENT ON FUNCTION public.fn_count_billing_seats(uuid, uuid) IS
  'Número de utilizadores distintos com membership activa e papel diferente do papel global client nas organizações desta conta de faturação, opcionalmente sem contar _exclude_user.';

-- Verificação de lotação: bloqueia se (lugares sem _exclude_user) + 1 excede
-- o limite. fn_check_user_seat_limit(uuid) é o caso sem exclusão.
CREATE OR REPLACE FUNCTION public.fn_check_seat_limit_excluding(
  _organization_id uuid,
  _exclude_user uuid
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

  v_active_seats := public.fn_count_billing_seats(v_billing_org_id, _exclude_user);

  IF v_active_seats + 1 > v_limit_value THEN
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

-- fn_check_user_seat_limit -- mesmo contrato de 20261201300000 (assinatura e
-- forma do retorno); delega em fn_check_seat_limit_excluding sem exclusão.
CREATE OR REPLACE FUNCTION public.fn_check_user_seat_limit(
  _organization_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.fn_check_seat_limit_excluding(_organization_id, NULL);
$$;

-- fn_get_plan_usage_summary -- igual a 20261201350000; só a contagem de
-- users muda (fn_count_billing_seats). COALESCE no agregado para o caso de
-- plano sem nenhum limite com contador (jsonb_agg de vazio dá NULL).
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

  -- Membro activo e não-portal (papel global client) desta organização.
  SELECT EXISTS (
    SELECT 1 FROM public.anew_memberships m
    WHERE m.organization_id = _organization_id
      AND m.user_id = v_business_user_id
      AND m.status = 'active'
      AND m.role_id IS DISTINCT FROM public.fn_billing_client_role_id()
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

  SELECT balance_credits INTO v_balance
    FROM public.organization_ai_credits
    WHERE organization_id = v_billing_org_id;

  SELECT COALESCE(jsonb_agg(
    CASE WHEN elem->>'limit_type' = 'ai_credits'
      THEN elem || jsonb_build_object('balance_credits', COALESCE(v_balance, 0))
      ELSE elem
    END
  ), '[]'::jsonb) INTO v_limits
  FROM jsonb_array_elements(v_limits) elem;

  SELECT limit_value INTO v_users_limit_value
    FROM public.plan_limits
    WHERE plan = v_plan AND limit_type = 'users';

  IF FOUND THEN
    v_active_seats := public.fn_count_billing_seats(v_billing_org_id);

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
  'Leitura, para o ecrã: consumo atual vs. teto de cada limite (ai_credits, leads, users, proposals, quotes, contracts) da organização de faturação resolvida a partir de _organization_id. Utilizadores = lugares distintos sem contas de portal (fn_count_billing_seats). Nunca escreve nem consome quota. Verifica que o chamador é membro ativo de _organization_id; devolve {"error": ...} quando não é.';

-- ------------------------------------------------------------
-- 2. Trigger de lotação de utilizadores
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_user_seat_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_role uuid;
  v_billing     uuid;
  v_payer       uuid;
  v_result      jsonb;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  -- Só o papel global de sistema 'client' (contas de portal) não ocupa lugar.
  v_client_role := public.fn_billing_client_role_id();
  IF NEW.role_id IS NOT DISTINCT FROM v_client_role THEN
    RETURN NEW;
  END IF;

  -- UPDATE de uma linha que já ocupava lugar (activa, mesma org e utilizador,
  -- papel não-client) não consome lugar novo.
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'active'
     AND OLD.organization_id = NEW.organization_id
     AND OLD.user_id = NEW.user_id
     AND OLD.role_id IS DISTINCT FROM v_client_role THEN
    RETURN NEW;
  END IF;

  -- O pagador raiz nunca é bloqueado: no signup a subscrição existe antes de
  -- bootstrap_org_creator inserir a sua membership.
  v_payer := public.resolve_root_payer_user_id(NEW.organization_id);
  IF v_payer IS NOT NULL AND v_payer = NEW.user_id THEN
    RETURN NEW;
  END IF;

  v_billing := public.resolve_billing_organization_id(NEW.organization_id);

  -- Organização sem nenhuma linha em organization_subscriptions (work orgs
  -- novas nascem sem subscrição e sem dono ligado): não bloquear a criação nem
  -- a adição de membros. Removido quando a migration de dados ligar a
  -- propriedade. Linhas expiradas/past_due/acima do limite continuam a bloquear.
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_subscriptions s
    WHERE s.organization_id = v_billing
  ) THEN
    RETURN NEW;
  END IF;

  -- Serializa por conta: dois convites concorrentes não passam ambos o teto.
  PERFORM pg_advisory_xact_lock(hashtext('billing_seats'), hashtext(v_billing::text));

  -- Conta os lugares SEM este utilizador e exige que ele caiba (+1): quem já
  -- ocupa lugar noutra org da mesma conta não é contado duas vezes.
  v_result := public.fn_check_seat_limit_excluding(NEW.organization_id, NEW.user_id);

  IF COALESCE((v_result->>'blocked')::boolean, false) THEN
    RAISE EXCEPTION 'plan_limit_exceeded:users (%)', v_result->>'reason'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_enforce_user_seat_limit() IS
  'Trigger BEFORE INSERT/UPDATE OF status, role_id, organization_id, user_id em anew_memberships: bloqueia (plan_limit_exceeded:users) uma membership activa e não-client que excederia a lotação da conta de faturação (lugares sem este utilizador + 1 > limite). Ignora o papel global client e o pagador raiz.';

DROP TRIGGER IF EXISTS trg_enforce_user_seat_limit ON public.anew_memberships;
CREATE TRIGGER trg_enforce_user_seat_limit
  BEFORE INSERT OR UPDATE OF status, role_id, organization_id, user_id ON public.anew_memberships
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION public.fn_enforce_user_seat_limit();

-- created_by é a raiz da identidade do pagador: só um chamador de confiança o
-- pode alterar. Função SECURITY INVOKER de propósito, para current_user ser o
-- papel efectivo de quem faz o UPDATE (RPCs SECURITY DEFINER correm como o
-- dono e passam). O teste não depende do nome literal do dono: aceita quem é
-- membro do papel postgres, service_role / supabase_admin (current_user ou
-- session_user). Qualquer outro papel que tente ALTERAR created_by recebe uma
-- excepção (não uma reposição silenciosa).
-- Excepção estreita: bootstrap_org_creator troca created_by de auth.uid()
-- para o id de anew_users (só em anew_organizations).
CREATE OR REPLACE FUNCTION public.fn_protect_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NOT DISTINCT FROM OLD.created_by THEN
    RETURN NEW;
  END IF;

  IF pg_has_role(current_user, 'postgres', 'MEMBER')
     OR current_user IN ('service_role', 'supabase_admin')
     OR session_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'anew_organizations'
     AND auth.uid() IS NOT NULL
     AND OLD.created_by = auth.uid()
     AND NEW.created_by = (SELECT u.id FROM public.anew_users u WHERE u.auth_user_id = auth.uid()) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'created_by não pode ser alterado (%.created_by)', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_created_by ON public.anew_users;
CREATE TRIGGER trg_protect_created_by
  BEFORE UPDATE OF created_by ON public.anew_users
  FOR EACH ROW
  WHEN (NEW.created_by IS DISTINCT FROM OLD.created_by)
  EXECUTE FUNCTION public.fn_protect_created_by();

DROP TRIGGER IF EXISTS trg_protect_created_by ON public.anew_organizations;
CREATE TRIGGER trg_protect_created_by
  BEFORE UPDATE OF created_by ON public.anew_organizations
  FOR EACH ROW
  WHEN (NEW.created_by IS DISTINCT FROM OLD.created_by)
  EXECUTE FUNCTION public.fn_protect_created_by();

-- ------------------------------------------------------------
-- 3. Créditos de IA: reembolso e crédito por fatura na org de faturação
-- ------------------------------------------------------------

-- fn_refund_ai_credits -- igual a 20261112410000, mas resolve a organização
-- de faturação primeiro (o débito, desde 20261201300000, já é feito lá).
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
  v_billing_org_id      uuid;
  v_period_start        date := date_trunc('month', now())::date;
  v_used_value          integer;
  v_refund_from_plan    integer;
  v_refund_to_balance   integer;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'fn_refund_ai_credits: _amount deve ser positivo (recebido %)', _amount;
  END IF;

  v_billing_org_id := public.resolve_billing_organization_id(_organization_id);

  -- Mesma ordem de lock de fn_check_and_consume_ai_credits: counters antes
  -- de credits.
  SELECT used_value INTO v_used_value
    FROM public.organization_usage_counters
    WHERE organization_id = v_billing_org_id
      AND limit_type = 'ai_credits'
      AND period_start = v_period_start
    FOR UPDATE;

  IF NOT FOUND THEN
    v_used_value := 0;
  END IF;

  v_refund_from_plan := LEAST(_amount, v_used_value);
  v_refund_to_balance := _amount - v_refund_from_plan;

  IF v_refund_from_plan > 0 THEN
    UPDATE public.organization_usage_counters
      SET used_value = used_value - v_refund_from_plan, updated_at = now()
      WHERE organization_id = v_billing_org_id
        AND limit_type = 'ai_credits'
        AND period_start = v_period_start;
  END IF;

  IF v_refund_to_balance > 0 THEN
    PERFORM 1 FROM public.organization_ai_credits
      WHERE organization_id = v_billing_org_id
      FOR UPDATE;

    INSERT INTO public.organization_ai_credits (organization_id, balance_credits, updated_at)
    VALUES (v_billing_org_id, v_refund_to_balance, now())
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

-- fn_credit_org_on_invoice_paid -- igual a 20261112400000, mas credita a
-- organização de faturação resolvida a partir de NEW.organization_id.
CREATE OR REPLACE FUNCTION public.fn_credit_org_on_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits integer;
  v_billing_org_id uuid;
BEGIN
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
      v_credits := NEW.credits_amount;
    ELSE
      RAISE EXCEPTION 'invoice % marcada como paga do tipo creditos mas não tem package_id nem credits_amount', NEW.id;
    END IF;

    v_billing_org_id := public.resolve_billing_organization_id(NEW.organization_id);

    INSERT INTO public.organization_ai_credits (organization_id, balance_credits, updated_at)
    VALUES (v_billing_org_id, v_credits, now())
    ON CONFLICT (organization_id) DO UPDATE
      SET balance_credits = public.organization_ai_credits.balance_credits + EXCLUDED.balance_credits,
          updated_at = now();

    -- Guarda o que foi realmente creditado: fn_revoke_invoice_credits retira
    -- exactamente isto, mesmo que o catálogo de pacotes mude depois.
    NEW.credits_credited := v_credits;
    NEW.credited_organization_id := v_billing_org_id;

    IF NEW.paid_at IS NULL THEN
      NEW.paid_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 4. invoices: colunas Stripe, alvo do plano, tecto de créditos, refunded_at
-- ------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS target_plan text,
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS credits_credited integer,
  ADD COLUMN IF NOT EXISTS credited_organization_id uuid;

COMMENT ON COLUMN public.invoices.credited_organization_id IS
  'Organização de faturação que recebeu os créditos (resolve_billing_organization_id no momento do pagamento). fn_revoke_invoice_credits debita esta organização; NULL em faturas antigas (recorre então a resolve_billing_organization_id).';

-- Backfill (guardado): faturas de plano pendentes sem target_plan, criadas
-- pelo fluxo antigo com a descrição "Upgrade de plano: <plano>". Só os valores
-- starter/pro/enterprise; nunca sobrescreve um target_plan já preenchido.
UPDATE public.invoices
  SET target_plan = lower((regexp_match(description, 'Upgrade de plano: (starter|pro|enterprise)', 'i'))[1])
  WHERE target_plan IS NULL
    AND type = 'plano'
    AND status = 'pendente'
    AND description ~* 'Upgrade de plano: (starter|pro|enterprise)';

COMMENT ON COLUMN public.invoices.credits_credited IS
  'Créditos efectivamente creditados por fn_credit_org_on_invoice_paid quando a fatura passou a paga. NULL em faturas pagas antes desta coluna existir (fn_revoke_invoice_credits recorre então ao pacote/credits_amount).';

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_target_plan_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_target_plan_check
  CHECK (target_plan IS NULL OR target_plan IN ('starter', 'pro', 'enterprise'));

COMMENT ON COLUMN public.invoices.target_plan IS
  'Plano para que a fatura de type=plano faz upgrade (starter|pro|enterprise). NULL nas faturas de créditos.';
COMMENT ON COLUMN public.invoices.refunded_at IS
  'Momento em que os créditos desta fatura foram retirados por fn_revoke_invoice_credits. Garante idempotência do reembolso.';

DO $do$
DECLARE
  v_bad bigint;
BEGIN
  SELECT count(*) INTO v_bad FROM public.invoices WHERE credits_amount > 10000;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'billing_hardening: % faturas existentes têm credits_amount > 10000; corrigir esses dados antes de aplicar o tecto (invoices_credits_amount_max_check)', v_bad;
  END IF;
END;
$do$;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_credits_amount_max_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_credits_amount_max_check
  CHECK (credits_amount <= 10000) NOT VALID;
ALTER TABLE public.invoices
  VALIDATE CONSTRAINT invoices_credits_amount_max_check;

-- ------------------------------------------------------------
-- 5. stripe_webhook_events -- idempotência do webhook
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id     text PRIMARY KEY,
  type         text,
  status       text NOT NULL DEFAULT 'processing',
  error        text,
  received_at  timestamptz NOT NULL DEFAULT now(),
  claimed_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT stripe_webhook_events_status_check
    CHECK (status IN ('processing', 'processed', 'rejected', 'failed'))
);

-- Se a tabela já existia com outra forma, garante a coluna e o CHECK finais.
ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.stripe_webhook_events
  DROP CONSTRAINT IF EXISTS stripe_webhook_events_status_check;
ALTER TABLE public.stripe_webhook_events
  ADD CONSTRAINT stripe_webhook_events_status_check
  CHECK (status IN ('processing', 'processed', 'rejected', 'failed'));

COMMENT ON COLUMN public.stripe_webhook_events.claimed_at IS
  'Quando o processamento foi reclamado; o webhook reclama linhas processing com mais de 5 minutos.';

COMMENT ON TABLE public.stripe_webhook_events IS
  'Um registo por evento Stripe recebido (event_id = evt_...). Só service_role; sem policies.';

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.stripe_webhook_events TO service_role;

-- ------------------------------------------------------------
-- 6. Estado 'expired', expiração diária de trials, revogação de créditos
-- ------------------------------------------------------------
ALTER TABLE public.organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_status_check;
ALTER TABLE public.organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_status_check
  CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'expired'));

CREATE OR REPLACE FUNCTION public.fn_expire_trials()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.organization_subscriptions
    SET status = 'expired', updated_at = now()
    WHERE status = 'trialing'
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at <= now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.fn_expire_trials() IS
  'Passa a expired as subscrições em trialing cujo trial_ends_at já passou. Agendada diariamente (expire-trials) pela parte B. Devolve quantas expirou.';

-- Retira do saldo da organização de faturação os créditos de uma fatura
-- paga (reembolso/disputa). Nunca abaixo de 0; devolve quantos retirou;
-- idempotente via invoices.refunded_at. "Paga" = paid_at preenchido (o
-- trigger de crédito preenche-o; sobrevive a status passar a cancelado).
CREATE OR REPLACE FUNCTION public.fn_revoke_invoice_credits(
  _invoice_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv        public.invoices%ROWTYPE;
  v_credits    integer;
  v_billing    uuid;
  v_balance    integer;
  v_removed    integer;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = _invoice_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_revoke_invoice_credits: fatura % não existe', _invoice_id;
  END IF;

  IF v_inv.refunded_at IS NOT NULL THEN
    RETURN 0;
  END IF;

  -- Nunca creditou nada: não há o que retirar (e não se marca como reembolsada).
  IF v_inv.type <> 'creditos' OR v_inv.paid_at IS NULL THEN
    RETURN 0;
  END IF;

  -- Retira exactamente o que foi creditado; só faturas pagas antes de
  -- credits_credited existir recorrem ao pacote / credits_amount.
  v_credits := v_inv.credits_credited;
  IF v_credits IS NULL THEN
    IF v_inv.package_id IS NOT NULL THEN
      SELECT credits INTO v_credits FROM public.ai_credit_packages WHERE id = v_inv.package_id;
    ELSE
      v_credits := v_inv.credits_amount;
    END IF;
  END IF;

  v_credits := COALESCE(v_credits, 0);
  -- Debita a organização que recebeu os créditos; fallback só para faturas
  -- pagas antes de credited_organization_id existir.
  v_billing := COALESCE(
    v_inv.credited_organization_id,
    public.resolve_billing_organization_id(v_inv.organization_id)
  );

  SELECT balance_credits INTO v_balance
    FROM public.organization_ai_credits
    WHERE organization_id = v_billing
    FOR UPDATE;

  IF NOT FOUND THEN
    v_balance := 0;
  END IF;

  v_removed := GREATEST(LEAST(v_balance, v_credits), 0);

  IF v_removed > 0 THEN
    UPDATE public.organization_ai_credits
      SET balance_credits = balance_credits - v_removed, updated_at = now()
      WHERE organization_id = v_billing;
  END IF;

  UPDATE public.invoices SET refunded_at = now() WHERE id = _invoice_id;

  RETURN v_removed;
END;
$$;

COMMENT ON FUNCTION public.fn_revoke_invoice_credits(uuid) IS
  'Retira do saldo da conta de faturação exactamente invoices.credits_credited (fallback: pacote/credits_amount se NULL), sem passar de 0; devolve quantos retirou. Único escritor de invoices.refunded_at; idempotente. Só service_role.';

-- ------------------------------------------------------------
-- 7. Visão de faturação para o ecrã (browser)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_billing_overview(
  _organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid;
  v_billing     uuid;
  v_payer       uuid;
  v_can_manage  boolean;
  v_plan        text;
  v_status      text;
  v_trial_end   timestamptz;
  v_period_end  timestamptz;
  v_balance     integer;
  v_invoices    jsonb := '[]'::jsonb;
BEGIN
  IF _organization_id IS NULL THEN
    RETURN jsonb_build_object('error', 'organization_id_required');
  END IF;

  SELECT id INTO v_user_id FROM public.anew_users WHERE auth_user_id = auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Membro activo e não-portal (papel global client) desta organização.
  IF NOT EXISTS (
    SELECT 1
      FROM public.anew_memberships m
      WHERE m.organization_id = _organization_id
        AND m.user_id = v_user_id
        AND m.status = 'active'
        AND m.role_id IS DISTINCT FROM public.fn_billing_client_role_id()
  ) THEN
    RETURN jsonb_build_object('error', 'not_a_member');
  END IF;

  v_billing := public.resolve_billing_organization_id(_organization_id);
  v_payer := public.resolve_root_payer_user_id(_organization_id);
  v_can_manage := (v_payer IS NOT NULL AND v_payer = v_user_id);

  SELECT plan, status, trial_ends_at, current_period_end
    INTO v_plan, v_status, v_trial_end, v_period_end
    FROM public.organization_subscriptions
    WHERE organization_id = v_billing;

  SELECT balance_credits INTO v_balance
    FROM public.organization_ai_credits
    WHERE organization_id = v_billing;

  IF v_can_manage THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
      INTO v_invoices
      FROM (
        SELECT i.id, i.organization_id, i.type, i.package_id, i.credits_amount,
               i.target_plan, i.amount, i.status, i.description,
               i.created_at, i.paid_at, i.refunded_at
          FROM public.invoices i
          WHERE i.organization_id IN (SELECT public.fn_list_billing_organization_ids(v_billing))
          ORDER BY i.created_at DESC
          LIMIT 50
      ) x;
  END IF;

  -- billing_organization_id só é devolvido a quem gere a faturação.
  RETURN jsonb_build_object(
    'plan', v_plan,
    'status', v_status,
    'trial_ends_at', v_trial_end,
    'current_period_end', v_period_end,
    'balance_credits', COALESCE(v_balance, 0),
    'can_manage_billing', v_can_manage,
    'invoices', v_invoices
  ) || CASE
         WHEN v_can_manage THEN jsonb_build_object('billing_organization_id', v_billing)
         ELSE '{}'::jsonb
       END;
END;
$$;

COMMENT ON FUNCTION public.fn_get_billing_overview(uuid) IS
  'Leitura para o ecrã de plano e faturação: plano, estado, saldo e (só para o pagador raiz) as últimas 50 faturas da conta de faturação. Exige membership activa não-portal em _organization_id; devolve {"error": ...} caso contrário. Sem identificadores Stripe. billing_organization_id só é devolvido ao pagador raiz.';

-- ------------------------------------------------------------
-- 8. Privilégios das funções desta parte
-- ------------------------------------------------------------
-- Funções NOVAS: só service_role (não existem no frontend antigo, por isso
-- fechar já aqui não parte nada). Os REVOKE de funções que já existiam ficam
-- na parte B.
DO $do$
DECLARE
  v_sig  text;
  v_oid  regprocedure;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.fn_billing_client_role_id()',
    'public.fn_list_billing_organization_ids(uuid)',
    'public.fn_count_billing_seats(uuid,uuid)',
    'public.fn_check_seat_limit_excluding(uuid,uuid)',
    'public.fn_enforce_user_seat_limit()',
    'public.fn_protect_created_by()',
    'public.fn_expire_trials()',
    'public.fn_revoke_invoice_credits(uuid)'
  ] LOOP
    v_oid := to_regprocedure(v_sig);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'billing_hardening_a: função em falta: %', v_sig;
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_oid);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_oid);
  END LOOP;
END;
$do$;

-- RPCs chamadas pelo browser.
REVOKE ALL ON FUNCTION public.fn_get_plan_usage_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_get_plan_usage_summary(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_get_billing_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_get_billing_overview(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 9. Auto-verificação da parte A: falha se algo ficou por fazer OU em falta
-- ------------------------------------------------------------
DO $do$
DECLARE
  v_sig   text;
  v_oid   regprocedure;
  v_name  text;
  v_col   text;
  v_def   text;
BEGIN
  -- funções novas: existem e só service_role executa
  FOREACH v_sig IN ARRAY ARRAY[
    'public.fn_billing_client_role_id()',
    'public.fn_list_billing_organization_ids(uuid)',
    'public.fn_count_billing_seats(uuid,uuid)',
    'public.fn_check_seat_limit_excluding(uuid,uuid)',
    'public.fn_enforce_user_seat_limit()',
    'public.fn_protect_created_by()',
    'public.fn_expire_trials()',
    'public.fn_revoke_invoice_credits(uuid)'
  ] LOOP
    v_oid := to_regprocedure(v_sig);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'billing_hardening_a: função em falta: %', v_sig;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE')
       OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'billing_hardening_a: % executável por anon/authenticated', v_sig;
    END IF;
    IF EXISTS (
      SELECT 1
        FROM pg_proc p,
             LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
        WHERE p.oid = v_oid::oid
          AND a.grantee = 0
          AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'billing_hardening_a: % executável por PUBLIC', v_sig;
    END IF;
  END LOOP;

  -- funções substituídas: têm de existir
  FOREACH v_sig IN ARRAY ARRAY[
    'public.fn_refund_ai_credits(uuid,integer)',
    'public.fn_credit_org_on_invoice_paid()',
    'public.fn_check_user_seat_limit(uuid)',
    'public.resolve_billing_organization_id(uuid)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'billing_hardening_a: função em falta: %', v_sig;
    END IF;
  END LOOP;

  -- RPCs do browser: authenticated sim, anon não
  FOREACH v_sig IN ARRAY ARRAY[
    'public.fn_get_plan_usage_summary(uuid)',
    'public.fn_get_billing_overview(uuid)'
  ] LOOP
    v_oid := to_regprocedure(v_sig);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'billing_hardening_a: função em falta: %', v_sig;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'billing_hardening_a: % executável por anon', v_sig;
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'billing_hardening_a: % deveria ser executável por authenticated', v_sig;
    END IF;
  END LOOP;

  -- colunas novas
  FOREACH v_col IN ARRAY ARRAY[
    'invoices.target_plan', 'invoices.stripe_invoice_id',
    'invoices.stripe_subscription_id', 'invoices.refunded_at',
    'invoices.credits_credited', 'invoices.credited_organization_id',
    'stripe_webhook_events.claimed_at'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
        WHERE attrelid = to_regclass('public.' || split_part(v_col, '.', 1))
          AND attname = split_part(v_col, '.', 2) AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'billing_hardening_a: coluna em falta: %', v_col;
    END IF;
  END LOOP;

  -- stripe_webhook_events: tabela, RLS, CHECK final
  IF to_regclass('public.stripe_webhook_events') IS NULL THEN
    RAISE EXCEPTION 'billing_hardening_a: tabela stripe_webhook_events em falta';
  END IF;
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
    WHERE c.conname = 'stripe_webhook_events_status_check'
      AND c.conrelid = to_regclass('public.stripe_webhook_events');
  IF v_def IS NULL
     OR position('processing' IN v_def) = 0
     OR position('processed' IN v_def) = 0
     OR position('rejected' IN v_def) = 0
     OR position('failed' IN v_def) = 0 THEN
    RAISE EXCEPTION 'billing_hardening_a: stripe_webhook_events_status_check incompleto';
  END IF;
  IF has_any_column_privilege('anon', to_regclass('public.stripe_webhook_events'), 'SELECT, INSERT, UPDATE')
     OR has_any_column_privilege('authenticated', to_regclass('public.stripe_webhook_events'), 'SELECT, INSERT, UPDATE')
     OR has_table_privilege('anon', to_regclass('public.stripe_webhook_events'), 'DELETE')
     OR has_table_privilege('authenticated', to_regclass('public.stripe_webhook_events'), 'DELETE') THEN
    RAISE EXCEPTION 'billing_hardening_a: stripe_webhook_events acessível a anon/authenticated';
  END IF;

  -- CHECK de invoices.target_plan
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
      WHERE c.conname = 'invoices_target_plan_check'
        AND c.conrelid = to_regclass('public.invoices')
  ) THEN
    RAISE EXCEPTION 'billing_hardening_a: invoices_target_plan_check em falta';
  END IF;

  -- triggers
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      WHERE t.tgname = 'trg_enforce_user_seat_limit'
        AND t.tgrelid = to_regclass('public.anew_memberships')
        AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'billing_hardening_a: trg_enforce_user_seat_limit não existe';
  END IF;

  FOREACH v_name IN ARRAY ARRAY['anew_users', 'anew_organizations'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t
        WHERE t.tgname = 'trg_protect_created_by'
          AND t.tgrelid = to_regclass('public.' || v_name)
          AND NOT t.tgisinternal
    ) THEN
      RAISE EXCEPTION 'billing_hardening_a: trg_protect_created_by não existe em %', v_name;
    END IF;
  END LOOP;

  -- índice de resolução
  IF to_regclass('public.idx_organization_subscriptions_created_by_created_at') IS NULL THEN
    RAISE EXCEPTION 'billing_hardening_a: índice idx_organization_subscriptions_created_by_created_at em falta';
  END IF;

  -- CHECK do status aceita 'expired'
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
    WHERE c.conname = 'organization_subscriptions_status_check'
      AND c.conrelid = to_regclass('public.organization_subscriptions');
  IF v_def IS NULL OR position('expired' IN v_def) = 0 THEN
    RAISE EXCEPTION 'billing_hardening_a: organization_subscriptions_status_check não aceita expired';
  END IF;
END;
$do$;
