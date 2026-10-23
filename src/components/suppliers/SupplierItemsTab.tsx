// Separador "Artigos e preços" da ficha do fornecedor (FornecedorArtigos do
// protótipo): os produtos/serviços ligados a este fornecedor (item_suppliers —
// o que estava no diálogo "Catálogo") e, por baixo, o catálogo que o fornecedor
// carregou no portal, onde cada artigo se liga a um produto
// (SupplierPortalCatalogSection, sem alterações de lógica).
// Adicionar uma associação continua a fazer-se na ficha do produto/serviço.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Star, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { InventoryEmptyState, InventoryStatusBadge } from "@/components/inventory/ui";
import SupplierPortalCatalogSection from "@/components/supplier-portal-crm/SupplierPortalCatalogSection";
import { supplierItemsKey, useSupplierItems, type SupplierItemRow } from "./useSupplierSheetData";

const itemLabel = (row: SupplierItemRow) =>
  (row.item_type === "product" ? row.products?.name : row.services?.name) || "—";
const itemSku = (row: SupplierItemRow) =>
  (row.item_type === "product" ? row.products?.sku : row.services?.sku) || "—";

interface SupplierItemsTabProps {
  supplierId: string;
  organizationId: string | null;
  onOpenPortalTab: () => void;
  /** Ligar/desligar no catálogo do portal muda contadores da lista. */
  onLinksChanged?: () => void;
}

export function SupplierItemsTab({ supplierId, organizationId, onOpenPortalTab, onLinksChanged }: SupplierItemsTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission, loading: permLoading } = usePermissions();
  // Custo de compra e código do fornecedor exigem suppliers.view_pricing (como no diálogo antigo).
  const canViewPricing = hasPermission("suppliers.view_pricing");
  const items = useSupplierItems(supplierId, canViewPricing, !permLoading);
  const [deleting, setDeleting] = useState<SupplierItemRow | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: supplierItemsKey(supplierId) });
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    const { error } = await supabase.rpc("rpc_delete_item_supplier", { p_id: deleting.id });
    setBusy(false);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Associação removida" });
    setDeleting(null);
    refresh();
  };

  const rows = items.data ?? [];

  return (
    <div className="space-y-6">
      <section className="space-y-2" aria-labelledby={`sup-items-${supplierId}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id={`sup-items-${supplierId}`} className="text-base font-semibold">
            Artigos do fornecedor
          </h3>
          <p className="text-xs text-muted-foreground">
            <Star className="mr-0.5 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />= preferido. Para
            associar um artigo novo, use a ficha do produto ou do serviço.
          </p>
        </div>

        {permLoading || items.isLoading ? (
          <div className="flex justify-center py-6">
            <OlyviaLoader size={24} />
          </div>
        ) : items.isError ? (
          <p className="text-sm text-destructive">
            {(items.error as { message?: string } | null)?.message || "Não foi possível carregar os artigos."}
          </p>
        ) : rows.length === 0 ? (
          <InventoryEmptyState
            title="Sem artigos"
            description="Nenhum produto ou serviço associado a este fornecedor. Ligue artigos do catálogo do portal abaixo."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table className="min-w-[760px]">
              <caption className="sr-only">Produtos e serviços associados a este fornecedor</caption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <span className="sr-only">Preferido</span>
                    <span aria-hidden="true">★</span>
                  </TableHead>
                  <TableHead>Ref. fornecedor</TableHead>
                  <TableHead>Artigo</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">Prazo</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {row.is_preferred ? (
                        <span title="Preferido">
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                          <span className="sr-only">Preferido</span>
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-[13px]">
                      {canViewPricing ? row.supplier_sku || "—" : <span className="italic text-muted-foreground">Sem permissão</span>}
                    </TableCell>
                    <TableCell className="font-medium">{itemLabel(row)}</TableCell>
                    <TableCell className="font-mono text-[13px]">{itemSku(row)}</TableCell>
                    <TableCell>{row.item_type === "product" ? "Produto" : "Serviço"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {canViewPricing ? (
                        row.purchase_price != null ? `${row.purchase_price} ${row.currency}` : "—"
                      ) : (
                        <span className="italic text-muted-foreground">Sem permissão</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {row.lead_time_days != null ? `${row.lead_time_days} d` : "—"}
                    </TableCell>
                    <TableCell>
                      <InventoryStatusBadge tone={row.is_active ? "ok" : "neutral"}>{row.is_active ? "Sim" : "Não"}</InventoryStatusBadge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setDeleting(row)}
                        aria-label={`Remover associação a ${itemLabel(row)}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <SupplierPortalCatalogSection
        supplierId={supplierId}
        organizationId={organizationId}
        hidePriceChanges
        onOpenPortalTab={onOpenPortalTab}
        onLinksChanged={() => {
          refresh();
          onLinksChanged?.();
        }}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(v) => {
          if (!v && !busy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover associação a "{deleting ? itemLabel(deleting) : ""}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Este fornecedor deixa de estar associado a este artigo. O histórico de preços fica preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
