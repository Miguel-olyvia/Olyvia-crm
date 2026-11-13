-- ============================================================
-- Teste: 20261229530000_anular_contrato_enviado.sql (base PRINCIPAL, tzbfgwpckrfbqcolqxtm)
-- ============================================================
-- Tudo dentro de BEGIN ... ROLLBACK, so na organizacao nike (b6ffce4f-f630-4933-833a-008649757a33).
-- Cria 4 contratos proprios (notas "TESTE anular enviado"), uma parte, um pedido e dois tokens de
-- assinatura, chama cancel_and_replace_contract como um membro activo da nike com
-- client_contracts.edit (role authenticated, auth.uid() pelas claims), e desfaz tudo.
-- Nao le nem escreve nada de outras organizacoes; a unica leitura fora da nike e um NOT EXISTS
-- sobre anew_memberships para escolher um utilizador que SO pertence a nike.
--
-- Correr (a partir do worktree; confirmar supabase/.temp/project-ref = tzbfgwpckrfbqcolqxtm):
--   supabase db query --linked -f supabase/tests/anular_contrato_enviado.test.sql
--
-- VERMELHO / VERDE:
--   * ANTES do db push (funcao viva): falha no passo 1 com
--     'FALHOU: 1 ... recusado com contract_not_cancellable (defeito presente)'.
--   * DEPOIS do db push: o ultimo SELECT devolve a linha 'OK: ...'.
--
-- Cobre (uma prova por suspeita):
--   0. Catalogo: SECURITY DEFINER, search_path, PUBLIC/anon sem EXECUTE, authenticated com EXECUTE
--   1. pending_signature anula-se (com substituicao): status cancelled, evento, token por usar
--      invalidado, token ja usado intacto, pedido de assinatura cancelled, rascunho de substituicao
--   2. cancelled  -> contract_already_cancelled
--   3. expired    -> contract_not_cancellable
--   4. motivo em branco -> reason_required
--   5. sem client_contracts.edit -> insufficient_permission
--   6. gatilho (UPDATE directo): cancelled->signed e cancelled->active recusados com
--      contract_cancelled_cannot_reopen; outra coluna num anulado e cancelled->draft permitidos
--      (antes do push o teste ja parou no passo 1, por isso o 6 so corre depois)
-- Possivel falha alheia ao defeito: 'plan_limit_exceeded:contracts' se a nike estiver no limite
-- de contratos do plano (o gatilho de quota corre nos INSERT; desfeito no ROLLBACK).
-- ============================================================

BEGIN;

-- ─── 0. Catalogo ────────────────────────────────────────────────────────────
DO $t$
DECLARE
  v_fn oid := to_regprocedure('public.cancel_and_replace_contract(uuid,text,boolean)')::oid;
