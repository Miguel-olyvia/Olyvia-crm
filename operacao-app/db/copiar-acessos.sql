-- =============================================================================
-- Operações — copiar os acessos de outra pessoa
--
-- Dá ao utilizador de destino exatamente as mesmas organizações e os mesmos
-- papéis que a pessoa de origem já tem. Nem mais, nem menos.
--
-- É o caminho preferível ao papel de sistema: em vez de abrir as 56
-- organizações e ligar o bypass de administrador da plataforma, replica um
-- âmbito que já existe e que alguém decidiu conscientemente.
--
--
-- O QUE ESCREVE
-- =============
--   N linhas em `anew_memberships`      — uma por acesso copiado
--   1 linha  em `ops_utilizador_perfil` — a função dentro de Operações
--
-- Não altera nada da pessoa de origem. Não cria utilizadores, não altera
-- papéis, não toca em permissões. O SQL para desfazer está no fim.
--
-- Antes de inserir, imprime a lista do que vai copiar. Se a lista não for a
-- que esperavas, é sinal para parar e não para continuar.
-- =============================================================================

BEGIN;

-- ┌──────────────────────────────────────────────────────────────────────┐
-- │  CONFIGURAÇÃO                                                        │
-- └──────────────────────────────────────────────────────────────────────┘
CREATE TEMP TABLE _cfg AS SELECT
  -- De quem se copiam os acessos. EMAIL, não nome: o nome não é único
  -- (há dois Ricardo Belchior, em empresas diferentes) e copiar da pessoa
  -- errada é o tipo de engano que só se descobre semanas depois.
  --   ricardo.belchior@bmlar.pt      → BMLar
  --   rbelchior@bmg-services.pt      → BMG Services
  'ricardo.belchior@bmlar.pt'::text  AS origem_email,

  -- Para quem vão.
  '1999rubencmail@gmail.com'::text  AS destino_email,

  -- Função dentro de Operações: admin | gestor | operador | tecnico.
  -- Não confundir com o papel do CRM — esta só governa as ordens de trabalho.
  'admin'::text                     AS funcao_operacoes;


-- ============================================================
-- Parte 0 — Verificações
-- ============================================================

DO $verificar$
DECLARE
  c        record;
  v_n      integer;
  v_origem uuid;
  v_dest   uuid;
BEGIN
  SELECT * INTO c FROM _cfg;

  IF to_regclass('public.ops_utilizador_perfil') IS NULL THEN
    RAISE EXCEPTION 'As tabelas de Operações não existem. Corre db/schema.sql primeiro.';
  END IF;

  -- Origem, por email. O nome não serve: há dois Ricardo Belchior.
  SELECT id INTO v_origem FROM public.anew_users
   WHERE lower(email) = lower(c.origem_email) AND deleted_at IS NULL;

  IF v_origem IS NULL THEN
    RAISE EXCEPTION 'Não existe utilizador ativo com o email %. Vê os que há com:  SELECT name, email FROM public.anew_users WHERE deleted_at IS NULL ORDER BY name;', c.origem_email;
  END IF;

  -- Destino.
  SELECT id INTO v_dest FROM public.anew_users
   WHERE lower(email) = lower(c.destino_email) AND deleted_at IS NULL;
  IF v_dest IS NULL THEN
    RAISE EXCEPTION 'Não existe utilizador ativo com o email %.', c.destino_email;
  END IF;

  IF v_origem = v_dest THEN
    RAISE EXCEPTION 'A origem e o destino são a mesma pessoa.';
  END IF;

  -- A origem tem mesmo acessos para copiar?
  SELECT count(*) INTO v_n FROM public.anew_memberships
   WHERE user_id = v_origem AND status = 'active';
  IF v_n = 0 THEN
    RAISE EXCEPTION 'A pessoa de origem não tem nenhuma membership ativa. Não há nada para copiar.';
  END IF;
END
$verificar$;


-- ============================================================
-- Parte 1 — Mostrar o que vai ser copiado, antes de copiar
-- ============================================================
-- Copiar acessos às cegas é como pedir uma chave sem perguntar que portas
-- abre. Isto imprime a lista, e assinala se algum dos papéis for de sistema.

DO $mostrar$
DECLARE
  r       record;
  v_total integer := 0;
  v_novas integer := 0;
