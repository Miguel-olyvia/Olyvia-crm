-- =============================================================================
-- Operações — pós-instalação
--
-- Corre DEPOIS de `db/schema.sql`. Faz duas coisas, e só estas duas:
--
--   1. atribui as permissões `operations.*` a um papel que já existe;
--   2. dá a um utilizador a sua função dentro do módulo.
--
-- Sem (1) a app abre e não mostra nada. Sem (2) a app diz-te, no ecrã, que
-- não tens função atribuída — em vez de te deixar a olhar para o vazio.
--
-- ⚠ ANTES DE CORRER: preenche as duas variáveis do bloco CONFIGURAÇÃO.
--
-- Este ficheiro ESCREVE em `anew_role_permissions` — uma tabela do CRM. Não
-- altera o esquema dela e não mexe em linhas existentes: só acrescenta as
-- ligações papel→permissão que farias à mão na UI de Papéis. Se preferires
-- fazê-lo por lá, salta a Parte 1 e corre só a Parte 2.
-- =============================================================================

BEGIN;

-- ┌──────────────────────────────────────────────────────────────────────┐
-- │  CONFIGURAÇÃO                                                        │
-- └──────────────────────────────────────────────────────────────────────┘
CREATE TEMP TABLE _cfg AS SELECT
  -- Email do utilizador que fica com acesso total a Operações.
  -- Tem de existir em `anew_users`.
  '1999rubencmail@gmail.com'::text  AS email,

  -- Nome EXATO do papel que recebe as permissões (ver Papéis, no CRM).
  -- Fica NULL para saltar a Parte 1 e atribuir as permissões pela UI.
  'Admin'::text                     AS papel;


-- ============================================================
-- Parte 0 — Verificações, antes de escrever seja o que for
-- ============================================================
-- Falhar aqui com uma mensagem legível é melhor do que falhar a meio com o
-- erro cru de um trigger.

DO $verificar$
DECLARE
  v_email  text;
  v_papel  text;
  v_user   uuid;
  v_papeis integer;
  v_sistema integer;
  v_catalogo integer;
BEGIN
  SELECT email, papel INTO v_email, v_papel FROM _cfg;

  IF v_email = 'muda-me@exemplo.pt' THEN
    RAISE EXCEPTION 'Preenche o email no bloco CONFIGURAÇÃO antes de correr isto.';
  END IF;

  IF to_regclass('public.ops_utilizador_perfil') IS NULL THEN
    RAISE EXCEPTION 'As tabelas de Operações não existem. Corre db/schema.sql primeiro.';
  END IF;

  SELECT id INTO v_user FROM public.anew_users
   WHERE email = v_email AND deleted_at IS NULL;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Não existe nenhum utilizador ativo com o email %. Confirma em anew_users.', v_email;
  END IF;

  IF v_papel IS NOT NULL THEN
    SELECT count(*) INTO v_papeis
      FROM public.anew_roles WHERE name = v_papel AND deleted_at IS NULL;

    IF v_papeis = 0 THEN
      RAISE EXCEPTION
        'Não existe nenhum papel chamado "%". Vê os nomes com:  SELECT name, is_system FROM public.anew_roles WHERE deleted_at IS NULL ORDER BY name;',
        v_papel;
    END IF;

    -- `trg_protect_system_role_perms` bloqueia INSERT em anew_role_permissions
    -- para papéis de sistema. Melhor dizê-lo agora do que deixar o trigger
    -- rebentar a meio com uma mensagem que não ajuda ninguém.
    SELECT count(*) INTO v_sistema
      FROM public.anew_roles
     WHERE name = v_papel AND deleted_at IS NULL AND is_system IS TRUE;

    IF v_sistema > 0 THEN
      RAISE EXCEPTION
        'O papel "%" é um papel de SISTEMA e está protegido por trigger contra alterações de permissões. Escolhe um papel normal, ou atribui as permissões operations.* pela UI de Papéis.',
        v_papel;
    END IF;

    IF v_papeis > 1 THEN
      RAISE NOTICE 'Atenção: há % papéis chamados "%" (organizações diferentes). Todos vão receber as permissões.', v_papeis, v_papel;
    END IF;

    -- A Parte 1 lê os códigos de anew_permissions. Sem o catálogo, não
    -- atribui nada e o módulo ficava vazio sem ninguém perceber porquê.
    SELECT count(*) INTO v_catalogo
      FROM public.anew_permissions WHERE category = 'operations';
    IF v_catalogo = 0 THEN
      RAISE EXCEPTION 'As permissões de Operações não estão no catálogo. Corre db/permissoes.sql primeiro.';
    END IF;
  END IF;
