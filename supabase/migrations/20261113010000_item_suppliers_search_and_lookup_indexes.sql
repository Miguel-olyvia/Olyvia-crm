-- Fornecedores múltiplos por artigo — Fase 2 (índices de suporte para pesquisa por referência)
-- Origem: C:\Olyvia\vault\plano-referencia-fornecedor-orcamentos.md, secção 1.1
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- NOTA: o ficheiro `20261112120000_products_trigram_search_indexes.sql` referido no plano
-- não existe neste repositório (confirmado por `grep -rli trigram supabase/migrations/` —
-- só aparece em 20260615130000_baseline_new_database.sql). O padrão de referência real para
-- índices trigram de pesquisa é o próprio baseline: idx_anew_leads_search_text_trgm,
-- idx_fiscal_entities_nif_trgm, idx_anew_entities_display_name_trgm, todos
-- `USING gin (coluna "extensions"."gin_trgm_ops")` (extensão pg_trgm instalada no schema
-- `extensions`, não em `public` — confirmado ao vivo via pg_extension; o operador tem de
-- vir qualificado com o schema, como o baseline já faz, senão falha com
-- "operator class gin_trgm_ops does not exist for access method gin").
-- Este ficheiro segue esse mesmo padrão.
--
-- Pesquisa por referência do fornecedor (supplier_sku) + "melhor referência por
-- artigo" (preferencial primeiro, depois mais barata) para o lookup batched em
-- AddItemsDialog.tsx (Fase 2 do plano).

CREATE INDEX IF NOT EXISTS idx_item_suppliers_supplier_sku_trgm
  ON public.item_suppliers USING gin (supplier_sku extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_item_suppliers_product_pref_price
  ON public.item_suppliers (product_id, is_preferred DESC, purchase_price ASC NULLS LAST)
  WHERE deleted_at IS NULL AND is_active AND product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_item_suppliers_service_pref_price
  ON public.item_suppliers (service_id, is_preferred DESC, purchase_price ASC NULLS LAST)
  WHERE deleted_at IS NULL AND is_active AND service_id IS NOT NULL;
