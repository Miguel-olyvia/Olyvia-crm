-- ============================================================================
-- Linhas de documentos passam a ter unidade (uom) e fator congelado
--
-- Altera: item_suppliers — a unicidade (produto, fornecedor) passa a
--         (produto, fornecedor, unidade): o mesmo fornecedor pode vender à
--         unidade E em PK100. O índice de preferido (1 por produto) fica igual.
-- Altera: purchase_order_items — uom_id, units_per_uom, supplier_sku
-- Altera: quote_lines, direct_sale_lines — uom_id, units_per_uom
-- Cria:   public.fn_item_suppliers_validate_uom() + gatilho
-- Cria:   public.fn_line_units_per_uom_snapshot() + gatilhos nas 3 tabelas
-- Redefine: public.fn_uom_is_used_in_lines(uuid) (placeholder de 20261204201500)
--
-- NÃO altera: nenhuma política RLS, nenhum GRANT de tabela, nenhum dado.
--
-- ---------------------------------------------------------------------------
-- SNAPSHOT DO FATOR
-- ---------------------------------------------------------------------------
-- units_per_uom é SEMPRE calculado no servidor (fn_uom_units_per) — nunca se
-- confia no valor enviado pelo cliente. No INSERT calcula-se; num UPDATE que
-- não mexe em uom_id/product_id mantém-se o valor antigo (um UPDATE direto a
-- units_per_uom, por exemplo em direct_sale_lines que o frontend escreve sem
-- RPC, é ignorado). Todas as funções de stock/compra leem o valor gravado na
-- linha, nunca voltam à uom. Com uom_id NULL o fator é 1 — é o caso de TODAS
-- as linhas existentes, e o comportamento fica exatamente o de hoje.
--
-- Quando a linha tem uom_id, `unidade` (texto, quote_lines/direct_sale_lines)
-- é alinhada com o código da uom, para PDFs/portal que só leem o texto.
--
-- item_suppliers.uom_id já existia: é a unidade em que o fornecedor vende e
-- purchase_price é por essa unidade. Todas as ligações vivas têm uom_id NULL
-- (verificado 23/09/2026: 275 linhas), por isso a nova unicidade e a
-- validação não afetam nenhum dado atual.
-- ============================================================================

-- ─── 1. item_suppliers: unicidade por unidade + validação ─────────────────
DROP INDEX IF EXISTS public.item_suppliers_product_supplier_active_uniq;

