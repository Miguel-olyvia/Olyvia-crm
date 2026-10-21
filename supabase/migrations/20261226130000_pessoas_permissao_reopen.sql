-- ============================================================
-- 20261226130000_pessoas_permissao_reopen  (Fase N, migration C)
-- ============================================================
-- *** SÓ SE APLICA COM AUTORIZAÇÃO EXPRESSA DO UTILIZADOR. ***
-- Mexe no catálogo de permissões (anew_permissions) e nas concessões do
-- papel GLOBAL Super Admin (anew_role_permissions), que são partilhados por
-- todas as organizações, a Mudelar incluída.
--
-- Desenho: vault ficheiros/crm/negocios-fecho-por-tipo-desenho.md (v4),
--   secção 12 e 16.1 (linha C). Segue o precedente
--   20261226025000_pessoas_permissao_config.sql, linha a linha.
--
-- O que faz
--   1. Acrescenta ao catálogo anew_permissions a permissão NOVA
--      pessoas.reopen («Reabrir negócios ganhos»), categoria 'pessoas',
--      âmbito 'organization', supports_scope false, display_order 5.
--   2. Dá-a SÓ ao papel GLOBAL de sistema Super Admin (anew_roles.code =
--      'super_admin', is_system, organization_id nulo; no remoto é
--      e91ef94e-a5e6-415c-9985-0c2b7594720b). Nenhum papel de organização a
--      recebe aqui. O ecrã de papéis (src/pages/Roles.tsx) NÃO muda e não
--      mostra a categoria Pessoas (decisão 4 do desenho).
--   Só isto: não toca noutras permissões, noutros papéis, em linhas de
--   âmbito, nem em funções.
--   - Se o papel não existir (base reconstruída), a permissão entra no
--     catálogo e a concessão é saltada com NOTICE, sem erro.
--   - Se existir mais do que um, aborta.
--
-- PARA QUE SERVE
--   Só neg_reabrir_ganho (migration D) a verifica, por
--   fn_neg_tem_permissao_org, DEPOIS de exigir a linha de
--   negocio_workflow_config (NG008). Sem esta migration, «Reabrir negócio»
--   recusa com 42501 a toda a gente e o ecrã esconde o botão.
--   Protege SÓ o botão. A reabertura automática por documento (contrato
--   substituído, proposta recusada depois de aceite, documento reaberto com
--   alterações) é feita por fn_neg_decidir_negocio (migration D) sem esta
--   permissão, por desenho: é o documento que manda. Por isso o texto da
--   permissão não diz «só o Super Admin reabre negócios».
--
-- QUEM A RECEBE (decisão do utilizador: só o Super Admin)
--   O papel de código 'super_admin' é o que a interface mostra como «Super
--   Admin» (CompanySwitcher). 'org_admin' é o «Admin Org» / «Administrador»
--   e NÃO a recebe aqui.
--
-- ALCANCE (lido no remoto a 20/10, só agregados)
--   O papel Super Admin é partilhado: 126 memberships activas, 17
--   utilizadores distintos, 69 organizações (os mesmos números do precedente
--   20261226025000). Todas passam a ter pessoas.reopen no mesmo instante, a
--   Mudelar incluída (3 organizações com «Mudelar» no nome, 3 memberships
--   Super Admin activas; na nike, 7 utilizadores). Efeito prático: só 1 organização tem
--   negocio_workflow_config (a nike); a Mudelar tem 0 linhas, por isso a
--   permissão não lhe abre nada: neg_reabrir_ganho recusa-a antes (NG008).
--   Para a Mudelar não muda nada nos dados nem no comportamento.
--
-- O QUE ESTA MIGRATION NÃO GARANTE (as mesmas lacunas do precedente)
--   - bootstrap_org_creator dá TODAS as permissões do catálogo ao papel
--     org_admin de cada organização NOVA: uma organização criada depois
--     desta migration recebe pessoas.reopen no seu Administrador (como já
--     recebe pessoas.*; o desenho, secção 12, aceita-o).
--   - rpc_create_role, rpc_update_role e a política de INSERT de
--     anew_role_permissions aceitam qualquer código a quem tenha
--     roles.create/roles.edit, por API (não há caixa na UI).
--
-- Porquê o set_config
--   anew_role_permissions tem o trigger protect_system_role_permissions, que
--   recusa escritas em papéis is_system excepto com
--   request.jwt.claims->>'role' = 'service_role'. Como no precedente, a claim
--   é posta com set_config(..., true), LOCAL à transacção, só à volta do
--   INSERT, e reposta depois. Nenhum trigger é desligado.
--
-- Idempotente: ON CONFLICT DO NOTHING nas duas tabelas.
-- O que o ecrã tem de fazer junto: nada nesta migration. O botão «Reabrir
--   negócio» (migration D) mostra-se só a quem tem pessoas.reopen.
-- Reversão: fora da pasta das migrations
--   (reversoes/R_20261226130000_pessoas_permissao_reopen.sql).
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
             WHERE ap.code = 'pessoas.reopen'
               AND (ap.category IS DISTINCT FROM 'pessoas'
                    OR ap.scope IS DISTINCT FROM 'organization'
                    OR ap.supports_scope IS DISTINCT FROM false
                    OR ap.parent_code IS NOT NULL)) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: pessoas.reopen já existe com outra forma; nada feito.';
  END IF;

  -- Nenhum papel além do Super Admin global pode já ter pessoas.reopen.
  SELECT count(*) INTO v_n
  FROM public.anew_role_permissions rp
  JOIN public.anew_roles r ON r.id = rp.role_id
  WHERE rp.permission_code = 'pessoas.reopen'
    AND NOT (r.code = 'super_admin' AND r.is_system AND r.organization_id IS NULL);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: % papel(éis) além do Super Admin já têm pessoas.reopen; nada feito.', v_n;
  END IF;

  -- O precedente (pessoas.config) está aplicado.
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = 'pessoas.config') THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: falta pessoas.config (20261226025000); nada feito.';
  END IF;
