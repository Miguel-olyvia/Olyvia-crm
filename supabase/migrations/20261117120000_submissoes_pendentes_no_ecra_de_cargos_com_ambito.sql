-- A permissao das submissoes pendentes nao aparecia no ecra de Cargos, e nao
-- tinha selector de ambito. Duas causas, ambas nesta linha de catalogo:
--
-- 1. Nasceu com category = 'platform'. O ecra de Cargos so mostra as categorias
--    da lista em src/pages/Roles.tsx (sidebarCategories) e 'platform' nao esta
--    la -- por isso a permissao era invisivel.
-- 2. Nasceu com supports_scope = false, que e a coluna que decide se uma
--    permissao ganha selector de ambito no ecra de ambitos por utilizador
--    (MembershipScopesDialog).
--
-- Passa para a categoria 'leads', que e onde a pagina vive no menu
-- (/leads/pending-submissions, dentro do grupo CRM), e ganha suporte de ambito.
-- A partir daqui comporta-se como leads.view e clients.view: aparece na lista
-- de permissoes do cargo e aceita OWNED / ORG por utilizador.
--
-- Idempotente e nao destrutiva: altera uma linha de catalogo, nao mexe em
-- nenhuma atribuicao de cargo nem em nenhuma politica.

UPDATE "public"."anew_permissions"
SET "category"       = 'leads',
    "supports_scope" = true
WHERE "code" = 'platform.pending_submissions.view';
