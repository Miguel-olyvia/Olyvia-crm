import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  REASON_LABEL,
  confidenceOf,
  fetchFreeSupplierRows,
  formatMoney,
  type CrmCatalogItem,
  type FreeSupplierRow,
  type LinkSuggestion,
} from "./types";

export interface LinkChoice {
  productId: string;
  productName: string;
  /** Linha item_suppliers que a sugestão "supplier_sku" vai reutilizar. */
  itemSupplierId: string | null;
  /**
   * Unidade da linha item_suppliers escolhida no diálogo (quando o produto
   * tem várias linhas livres deste fornecedor). Ausente = quem liga resolve.
   */
  uomId?: string | null;
  applyCatalogPrice: boolean;
}

interface ProductHit {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
}

interface CatalogLinkDialogProps {
  item: CrmCatalogItem | null;
  suggestions: LinkSuggestion[];
  supplierId: string;
  /** Os produtos ligáveis são os da organização do fornecedor (regra da RPC). */
  organizationId: string | null;
  canViewPricing: boolean;
  linking: boolean;
  onClose: () => void;
  onConfirm: (choice: LinkChoice) => void;
}

const SEARCH_LIMIT = 30;

// Remove os caracteres com significado no filtro .or() do PostgREST.
const sanitizeTerm = (raw: string) => raw.replace(/[,()*%\\"']/g, " ").trim().slice(0, 100);

// Escolher o produto a que se liga um artigo do catálogo: uma das sugestões
// (pré-selecionada a melhor) ou um produto pesquisado. A pesquisa fica dentro
// do diálogo (sem Popover) para não lutar com o focus trap.
export default function CatalogLinkDialog({
  item,
  suggestions,
  supplierId,
  organizationId,
  canViewPricing,
  linking,
  onClose,
  onConfirm,
}: CatalogLinkDialogProps) {
  const [selected, setSelected] = useState<{ id: string; name: string; itemSupplierId: string | null } | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Sem can_view_pricing a opção fica escondida e o preço de compra não é tocado.
  const [applyPrice, setApplyPrice] = useState(canViewPricing);

  // Linhas item_suppliers livres do produto escolhido (sem linha na sugestão).
  const [freeRows, setFreeRows] = useState<FreeSupplierRow[] | null>(null);
  const [freeRowsLoading, setFreeRowsLoading] = useState(false);
  const [freeRowsError, setFreeRowsError] = useState<string | null>(null);
  const [chosenRowId, setChosenRowId] = useState<string | null>(null);

  // Reabrir com outro artigo: repõe a escolha na melhor sugestão.
  useEffect(() => {
    if (!item) return;
    const top = suggestions[0];
    setSelected(top ? { id: top.product_id, name: top.product_name, itemSupplierId: top.item_supplier_id } : null);
    setQuery("");
    setHits([]);
    setSearchError(null);
    setApplyPrice(canViewPricing);
  }, [item, suggestions, canViewPricing]);

  const selectedProductId = selected?.id ?? null;
  const selectedItemSupplierId = selected?.itemSupplierId ?? null;

  useEffect(() => {
    setFreeRows(null);
    setFreeRowsError(null);
    setChosenRowId(null);
    if (!item || !selectedProductId || selectedItemSupplierId) {
      setFreeRowsLoading(false);
      return;
    }
    let cancelled = false;
    setFreeRowsLoading(true);
    void fetchFreeSupplierRows(selectedProductId, supplierId).then(({ rows, error }) => {
      if (cancelled) return;
      setFreeRowsLoading(false);
      if (error) {
        setFreeRowsError(error);
        return;
      }
      setFreeRows(rows);
      if (rows.length === 1) setChosenRowId(rows[0].id);
    });
    return () => {
      cancelled = true;
    };
  }, [item, selectedProductId, selectedItemSupplierId, supplierId]);

  const needsRowChoice = !!freeRows && freeRows.length > 1;
  const chosenRow = freeRows?.find((r) => r.id === chosenRowId) ?? null;
  // Com a resposta das linhas: a unidade é decidida aqui. Sem ela (erro), quem
  // liga volta a ler e salta se for ambíguo.
  const resolvedUom: { uomId?: string | null } =
    freeRows === null ? {} : freeRows.length === 0 ? { uomId: null } : chosenRow ? { uomId: chosenRow.uom_id } : {};
  const canConfirm = !!selected && !linking && !freeRowsLoading && (!needsRowChoice || !!chosenRow);

  useEffect(() => {
    const term = sanitizeTerm(query);
    if (!item || !organizationId || term.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, barcode")
        .eq("organization_id", organizationId)
        .eq("is_deleted", false)
        .or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`)
        .order("name")
        .limit(SEARCH_LIMIT);
      if (cancelled) return;
      setSearching(false);
      if (error) {
        setSearchError(error.message);
        setHits([]);
        return;
      }
      setSearchError(null);
      setHits((data || []) as ProductHit[]);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, item, organizationId]);

  const optionClass = (active: boolean) =>
    cn(
      "w-full text-left rounded-md border px-3 py-2 text-sm flex items-start gap-2 min-h-[44px] transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      active ? "border-primary bg-primary/5" : "hover:bg-muted/60",
    );

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v && !linking) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ligar artigo do catálogo</DialogTitle>
          <DialogDescription>
            {item && (
              <>
                <span className="font-mono">{item.supplier_ref}</span> — {item.name}
                {item.barcode ? ` · EAN ${item.barcode}` : ""}
                {canViewPricing && item.base_price != null ? ` · ${formatMoney(item.base_price, item.currency)}` : ""}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="space-y-2" aria-labelledby="catalog-link-suggestions">
            <h4 id="catalog-link-suggestions" className="text-sm font-medium">Sugestões</h4>
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem sugestões para este artigo. Pesquisa o produto abaixo.</p>
            ) : (
              <div className="space-y-1.5" role="radiogroup" aria-label="Sugestões de produto">
                {suggestions.map((s) => {
                  const active = selected?.id === s.product_id;
                  const conf = confidenceOf(s);
                  return (
                    <button
                      key={`${s.product_id}-${s.reason}`}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={optionClass(active)}
                      onClick={() => setSelected({ id: s.product_id, name: s.product_name, itemSupplierId: s.item_supplier_id })}
                    >
                      <Check className={cn("w-4 h-4 mt-0.5 shrink-0", active ? "opacity-100 text-primary" : "opacity-0")} />
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium truncate">{s.product_name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {s.product_sku ? `SKU ${s.product_sku}` : "Sem SKU"}
                          {s.product_barcode ? ` · EAN ${s.product_barcode}` : ""}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="outline" className="whitespace-nowrap">{REASON_LABEL[s.reason]}</Badge>
                        <Badge variant={conf.variant} className="whitespace-nowrap">{conf.label}</Badge>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-2" aria-labelledby="catalog-link-search">
            <h4 id="catalog-link-search" className="text-sm font-medium">Escolher outro produto</h4>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pesquisar por nome, SKU ou código de barras"
                className="pl-10"
                aria-label="Pesquisar produto"
                disabled={!organizationId}
              />
            </div>
            {!organizationId && (
              <p className="text-xs text-muted-foreground">O fornecedor não tem empresa definida — não é possível pesquisar produtos.</p>
            )}
            {searching && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> A pesquisar...</p>}
            {searchError && <p className="text-xs text-destructive">{searchError}</p>}
            {!searching && sanitizeTerm(query).length >= 2 && hits.length === 0 && !searchError && (
              <p className="text-xs text-muted-foreground">Nenhum produto encontrado.</p>
            )}
            {hits.length > 0 && (
              <div className="space-y-1.5 max-h-60 overflow-y-auto" role="radiogroup" aria-label="Produtos encontrados">
                {hits.map((p) => {
                  const active = selected?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={optionClass(active)}
                      onClick={() => setSelected({ id: p.id, name: p.name, itemSupplierId: null })}
                    >
                      <Check className={cn("w-4 h-4 mt-0.5 shrink-0", active ? "opacity-100 text-primary" : "opacity-0")} />
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium truncate">{p.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {p.sku ? `SKU ${p.sku}` : "Sem SKU"}
                          {p.barcode ? ` · EAN ${p.barcode}` : ""}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {hits.length >= SEARCH_LIMIT && (
                  <p className="text-xs text-muted-foreground">A mostrar os primeiros {SEARCH_LIMIT} — refina a pesquisa.</p>
                )}
              </div>
            )}
          </section>

          {freeRowsLoading && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> A verificar as associações do produto a este fornecedor...
            </p>
          )}
          {freeRowsError && (
            <p className="text-xs text-destructive">Não foi possível ler as associações do produto: {freeRowsError}</p>
          )}
          {needsRowChoice && freeRows && (
            <section className="space-y-2" aria-labelledby="catalog-link-rows">
              <h4 id="catalog-link-rows" className="text-sm font-medium">Associação a reaproveitar</h4>
              <p className="text-xs text-muted-foreground">
                Este produto tem várias associações a este fornecedor. Escolhe a que fica ligada ao artigo do catálogo.
              </p>
              <div className="space-y-1.5" role="radiogroup" aria-label="Associações do produto a este fornecedor">
                {freeRows.map((r) => {
                  const active = chosenRowId === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={optionClass(active)}
                      onClick={() => setChosenRowId(r.id)}
                    >
                      <Check className={cn("w-4 h-4 mt-0.5 shrink-0", active ? "opacity-100 text-primary" : "opacity-0")} />
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium">Unidade: {r.uom_code ?? "sem unidade"}</span>
                        <span className="block text-xs text-muted-foreground">
                          {r.supplier_sku ? `Ref. ${r.supplier_sku}` : "Sem ref."}
                          {canViewPricing && r.purchase_price != null ? ` · ${formatMoney(r.purchase_price, r.currency)}` : ""}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {canViewPricing && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="catalog-link-apply-price"
                checked={applyPrice}
                onCheckedChange={(v) => setApplyPrice(!!v)}
              />
              <Label htmlFor="catalog-link-apply-price" className="text-sm font-normal leading-snug cursor-pointer">
                Usar o preço do catálogo como preço de compra
                <span className="block text-xs text-muted-foreground">
                  Se desmarcado, uma associação existente mantém o preço; uma nova fica sem preço.
                </span>
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={linking}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!canConfirm}
            onClick={() =>
              selected &&
              onConfirm({
                productId: selected.id,
                productName: selected.name,
                itemSupplierId: selected.itemSupplierId,
                ...resolvedUom,
                applyCatalogPrice: canViewPricing && applyPrice,
              })
            }
          >
            {linking && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            <span className="truncate max-w-[18rem]">{selected ? `Ligar a «${selected.name}»` : "Escolhe um produto"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
