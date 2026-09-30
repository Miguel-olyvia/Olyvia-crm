-- Endurecimento da faturação, PARTE B1 (restritiva, SEM tocar nas leituras).
-- ============================================================
-- O que FECHA:
--   1. A política que deixava qualquer membro criar faturas pelo browser
--      (INSERT em invoices).
--   2. O EXECUTE de anon/authenticated/PUBLIC nas funções internas de
--      faturação (quotas, créditos, lugares, expiração de trials, etc.):
--      passam a ser só do service_role. Inclui org_has_active_access, que
--      nunca foi fechada.
--   3. Toda a escrita (INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) de
--      anon e authenticated nas tabelas de faturação, incluindo
--      billing_account_work_orgs e ai_credit_packages.
--   4. A leitura anónima (SELECT de anon) nas tabelas de faturação que nenhuma
--      página pública lê.
--   5. Agenda diariamente fn_expire_trials (pg_cron), com aviso se falhar.
--
-- O que NÃO toca, de propósito:
--   * A leitura directa de authenticated (SELECT) em organization_subscriptions,
--     organization_ai_credits, organization_usage_counters, invoices e
--     billing_accounts. O cartão antigo de Plano e Faturação, que está
--     publicado, lê organization_ai_credits, invoices e
--     organization_subscriptions directamente com o token do utilizador.
--     Esses SELECT só se fecham na parte B2 (fora das migrations), depois de o
--     ecrã novo estar no main.
--   * O SELECT de anon em plan_pricing, plan_limits e ai_credit_packages
--     (fica como está; o fecho de anon em plan_pricing e plan_limits fica
--     para a B2). O SELECT de authenticated em plan_pricing, plan_limits e o
--     SELECT por coluna (sem cost_real) em ai_credit_packages mantêm-se.
--   * Os EXECUTE das duas RPCs do browser, fn_get_billing_overview e
--     fn_get_plan_usage_summary: continuam abertas a authenticated.
--
-- É SEGURA de aplicar com o frontend actualmente publicado e com as Edge
-- Functions actualmente publicadas: o cartão antigo só lê (nunca escreve nas
-- tabelas de faturação) e as Edge Functions Stripe e o registo de uso de IA
-- escrevem com o cliente service_role, que não é afectado por estes REVOKE.
--
-- Pré-requisito: parte A (20261204910000) aplicada.
--
-- Interruptor de emergência: se alguma coisa parar, o caminho é uma nova
-- migration a repor o GRANT do privilégio em causa (ou o EXECUTE da função em
-- causa); o agendamento de trials desliga-se com
-- cron.unschedule('expire-trials'). Nunca aplicar SQL avulso ao remoto.
--
-- Verificado por leitura: nenhuma página pública (Landing, PublicLeadForm,
-- PublicProposal) nem nada em src/ lê estas tabelas como anon; as Edge
-- Functions Stripe usam supabaseAdmin (service_role) para todas elas.
--
-- Forward-only e re-executável. Não toca em nenhuma base local.
-- ============================================================

-- Um bloqueio de lock reverte a migration inteira de forma limpa, em vez de pôr pedidos em produção à fila.
SET LOCAL lock_timeout = '5s';

-- ------------------------------------------------------------
-- 1. Faturas deixam de ser criadas pelo browser
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Org members can insert pending invoices for their org" ON public.invoices;

-- ------------------------------------------------------------
-- 2. Funções sensíveis só para service_role
-- ------------------------------------------------------------
DO $do$
DECLARE
  v_sig  text;
  v_oid  regprocedure;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.fn_check_and_consume_ai_credits(uuid,integer)',
    'public.fn_refund_ai_credits(uuid,integer)',
    'public.fn_credit_org_on_invoice_paid()',
    'public.fn_check_and_consume_lead_quota(uuid,uuid)',
    'public.fn_check_and_consume_simple_quota(uuid,text)',
    'public.fn_check_user_seat_limit(uuid)',
    'public.fn_check_seat_limit_excluding(uuid,uuid)',
    'public.purge_old_usage_counters()',
    'public.org_has_active_access(uuid)',
    'public.resolve_billing_organization_id(uuid)',
    'public.resolve_root_payer_user_id(uuid)',
    'public.fn_billing_client_role_id()',
    'public.fn_list_billing_organization_ids(uuid)',
    'public.fn_count_billing_seats(uuid,uuid)',
    'public.fn_enforce_user_seat_limit()',
    'public.fn_protect_created_by()',
    'public.fn_expire_trials()',
    'public.fn_revoke_invoice_credits(uuid)'
  ] LOOP
    v_oid := to_regprocedure(v_sig);
    IF v_oid IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_oid);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_oid);
    END IF;
  END LOOP;
