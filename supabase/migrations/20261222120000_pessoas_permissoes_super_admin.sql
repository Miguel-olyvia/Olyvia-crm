-- ============================================================
-- 20261222120000_pessoas_permissoes_super_admin
-- ============================================================
-- O que faz
--   Dá as permissões pessoas.view, pessoas.create, pessoas.edit e
--   pessoas.delete ao papel GLOBAL de sistema Super Admin, encontrado pelo
--   código (anew_roles.code = 'super_admin', is_system = true,
--   organization_id nulo; no remoto é e91ef94e-a5e6-415c-9985-0c2b7594720b).
--   Só isto: não escreve linhas de âmbito para ninguém.
--   - Se o papel não existir (base reconstruída, preview), sai com NOTICE,
--     sem erro e sem escrever nada.
--   - Se existir mais do que um, aborta.
--
-- ALCANCE (lido no remoto a 19/10)
--   O papel é partilhado: 126 memberships activas, 17 utilizadores
--   distintos, 69 organizações, a Mudelar incluída. Todas passam a ter
--   pessoas.* no mesmo instante. Foi esta a escolha do utilizador.
--   Hoje negocios e negocio_eventos têm 0 linhas em toda a base.
--
--   Âmbito efectivo: sem linhas de âmbito o omissão é OWNED, MAS
--   resolve_lead_access_context (via crm_scope_keys) dá ORG a quem é
--   super_admin. Cada Super Admin passa a ver TODOS os negócios das
--   organizações onde tem membership activa, não só os próprios.
--
--   Organizações filhas: um Super Admin de uma organização pai NÃO vê nem
--   cria negócios numa filha onde não tenha membership própria. As
--   políticas exigem organization_id em get_user_crm_org_ids (só as
--   memberships activas do utilizador) e uma chave de crm_scope_keys; só
--   quem é membro da filha a vê. Medido: 51 pares (Super Admin de pai,
--   filha sem membership) ficam bloqueados.
--
--   O que um Super Admin (da Mudelar, por exemplo) passa a poder fazer por
--   API, nas organizações onde tem membership: ler, criar, editar, enviar
--   para o lixo (soft delete) e restaurar negócios. NÃO pode DELETE
--   físico, mudar a organização, a pessoa ou o criador de um negócio, nem
--   escrever em negocio_eventos (os triggers da migration 1 recusam).
--
--   Levantamentos: a migration 2 (20261222110000_levantamento_tabelas)
--   usa pessoas.view/edit/delete, por isso esta concessão vale também
--   para os levantamentos. A migration 2 ainda NÃO está aplicada no remoto
--   e tem de ser aplicada ANTES desta (o timestamp garante a ordem no db
--   push); não aplicar esta sozinha.
--
-- LACUNAS ASSUMIDAS (migration futura)
--   - O soft delete e o restauro de negócios não deixam rasto: negocios
--     não tem auditoria genérica e negocio_eventos só regista mudanças de
--     estado.
--   - O ecrã de âmbitos pode mostrar "só os meus" para um Super Admin sem
--     linhas de âmbito enquanto a base lhe devolve tudo (a base dá ORG ao
--     super_admin; o cliente só tem atalho para o system_admin). Por
--     verificar no código do cliente.
--
-- Porquê o set_config
--   anew_role_permissions tem o trigger protect_system_role_permissions,
--   que recusa escritas em permissões de papéis is_system = true excepto
--   quando request.jwt.claims->>'role' = 'service_role'. É o caminho das
--   migrations anteriores que semearam papéis de sistema (20260919010000,
--   20261111070000, 20261113290000, 20261116110000, 20261119050000,
--   20261119070000). A claim é posta com set_config(..., true), LOCAL à
--   transacção, só à volta do INSERT. Nenhum trigger é desligado, nenhuma
--   função é alterada, nenhuma isenção é acrescentada.
--
--   AVISO: depois do INSERT a claim volta ao valor anterior se existia e
--   não era vazio; senão fica '{}'. NUNCA texto vazio: o trigger faz
--   current_setting(...)::jsonb, e ''::jsonb rebenta (22P02) em qualquer
--   escrita seguinte em anew_role_permissions na mesma transacção.
--
-- Efeito indirecto
--   entity_audit_log: o trigger existente trg_audit_anew_role_permissions
--   (fn_audit_anew_role_permissions) regista uma linha INSERT por
--   permissão (organization_id = sentinela 00000000-0000-0000-0000-
--   000000000001, source 'system'). Como essa função engole erros, o
--   CONFERIR confirma que as linhas de auditoria existem.
--
-- Idempotente: ON CONFLICT (role_id, permission_code) DO NOTHING. Numa
--   segunda execução não insere nada e o CONFERIR aceita 0 linhas novas.
--
-- Reversão: fora da pasta das migrations (NÃO APLICAR sem decisão; só
--   pode entrar como migration nova, com timestamp posterior). Apaga só as
--   4 linhas desta migration e precisa da mesma claim local.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  v_role        uuid;
  v_n           int;
  v_prev_claim  text;
  v_inserted    int;
  v_audit       int;