END
$verificar$;


-- ============================================================
-- Parte 1 — Permissões do papel
-- ============================================================
-- Acrescenta as 15 ligações papel→permissão. `ON CONFLICT DO NOTHING`: correr
-- isto duas vezes não duplica nada e não desfaz nada.

INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
  FROM public.anew_roles r
  CROSS JOIN public.anew_permissions p
  JOIN _cfg c ON c.papel IS NOT NULL
 WHERE r.name = (SELECT papel FROM _cfg)
   AND r.deleted_at IS NULL
   AND r.is_system IS NOT TRUE
   AND p.category = 'operations'
ON CONFLICT DO NOTHING;


-- ============================================================
-- Parte 2 — Função do utilizador dentro do módulo
-- ============================================================
-- Uma linha por organização onde o utilizador é membro ativo. É isto que a
-- app lê para saber se és gestor ou técnico, e o que podes fazer.
--
-- custo_hora fica NULL de propósito: sem ele o custo de mão de obra aparece a
-- zero e a app diz que falta — melhor do que inventar um número.

INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao, ativo)
SELECT DISTINCT m.organization_id, u.id, 'admin', true
  FROM public.anew_users u
  JOIN public.anew_memberships m ON m.user_id = u.id AND m.status = 'active'
 WHERE u.email = (SELECT email FROM _cfg)
ON CONFLICT (organization_id, utilizador_id) DO NOTHING;


-- ============================================================
-- Relatório
-- ============================================================

DO $relatorio$
DECLARE
  v_email  text;
  v_papel  text;
  v_perms  integer;
  v_perfis integer;
BEGIN
  SELECT email, papel INTO v_email, v_papel FROM _cfg;

  SELECT count(*) INTO v_perms
    FROM public.anew_role_permissions rp
    JOIN public.anew_roles r ON r.id = rp.role_id
   WHERE r.name = v_papel AND r.deleted_at IS NULL
     AND rp.permission_code LIKE 'operations.%';

  SELECT count(*) INTO v_perfis
    FROM public.ops_utilizador_perfil p
    JOIN public.anew_users u ON u.id = p.utilizador_id
   WHERE u.email = v_email;

  IF v_papel IS NOT NULL THEN
    RAISE NOTICE 'Papel "%": % permissões de Operações atribuídas.', v_papel, v_perms;
  ELSE
    RAISE NOTICE 'Papel não indicado — atribui as permissões operations.* na UI de Papéis.';
  END IF;

  RAISE NOTICE 'Utilizador %: perfil de Operações em % organização(ões).', v_email, v_perfis;

  IF v_perfis = 0 THEN
    RAISE WARNING 'O utilizador não tem nenhuma membership ativa. Confirma em anew_memberships.';
  END IF;
END
$relatorio$;

DROP TABLE _cfg;

COMMIT;


-- =============================================================================
-- Para DESFAZER tudo o que este ficheiro fez:
--
--   DELETE FROM public.anew_role_permissions
--    WHERE permission_code LIKE 'operations.%';
--
--   DELETE FROM public.ops_utilizador_perfil;
--
-- Nenhum dos dois toca em dados do CRM.
-- =============================================================================
