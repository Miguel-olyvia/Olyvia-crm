-- =============================================================================
-- Operações — dar acesso a todas as empresas
--
-- ⚠ LÊ ISTO ANTES DE CORRER.
--
-- Este ficheiro dá ao utilizador o papel **System Admin**. Isso não é "acesso
-- a Operações": é administração da plataforma inteira. Confirmado por leitura
-- das duas funções que decidem tudo no CRM:
--
--   get_user_visible_org_ids()  devolve `SELECT id FROM anew_organizations`
--                               SEM FILTRO a quem tenha um papel com
--                               code = 'system_admin' — as 56 organizações.
--
--   is_system_admin_user()      passa a true, e todas as policies do CRM que
--                               começam por `is_system_admin_user(...) OR ...`
--                               deixam de aplicar as restrições seguintes.
--                               As de Operações incluídas.
--
-- Consequência prática: com isto vês e escreves em tudo — clientes, contratos,
-- propostas, faturação — nas 56 organizações, não só em Operações.
--
-- É a opção certa se és quem administra a plataforma. Se só precisas de mexer
-- em Operações, usa a ALTERNATIVA no fim do ficheiro, que é mais estreita.
--
--
-- PORQUE NÃO HÁ CAMINHO INTERMÉDIO SIMPLES
-- =========================================
-- `get_user_visible_org_ids()` também percorre `anew_hierarchy` — ascendentes,
-- descendentes e associações cruzadas. Se as 56 organizações pendessem de uma
-- raiz comum, uma membership nessa raiz bastava, sem privilégios de
-- plataforma.
--
-- Não é o caso: o diagnóstico deu **35 raízes para 56 organizações**. São 35
-- árvores separadas. Cobri-las por membership exigiria 35 linhas, e mais uma
-- por cada organização criada daí em diante.
--
--
-- O QUE ESTE FICHEIRO ESCREVE
-- ============================
--   1 linha em `anew_memberships`  — a membership com o papel System Admin
--   1 linha em `ops_utilizador_perfil` — a função dentro de Operações
--
-- Nada mais. Não cria utilizadores, não altera papéis, não toca em
-- permissões. O SQL para desfazer está no fim.
-- =============================================================================

BEGIN;

-- ┌──────────────────────────────────────────────────────────────────────┐
-- │  CONFIGURAÇÃO                                                        │
-- └──────────────────────────────────────────────────────────────────────┘
CREATE TEMP TABLE _cfg AS SELECT
  '1999rubencmail@gmail.com'::text  AS email,

  -- Função dentro de Operações: admin | gestor | operador | tecnico.
  -- Não confundir com o papel do CRM — esta só diz o que podes fazer às
  -- ordens de trabalho.
  'admin'::text                     AS funcao_operacoes;


-- ============================================================
-- Parte 0 — Verificações
-- ============================================================

DO $verificar$
DECLARE
  c        record;
  v_user   uuid;
  v_papel  uuid;
  v_membs  integer;
BEGIN
  SELECT * INTO c FROM _cfg;

  SELECT id INTO v_user FROM public.anew_users
   WHERE lower(email) = lower(c.email) AND deleted_at IS NULL;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Não existe utilizador ativo com o email %.', c.email;
  END IF;

  IF to_regclass('public.ops_utilizador_perfil') IS NULL THEN
    RAISE EXCEPTION 'As tabelas de Operações não existem. Corre db/schema.sql primeiro.';
  END IF;

  -- O papel de sistema tem de existir, e tem de ser único.
  SELECT count(*) INTO v_membs
    FROM public.anew_roles WHERE code = 'system_admin' AND deleted_at IS NULL;
  IF v_membs = 0 THEN
    RAISE EXCEPTION 'Não existe papel com code = ''system_admin''. Sem ele este caminho não funciona — vê a ALTERNATIVA no fim do ficheiro.';
  END IF;
  IF v_membs > 1 THEN
    RAISE EXCEPTION 'Há % papéis com code = ''system_admin''. Resolve a ambiguidade antes de continuar.', v_membs;
  END IF;

  -- Já é system admin? Então não há nada a fazer, e dizê-lo é melhor do que
  -- inserir uma linha duplicada em silêncio.
  IF EXISTS (
    SELECT 1 FROM public.anew_memberships m
      JOIN public.anew_roles r ON r.id = m.role_id
     WHERE m.user_id = v_user AND m.status = 'active' AND r.code = 'system_admin'
  ) THEN
    RAISE EXCEPTION 'Este utilizador já tem o papel System Admin. Nada a fazer.';
  END IF;
END
$verificar$;


