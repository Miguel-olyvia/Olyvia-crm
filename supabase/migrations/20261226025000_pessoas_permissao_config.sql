-- ============================================================
-- 20261226025000_pessoas_permissao_config
-- ============================================================
-- O que faz
--   1. Acrescenta ao catálogo anew_permissions a permissão NOVA
--      pessoas.config («Configurar o workflow de Pessoas»), categoria
--      'pessoas', âmbito 'organization', supports_scope false.
--   2. Dá-a SÓ ao papel GLOBAL de sistema Super Admin, encontrado pelo
--      código (anew_roles.code = 'super_admin', is_system = true,
--      organization_id nulo; no remoto é e91ef94e-a5e6-415c-9985-0c2b7594720b).
--      Nenhum papel configurável de organização a recebe aqui.
--   Só isto: não toca noutras permissões, noutros papéis, em linhas de
--   âmbito, nem em funções. Segue o precedente de
--   20261222100000 (catálogo) e 20261222120000 (concessão ao Super Admin).
--   - Se o papel não existir (base reconstruída, preview), a permissão entra
--     no catálogo e a concessão é saltada com NOTICE, sem erro.
--   - Se existir mais do que um, aborta.
--
-- PARA QUE SERVE
--   Só a função neg_guardar_regras_qualificacao (20261226030000, que exige
--   esta migration aplicada antes) a verifica, por fn_neg_tem_permissao_org.
--   Essa função recusa (NG008) qualquer organização sem linha em
--   negocio_workflow_config ANTES de olhar para pessoas.config.
--
-- ALCANCE (lido no remoto a 20/10, só agregados)
--   O papel Super Admin é partilhado por todas as organizações: 126
--   memberships activas (mais 1 inactiva), 17 utilizadores distintos, 69
--   organizações. Todas passam a ter pessoas.config no mesmo instante, a
--   Mudelar incluída (3 organizações com «Mudelar» no nome, 3 memberships
--   Super Admin activas). Foi esta a escolha do utilizador.
--   Efeito prático: só 1 organização tem negocio_workflow_config (a nike,
--   com 7 utilizadores Super Admin activos); a Mudelar tem 0 linhas, por
--   isso a permissão não lhe abre nada: a função de escrita recusa-a antes.
--
-- O QUE ESTA MIGRATION NÃO GARANTE (lacunas lidas no remoto, fora do âmbito)
--   - «Só o Super Admin» vale para o que esta migration escreve, não para o
--     futuro: (a) bootstrap_org_creator dá TODAS as permissões do catálogo
--     ao papel configurável org_admin de cada organização NOVA, por isso uma
--     organização criada depois desta migration recebe pessoas.config no
--     seu Administrador (como já recebe pessoas.*); (b) rpc_create_role,
--     rpc_update_role e a política de INSERT de anew_role_permissions
--     aceitam qualquer código a quem tenha roles.create/roles.edit, por API.
--     O ecrã de papéis (src/pages/Roles.tsx, sidebarCategories) NÃO mostra
--     a categoria 'pessoas', por isso não há caixa para a marcar na UI.
--     Fechar isto na base (trigger ou lista em bootstrap_org_creator) é
--     mexer em peças partilhadas com a Mudelar: decisão à parte.
--   - has_anew_permission não é por organização; quem a filtra é
--     crm_scope_keys (resolve_lead_access_context), que dá ORG a qualquer
--     system_admin. Um system_admin com Super Admin noutra organização e
--     membro da nike com outro papel passaria; medido hoje: 0 utilizadores.
--
-- Porquê o set_config
--   anew_role_permissions tem o trigger protect_system_role_permissions, que
--   recusa escritas em papéis is_system excepto com
--   request.jwt.claims->>'role' = 'service_role'. Como em 20261222120000, a
--   claim é posta com set_config(..., true), LOCAL à transacção, só à volta
--   do INSERT, e reposta depois (nunca texto vazio: o trigger faz ::jsonb).
--   Nenhum trigger é desligado, nenhuma função é alterada.
--
-- Efeito indirecto
--   entity_audit_log: trg_audit_anew_role_permissions regista um INSERT
--   para a concessão. Como fn_audit_anew_role_permissions engole erros, o
--   CONFERIR confirma a linha de auditoria.
--
-- Idempotente: ON CONFLICT DO NOTHING nas duas tabelas. Numa repetição não
--   insere nada e o CONFERIR aceita 0 linhas novas.
--
-- Reversão: fora da pasta das migrations (só como migration nova, com
--   timestamp posterior, e depois de reverter 20261226030000).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Pré-condição: o que se lê é o que estava no remoto a 20/10.
DO $pre$
DECLARE
  v_n int;
