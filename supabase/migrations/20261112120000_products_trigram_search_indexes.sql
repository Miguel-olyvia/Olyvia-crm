-- Products search (name/sku/description/barcode via ilike, e.g.
-- src/pages/Products.tsx and src/components/quote/AddItemsDialog.tsx) does a
-- sequential scan today because there is no text index on these columns.
-- Invisible at the current catalog size (~2.3k rows); becomes a real
-- per-keystroke slowdown once the catalog grows toward 100k articles/
-- supplier references. pg_trgm is already enabled on this database (in the
-- "extensions" schema, Supabase's default) — the operator class must be
-- schema-qualified because the session running migrations does not have
-- "extensions" on its search_path (unqualified gin_trgm_ops fails with
-- "operator class does not exist for access method gin"). Only adds
-- indexes, no query/behavior change.
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm ON public.products USING gin (sku extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_description_trgm ON public.products USING gin (description extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_barcode_trgm ON public.products USING gin (barcode extensions.gin_trgm_ops);