BEGIN
  IF v_fn IS NULL THEN RAISE EXCEPTION 'FALHOU: 0 a funcao nao existe'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION 'FALHOU: 0 sem SECURITY DEFINER'; END IF;
  IF (SELECT proconfig::text FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM '{"search_path=public, pg_temp"}' THEN
    RAISE EXCEPTION 'FALHOU: 0 search_path inesperado';
  END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU: 0 anon tem EXECUTE'; END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION 'FALHOU: 0 authenticated sem EXECUTE'; END IF;
END $t$;

-- ─── Fixtures (como postgres) ───────────────────────────────────────────────
DO $fx$
DECLARE
  c_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_auth uuid;
  v_act  uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = c_nike) THEN
    RAISE EXCEPTION 'FALHOU: fixture organizacao nike nao encontrada';
  END IF;

  -- Membro activo da nike, com client_contracts.edit, nao system admin, sem memberships activas
  -- noutras organizacoes (has_anew_permission nao filtra por org) e mapeado em
  -- auth_to_business_user_map (a substituicao precisa de created_by).
  SELECT u.auth_user_id, u.id INTO v_auth, v_act
  FROM public.anew_users u
  JOIN public.anew_memberships m ON m.user_id = u.id AND m.organization_id = c_nike
   AND m.status = 'active' AND m.role_is_client IS NOT TRUE
  JOIN public.auth_to_business_user_map bm ON bm.auth_user_id = u.auth_user_id AND bm.business_user_id = u.id
  WHERE u.auth_user_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp
                WHERE rp.role_id = m.role_id AND rp.permission_code = 'client_contracts.edit')
    AND NOT public.is_system_admin_user(u.auth_user_id)
    AND NOT EXISTS (SELECT 1 FROM public.anew_memberships o
                    WHERE o.user_id = u.id AND o.status = 'active' AND o.organization_id <> c_nike)
  ORDER BY u.id
  LIMIT 1;
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'FALHOU: fixture sem membro so-da-nike (nao system admin) com client_contracts.edit';
  END IF;

  INSERT INTO public.client_contracts (id, organization_id, status, created_by, notes, currency)
  VALUES ('a2a10000-0000-4000-8000-000000000001', c_nike, 'pending_signature', v_act, 'TESTE anular enviado 1', 'EUR'),
         ('a2a10000-0000-4000-8000-000000000002', c_nike, 'cancelled',         v_act, 'TESTE anular enviado 2', 'EUR'),
         ('a2a10000-0000-4000-8000-000000000003', c_nike, 'expired',           v_act, 'TESTE anular enviado 3', 'EUR'),
         ('a2a10000-0000-4000-8000-000000000004', c_nike, 'draft',             v_act, 'TESTE anular enviado 4', 'EUR');

  INSERT INTO public.client_contract_parties (id, contract_id, signing_email, signing_name, status)
  VALUES ('a2a1aaaa-0000-4000-8000-000000000001', 'a2a10000-0000-4000-8000-000000000001',
          'teste.anular@example.invalid', 'Teste Anular', 'pending'),
         ('a2a1aaaa-0000-4000-8000-000000000002', 'a2a10000-0000-4000-8000-000000000001',
          'teste.anular2@example.invalid', 'Teste Anular 2', 'signed');

  INSERT INTO public.client_contract_signature_requests (id, contract_id, contract_version_id, status, created_by)
  VALUES ('a2a1bbbb-0000-4000-8000-000000000001', 'a2a10000-0000-4000-8000-000000000001',
          gen_random_uuid(), 'created', v_act);

  INSERT INTO public.client_contract_signature_tokens (id, signature_request_id, contract_party_id, token_hash, valid_until, used_at)
  VALUES ('a2a1cccc-0000-4000-8000-000000000001', 'a2a1bbbb-0000-4000-8000-000000000001',
          'a2a1aaaa-0000-4000-8000-000000000001', md5(gen_random_uuid()::text) || '-teste-anular-1',
          now() + interval '7 days', NULL),
         ('a2a1cccc-0000-4000-8000-000000000002', 'a2a1bbbb-0000-4000-8000-000000000001',
          'a2a1aaaa-0000-4000-8000-000000000002', md5(gen_random_uuid()::text) || '-teste-anular-2',
          now() + interval '7 days', now() - interval '1 hour');

  PERFORM set_config('teste.act', v_act::text, true);
  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
END $fx$;

-- ─── 1. pending_signature anula-se (o vermelho antes do push) ───────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE r jsonb;
BEGIN
  BEGIN
    r := public.cancel_and_replace_contract('a2a10000-0000-4000-8000-000000000001', 'Teste: cliente desistiu', true);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'contract_not_cancellable' THEN
      RAISE EXCEPTION 'FALHOU: 1 contrato enviado (pending_signature) recusado com contract_not_cancellable (defeito presente)';
    END IF;
    RAISE EXCEPTION 'FALHOU: 1 erro inesperado ao anular contrato enviado: %', SQLERRM;
  END;
  IF (r ->> 'cancelled_contract_id') IS DISTINCT FROM 'a2a10000-0000-4000-8000-000000000001'
     OR (r ->> 'replacement_contract_id') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: 1 retorno inesperado: %', r;
  END IF;
  PERFORM set_config('teste.subst', r ->> 'replacement_contract_id', true);
