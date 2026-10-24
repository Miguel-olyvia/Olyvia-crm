import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import type { CrmCatalogItem } from "./types";
import {
  SKU_MAX,
  applyCatalogPriceOnLink,
  catalogCurrency,
  catalogUnitCost,
  createProductFromCatalog,
  findTakenSkus,
  loadCreateMeta,
  matchBrand,
  matchUom,
  normalizeSkuBase,
  pickFreeSku,
  skuCandidates,
  validateSku,
  type UomOption,
} from "./catalogProductCreate";

export type BulkRowStatus = "pending" | "running" | "linked" | "not_linked" | "error";

export interface BulkCreateRow {
  item: CrmCatalogItem;
  sku: string;
  uom: UomOption | null;
  brandId: string | null;
  status: BulkRowStatus;
  message: string | null;
  productId: string | null;
}

interface BulkCreateProductsDialogProps {
  /** Artigos a criar; null = fechado. */
  items: CrmCatalogItem[] | null;
  supplierId: string;
  organizationId: string | null;
  canViewPricing: boolean;
  /** products.manage_prices: sem ela a ligação nunca usa o preço do catálogo. */
  canManagePrices?: boolean;
  onClose: () => void;
  /** Fim de uma execução (com pelo menos uma linha tentada). */
  onFinished: (rows: BulkCreateRow[]) => void;
}

const STATUS_BADGE: Record<BulkRowStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "Por criar", variant: "outline" },
  running: { label: "A criar...", variant: "secondary" },
  linked: { label: "Criado e ligado", variant: "default" },
  not_linked: { label: "Criado, não ligado", variant: "destructive" },
  error: { label: "Erro", variant: "destructive" },
};

const retriable = (s: BulkRowStatus) => s === "pending" || s === "error";

