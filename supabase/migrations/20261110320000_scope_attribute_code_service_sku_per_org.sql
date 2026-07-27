-- Make product_attributes.code and services.sku unique per-organization instead of
-- globally unique. Both tables are per-org (organization_id column present, all app
-- code paths already org-scoped), so a global UNIQUE constraint incorrectly prevents
-- two different organizations from using the same code/sku.
--
-- Mirrors the composite-constraint pattern already used correctly for
-- products_sku_organization_id_key and bundles_sku_company_unique.

ALTER TABLE ONLY "public"."product_attributes"
    DROP CONSTRAINT IF EXISTS "product_attributes_code_key";

ALTER TABLE ONLY "public"."product_attributes"
    ADD CONSTRAINT "product_attributes_organization_id_code_key" UNIQUE ("organization_id", "code");

ALTER TABLE ONLY "public"."services"
    DROP CONSTRAINT IF EXISTS "services_sku_key";

ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_organization_id_sku_key" UNIQUE ("organization_id", "sku");
