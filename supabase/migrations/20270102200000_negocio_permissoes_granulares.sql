-- ============================================================
-- 20270102200000_negocio_permissoes_granulares
-- ============================================================
-- O que faz (só dados de configuração; nenhuma função nem tabela muda)
--   1. Cria no catálogo anew_permissions as permissões finas do Negócio e da Obra (categoria 'pessoas', como
--      negocios.registar_fatura e negocios.validar_pagamento):
--        negocios.orcamento.editar   mudar linhas, preços, custos, desconto e versões do orçamento, e as adendas
--        negocios.margem.aprovar     aprovar (ou recusar) a exceção à margem mínima
--        negocios.proposta.enviar    enviar a proposta (ou a adenda) ao cliente
--        negocios.contrato.editar    mudar o contrato: estado, cláusulas, pedidos do cliente e revisão jurídica
--        negocios.obra.planear       o plano da obra: estado, tarefas, técnicos, validação, cancelar
--        negocios.obra.executar      marcar as próprias tarefas da obra (registos, fotografias, notas, imprevistos)
--        negocios.obra.materiais     pedir materiais novos da obra ao fornecedor
--      e as duas da plataforma que o frontend já pede (src/App.tsx, menuConfig.ts) e não existiam:
--        platform.support_access.view, platform.auth_audit_log.view   (categoria 'platform', âmbito global, como as outras)
--   2. Dá as 9 aos papéis GLOBAIS de sistema super_admin e system_admin (code + is_system + organization_id nulo).
--   3. neg_papeis_permissoes (Papel no Negócio, do RH): ACRESCENTA, não retira nada:
--        comercial:  negocios.orcamento.editar, negocios.proposta.enviar, negocios.contrato.editar, quotes.view_costs
--        direcao:    as do comercial + negocios.margem.aprovar, client_contracts.cancel, negocios.obra.planear, negocios.obra.materiais
--        financeiro: quotes.view_costs
--        juridico:   negocios.contrato.editar
--        operacoes:  negocios.obra.planear, negocios.obra.executar, negocios.obra.materiais, quotes.view_costs
--        tecnico:    negocios.obra.executar   (o papel tecnico é implícito, pelo cargo técnico de obra: fn_neg_papeis junta-o e
--                                              fn_neg_papel_permite lê neg_papeis_permissoes para ele como para os outros)
--        armazem:    sem mudanças
--      negocios.obra (o código antigo) sai em 20270102230000, depois de as funções deixarem de o usar.
-- Porque o set_config: anew_role_permissions tem o trigger protect_system_role_permissions, que só deixa escrever em papéis de
--   sistema com request.jwt.claims->>'role' = 'service_role'. A claim é posta LOCAL à transação, só à volta do INSERT, e reposta
--   depois. Nenhum trigger é desligado (padrão de 20261230100000).
-- Idempotente: ON CONFLICT DO NOTHING.
-- Reversão (só como migration nova): apagar estas linhas de neg_papeis_permissoes e de anew_role_permissions (com a mesma claim
--   local) e as 9 de anew_permissions.
-- ============================================================

SET lock_timeout = '5s';

-- 1. Catálogo
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('negocios.orcamento.editar', 'Editar o orçamento do negócio',
   'Mudar as linhas, os preços, os custos, o desconto e as versões do orçamento do negócio, e as adendas.', 'pessoas', NULL, 8, false, 'organization', false),
  ('negocios.margem.aprovar', 'Aprovar a margem do orçamento',
   'Aprovar (ou recusar) um orçamento abaixo da margem mínima, para o comercial o poder enviar.', 'pessoas', NULL, 9, true, 'organization', false),
  ('negocios.proposta.enviar', 'Enviar a proposta ao cliente',
   'Enviar a proposta do negócio (ou de uma adenda) ao portal do cliente.', 'pessoas', NULL, 10, false, 'organization', false),
  ('negocios.contrato.editar', 'Editar o contrato do negócio',
   'Mudar o contrato do negócio ou de uma adenda: o estado (rascunho, enviado, alterações pedidas), as cláusulas, os pedidos do cliente e a revisão jurídica.', 'pessoas', NULL, 11, false, 'organization', false),
  ('negocios.obra.planear', 'Planear a obra',
   'O plano da obra: o estado, as tarefas, a atribuição dos técnicos, a validação das tarefas e o cancelamento.', 'pessoas', NULL, 12, false, 'organization', false),
  ('negocios.obra.executar', 'Executar as tarefas da obra',
   'Marcar as tarefas da obra atribuídas ao próprio: os registos, as fotografias, as notas e os imprevistos dessas tarefas.', 'pessoas', NULL, 13, false, 'organization', false),
  ('negocios.obra.materiais', 'Encomendar materiais da obra',
   'Pedir ao fornecedor os materiais novos da obra (encomenda de ajuste ligada à encomenda de cliente).', 'pessoas', NULL, 14, false, 'organization', false),
  ('platform.support_access.view', 'Ver acessos de suporte',
   'Consultar os acessos de suporte concedidos às contas da plataforma.', 'platform', NULL, 0, true, 'global', false),
  ('platform.auth_audit_log.view', 'Ver o registo de autenticação',
   'Consultar o registo de auditoria das autenticações (entradas, falhas e alterações de acesso).', 'platform', NULL, 0, true, 'global', false)
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_role       uuid;
  v_papel      text;
  v_n          int;
  v_prev_claim text;
  v_codes      text[] := ARRAY['negocios.orcamento.editar','negocios.margem.aprovar','negocios.proposta.enviar','negocios.contrato.editar',
                               'negocios.obra.planear','negocios.obra.executar','negocios.obra.materiais',
                               'platform.support_access.view','platform.auth_audit_log.view'];