// Criar em lote produtos novos para os artigos "Por ligar" escolhidos, cada um
// ligado ao seu artigo. Um a um, em sequência, com o resultado por linha.
// Sem preço de venda; preço de compra só com can_view_pricing; estado Ativo,
// tipo Compra e venda (tal como o diálogo individual por omissão).
export default function BulkCreateProductsDialog({
  items,
  supplierId,
  organizationId,
  canViewPricing,
  canManagePrices = false,
  onClose,
  onFinished,
}: BulkCreateProductsDialogProps) {
  const [rows, setRows] = useState<BulkCreateRow[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [skuErrors, setSkuErrors] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // Ao fechar (items=null) o Radix ainda mostra o conteúdo durante a animação
  // de saída: nada é limpo nem lido de `items` aí. A reposição é feita ao abrir.
  const [prevItems, setPrevItems] = useState<CrmCatalogItem[] | null>(items);
  const [shownCount, setShownCount] = useState(items?.length ?? 0);
  if (items !== prevItems) {
    setPrevItems(items);
    if (items) {
      setShownCount(items.length);
      setRows([]);
      setSkuErrors({});
      setPrepareError(null);
      setProgress({ done: 0, total: 0 });
    }
  }

  useEffect(() => {
    if (!items || !organizationId) return;
    let cancelled = false;
    (async () => {
      setPreparing(true);
      setPrepareError(null);
      setSkuErrors({});
      setProgress({ done: 0, total: 0 });
      const { meta, error } = await loadCreateMeta(organizationId);
      const bases = items.map((i) => normalizeSkuBase(i.supplier_ref));
      const { taken, error: takenError } = await findTakenSkus(organizationId, bases.flatMap(skuCandidates));
      if (cancelled) return;
      setPreparing(false);
      setPrepareError(error || takenError);
      // SKUs sugeridos únicos também dentro do lote.
      const reserved = new Set<string>();
      setRows(
        items.map((item, idx) => {
          const sku = bases[idx] ? pickFreeSku(bases[idx], taken, reserved) : "";
          if (sku) reserved.add(sku);
          return {
            item,
            sku,
            uom: meta ? matchUom(item, meta.uoms) : null,
            brandId: meta ? matchBrand(item.brand, meta.brands)?.id ?? null : null,
            status: "pending" as const,
            message: null,
            productId: null,
          };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [items, organizationId]);

  const setSku = (id: string, sku: string) => {
    setRows((prev) => prev.map((r) => (r.item.id === id ? { ...r, sku } : r)));
    setSkuErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const toRun = rows.filter((r) => retriable(r.status));

  const handleRun = async () => {
    if (!organizationId || toRun.length === 0) return;
    // Validação: obrigatório, tamanho, repetido no lote, já existente na BD.
    const errs: Record<string, string> = {};
    const seen = new Map<string, string>();
    rows.forEach((r) => {
      const sku = r.sku.trim();
      if (!retriable(r.status)) {
        if (sku) seen.set(sku, r.item.id);
        return;
      }
      const err = validateSku(sku);
      if (err) errs[r.item.id] = err;
      else if (seen.has(sku)) errs[r.item.id] = "SKU repetido neste lote.";
      else seen.set(sku, r.item.id);
    });
    const { taken, error } = await findTakenSkus(organizationId, toRun.map((r) => r.sku.trim()));
    if (error) {
      setPrepareError(`Não foi possível verificar os SKUs: ${error}`);
      return;
    }
    toRun.forEach((r) => {
      if (!errs[r.item.id] && taken.has(r.sku.trim())) errs[r.item.id] = "Já existe um produto com este SKU.";
    });
    if (Object.keys(errs).length > 0) {
      setSkuErrors(errs);
      return;
    }

    const targets = toRun.map((r) => r.item.id);
    setRunning(true);
    setProgress({ done: 0, total: targets.length });
    let finalRows = rows;
    const update = (id: string, patch: Partial<BulkCreateRow>) => {
      finalRows = finalRows.map((r) => (r.item.id === id ? { ...r, ...patch } : r));
      setRows(finalRows);
    };
    for (const id of targets) {
      const row = finalRows.find((r) => r.item.id === id);
      if (!row) continue;
      update(id, { status: "running", message: null });
      const outcome = await createProductFromCatalog({
        organizationId,
        supplierId,
        item: row.item,
        sku: row.sku,
        name: row.item.name ?? "",
        description: row.item.description ?? "",
        barcode: row.item.barcode ?? "",
        brandId: row.brandId,
        categoryId: null,
        subcategoryId: null,
        uomId: row.uom?.id ?? null,
        status: "active",
        productType: "both",
        purchasePrice: canViewPricing ? catalogUnitCost(row.item) : null,
        salePrice: null,
        currency: catalogCurrency(row.item),
        vatRate: 23,
        applyCatalogPrice: applyCatalogPriceOnLink(row.item, canViewPricing, canManagePrices),
      });
      if (outcome.status === "linked") {
        update(id, {
          status: "linked",
          productId: outcome.productId,
          message: [outcome.priceNotApplied, ...(outcome.result.warnings ?? [])].filter(Boolean).join(" ") || null,
        });
      } else if (outcome.status === "created_not_linked") {
        update(id, { status: "not_linked", productId: outcome.productId, message: outcome.message });
      } else {
        update(id, { status: "error", message: outcome.message });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setRunning(false);
    onFinished(finalRows);
  };

  const counts = rows.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
    {} as Partial<Record<BulkRowStatus, number>>,
  );
  const anyDone = (counts.linked ?? 0) + (counts.not_linked ?? 0) + (counts.error ?? 0) > 0;

  return (
    <Dialog open={!!items} onOpenChange={(v) => { if (!v && !running) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar {shownCount} produto(s) a partir do catálogo</DialogTitle>
          <DialogDescription>
            Cada artigo dá origem a um produto novo (estado Ativo, compra e venda), já ligado ao artigo.
            {canViewPricing ? " O preço de compra é o do catálogo (por unidade)." : ""}
            {canViewPricing
              ? canManagePrices
                ? " A ligação ao fornecedor fica com o preço do catálogo (exceto embalagens)."
                : " Sem permissão para gerir preços: a ligação ao fornecedor fica sem preço."
              : ""}{" "}
            Sem preço de venda.
            Revê os SKUs sugeridos antes de criar.
          </DialogDescription>
        </DialogHeader>

        {!organizationId ? (
          <p className="text-sm text-destructive">O fornecedor não tem empresa definida — não é possível criar produtos.</p>
        ) : preparing ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" aria-label="A preparar" /></div>
        ) : (
          <div className="space-y-3">
            {prepareError && <p className="text-xs text-destructive">{prepareError}</p>}
            {(running || anyDone) && (
              <div className="space-y-1" aria-live="polite">
                {running && (
                  <>
                    <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} aria-label="Progresso da criação" />
                    <p className="text-xs text-muted-foreground">{progress.done} de {progress.total}...</p>
                  </>
                )}
                {!running && anyDone && (
                  <p className="text-sm">
                    {counts.linked ?? 0} criado(s) e ligado(s)
                    {counts.not_linked ? `, ${counts.not_linked} criado(s) sem ligação (ligar manualmente)` : ""}
                    {counts.error ? `, ${counts.error} com erro` : ""}.
                  </p>
                )}
              </div>
            )}
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ref. fornecedor</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead className="min-w-[12rem]">SKU *</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Resultado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const badge = STATUS_BADGE[r.status];
                    const editable = retriable(r.status) && !running;
                    const err = skuErrors[r.item.id];
                    const inputId = `bulk-sku-${r.item.id}`;
                    return (
                      <TableRow key={r.item.id}>
                        <TableCell className="font-mono text-xs align-top">{r.item.supplier_ref}</TableCell>
                        <TableCell className="align-top text-sm">{r.item.name}</TableCell>
                        <TableCell className="align-top">
                          <Input
                            id={inputId}
                            value={r.sku}
                            maxLength={SKU_MAX}
                            onChange={(e) => setSku(r.item.id, e.target.value)}
                            disabled={!editable}
                            aria-label={`SKU para ${r.item.supplier_ref}`}
                            aria-invalid={!!err}
                            aria-describedby={err ? `${inputId}-error` : undefined}
                            className="h-9 font-mono text-xs"
                          />
                          {err && <p id={`${inputId}-error`} className="text-xs text-destructive mt-1">{err}</p>}
                        </TableCell>
                        <TableCell className="align-top text-sm whitespace-nowrap">
                          {r.uom ? r.uom.code : <span className="text-muted-foreground">Sem unidade</span>}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant={badge.variant} className="whitespace-nowrap">
                            {r.status === "running" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                            {badge.label}
                          </Badge>
                          {r.message && <p className="text-xs text-muted-foreground mt-1 max-w-[16rem]">{r.message}</p>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={running}>
            {anyDone ? "Fechar" : "Cancelar"}
          </Button>
          {toRun.length > 0 && (
            <Button type="button" onClick={() => void handleRun()} disabled={running || preparing || !organizationId}>
              {running && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {anyDone ? `Tentar de novo (${toRun.length})` : `Criar ${toRun.length} produto(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