-- ============================================================
-- Parte 1 — A membership
-- ============================================================
-- `anew_memberships.organization_id` é NOT NULL, por isso é preciso indicar
-- uma. Qual delas é indiferente para o efeito: o que abre as 56 é o `code` do
-- PAPEL, não a organização da linha. Usa-se a do próprio papel de sistema
-- quando ele tem uma, senão a organização mais antiga — a escolha é estável e
-- não arbitrária de cada vez que se corre.

INSERT INTO public.anew_memberships
  (user_id, organization_id, role_id, relationship_type, status)
SELECT
  u.id,
  COALESCE(r.organization_id, (SELECT id FROM public.anew_organizations ORDER BY id LIMIT 1)),
  r.id,
  'BELONGS_TO',
  'active'
  FROM public.anew_users u
  CROSS JOIN public.anew_roles r
  CROSS JOIN _cfg c
 WHERE lower(u.email) = lower(c.email)
   AND u.deleted_at IS NULL
   AND r.code = 'system_admin'
   AND r.deleted_at IS NULL;


-- ============================================================
-- Parte 2 — A função dentro de Operações
-- ============================================================
-- UMA linha. A aplicação lê a função sem filtrar por organização e espera no
-- máximo um resultado — várias linhas fariam a leitura falhar.
--
-- custo_hora fica NULL de propósito: sem ele o custo de mão de obra aparece a
-- zero e a aplicação diz que falta, em vez de inventar um número.

INSERT INTO public.ops_utilizador_perfil
  (organization_id, utilizador_id, funcao, ativo)
SELECT m.organization_id, u.id, c.funcao_operacoes, true
  FROM public.anew_users u
  JOIN public.anew_memberships m ON m.user_id = u.id AND m.status = 'active'
  CROSS JOIN _cfg c
 WHERE lower(u.email) = lower(c.email)
 ORDER BY m.created_at
 LIMIT 1
ON CONFLICT (organization_id, utilizador_id) DO NOTHING;


-- ============================================================
-- Relatório
-- ============================================================

DO $relatorio$
DECLARE
  c       record;
  v_orgs  integer;
  v_func  text;
BEGIN
  SELECT * INTO c FROM _cfg;

  SELECT count(*) INTO v_orgs
    FROM public.get_user_visible_org_ids(
      (SELECT au.id FROM auth.users au
        JOIN public.anew_users u ON u.auth_user_id = au.id
       WHERE lower(u.email) = lower(c.email) LIMIT 1));

  SELECT p.funcao INTO v_func
    FROM public.ops_utilizador_perfil p
    JOIN public.anew_users u ON u.id = p.utilizador_id
   WHERE lower(u.email) = lower(c.email) LIMIT 1;

  RAISE NOTICE 'Organizações visíveis agora: %.', v_orgs;
  RAISE NOTICE 'Função em Operações: %.', COALESCE(v_func, 'NENHUMA — algo correu mal');

  IF v_orgs < 2 THEN
    RAISE WARNING 'Esperavam-se todas as organizações. Confirma que o papel tem mesmo code = ''system_admin''.';
  END IF;
END
$relatorio$;

DROP TABLE _cfg;

COMMIT;


-- =============================================================================
-- ALTERNATIVA MAIS ESTREITA — só Operações, sem admin de plataforma
-- =============================================================================
-- Se preferires não ser system admin, dá-te membership apenas nas organizações
-- onde precisas de trabalhar, com um papel `org_admin`, e atribui-lhe as
-- permissões de Operações. Vês só essas organizações, e no CRM tens o que o
-- org_admin tem — não tudo.
--
-- Substitui a lista de nomes pelas organizações que interessam:
--
--   BEGIN;
--   INSERT INTO public.anew_memberships
--     (user_id, organization_id, role_id, relationship_type, status)
--   SELECT u.id, o.id, r.id, 'BELONGS_TO', 'active'
--     FROM public.anew_users u
--     JOIN public.anew_organizations o
--       ON o.name IN ('Nome da empresa A', 'Nome da empresa B')
--     JOIN public.anew_roles r
--       ON r.organization_id = o.id AND r.code = 'org_admin' AND r.deleted_at IS NULL
--    WHERE u.email = '1999rubencmail@gmail.com'
--   ON CONFLICT DO NOTHING;
--
--   -- E depois db/pos-instalacao.sql, com o nome desse papel.
--   COMMIT;
--
--
-- PARA DESFAZER O QUE ESTE FICHEIRO FEZ
-- ======================================
--   BEGIN;
--   DELETE FROM public.ops_utilizador_perfil
--    WHERE utilizador_id IN (SELECT id FROM public.anew_users
--                             WHERE email = '1999rubencmail@gmail.com');
--   DELETE FROM public.anew_memberships
--    WHERE user_id IN (SELECT id FROM public.anew_users
--                       WHERE email = '1999rubencmail@gmail.com')
--      AND role_id IN (SELECT id FROM public.anew_roles WHERE code = 'system_admin');
--   COMMIT;
-- =============================================================================