CREATE UNIQUE INDEX item_suppliers_product_supplier_uom_active_uniq
  ON public.item_suppliers (product_id, supplier_id, COALESCE(uom_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE deleted_at IS NULL AND product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_item_suppliers_uom
  ON public.item_suppliers (uom_id) WHERE uom_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_item_suppliers_validate_uom()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.uom_id IS NOT NULL AND NEW.product_id IS NOT NULL THEN
    PERFORM public.fn_uom_units_per(NEW.uom_id, NEW.product_id);  -- erro claro se incompatível
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_item_suppliers_validate_uom() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_item_suppliers_validate_uom
  BEFORE INSERT OR UPDATE OF uom_id, product_id ON public.item_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.fn_item_suppliers_validate_uom();

-- ─── 2. Colunas novas nas linhas ───────────────────────────────────────────
-- DEFAULT constante => ADD COLUMN sem reescrita da tabela e sem disparar
-- gatilhos de linha (nenhum proposal_mark_dirty, nenhuma auditoria).
ALTER TABLE public.purchase_order_items
  ADD COLUMN uom_id        uuid    NULL REFERENCES public.uom(id),
  ADD COLUMN units_per_uom integer NOT NULL DEFAULT 1,
  ADD COLUMN supplier_sku  text    NULL,
  ADD CONSTRAINT purchase_order_items_units_per_uom_positive CHECK (units_per_uom >= 1);

ALTER TABLE public.quote_lines
  ADD COLUMN uom_id        uuid    NULL REFERENCES public.uom(id),
  ADD COLUMN units_per_uom integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT quote_lines_units_per_uom_positive CHECK (units_per_uom >= 1);

ALTER TABLE public.direct_sale_lines
  ADD COLUMN uom_id        uuid    NULL REFERENCES public.uom(id),
  ADD COLUMN units_per_uom integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT direct_sale_lines_units_per_uom_positive CHECK (units_per_uom >= 1);

CREATE INDEX idx_purchase_order_items_uom ON public.purchase_order_items (uom_id) WHERE uom_id IS NOT NULL;
CREATE INDEX idx_quote_lines_uom          ON public.quote_lines (uom_id)          WHERE uom_id IS NOT NULL;
CREATE INDEX idx_direct_sale_lines_uom    ON public.direct_sale_lines (uom_id)    WHERE uom_id IS NOT NULL;

COMMENT ON COLUMN public.purchase_order_items.uom_id IS 'Unidade da linha (ex. PK100). NULL = unidade do produto.';
COMMENT ON COLUMN public.purchase_order_items.units_per_uom IS 'Snapshot: unidades de stock por 1 unidade da linha. Calculado no servidor.';
COMMENT ON COLUMN public.purchase_order_items.supplier_sku IS 'Snapshot da referência do fornecedor no momento da encomenda.';
COMMENT ON COLUMN public.quote_lines.units_per_uom IS 'Snapshot: unidades de stock por 1 unidade da linha. Calculado no servidor.';
COMMENT ON COLUMN public.direct_sale_lines.units_per_uom IS 'Snapshot: unidades de stock por 1 unidade da linha. Calculado no servidor.';

-- ─── 3. Gatilho de snapshot (as 3 tabelas) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_line_units_per_uom_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_code text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.uom_id IS NOT DISTINCT FROM OLD.uom_id
     AND NEW.product_id IS NOT DISTINCT FROM OLD.product_id THEN
    NEW.units_per_uom := OLD.units_per_uom;
    RETURN NEW;
  END IF;

  NEW.units_per_uom := public.fn_uom_units_per(NEW.uom_id, NEW.product_id);

  IF NEW.uom_id IS NOT NULL AND TG_TABLE_NAME IN ('quote_lines', 'direct_sale_lines') THEN
    SELECT code INTO v_code FROM public.uom WHERE id = NEW.uom_id;
    NEW.unidade := v_code;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_line_units_per_uom_snapshot() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_purchase_order_items_units_per_uom
  BEFORE INSERT OR UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_line_units_per_uom_snapshot();

CREATE TRIGGER trg_quote_lines_units_per_uom
  BEFORE INSERT OR UPDATE ON public.quote_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_line_units_per_uom_snapshot();

CREATE TRIGGER trg_direct_sale_lines_units_per_uom
  BEFORE INSERT OR UPDATE ON public.direct_sale_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_line_units_per_uom_snapshot();

-- ─── 4. Uso da uom em linhas (congela base/fator, ver 20261204201500) ─────
CREATE OR REPLACE FUNCTION public.fn_uom_is_used_in_lines(p_uom_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.quote_lines          WHERE uom_id = p_uom_id)
      OR EXISTS (SELECT 1 FROM public.direct_sale_lines    WHERE uom_id = p_uom_id)
      OR EXISTS (SELECT 1 FROM public.purchase_order_items WHERE uom_id = p_uom_id)
$function$;

REVOKE ALL ON FUNCTION public.fn_uom_is_used_in_lines(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- REVERSÃO (manual; só depois de reverter 20261204203500+ e com as funções
-- dessas migrations repostas na versão anterior)
-- ============================================================================
-- CREATE OR REPLACE FUNCTION public.fn_uom_is_used_in_lines(p_uom_id uuid)
--   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
--   SET search_path TO 'public', 'pg_temp' AS $f$ SELECT false $f$;
-- DROP TRIGGER IF EXISTS trg_direct_sale_lines_units_per_uom ON public.direct_sale_lines;
-- DROP TRIGGER IF EXISTS trg_quote_lines_units_per_uom ON public.quote_lines;
-- DROP TRIGGER IF EXISTS trg_purchase_order_items_units_per_uom ON public.purchase_order_items;
-- DROP FUNCTION IF EXISTS public.fn_line_units_per_uom_snapshot();
-- ALTER TABLE public.direct_sale_lines    DROP COLUMN IF EXISTS units_per_uom, DROP COLUMN IF EXISTS uom_id;
-- ALTER TABLE public.quote_lines          DROP COLUMN IF EXISTS units_per_uom, DROP COLUMN IF EXISTS uom_id;
-- ALTER TABLE public.purchase_order_items DROP COLUMN IF EXISTS supplier_sku, DROP COLUMN IF EXISTS units_per_uom, DROP COLUMN IF EXISTS uom_id;
-- DROP TRIGGER IF EXISTS trg_item_suppliers_validate_uom ON public.item_suppliers;
-- DROP FUNCTION IF EXISTS public.fn_item_suppliers_validate_uom();
-- DROP INDEX IF EXISTS public.idx_item_suppliers_uom;
-- DROP INDEX IF EXISTS public.item_suppliers_product_supplier_uom_active_uniq;
-- -- só é possível se não houver o mesmo produto+fornecedor em 2 unidades:
-- CREATE UNIQUE INDEX item_suppliers_product_supplier_active_uniq
--   ON public.item_suppliers (product_id, supplier_id)
--   WHERE deleted_at IS NULL AND product_id IS NOT NULL;