BEGIN
  IF md5(pg_catalog.pg_get_functiondef('public.protect_system_role_permissions()'::regprocedure))
       <> '11f8c590be1948bb2a0a35884cb0dd64' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: protect_system_role_permissions mudou desde 20/10; nada feito.';
  END IF;
  IF md5(pg_catalog.pg_get_functiondef('public.fn_audit_anew_role_permissions()'::regprocedure))
       <> 'ebf773db85b79b41f520e229f1849e67' THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: fn_audit_anew_role_permissions mudou desde 20/10; nada feito.';
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'public.anew_permissions'::regclass AND NOT t.tgisinternal;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: anew_permissions passou a ter % trigger(s); nada feito.', v_n;
  END IF;

  -- Se a permissão já existe (repetição), tem de ser a mesma.
  IF EXISTS (SELECT 1 FROM public.anew_permissions ap
             WHERE ap.code = 'pessoas.config'
               AND (ap.category IS DISTINCT FROM 'pessoas'
                    OR ap.scope IS DISTINCT FROM 'organization'
                    OR ap.supports_scope IS DISTINCT FROM false
                    OR ap.parent_code IS NOT NULL)) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: pessoas.config já existe com outra forma; nada feito.';
  END IF;

  -- Nenhum papel além do Super Admin global pode já ter pessoas.config
  -- (anew_role_permissions não tem chave estrangeira para o catálogo).
  SELECT count(*) INTO v_n
  FROM public.anew_role_permissions rp
  JOIN public.anew_roles r ON r.id = rp.role_id
  WHERE rp.permission_code = 'pessoas.config'
    AND NOT (r.code = 'super_admin' AND r.is_system AND r.organization_id IS NULL);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: % papel(éis) além do Super Admin já têm pessoas.config; nada feito.', v_n;
  END IF;
END
$pre$;

-- 1. Catálogo
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('pessoas.config', 'Configurar o workflow de Pessoas',
   'Alterar a configuração do botão Workflow da página Pessoas (regras de qualificação MQL/SQL). Só o Super Admin.',
   'pessoas', NULL, 4, false, 'organization', false)
ON CONFLICT (code) DO NOTHING;

-- 2. Concessão ao Super Admin global, e CONFERIR
DO $grant$
DECLARE
  v_role        uuid;
  v_n           int;
  v_prev_claim  text;
  v_inserted    int;
  v_audit       int;
