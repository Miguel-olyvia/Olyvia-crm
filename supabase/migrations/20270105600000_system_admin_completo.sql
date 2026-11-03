-- ============================================================
-- 20270105600000_system_admin_completo
-- ============================================================
-- O que faz (só dados de configuração; nenhuma função nem tabela muda)
--   Dá ao papel GLOBAL de sistema system_admin (code + is_system + organization_id nulo) as 29 permissões que o super_admin global
--   tem e ele não tinha (lidas na base RH a 2/11/2026 e reconfirmadas a 3/11, depois de 20270105200000 e 20270105500000:
--   a mesma lista de 29).
-- Versão: escrita como 20270105100000, que já é de 20270105100000_negocio_historico_autor (origin/feature/rh-pessoas); passou a
--   20270105600000 para o db push não saltar nenhuma das duas. Todas são de âmbito 'organization' (nenhuma de plataforma):
--     fleet:            fleet.costs, fleet.manage, fleet.self, fleet.view
--     hr:               hr.assiduidade.obras.registar, hr.cargos.salario.alterar, hr.contratos.regras.gerir, hr.onboarding.approve,
--                       hr.onboarding.restrito, hr.onboarding.sensitive, hr.onboarding.sign_employer, hr.pessoas.retribuicao.corrigir
--     pessoas/negócios: negocios.registar_fatura, negocios.validar_pagamento, pessoas.config, pessoas.create, pessoas.delete,
--                       pessoas.edit, pessoas.reopen, pessoas.view
--     inventário:       purchase_orders.manage, purchase_orders.view_prices, receiving.download_proof, receiving.learn_codes,
--                       receiving.manage_delivery_notes, receiving.receive, receiving.view, suppliers.contract_manage,
--                       suppliers.portal_manage
-- Exclusões: nenhuma. As de plataforma (platform.*, organizations.*, planos) o system_admin já as tinha todas; nada da diferença é
--   só de plataforma. O system_admin já tinha can_sign_contracts = true (hr.onboarding.sign_employer não lhe dá mais do que isso).
-- Nota: nas RPCs com fn_cat_* o system_admin já passava (is_system_admin_user); faltava-lhe nas verificações por has_anew_permission,
--   nas políticas e no ecrã (PermissionsContext não dá nada por ser system_admin).
-- Porque o set_config: anew_role_permissions tem o trigger protect_system_role_permissions, que só deixa escrever em papéis de
--   sistema com request.jwt.claims->>'role' = 'service_role'. A claim é LOCAL à transação e reposta logo a seguir; nenhum trigger
--   é desligado (os de 20270102110000 só atuam com current_user authenticated/anon).
-- Idempotente: ON CONFLICT DO NOTHING. Reversão (só como migration nova): apagar estas 29 linhas do system_admin (com a mesma claim).
-- ============================================================

SET lock_timeout = '5s';

DO $$
DECLARE
  v_role       uuid;
  v_n          int;
  v_prev_claim text;
  v_codes      text[] := ARRAY[
    'fleet.costs', 'fleet.manage', 'fleet.self', 'fleet.view',
    'hr.assiduidade.obras.registar', 'hr.cargos.salario.alterar', 'hr.contratos.regras.gerir', 'hr.onboarding.approve',
    'hr.onboarding.restrito', 'hr.onboarding.sensitive', 'hr.onboarding.sign_employer', 'hr.pessoas.retribuicao.corrigir',
    'negocios.registar_fatura', 'negocios.validar_pagamento', 'pessoas.config', 'pessoas.create', 'pessoas.delete',
    'pessoas.edit', 'pessoas.reopen', 'pessoas.view',
    'purchase_orders.manage', 'purchase_orders.view_prices', 'receiving.download_proof', 'receiving.learn_codes',
    'receiving.manage_delivery_notes', 'receiving.receive', 'receiving.view', 'suppliers.contract_manage', 'suppliers.portal_manage'];
BEGIN
  -- Guarda: as 29 estão no catálogo e nenhuma é de plataforma
  SELECT count(*) INTO v_n FROM public.anew_permissions p WHERE p.code = ANY (v_codes) AND p.scope = 'organization' AND p.category <> 'platform';
  IF v_n <> 29 THEN
    RAISE EXCEPTION 'GUARDA: esperadas 29 permissões de organização no catálogo, encontradas %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.anew_roles r WHERE r.code = 'system_admin' AND r.is_system = true AND r.organization_id IS NULL;
  IF v_n = 0 THEN
    RAISE NOTICE 'Papel system_admin global não existe nesta base: não se concede nada.';
    RETURN;
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'GUARDA: % papéis system_admin globais de sistema (esperado 1)', v_n;
  END IF;
  SELECT r.id INTO v_role FROM public.anew_roles r WHERE r.code = 'system_admin' AND r.is_system = true AND r.organization_id IS NULL;

  v_prev_claim := current_setting('request.jwt.claims', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
  SELECT v_role, c, NULL::uuid FROM unnest(v_codes) AS c
  ON CONFLICT (role_id, permission_code) DO NOTHING;
  PERFORM set_config('request.jwt.claims', CASE WHEN coalesce(v_prev_claim, '') = '' THEN '{}' ELSE v_prev_claim END, true);

  SELECT count(*) INTO v_n FROM public.anew_role_permissions rp WHERE rp.role_id = v_role AND rp.permission_code = ANY (v_codes);
  IF v_n <> 29 THEN
    RAISE EXCEPTION 'CONFERIR: o system_admin tem % de 29 permissões', v_n;
  END IF;
END $$;