END;
$do$;

-- ------------------------------------------------------------
-- 3. Privilégios de tabelas (só escritas e leitura anónima)
-- ------------------------------------------------------------
-- Um REVOKE ao nível da tabela retira também os privilégios por coluna do
-- mesmo tipo. O SELECT de authenticated NÃO é tocado aqui. Tabela em falta: a
-- auto-verificação (secção 5) falha.
DO $do$
DECLARE
  v_name text;
  v_reg  regclass;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'organization_subscriptions', 'organization_ai_credits',
    'organization_usage_counters', 'invoices', 'plan_limits', 'plan_pricing',
    'ai_gateway_usage_log', 'organization_counted_entities', 'billing_accounts'
  ] LOOP
    v_reg := to_regclass('public.' || v_name);
    IF v_reg IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %s FROM anon, authenticated', v_reg);
      -- plan_pricing e plan_limits: o SELECT de anon fica como está (B2).
      IF v_name NOT IN ('plan_pricing', 'plan_limits') THEN
        EXECUTE format('REVOKE SELECT ON TABLE %s FROM anon', v_reg);
      END IF;
    END IF;
  END LOOP;

  -- billing_account_work_orgs e ai_credit_packages: só as escritas. O SELECT
  -- por coluna (sem cost_real) de ai_credit_packages mantém-se -- não
  -- conceder SELECT ao nível da tabela.
  FOREACH v_name IN ARRAY ARRAY['billing_account_work_orgs', 'ai_credit_packages'] LOOP
    v_reg := to_regclass('public.' || v_name);
    IF v_reg IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %s FROM anon, authenticated', v_reg);
    END IF;
  END LOOP;
END;
$do$;

-- ------------------------------------------------------------
-- 4. Expiração diária de trials
-- ------------------------------------------------------------
-- Mesmo padrão de purge-usage-counters (20261112400000): só agenda se pg_cron
-- existir e nunca falha a migration -- mas avisa em vez de engolir em silêncio.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('expire-trials')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-trials');

    PERFORM cron.schedule(
      'expire-trials',
      '45 3 * * *',
      $cron$SELECT public.fn_expire_trials()$cron$
    );
  ELSE
    RAISE WARNING 'billing_hardening_b1: pg_cron não instalado; o job expire-trials NÃO foi agendado (chamar fn_expire_trials por outro meio)';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'billing_hardening_b1: falha ao agendar expire-trials: %', SQLERRM;
END;
$do$;

-- ------------------------------------------------------------
-- 5. Auto-verificação da parte B1
-- ------------------------------------------------------------
-- Verifica só o que a B1 faz. NÃO verifica (nem exige) que authenticated tenha
-- perdido o SELECT: esse fecho é da B2.
DO $do$
DECLARE
  v_sig   text;
  v_oid   regprocedure;
  v_name  text;
  v_reg   regclass;
  v_role  text;
