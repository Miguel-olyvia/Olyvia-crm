-- Products search (name/sku/description/barcode via ilike, e.g.
-- src/pages/Products.tsx and src/components/quote/AddItemsDialog.tsx) does a
-- sequential scan today because there is no text index on these columns.
-- Invisible at the current catalog size (~2.3k rows); becomes a real
-- per-keystroke slowdown once the catalog grows toward 100k articles/
-- supplier references. pg_trgm is already enabled on this database, just
-- unused here — this only adds indexes, no query/behavior change.
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm ON public.products USING gin (sku gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_description_trgm ON public.products USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_barcode_trgm ON public.products USING gin (barcode gin_trgm_ops);