BEGIN
  -- Guarda: as 9 estão no catálogo.
  SELECT count(*) INTO v_n FROM public.anew_permissions p WHERE p.code = ANY (v_codes);
  IF v_n <> 9 THEN
    RAISE EXCEPTION 'GUARDA: esperadas 9 permissões no catálogo, encontradas %', v_n;
  END IF;

  -- 2. super_admin e system_admin globais
  FOREACH v_papel IN ARRAY ARRAY['super_admin', 'system_admin'] LOOP
    SELECT count(*) INTO v_n FROM public.anew_roles r WHERE r.code = v_papel AND r.is_system = true AND r.organization_id IS NULL;
    IF v_n = 0 THEN
      RAISE NOTICE 'Papel % global não existe nesta base: não se concede nada.', v_papel;
      CONTINUE;
    ELSIF v_n > 1 THEN
      RAISE EXCEPTION 'GUARDA: % papéis % globais de sistema (esperado 1)', v_n, v_papel;
    END IF;
    SELECT r.id INTO v_role FROM public.anew_roles r WHERE r.code = v_papel AND r.is_system = true AND r.organization_id IS NULL;

    v_prev_claim := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
    SELECT v_role, c, NULL::uuid FROM unnest(v_codes) AS c
    ON CONFLICT (role_id, permission_code) DO NOTHING;
    PERFORM set_config('request.jwt.claims', CASE WHEN coalesce(v_prev_claim, '') = '' THEN '{}' ELSE v_prev_claim END, true);

    SELECT count(*) INTO v_n FROM public.anew_role_permissions rp WHERE rp.role_id = v_role AND rp.permission_code = ANY (v_codes);
    IF v_n <> 9 THEN
      RAISE EXCEPTION 'CONFERIR: o % tem % de 9 permissões novas', v_papel, v_n;
    END IF;
  END LOOP;
END $$;

-- 3. Papel no Negócio (RH): só acrescenta
INSERT INTO public.neg_papeis_permissoes (papel, permission_code)
SELECT p, c FROM unnest(ARRAY['comercial', 'direcao']) p,
                 unnest(ARRAY['negocios.orcamento.editar', 'negocios.proposta.enviar', 'negocios.contrato.editar', 'quotes.view_costs']) c
UNION ALL SELECT 'direcao', c FROM unnest(ARRAY['negocios.margem.aprovar', 'client_contracts.cancel', 'negocios.obra.planear', 'negocios.obra.materiais']) c
UNION ALL SELECT 'financeiro', 'quotes.view_costs'
UNION ALL SELECT 'juridico', 'negocios.contrato.editar'
UNION ALL SELECT 'operacoes', c FROM unnest(ARRAY['negocios.obra.planear', 'negocios.obra.executar', 'negocios.obra.materiais', 'quotes.view_costs']) c
UNION ALL SELECT 'tecnico', 'negocios.obra.executar'
ON CONFLICT DO NOTHING;

DO $$
DECLARE v_falta text;
BEGIN
  -- Conferir: todos os códigos dados aos papéis existem no catálogo
  SELECT string_agg(DISTINCT m.permission_code, ', ') INTO v_falta FROM public.neg_papeis_permissoes m
  WHERE NOT EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = m.permission_code) AND m.permission_code <> 'negocios.obra';
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: códigos em neg_papeis_permissoes que não estão no catálogo: %', v_falta;
  END IF;
  IF (SELECT count(*) FROM public.neg_papeis_permissoes WHERE permission_code LIKE 'negocios.%.%' OR permission_code IN ('quotes.view_costs', 'client_contracts.cancel')) <> 19 THEN
    RAISE EXCEPTION 'CONFERIR: esperadas 19 linhas novas em neg_papeis_permissoes';
  END IF;
END $$;
