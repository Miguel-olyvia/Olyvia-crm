-- Ordenacao da lista de Leads por actividade.
--
-- `anew_leads.last_activity_at` ja existe (20261116050000) e guarda o instante
-- em que alguem que JA era lead voltou a preencher o formulario publico. A
-- lista de Leads ordena por `created_at DESC`, por isso quem volta a contactar
-- nao sobe: a ficha continua na data em que nasceu.
--
-- O PostgREST so sabe ordenar por COLUNAS, nao por expressoes, por isso a
-- expressao passa a ser uma coluna gerada. Assim a lead entra na lista na data
-- em que a pessoa voltou a contactar -- como se fosse uma entrada nova desse
-- dia -- em vez de ficar presa no topo para sempre acima de leads criadas hoje.
--
-- GREATEST ignora NULLs e `created_at` e NOT NULL: `list_sort_at` nunca fica
-- nulo, e quem nunca voltou a contactar ordena exactamente como antes.
-- E uma coluna GERADA: ninguem lhe escreve, nem a aplicacao nem as functions.

ALTER TABLE "public"."anew_leads"
  ADD COLUMN IF NOT EXISTS "list_sort_at" timestamp with time zone
  GENERATED ALWAYS AS (GREATEST("created_at", "last_activity_at")) STORED;

COMMENT ON COLUMN "public"."anew_leads"."list_sort_at" IS
  'Data pela qual a lista de Leads ordena: a mais recente entre created_at e last_activity_at. Coluna gerada, nunca escrita a mao.';

-- Cobre o ORDER BY da lista com os filtros que ela sempre aplica
-- (organization_id + deleted_at IS NULL, ver buildLeadsBaseQuery).
CREATE INDEX IF NOT EXISTS "idx_anew_leads_list_sort"
  ON "public"."anew_leads" ("organization_id", "list_sort_at" DESC, "id" DESC)
  WHERE "deleted_at" IS NULL;
