-- Orçamentos — referência de fornecedor concreta usada em cada linha (Fase 2 do
-- plano de fornecedores multi-stock).
-- Origem: C:\Olyvia\vault\plano-referencia-fornecedor-orcamentos.md, secção 1.2
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- quote_lines não tinha nenhuma coluna para saber qual item_supplier_id (referência
-- de fornecedor) foi usado numa linha — só product_id/service_id. Nullable: produtos/
-- serviços sem nenhum item_suppliers cadastrado continuam a poder ser orçamentados
-- normalmente. ON DELETE SET NULL segue o precedente de quote_lines.bundle_id — nunca
-- bloquear nem apagar a linha do orçamento por causa de uma alteração em item_suppliers.

ALTER TABLE public.quote_lines
  ADD COLUMN IF NOT EXISTS item_supplier_id uuid REFERENCES public.item_suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quote_lines_item_supplier
  ON public.quote_lines(item_supplier_id) WHERE item_supplier_id IS NOT NULL;

COMMENT ON COLUMN public.quote_lines.item_supplier_id IS
  'Referência de fornecedor concreta (item_suppliers) usada nesta linha, para rastreabilidade histórica. Nullable: produtos/serviços sem nenhum item_suppliers cadastrado continuam a poder ser orçamentados normalmente. ON DELETE SET NULL — nunca bloquear nem apagar a linha do orçamento por causa de uma alteração em item_suppliers.';