BEGIN
  -- funções: têm de existir e não ser executáveis por anon/authenticated/PUBLIC
  FOREACH v_sig IN ARRAY ARRAY[
    'public.fn_check_and_consume_ai_credits(uuid,integer)',
    'public.fn_refund_ai_credits(uuid,integer)',
    'public.fn_credit_org_on_invoice_paid()',
    'public.fn_check_and_consume_lead_quota(uuid,uuid)',
    'public.fn_check_and_consume_simple_quota(uuid,text)',
    'public.fn_check_user_seat_limit(uuid)',
    'public.fn_check_seat_limit_excluding(uuid,uuid)',
    'public.purge_old_usage_counters()',
    'public.org_has_active_access(uuid)',
    'public.resolve_billing_organization_id(uuid)',
    'public.resolve_root_payer_user_id(uuid)',
    'public.fn_billing_client_role_id()',
    'public.fn_list_billing_organization_ids(uuid)',
    'public.fn_count_billing_seats(uuid,uuid)',
    'public.fn_enforce_user_seat_limit()',
    'public.fn_protect_created_by()',
    'public.fn_expire_trials()',
    'public.fn_revoke_invoice_credits(uuid)'
  ] LOOP
    v_oid := to_regprocedure(v_sig);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'billing_hardening_b1: função em falta: %', v_sig;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE')
       OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'billing_hardening_b1: % ainda é executável por anon/authenticated', v_sig;
    END IF;
    IF EXISTS (
      SELECT 1
        FROM pg_proc p,
             LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
        WHERE p.oid = v_oid::oid
          AND a.grantee = 0
          AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'billing_hardening_b1: % ainda é executável por PUBLIC', v_sig;
    END IF;
  END LOOP;

  -- as duas RPCs do browser continuam abertas a authenticated
  FOREACH v_sig IN ARRAY ARRAY[
    'public.fn_get_plan_usage_summary(uuid)',
    'public.fn_get_billing_overview(uuid)'
  ] LOOP
    v_oid := to_regprocedure(v_sig);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'billing_hardening_b1: função em falta: %', v_sig;
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'billing_hardening_b1: % deveria continuar executável por authenticated', v_sig;
    END IF;
  END LOOP;

  -- tabelas: têm de existir; nenhuma escrita/TRUNCATE de anon/authenticated
  FOREACH v_name IN ARRAY ARRAY[
    'organization_subscriptions', 'organization_ai_credits',
    'organization_usage_counters', 'invoices', 'plan_limits', 'plan_pricing',
    'ai_gateway_usage_log', 'organization_counted_entities', 'billing_accounts',
    'billing_account_work_orgs', 'ai_credit_packages', 'stripe_webhook_events'
  ] LOOP
    v_reg := to_regclass('public.' || v_name);
    IF v_reg IS NULL THEN
      RAISE EXCEPTION 'billing_hardening_b1: tabela em falta: %', v_name;
    END IF;

    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_any_column_privilege(v_role, v_reg, 'INSERT, UPDATE, REFERENCES')
         OR has_table_privilege(v_role, v_reg, 'DELETE')
         OR has_table_privilege(v_role, v_reg, 'TRUNCATE')
         OR has_table_privilege(v_role, v_reg, 'TRIGGER') THEN
        RAISE EXCEPTION 'billing_hardening_b1: % ainda tem privilégio de escrita/TRUNCATE para %', v_name, v_role;
      END IF;
    END LOOP;

    -- SELECT de anon: fechado, excepto nas três tabelas onde fica como está
    -- (plan_pricing, plan_limits, ai_credit_packages) e em
    -- billing_account_work_orgs, que a B1 não toca na leitura.
    IF v_name NOT IN ('ai_credit_packages', 'billing_account_work_orgs', 'plan_pricing', 'plan_limits')
       AND has_any_column_privilege('anon', v_reg, 'SELECT') THEN
      RAISE EXCEPTION 'billing_hardening_b1: % ainda tem SELECT para anon', v_name;
    END IF;
  END LOOP;

  -- cost_real nunca visível a authenticated (a coluna tem de existir)
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
      WHERE attrelid = to_regclass('public.ai_credit_packages')
        AND attname = 'cost_real' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'billing_hardening_b1: ai_credit_packages.cost_real em falta';
  END IF;
  IF has_column_privilege('authenticated', to_regclass('public.ai_credit_packages'), 'cost_real', 'SELECT') THEN
    RAISE EXCEPTION 'billing_hardening_b1: authenticated consegue ler ai_credit_packages.cost_real';
  END IF;

  -- política de INSERT em invoices eliminada
  IF EXISTS (
    SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'invoices'
        AND policyname = 'Org members can insert pending invoices for their org'
  ) THEN
    RAISE EXCEPTION 'billing_hardening_b1: a política de INSERT em invoices ainda existe';
  END IF;
END;
$do$;