BEGIN
  RAISE NOTICE '─── acessos de origem ────────────────────';
  FOR r IN
    SELECT o.name AS org,
           p.name AS papel,
           p.code AS codigo,
           p.is_system,
           EXISTS (
             SELECT 1 FROM public.anew_memberships x
              JOIN public.anew_users d ON d.id = x.user_id
              WHERE lower(d.email) = lower((SELECT destino_email FROM _cfg))
                AND x.organization_id = m.organization_id
                AND x.role_id = m.role_id
                AND x.status = 'active'
           ) AS ja_tem
      FROM public.anew_memberships m
      JOIN public.anew_users u  ON u.id = m.user_id
      JOIN public.anew_organizations o ON o.id = m.organization_id
      JOIN public.anew_roles p  ON p.id = m.role_id
     WHERE lower(u.email) = lower((SELECT origem_email FROM _cfg))
       AND u.deleted_at IS NULL
       AND m.status = 'active'
     ORDER BY o.name
  LOOP
    v_total := v_total + 1;
    IF NOT r.ja_tem THEN v_novas := v_novas + 1; END IF;
    RAISE NOTICE '  % — % (%)%',
      r.org, r.papel, r.codigo,
      CASE WHEN r.is_system THEN '  ⚠ PAPEL DE SISTEMA' ELSE '' END
      || CASE WHEN r.ja_tem THEN '  [já tinha]' ELSE '' END;
  END LOOP;
  RAISE NOTICE '─── % acessos, % por copiar ──────────────', v_total, v_novas;
END
$mostrar$;


-- ============================================================
-- Parte 2 — Copiar
-- ============================================================
-- `NOT EXISTS` em vez de `ON CONFLICT`: o índice único é PARCIAL
-- (user_id, organization_id, role_id) WHERE status = 'active', e um
-- ON CONFLICT sobre índices parciais obriga a repetir o predicado — mais
-- frágil do que dizer simplesmente o que se quer.

INSERT INTO public.anew_memberships
  (user_id, organization_id, role_id, relationship_type, status)
SELECT d.id, m.organization_id, m.role_id, m.relationship_type, 'active'
  FROM public.anew_memberships m
  JOIN public.anew_users o ON o.id = m.user_id
  CROSS JOIN _cfg c
  JOIN public.anew_users d ON lower(d.email) = lower(c.destino_email) AND d.deleted_at IS NULL
 WHERE lower(o.email) = lower(c.origem_email)
   AND o.deleted_at IS NULL
   AND m.status = 'active'
   AND NOT EXISTS (
     SELECT 1 FROM public.anew_memberships x
      WHERE x.user_id = d.id
        AND x.organization_id = m.organization_id
        AND x.role_id = m.role_id
        AND x.status = 'active'
   );


-- ============================================================
-- Parte 3 — A função dentro de Operações
-- ============================================================
-- UMA linha. A aplicação lê a função sem filtrar por organização e espera no
-- máximo um resultado — várias linhas fariam a leitura falhar.
--
-- custo_hora fica NULL de propósito: sem ele o custo de mão de obra aparece a
-- zero e a aplicação diz que falta, em vez de inventar um número.

INSERT INTO public.ops_utilizador_perfil
  (organization_id, utilizador_id, funcao, ativo)
SELECT m.organization_id, d.id, c.funcao_operacoes, true
  FROM public.anew_users d
  JOIN public.anew_memberships m ON m.user_id = d.id AND m.status = 'active'
  CROSS JOIN _cfg c
 WHERE lower(d.email) = lower(c.destino_email)
   AND NOT EXISTS (SELECT 1 FROM public.ops_utilizador_perfil p WHERE p.utilizador_id = d.id)
 ORDER BY m.created_at
 LIMIT 1;


-- ============================================================
-- Relatório
-- ============================================================

DO $relatorio$
DECLARE
  c      record;
  v_orgs integer;
  v_func text;
BEGIN
  SELECT * INTO c FROM _cfg;

  SELECT count(*) INTO v_orgs
    FROM public.anew_memberships m
    JOIN public.anew_users d ON d.id = m.user_id
   WHERE lower(d.email) = lower(c.destino_email) AND m.status = 'active';

  SELECT p.funcao INTO v_func
    FROM public.ops_utilizador_perfil p
    JOIN public.anew_users d ON d.id = p.utilizador_id
   WHERE lower(d.email) = lower(c.destino_email) LIMIT 1;

  RAISE NOTICE 'Destino tem agora % membership(s) ativa(s).', v_orgs;
  RAISE NOTICE 'Função em Operações: %.', COALESCE(v_func, 'NENHUMA — algo correu mal');
END
$relatorio$;

DROP TABLE _cfg;

COMMIT;


-- =============================================================================
-- FALTA AINDA: as permissões de Operações
--
-- Copiar acessos dá as organizações e o papel, mas as permissões
-- `operations.*` são do PAPEL e ninguém lhas atribuiu ainda. Sem elas a
-- aplicação abre e não mostra ordens nenhumas.
--
-- Corre a seguir `db/pos-instalacao.sql`, pondo no bloco CONFIGURAÇÃO o nome
-- do papel que apareceu na lista acima.
--
--
-- PARA DESFAZER
-- ==============
--   BEGIN;
--   DELETE FROM public.ops_utilizador_perfil
--    WHERE utilizador_id IN (SELECT id FROM public.anew_users
--                             WHERE email = '1999rubencmail@gmail.com');
--   DELETE FROM public.anew_memberships
--    WHERE user_id IN (SELECT id FROM public.anew_users
--                       WHERE email = '1999rubencmail@gmail.com');
--   COMMIT;
--
-- Nenhum dos dois toca na pessoa de origem.
-- =============================================================================