END $t$;
RESET ROLE;

DO $t$
DECLARE
  c record;
  v_subst uuid := current_setting('teste.subst')::uuid;
  v_ev jsonb;
BEGIN
  SELECT status, cancelled_at, cancellation_reason, replaced_by_contract_id INTO c
  FROM public.client_contracts WHERE id = 'a2a10000-0000-4000-8000-000000000001';
  IF c.status <> 'cancelled' OR c.cancelled_at IS NULL OR c.cancellation_reason <> 'Teste: cliente desistiu'
     OR c.replaced_by_contract_id IS DISTINCT FROM v_subst THEN
    RAISE EXCEPTION 'FALHOU: 1 contrato anulado ficou %', c;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.client_contracts
                 WHERE id = v_subst AND status = 'draft'
                   AND replaces_contract_id = 'a2a10000-0000-4000-8000-000000000001'
                   AND organization_id = 'b6ffce4f-f630-4933-833a-008649757a33') THEN
    RAISE EXCEPTION 'FALHOU: 1 rascunho de substituicao nao criado';
  END IF;

  SELECT new_values INTO v_ev FROM public.client_contract_events
  WHERE contract_id = 'a2a10000-0000-4000-8000-000000000001' AND event_type = 'contract_cancelled';
  IF v_ev IS NULL OR (v_ev ->> 'previous_status') IS DISTINCT FROM 'pending_signature'
     OR (v_ev ->> 'signature_tokens_invalidated') IS DISTINCT FROM '1'
     OR (v_ev ->> 'signature_requests_cancelled') IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'FALHOU: 1 evento contract_cancelled: %', coalesce(v_ev::text, 'ausente');
  END IF;

  IF (SELECT valid_until > now() FROM public.client_contract_signature_tokens
      WHERE id = 'a2a1cccc-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FALHOU: 1 token por usar continua valido depois da anulacao';
  END IF;
  IF (SELECT valid_until <= now() OR used_at IS NULL FROM public.client_contract_signature_tokens
      WHERE id = 'a2a1cccc-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'FALHOU: 1 token ja usado foi alterado';
  END IF;
  IF (SELECT status FROM public.client_contract_signature_requests
      WHERE id = 'a2a1bbbb-0000-4000-8000-000000000001') IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'FALHOU: 1 pedido de assinatura nao ficou cancelled';
  END IF;
END $t$;

-- ─── 2 a 4. Recusas, cada uma uma vez ───────────────────────────────────────
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  casos constant text[][] := ARRAY[
    ['a2a10000-0000-4000-8000-000000000002', 'Teste motivo', 'contract_already_cancelled', '2'],
    ['a2a10000-0000-4000-8000-000000000003', 'Teste motivo', 'contract_not_cancellable',   '3'],
    ['a2a10000-0000-4000-8000-000000000004', '   ',          'reason_required',            '4']];
  i int;
BEGIN
  FOR i IN 1 .. array_length(casos, 1) LOOP
    BEGIN
      PERFORM public.cancel_and_replace_contract(casos[i][1]::uuid, casos[i][2], false);
      RAISE EXCEPTION 'FALHOU: % aceite quando devia dar %', casos[i][4], casos[i][3];
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'FALHOU:%' THEN RAISE; END IF;
      IF SQLERRM <> casos[i][3] THEN
        RAISE EXCEPTION 'FALHOU: % esperava %, veio %', casos[i][4], casos[i][3], SQLERRM;
      END IF;
    END;
  END LOOP;
END $t$;
RESET ROLE;

-- ─── 5. Sem client_contracts.edit ───────────────────────────────────────────
-- O membro passa, so nesta transaccao, para um papel novo da nike sem permissoes
-- (claims vazias: o gatilho de auto-promocao e o de lugares deixam passar).
SELECT set_config('request.jwt.claims', '', true);
DO $fx$
DECLARE v_role uuid;
BEGIN
  INSERT INTO public.anew_roles (code, name, organization_id)
  VALUES ('teste_anular_sem_permissoes', 'TESTE anular sem permissoes', 'b6ffce4f-f630-4933-833a-008649757a33')
  RETURNING id INTO v_role;
  UPDATE public.anew_memberships SET role_id = v_role
  WHERE user_id = current_setting('teste.act')::uuid
    AND organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'
    AND status = 'active';
END $fx$;

SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  BEGIN
    PERFORM public.cancel_and_replace_contract('a2a10000-0000-4000-8000-000000000004', 'Teste motivo', false);
    RAISE EXCEPTION 'FALHOU: 5 anulacao aceite sem client_contracts.edit';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FALHOU:%' THEN RAISE; END IF;
    IF SQLERRM <> 'insufficient_permission' THEN
      RAISE EXCEPTION 'FALHOU: 5 esperava insufficient_permission, veio %', SQLERRM;
    END IF;
  END;
END $t$;
RESET ROLE;

-- ─── 6. Gatilho: um contrato anulado nao volta a assinado/activo ───────────
-- UPDATE directo como postgres (o caminho das Edge Functions com service_role
-- e o mesmo UPDATE): uma prova por transicao.
SELECT set_config('request.jwt.claims', '', true);
DO $t$
DECLARE
  c_id constant uuid := 'a2a10000-0000-4000-8000-000000000002';  -- fixture em 'cancelled'
  v_alvo text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid = 'public.client_contracts'::regclass
                   AND t.tgname::text = 'trg_00_client_contracts_block_reopen_cancelled'
                   AND t.tgenabled::text = 'O') THEN
    RAISE EXCEPTION 'FALHOU: 6 gatilho trg_00_client_contracts_block_reopen_cancelled em falta ou inactivo';
  END IF;

  -- (a) cancelled -> signed e (b) cancelled -> active: recusados
  FOREACH v_alvo IN ARRAY ARRAY['signed', 'active'] LOOP
    BEGIN
      UPDATE public.client_contracts SET status = v_alvo WHERE id = c_id;
      RAISE EXCEPTION 'FALHOU: 6 cancelled -> % foi aceite', v_alvo;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'FALHOU:%' THEN RAISE; END IF;
      IF SQLERRM <> 'contract_cancelled_cannot_reopen' THEN
        RAISE EXCEPTION 'FALHOU: 6 cancelled -> % esperava contract_cancelled_cannot_reopen, veio %', v_alvo, SQLERRM;
      END IF;
    END;
  END LOOP;

  -- (d) outra coluna num contrato anulado: permitido
  UPDATE public.client_contracts SET notes = 'TESTE anular enviado 2 (nota alterada)' WHERE id = c_id;
  IF (SELECT status FROM public.client_contracts WHERE id = c_id) IS DISTINCT FROM 'cancelled'
     OR (SELECT notes FROM public.client_contracts WHERE id = c_id) IS DISTINCT FROM 'TESTE anular enviado 2 (nota alterada)' THEN
    RAISE EXCEPTION 'FALHOU: 6 alterar notas de um contrato anulado nao ficou gravado';
  END IF;

  -- (c) cancelled -> draft: permitido
  UPDATE public.client_contracts SET status = 'draft' WHERE id = c_id;
  IF (SELECT status FROM public.client_contracts WHERE id = c_id) IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'FALHOU: 6 cancelled -> draft nao ficou gravado';
  END IF;
END $t$;

SELECT 'OK: contrato enviado anula-se, ligacoes de assinatura invalidadas, substituicao criada; recusas (ja anulado, expirado, motivo vazio, sem permissao) com a mensagem certa; anulado nao volta a signed/active, mas volta a draft e aceita outras alteracoes (tudo desfeito no ROLLBACK)' AS resultado;

ROLLBACK;
