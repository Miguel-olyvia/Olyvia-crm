// Secção "Códigos" da ficha do produto (Fase 2 — fatia 3, "aprender códigos").
//
// Lista o código de barras principal (products.barcode, editado no campo da
// ficha) e os códigos aprendidos ativos (product_codes, leitura direta com
// RLS). Acrescentar → LearnCodeDialog com o produto fixo (source
// 'product_form'); remover → rpc_product_code_remove com motivo (anulação
// lógica; não reverte receções).
// Componente autónomo: a única ligação a Products.tsx é o <ProductCodesSection />.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LearnCodeDialog } from "@/components/receiving/LearnCodeDialog";
import {
  describeLearnResult,
  fetchProductCodes,
  productCodeErrorMessage,
  removeProductCode,
  type ProductCodeRow,
} from "@/components/receiving/productCodes";

interface Props {
  productId: string;
  organizationId: string | null;
  productName: string;
  sku: string | null;
  /** Código de barras principal gravado (products.barcode). */
  barcode: string | null | undefined;
  /** products.edit: acrescentar, remover e definir a unidade «un». */
  canEdit: boolean;
}

const SOURCE_LABEL: Record<string, string> = {
  receiving: "receção",
  product_form: "ficha do produto",
  catalog: "catálogo",
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-PT");
};

export function ProductCodesSection({ productId, organizationId, productName, sku, barcode, canEdit }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<ProductCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [toRemove, setToRemove] = useState<ProductCodeRow | null>(null);
  const [reason, setReason] = useState("");
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetchProductCodes(productId);
    setRows(r.rows);
    setLoadError(r.error ? productCodeErrorMessage(r.error) : null);
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmRemove = async () => {
    if (!toRemove || removing) return;
    const why = reason.trim();
    if (!why) {
      setRemoveError("Indica o motivo.");
      return;
    }
    setRemoving(true);
    setRemoveError(null);
    const { data, error } = await removeProductCode(toRemove.id, why);
    setRemoving(false);
    if (error || !data) {
      setRemoveError(productCodeErrorMessage(error ?? { code: "XX000", message: "Resposta vazia do servidor." }));
      return;
    }
    const n = data.scans_using_code ?? 0;
    toast({
      title: data.already_removed ? "O código já tinha sido removido" : "Código removido",
      description:
        n > 0
          ? `«${toRemove.code}» foi usado em ${n} ${n === 1 ? "leitura" : "leituras"} — essas receções não são revertidas.`
          : `«${toRemove.code}» deixa de ser reconhecido.`,
    });
    setToRemove(null);
    void load();
  };

  const mainBarcode = (barcode ?? "").trim();

  return (
    <section aria-labelledby="product-codes-title" className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="product-codes-title" className="font-semibold">
          Códigos
        </h3>
        {canEdit && (
          <Button type="button" variant="outline" className="h-11" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Acrescentar código
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Códigos que a receção por leitura reconhece como este produto. O código de barras principal edita-se no campo acima.
      </p>

      <ul className="space-y-1">
        {mainBarcode && (
          <li className="flex min-h-[2.75rem] flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <span className="break-all font-mono">{mainBarcode}</span>
            <Badge variant="secondary">Código de barras principal</Badge>
          </li>
        )}
        {rows.map((r) => {
          const pack = r.uom_id && r.uom?.code ? `${r.uom.code}${r.uom.conversion_factor ? ` de ${r.uom.conversion_factor}` : ""}` : null;
          return (
            <li key={r.id} className="flex min-h-[2.75rem] flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="break-all font-mono">{r.code}</span>
                  <Badge variant="outline">{r.kind === "barcode" ? "Código de barras" : "Ref. do fornecedor"}</Badge>
                  {pack && <Badge variant="outline">{pack}</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[
                    r.kind === "supplier_ref" ? (r.suppliers?.name ?? "Fornecedor") : null,
                    `via ${SOURCE_LABEL[r.source] ?? r.source}`,
                    fmtDate(r.created_at),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-11 shrink-0 p-0 text-destructive hover:text-destructive"
                  onClick={() => {
                    setToRemove(r);
                    setReason("");
                    setRemoveError(null);
                  }}
                  aria-label={`Remover o código ${r.code}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {loading && <p className="text-sm text-muted-foreground">A carregar códigos…</p>}
      {!loading && loadError && (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      )}
      {!loading && !loadError && !mainBarcode && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Este produto ainda não tem códigos.</p>
      )}

      <LearnCodeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        code=""
        organizationId={organizationId}
        warehouseId={null}
        fixedProduct={{ id: productId, name: productName, sku }}
        canEditProducts={canEdit}
        onLearned={(res) => {
          toast({ title: res.learned ? "Código associado" : "Código já associado", description: describeLearnResult(res) });
          void load();
        }}
      />

      <AlertDialog open={!!toRemove} onOpenChange={(o) => !removing && !o && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover o código «{toRemove?.code}»?</AlertDialogTitle>
            <AlertDialogDescription>
              A leitura deixa de o reconhecer como este produto. As receções já feitas com este código não são revertidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="product-code-remove-reason">Motivo *</Label>
            <Textarea
              id="product-code-remove-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 1000))}
              rows={2}
              disabled={removing}
            />
            {removeError && (
              <p role="alert" className="break-words text-sm text-destructive">
                {removeError}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11" disabled={removing}>
              Cancelar
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              className="h-11"
              onClick={() => void confirmRemove()}
              disabled={removing || reason.trim() === ""}
            >
              {removing ? "A remover…" : "Remover"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
