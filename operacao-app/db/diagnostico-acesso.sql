-- =============================================================================
-- Operações — diagnóstico de acesso
--
-- Só lê. Não escreve nada, em lado nenhum.
--
-- Responde às perguntas que decidem o que fazer a seguir:
--   · a conta existe na autenticação, e está confirmada?
--   · tem perfil de negócio (anew_users)?
--   · a que organizações pertence, e com que papel?
--   · já tem perfil no módulo de Operações?
--   · quantas organizações existem, e quantas são raiz?
--   · que papéis há, e qual o `code` de cada um?
--
-- O `code` do papel é o que mais importa: `get_user_visible_org_ids()` devolve
-- TODAS as organizações a quem tenha um papel com `code = 'system_admin'`.
-- Para toda a gente, a visibilidade vem das memberships mais a hierarquia
-- (ascendentes, descendentes e associações cruzadas).
-- =============================================================================

WITH alvo AS (SELECT '1999rubencmail@gmail.com'::text AS email)
SELECT 'auth.users' AS onde,
       au.id::text AS id,
       au.email AS detalhe,
       CASE WHEN au.email_confirmed_at IS NULL THEN 'POR CONFIRMAR' ELSE 'confirmado' END AS nota
  FROM auth.users au, alvo a WHERE lower(au.email) = lower(a.email)
UNION ALL
SELECT 'anew_users', u.id::text, u.email,
       CASE WHEN u.deleted_at IS NOT NULL THEN 'APAGADO' ELSE u.status END
  FROM public.anew_users u, alvo a WHERE lower(u.email) = lower(a.email)
UNION ALL
SELECT 'membership', m.id::text, o.name, r.name || ' (code=' || COALESCE(r.code,'?') || ')'
  FROM public.anew_memberships m
  JOIN public.anew_users u ON u.id = m.user_id
  JOIN public.anew_organizations o ON o.id = m.organization_id
  JOIN public.anew_roles r ON r.id = m.role_id, alvo a
 WHERE lower(u.email) = lower(a.email)
UNION ALL
SELECT 'ops_perfil', p.id::text, p.funcao, CASE WHEN p.ativo THEN 'ativo' ELSE 'inativo' END
  FROM public.ops_utilizador_perfil p
  JOIN public.anew_users u ON u.id = p.utilizador_id, alvo a
 WHERE lower(u.email) = lower(a.email)
UNION ALL
SELECT '— total de organizacoes —', count(*)::text, '', '' FROM public.anew_organizations
UNION ALL
SELECT '— organizacoes raiz —', count(*)::text, '', ''
  FROM public.anew_organizations o
 WHERE NOT EXISTS (SELECT 1 FROM public.anew_hierarchy h WHERE h.child_org_id = o.id)
UNION ALL
SELECT 'papel disponivel', r.id::text, r.name,
       'code=' || COALESCE(r.code,'?') || CASE WHEN r.is_system THEN ' SISTEMA' ELSE '' END
  FROM public.anew_roles r WHERE r.deleted_at IS NULL
ORDER BY 1;