BEGIN
  -- Guarda: exactamente um papel Super Admin global de sistema.
  SELECT count(*) INTO v_n
  FROM public.anew_roles r
  WHERE r.code = 'super_admin'
    AND r.is_system = true
    AND r.organization_id IS NULL;

  IF v_n = 0 THEN
    RAISE NOTICE 'Papel super_admin global não existe nesta base: nada a fazer.';
    RETURN;
  END IF;
  IF v_n > 1 THEN
    RAISE EXCEPTION 'GUARDA: % papéis super_admin globais de sistema (esperado 1)', v_n;
  END IF;

  SELECT r.id INTO v_role
  FROM public.anew_roles r
  WHERE r.code = 'super_admin'
    AND r.is_system = true
    AND r.organization_id IS NULL;

  -- Guarda: as 4 permissões existem (criadas pela migration 20261222100000).
  SELECT count(*) INTO v_n
  FROM public.anew_permissions p
  WHERE p.code IN ('pessoas.view', 'pessoas.create', 'pessoas.edit', 'pessoas.delete');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'GUARDA: esperadas 4 permissões pessoas.*, encontradas %', v_n;
  END IF;

  -- Claim local só à volta do INSERT.
  v_prev_claim := current_setting('request.jwt.claims', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
  SELECT v_role, v.permission_code, NULL::uuid
  FROM (VALUES
    ('pessoas.view'),
    ('pessoas.create'),
    ('pessoas.edit'),
    ('pessoas.delete')
  ) AS v(permission_code)
  ON CONFLICT (role_id, permission_code) DO NOTHING;

  PERFORM set_config(
    'request.jwt.claims',
    CASE WHEN coalesce(v_prev_claim, '') = '' THEN '{}' ELSE v_prev_claim END,
    true);

  -- ==========================================================
  -- CONFERIR
  -- ==========================================================
  -- 1. As 4 permissões estão no papel.
  SELECT count(*) INTO v_n
  FROM public.anew_role_permissions rp
  WHERE rp.role_id = v_role
    AND rp.permission_code IN ('pessoas.view', 'pessoas.create', 'pessoas.edit', 'pessoas.delete');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'CONFERIR: o papel Super Admin tem % de 4 permissões pessoas.*', v_n;
  END IF;

  -- 2. Nesta transacção, as linhas pessoas.* novas são só deste papel:
  --    4 na primeira execução, 0 numa repetição.
  SELECT count(*) INTO v_inserted
  FROM public.anew_role_permissions rp
  WHERE rp.permission_code LIKE 'pessoas.%'
    AND rp.created_at = now();
  SELECT count(*) INTO v_n
  FROM public.anew_role_permissions rp
  WHERE rp.permission_code IN ('pessoas.view', 'pessoas.create', 'pessoas.edit', 'pessoas.delete')
    AND rp.role_id = v_role
    AND rp.created_by IS NULL
    AND rp.created_at = now();
  IF v_inserted <> v_n OR v_inserted NOT IN (0, 4) THEN
    RAISE EXCEPTION 'CONFERIR: % linha(s) pessoas.* novas nesta transacção, % no Super Admin (esperado 4 e 4, ou 0 e 0)',
      v_inserted, v_n;
  END IF;

  -- 3. A auditoria registou um INSERT por linha nova.
  SELECT count(*) INTO v_audit
  FROM public.entity_audit_log a
  WHERE a.table_name = 'anew_role_permissions'
    AND a.operation = 'INSERT'
    AND a.entity_id = v_role
    AND a.created_at = now()
    AND a.full_record ->> 'permission_code' LIKE 'pessoas.%';
  IF v_audit <> v_inserted THEN
    RAISE EXCEPTION 'CONFERIR: % linha(s) de auditoria para % inserção(ões)', v_audit, v_inserted;
  END IF;

  -- 4. A claim não ficou em service_role e não é texto vazio.
  IF coalesce(current_setting('request.jwt.claims', true), '') = '' THEN
    RAISE EXCEPTION 'CONFERIR: request.jwt.claims ficou vazia';
  END IF;
  IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') IS NOT DISTINCT FROM 'service_role'
     AND (nullif(v_prev_claim, '')::jsonb ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'CONFERIR: a claim service_role ficou activa depois do INSERT';
  END IF;

  -- 5. Funções e triggers intocados (md5 lidos no remoto a 19/10).
  IF md5(pg_get_functiondef('public.protect_system_role_permissions()'::regprocedure))
       <> '11f8c590be1948bb2a0a35884cb0dd64' THEN
    RAISE EXCEPTION 'CONFERIR: protect_system_role_permissions mudou';
  END IF;
  IF md5(pg_get_functiondef('public.fn_audit_anew_role_permissions()'::regprocedure))
       <> 'ebf773db85b79b41f520e229f1849e67' THEN
    RAISE EXCEPTION 'CONFERIR: fn_audit_anew_role_permissions mudou';
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.anew_role_permissions'::regclass
    AND NOT t.tgisinternal
    AND t.tgname::text IN ('trg_protect_system_role_perms', 'trg_audit_anew_role_permissions')
    AND t.tgenabled::text = 'O';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'CONFERIR: os triggers de anew_role_permissions não estão os dois activos (% de 2)', v_n;
  END IF;
END $$;

COMMIT;
