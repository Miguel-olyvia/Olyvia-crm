-- Bundles: pesquisa/listagem de bundles no seletor de orçamentos estava a dar
-- timeout (57014, statement_timeout de 8s) mesmo com paginação em lotes de 10.
--
-- Causa confirmada por EXPLAIN ANALYZE (não é o count:'exact'; esse custa
-- ~30ms isolado com RLS): a query gerada pelo PostgREST usa LEFT JOIN LATERAL
-- para bundle_components -> products/services -> product_prices/service_prices,
-- e o ORDER BY bundles.name + LIMIT ficam por cima de todos esses LATERAL
-- joins. Sem um índice que já entregue "bundles" ordenados por nome para o
-- organization_id em causa, o planeador do Postgres tem de materializar a
-- árvore completa de componentes/produtos/preços dos ~93 bundles ativos da
-- organização antes de ordenar e cortar ao LIMIT 10 — ou seja, o LIMIT não
-- reduzia nada o trabalho feito. Isto fazia o custo (e o tempo) escalar com o
-- catálogo completo, não com o tamanho da página, e explica porque o
-- carregamento em lotes (commit 3f7b53fd) não resolveu o timeout.
--
-- Com este índice parcial (organization_id, name) restrito às linhas
-- realmente elegíveis (is_active, status='active', deleted_at IS NULL), o
-- Postgres consegue ler os bundles já ordenados por nome e aplicar o LIMIT
-- antes de entrar nos LATERAL joins, avaliando-os só para as 10 linhas
-- pedidas em vez das 93. Medido com EXPLAIN ANALYZE (RLS ativo, utilizador
-- real da Mudelar): primeira página sem pesquisa passou de ~4.7s (e picos
-- observados em pg_stat_statements até 7.97s, mesmo acima dos 8s em produção)
-- para ~1.0s; com termo de pesquisa (ILIKE), para ~0.14s.
CREATE INDEX IF NOT EXISTS idx_bundles_org_active_name
  ON public.bundles (organization_id, name)
  WHERE is_active = true AND status = 'active' AND deleted_at IS NULL;