END
$pre$;

-- 1. Catálogo
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('pessoas.reopen', 'Reabrir negócios ganhos',
   'Botão «Reabrir negócio» na página Pessoas: reabrir à mão um negócio ganho. Não desfaz a conversão nem mexe nos documentos. Não se aplica à reabertura automática quando um documento muda (contrato substituído, proposta recusada depois de aceite, documento reaberto com alterações), que acontece sem esta permissão.',
   'pessoas', NULL, 5, false, 'organization', false)
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
    VALUES (v_role, 'pessoas.reopen', NULL::uuid)
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
  WHERE ap.code = 'pessoas.reopen' AND ap.category = 'pessoas'
    AND ap.scope = 'organization' AND ap.supports_scope = false AND ap.parent_code IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CONFERIR: pessoas.reopen no catálogo % vez(es) com a forma esperada (esperado 1)', v_n;
  END IF;

  -- 2. O catálogo só ganhou esta linha nesta transacção.
  SELECT count(*) INTO v_n
  FROM public.anew_permissions ap
  WHERE ap.created_at = now() AND ap.code <> 'pessoas.reopen';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % outra(s) permissão(ões) criadas nesta transacção', v_n;
  END IF;

  -- 3. pessoas.reopen está só no Super Admin global (ou em nenhum, sem ele).
  SELECT count(*) INTO v_n
  FROM public.anew_role_permissions rp
  WHERE rp.permission_code = 'pessoas.reopen'
    AND rp.role_id IS DISTINCT FROM v_role;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: pessoas.reopen está em % papel(éis) além do Super Admin', v_n;
  END IF;
  IF v_role IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.anew_role_permissions rp
       WHERE rp.role_id = v_role AND rp.permission_code = 'pessoas.reopen') THEN
    RAISE EXCEPTION 'CONFERIR: o Super Admin não ficou com pessoas.reopen';
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
    AND rp.permission_code = 'pessoas.reopen'
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
    AND a.full_record ->> 'permission_code' = 'pessoas.reopen';
  IF v_audit <> v_inserted THEN
    RAISE EXCEPTION 'CONFERIR: % linha(s) de auditoria para % inserção(ões)', v_audit, v_inserted;
  END IF;

  -- 6. As 5 permissões pessoas.* anteriores do Super Admin continuam lá.
  IF v_role IS NOT NULL THEN
    SELECT count(*) INTO v_n
    FROM public.anew_role_permissions rp
    WHERE rp.role_id = v_role
      AND rp.permission_code IN ('pessoas.view', 'pessoas.create', 'pessoas.edit',
                                 'pessoas.delete', 'pessoas.config');
    IF v_n <> 5 THEN
      RAISE EXCEPTION 'CONFERIR: o Super Admin tem % de 5 permissões pessoas.* anteriores', v_n;
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
