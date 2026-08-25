-- quotes.search_text nao continha o quote_number dos orcamentos criados sem
-- numero explicito. Consequencia: pesquisar pelo numero do orcamento nao os
-- encontrava -- nem na lista nem nos cartoes de KPI, porque ambos passaram a
-- filtrar por search_text (20261113170000).
--
-- CAUSA, confirmada por leitura directa do catalogo do remoto (pg_trigger
-- sobre public.quotes), nao por deducao:
--
--   CREATE TRIGGER trg_quotes_search_text     BEFORE INSERT OR UPDATE OF ...
--   CREATE TRIGGER trigger_set_quote_number   BEFORE INSERT
--
-- O Postgres dispara os triggers BEFORE ... FOR EACH ROW por ordem alfabetica
-- do nome. "trg_quotes_search_text" < "trigger_set_quote_number" ('g' < 'i'),
-- portanto o search_text era calculado ANTES de set_quote_number() atribuir o
-- numero: NEW.quote_number ainda era NULL. E como set_quote_number so corre
-- BEFORE INSERT, nenhuma actualizacao posterior voltava a disparar o calculo.
--
-- EVIDENCIA na base de dados viva (organizacao Mudelar, 2026-08-25): dos 74
-- orcamentos cujo quote_number contem 'Q-2026-15', 2 nao eram encontrados por
-- search_text -- Q-2026-1576 e Q-2026-1578, ambos criados nesse dia, ambos com
-- search_text a comecar pelo titulo em vez do numero. Os criados antes da
-- migration estavam certos porque o backfill dessa migration os calculou com o
-- numero ja atribuido.
--
-- CORRECCAO, forward-only: recriar o trigger com um nome que ordene DEPOIS de
-- todos os outros BEFORE triggers da tabela (o mais tardio hoje e
-- "update_quotes_updated_at"), e voltar a fazer o backfill idempotente para
-- apanhar as linhas ja escritas com o numero em falta. Nenhuma migration
-- anterior foi editada e nenhuma funcao de listagem foi tocada.

DROP TRIGGER IF EXISTS "trg_quotes_search_text" ON "public"."quotes";
DROP TRIGGER IF EXISTS "zz_quotes_search_text" ON "public"."quotes";

CREATE TRIGGER "zz_quotes_search_text"
  BEFORE INSERT OR UPDATE OF "quote_number", "title", "entity_id", "deal_id" ON "public"."quotes"
  FOR EACH ROW EXECUTE FUNCTION "public"."quotes_search_text_trigger"();

-- Backfill idempotente: so toca as linhas cujo search_text esta realmente
-- desactualizado (hoje, uma mao cheia), portanto nao e um UPDATE da tabela toda.
UPDATE public.quotes AS q
   SET search_text = public.quotes_compute_search_text(q.quote_number, q.title, q.entity_id, q.deal_id)
 WHERE q.search_text IS DISTINCT FROM public.quotes_compute_search_text(q.quote_number, q.title, q.entity_id, q.deal_id);