BEGIN
  SELECT count(*) INTO v_n
  FROM public.anew_roles r
  WHERE r.code = 'super_admin' AND r.is_system = true AND r.organization_id IS NULL;

  IF v_n > 1 THEN
    RAISE EXCEPTION 'GUARDA: % papéis super_admin globais de sistema (esperado 1)', v_n;
  END IF;

  IF v_n = 1 THEN
    SELECT r.id INTO v_role
    FROM public.anew_roles r
    WHERE r.code = 'super_admin' AND r.is_system = true AND r.organization_id IS NULL;

    -- Claim local só à volta do INSERT.
    v_prev_claim := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

    INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
    VALUES (v_role, 'pessoas.config', NULL::uuid)
    ON CONFLICT (role_id, permission_code) DO NOTHING;

    PERFORM set_config(
      'request.jwt.claims',
      CASE WHEN coalesce(v_prev_claim, '') = '' THEN '{}' ELSE v_prev_claim END,
      true);
  ELSE
    RAISE NOTICE 'Papel super_admin global não existe nesta base: permissão no catálogo, sem concessão.';
  END IF;

  -- ==========================================================
  -- CONFERIR
  -- ==========================================================
  -- 1. A permissão está no catálogo, uma vez, com a forma esperada.
  SELECT count(*) INTO v_n
  FROM public.anew_permissions ap
  WHERE ap.code = 'pessoas.config' AND ap.category = 'pessoas'
    AND ap.scope = 'organization' AND ap.supports_scope = false AND ap.parent_code IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CONFERIR: pessoas.config no catálogo % vez(es) com a forma esperada (esperado 1)', v_n;
  END IF;

  -- 2. O catálogo só ganhou esta linha nesta transacção.
  SELECT count(*) INTO v_n
  FROM public.anew_permissions ap
  WHERE ap.created_at = now() AND ap.code <> 'pessoas.config';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % outra(s) permissão(ões) criadas nesta transacção', v_n;
  END IF;

  -- 3. pessoas.config está só no Super Admin global (ou em nenhum, sem ele).
  SELECT count(*) INTO v_n
  FROM public.anew_role_permissions rp
  WHERE rp.permission_code = 'pessoas.config'
    AND rp.role_id IS DISTINCT FROM v_role;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: pessoas.config está em % papel(éis) além do Super Admin', v_n;
  END IF;
  IF v_role IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.anew_role_permissions rp
       WHERE rp.role_id = v_role AND rp.permission_code = 'pessoas.config') THEN
    RAISE EXCEPTION 'CONFERIR: o Super Admin não ficou com pessoas.config';
  END IF;

  -- 4. Nesta transacção só entrou esta concessão: 1 na primeira vez, 0 numa
  --    repetição; nenhuma outra linha de anew_role_permissions.
  SELECT count(*) INTO v_inserted
  FROM public.anew_role_permissions rp
  WHERE rp.created_at = now();
  SELECT count(*) INTO v_n
  FROM public.anew_role_permissions rp
  WHERE rp.created_at = now()
    AND rp.role_id = v_role
    AND rp.permission_code = 'pessoas.config'
    AND rp.created_by IS NULL;
  IF v_inserted <> v_n OR v_inserted NOT IN (0, 1) THEN
    RAISE EXCEPTION 'CONFERIR: % linha(s) novas em anew_role_permissions, % delas a concessão esperada',
      v_inserted, v_n;
  END IF;

  -- 5. A auditoria registou a concessão nova.
  SELECT count(*) INTO v_audit
  FROM public.entity_audit_log a
  WHERE a.table_name = 'anew_role_permissions'
    AND a.operation = 'INSERT'
    AND a.entity_id = v_role
    AND a.created_at = now()
    AND a.full_record ->> 'permission_code' = 'pessoas.config';
  IF v_audit <> v_inserted THEN
    RAISE EXCEPTION 'CONFERIR: % linha(s) de auditoria para % inserção(ões)', v_audit, v_inserted;
  END IF;

  -- 6. As 4 permissões pessoas.* do Super Admin continuam lá.
  IF v_role IS NOT NULL THEN
    SELECT count(*) INTO v_n
    FROM public.anew_role_permissions rp
    WHERE rp.role_id = v_role
      AND rp.permission_code IN ('pessoas.view', 'pessoas.create', 'pessoas.edit', 'pessoas.delete');
    IF v_n <> 4 THEN
      RAISE EXCEPTION 'CONFERIR: o Super Admin tem % de 4 permissões pessoas.*', v_n;
    END IF;
  END IF;

  -- 7. A claim (só mexida quando há papel) não ficou em service_role nem vazia.
  IF v_role IS NOT NULL THEN
    IF coalesce(current_setting('request.jwt.claims', true), '') = '' THEN
      RAISE EXCEPTION 'CONFERIR: request.jwt.claims ficou vazia';
    END IF;
    IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') IS NOT DISTINCT FROM 'service_role'
       AND (nullif(v_prev_claim, '')::jsonb ->> 'role') IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'CONFERIR: a claim service_role ficou activa depois do INSERT';
    END IF;
  END IF;

  -- 8. Os dois triggers de anew_role_permissions continuam activos.
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'public.anew_role_permissions'::regclass
    AND NOT t.tgisinternal
    AND t.tgname::text IN ('trg_protect_system_role_perms', 'trg_audit_anew_role_permissions')
    AND t.tgenabled::text = 'O';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'CONFERIR: os triggers de anew_role_permissions não estão os dois activos (% de 2)', v_n;
  END IF;
END
$grant$;

COMMIT;
