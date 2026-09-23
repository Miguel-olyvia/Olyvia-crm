import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Loader2, Search, Star, Trash2, Upload } from "lucide-react";
import {
  buildCatalogImportPlan,
  exportSupplierCatalogXlsx,
  formatCatalogUnit,
  readCatalogFile,
  type CatalogImportLine,
  type CatalogProductRef,
  type CatalogUomRef,
  type SupplierCatalogRow,
} from "@/utils/supplierCatalogExportImport";

interface SupplierCatalogPanelProps {
  supplierId: string;
  supplierName: string;
  // Organização do fornecedor: os produtos do import procuram-se aqui e as
  // ligações novas ficam com esta organization_id (como no ItemSuppliersTable).
  organizationId: string | null;
  onChanged?: () => void;
}

const PRODUCTS_PAGE = 1000;
const IN_CHUNK = 200;

const formatMoney = (value: number | null, currency: string | null) =>
  value == null
    ? "-"
    : `${Number(value).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${currency ?? ""}`.trim();

const ACTION_BADGE: Record<CatalogImportLine["action"] | "saved", { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  insert: { label: "Novo", variant: "default" },
  update: { label: "Atualizar", variant: "secondary" },
  unchanged: { label: "Sem alterações", variant: "outline" },
  error: { label: "Erro", variant: "destructive" },
  saved: { label: "Gravado", variant: "default" },
};

function describePatch(line: CatalogImportLine): string {
  const p = line.patch;
  const parts: string[] = [];
  if (p.supplier_sku !== undefined) parts.push(`Ref. ${p.supplier_sku}`);
  if (p.purchase_price !== undefined) parts.push(`Preço ${formatMoney(p.purchase_price, p.currency ?? null)}`);
  else if (p.currency !== undefined) parts.push(`Moeda ${p.currency}`);
  if (p.moq !== undefined) parts.push(`MOQ ${p.moq}`);
  if (p.lead_time_days !== undefined) parts.push(`Prazo ${p.lead_time_days} d`);
  if (p.is_active !== undefined) parts.push(p.is_active ? "Ativo" : "Inativo");
  return parts.join(" · ") || "-";
}

// Os gatilhos da BD já falam PT; só o índice único chega em inglês.
function describeDbError(error: { message?: string } | null | undefined): string {
  const msg = error?.message || "Erro desconhecido";
  if (msg.includes("item_suppliers_product_supplier_uom_active_uniq")) {
    return "Esta ligação (produto + unidade) já existe — recarregue o catálogo e importe de novo.";
  }
  return msg;
}

// Catálogo de um fornecedor (produtos), por unidade de compra: consulta,
// pesquisa, exportação e importação XLSX. Leitura via rpc_supplier_catalog /
// rpc_supplier_catalog_search (SECURITY INVOKER — o RLS de item_suppliers
// decide o que se vê). Escrita direta em item_suppliers, com as mesmas regras
// do ItemSuppliersTable (preferido só na primeira ligação do produto).
export default function SupplierCatalogPanel({ supplierId, supplierName, organizationId, onChanged }: SupplierCatalogPanelProps) {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canView = hasPermission("suppliers.view_pricing") || hasPermission("products.view_cost");
  // item_suppliers_insert/update/delete_policy exigem products.edit.
  const canEdit = hasPermission("products.edit");

  const [allRows, setAllRows] = useState<SupplierCatalogRow[]>([]);
  const [searchRows, setSearchRows] = useState<SupplierCatalogRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [deletingRow, setDeletingRow] = useState<SupplierCatalogRow | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preparingImport, setPreparingImport] = useState(false);
  const [importLines, setImportLines] = useState<CatalogImportLine[] | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyErrors, setApplyErrors] = useState<Record<number, string>>({});
  // Linhas já gravadas nesta pré-visualização — nunca se reenviam.
  const [savedLines, setSavedLines] = useState<Set<number>>(new Set());

  const loadCatalog = async (): Promise<SupplierCatalogRow[]> => {
    setLoading(true);
    const { data, error } = await supabase.rpc("rpc_supplier_catalog", { p_supplier_id: supplierId });
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao carregar o catálogo", description: error.message, variant: "destructive" });
      return allRows;
    }
    const rows = (data || []) as SupplierCatalogRow[];
    setAllRows(rows);
    return rows;
  };

  useEffect(() => {
    if (supplierId && canView) loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, canView]);

  // Pesquisa no servidor (SKU, código de barras, ref. do fornecedor, nome) —
  // correspondências exatas de código primeiro (leitor de código de barras).
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setSearchRows(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      const { data, error } = await supabase.rpc("rpc_supplier_catalog_search", {
        p_supplier_id: supplierId,
        p_query: term,
        p_limit: 200,
      });
      if (cancelled) return;
      setSearching(false);
      if (error) {
        toast({ title: "Erro na pesquisa", description: error.message, variant: "destructive" });
        return;
      }
      setSearchRows((data || []) as SupplierCatalogRow[]);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, supplierId]);

  const visibleRows = searchRows ?? allRows;

  const handleExport = () => {
    exportSupplierCatalogXlsx(allRows, supplierName);
    toast({ title: "Catálogo exportado", description: `${allRows.length} linha(s).` });
  };

  const handleDelete = async () => {
    if (!deletingRow) return;
    const { error } = await supabase.rpc("rpc_delete_item_supplier", { p_id: deletingRow.item_supplier_id });
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Associação removida" });
    setDeletingRow(null);
    const removedId = deletingRow.item_supplier_id;
    setSearchRows((prev) => (prev ? prev.filter((r) => r.item_supplier_id !== removedId) : prev));
    await loadCatalog();
    onChanged?.();
  };

  // ─── Import ───────────────────────────────────────────────────────────────

  // Produtos no âmbito da empresa do fornecedor, com o mesmo critério do
  // catálogo das Encomendas a Fornecedor: os que ela possui
  // (products.organization_id) e os partilhados com ela via
  // product_organizations (rpc_create/update_product, p_all_org_ids). O RLS
  // de products (get_user_visible_org_ids) limita ao que o utilizador vê.
  const loadOrgProducts = async (orgId: string): Promise<CatalogProductRef[]> => {
    const byId = new Map<string, CatalogProductRef>();
    const pageAll = async (build: (from: number) => PromiseLike<{ data: any[] | null; error: any }>) => {
      for (let from = 0; ; from += PRODUCTS_PAGE) {
        const { data, error } = await build(from);
        if (error) throw error;
        (data || []).forEach((p: any) => {
          if (!byId.has(p.id)) byId.set(p.id, { id: p.id, name: p.name, sku: p.sku, barcode: p.barcode, uom_id: p.uom_id } as CatalogProductRef);
        });
        if (!data || data.length < PRODUCTS_PAGE) break;
      }
    };
    await Promise.all([
      pageAll((from) =>
        supabase
          .from("products")
          .select("id, name, sku, barcode, uom_id")
          .eq("organization_id", orgId)
          .eq("is_deleted", false)
          .order("id")
          .range(from, from + PRODUCTS_PAGE - 1),
      ),
      pageAll((from) =>
        (supabase as any)
          .from("products")
          .select("id, name, sku, barcode, uom_id, product_organizations!inner(organization_id)")
          .eq("product_organizations.organization_id", orgId)
          .neq("organization_id", orgId)
          .eq("is_deleted", false)
          .order("id")
          .range(from, from + PRODUCTS_PAGE - 1),
      ),
    ]);
    return Array.from(byId.values());
  };

  const loadUoms = async (orgId: string): Promise<CatalogUomRef[]> => {
    const { data, error } = await supabase
      .from("uom")
      .select("id, code, base_uom_id, conversion_factor")
      .or(`organization_id.eq.${orgId},organization_id.is.null`);
    if (error) throw error;
    return (data || []) as CatalogUomRef[];
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!organizationId) {
      toast({ title: "Erro", description: "O fornecedor não tem empresa definida.", variant: "destructive" });
      return;
    }
    setPreparingImport(true);
    try {
      const parsed = await readCatalogFile(file);
      const [products, uoms, existing] = await Promise.all([
        loadOrgProducts(organizationId),
        loadUoms(organizationId),
        loadCatalog(),
      ]);
      const lines = buildCatalogImportPlan(parsed, { products, uoms, existing });
      if (lines.length === 0) throw new Error("O ficheiro não tem linhas para importar.");
      setApplyErrors({});
      setSavedLines(new Set());
      setImportFileName(file.name);
      setImportLines(lines);
    } catch (error: any) {
      captureFlowError(error, "record-export-import");
      toast({ title: "Erro ao ler o ficheiro", description: error?.message ?? String(error), variant: "destructive" });
    } finally {
      setPreparingImport(false);
    }
  };

  const pendingLines = (importLines ?? []).filter(
    (l) => (l.action === "insert" || l.action === "update") && !(l.line in applyErrors) && !savedLines.has(l.line),
  );

  const handleApplyImport = async () => {
    if (!importLines || !organizationId) return;
    const businessUserId = await resolveCurrentBusinessUserId();
    if (!businessUserId) {
      toast({ title: "Erro", description: "Perfil de utilizador não encontrado.", variant: "destructive" });
      return;
    }
    setApplying(true);
    const failures: Record<number, string> = { ...applyErrors };
    const saved = new Set(savedLines);
    let inserted = 0;
    let updated = 0;
    try {
      // Mesma regra do ItemSuppliersTable: a primeira ligação de um produto
      // (a qualquer fornecedor) fica preferencial. O gatilho de preferido
      // rejeitaria uma segunda — por isso só se marca quando não há nenhuma.
      const toInsert = pendingLines.filter((l) => l.action === "insert");
      const productIds = Array.from(new Set(toInsert.map((l) => l.productId!)));
      const hasLink = new Set<string>();
      for (let i = 0; i < productIds.length; i += IN_CHUNK) {
        const { data, error } = await supabase
          .from("item_suppliers")
          .select("product_id")
          .in("product_id", productIds.slice(i, i + IN_CHUNK))
          .is("deleted_at", null);
        if (error) throw error;
        (data || []).forEach((r) => r.product_id && hasLink.add(r.product_id));
      }

      for (const line of pendingLines) {
        if (line.action === "insert") {
          const preferred = !hasLink.has(line.productId!);
          const { error } = await supabase.from("item_suppliers").insert({
            organization_id: organizationId,
            item_type: "product",
            product_id: line.productId!,
            supplier_id: supplierId,
            uom_id: line.uomId ?? null,
            supplier_sku: line.patch.supplier_sku ?? null,
            purchase_price: line.patch.purchase_price ?? null,
            currency: line.patch.currency ?? "EUR",
            moq: line.patch.moq ?? null,
            lead_time_days: line.patch.lead_time_days ?? null,
            is_active: line.patch.is_active ?? true,
            is_preferred: preferred,
            created_by: businessUserId,
          });
          if (error) {
            failures[line.line] = describeDbError(error);
            continue;
          }
          hasLink.add(line.productId!);
          saved.add(line.line);
          inserted += 1;
        } else if (line.itemSupplierId) {
          // .select("id"): sem ele, uma linha filtrada pelo RLS "atualiza" 0
          // registos sem erro e contaria como gravada.
          const { data, error } = await supabase
            .from("item_suppliers")
            .update({ ...line.patch, updated_at: new Date().toISOString() })
            .eq("id", line.itemSupplierId)
            .select("id");
          if (error) {
            failures[line.line] = describeDbError(error);
            continue;
          }
          if (!data || data.length === 0) {
            failures[line.line] = "Sem permissão para alterar esta ligação, ou foi removida entretanto — nada foi gravado.";
            continue;
          }
          saved.add(line.line);
          updated += 1;
        }
      }
    } catch (error: any) {
      captureFlowError(error, "record-export-import");
      toast({ title: "Erro ao importar", description: error?.message ?? String(error), variant: "destructive" });
    } finally {
      setApplying(false);
    }

    const failedCount = Object.keys(failures).length - Object.keys(applyErrors).length;
    setApplyErrors(failures);
    setSavedLines(saved);
    if (inserted + updated > 0) {
      await loadCatalog();
      onChanged?.();
    }
    toast({
      title: "Importação concluída",
      description: `${inserted} nova(s), ${updated} atualizada(s)${failedCount > 0 ? `, ${failedCount} com erro` : ""}.`,
      variant: failedCount > 0 ? "destructive" : undefined,
    });
    // Sem falhas fecha; com falhas fica aberto para ver o motivo por linha.
    if (failedCount === 0) setImportLines(null);
  };

  if (!canView) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sem permissão para ver os preços de compra — o catálogo não está disponível.
      </p>
    );
  }

  const counts = (importLines ?? []).reduce(
    (acc, l) => {
      acc[savedLines.has(l.line) ? "saved" : l.line in applyErrors ? "error" : l.action] += 1;
      return acc;
    },
    { insert: 0, update: 0, unchanged: 0, error: 0, saved: 0 } as Record<CatalogImportLine["action"] | "saved", number>,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar por SKU, código de barras, ref. ou nome"
            className="pl-10"
            aria-label="Pesquisar no catálogo"
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleExport} disabled={loading}>
            <Download className="w-4 h-4 mr-1" /> Exportar XLSX
          </Button>
          {canEdit && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={preparingImport || !organizationId}
              >
                {preparingImport ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                Importar XLSX
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileChosen}
              />
            </>
          )}
        </div>
      </div>

      {loading && allRows.length === 0 ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : visibleRows.length === 0 ? (
        <p className="text-center text-muted-foreground py-6">
          {searchRows ? (searching ? "A pesquisar..." : "Nenhum resultado.") : "Nenhum produto associado a este fornecedor."}
        </p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"><span className="sr-only">Preferido</span></TableHead>
                <TableHead>Ref. fornecedor</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">MOQ</TableHead>
                <TableHead className="text-right">Prazo (dias)</TableHead>
                {canEdit && <TableHead className="text-right w-12"><span className="sr-only">Ações</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => {
                const perBase =
                  row.purchase_price != null && row.units_per_uom && row.units_per_uom > 1
                    ? Number(row.purchase_price) / row.units_per_uom
                    : null;
                return (
                  <TableRow key={row.item_supplier_id} className={row.is_active ? "" : "opacity-60"}>
                    <TableCell>
                      {row.is_preferred && (
                        <span title="Fornecedor preferencial deste produto">
                          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.supplier_sku || "-"}</TableCell>
                    <TableCell className="font-medium">
                      {row.product_name}
                      {!row.is_active && <Badge variant="secondary" className="ml-2">Inativo</Badge>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.sku || "-"}</TableCell>
                    <TableCell>{formatCatalogUnit(row)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div>{formatMoney(row.purchase_price, row.currency)}</div>
                      {perBase != null && (
                        <div className="text-xs text-muted-foreground">
                          {formatMoney(perBase, row.currency)} / {row.product_uom_code}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{row.moq ?? "-"}</TableCell>
                    <TableCell className="text-right">{row.lead_time_days ?? "-"}</TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label="Remover associação"
                          onClick={() => setDeletingRow(row)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {searchRows && searchRows.length >= 200 && (
        <p className="text-xs text-muted-foreground">A mostrar os primeiros 200 resultados — refine a pesquisa.</p>
      )}

      {/* Pré-visualização do import: nada é gravado até confirmar. */}
      <Dialog open={!!importLines} onOpenChange={(v) => { if (!v && !applying) setImportLines(null); }}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar catálogo — {supplierName}</DialogTitle>
            <DialogDescription>
              {importFileName}: {counts.insert} nova(s), {counts.update} a atualizar, {counts.unchanged} sem alterações, {counts.error} com erro{counts.saved > 0 ? `, ${counts.saved} gravada(s)` : ""}.
              As linhas com erro não são gravadas. Células vazias não alteram o valor atual.
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Linha</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Valores</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(importLines ?? []).map((l) => {
                const failed = applyErrors[l.line];
                const badge = ACTION_BADGE[savedLines.has(l.line) ? "saved" : failed ? "error" : l.action];
                const errors = failed ? [failed] : l.errors;
                return (
                  <TableRow key={l.line}>
                    <TableCell>{l.line}</TableCell>
                    <TableCell>
                      <div className="font-mono text-xs">{l.reference || "-"}</div>
                      {l.productName && <div className="text-sm">{l.productName}</div>}
                    </TableCell>
                    <TableCell>{l.uomLabel}</TableCell>
                    <TableCell className="text-xs">{describePatch(l)}</TableCell>
                    <TableCell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      {errors.length > 0 && (
                        <ul className="mt-1 text-xs text-destructive space-y-0.5">
                          {errors.map((err, idx) => <li key={idx}>{err}</li>)}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportLines(null)} disabled={applying}>
              Fechar
            </Button>
            <Button type="button" onClick={handleApplyImport} disabled={applying || pendingLines.length === 0}>
              {applying && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Gravar {pendingLines.length} linha(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingRow} onOpenChange={(v) => { if (!v) setDeletingRow(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover associação a "{deletingRow?.product_name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Este fornecedor deixa de estar associado a este produto{deletingRow ? ` (${formatCatalogUnit(deletingRow)})` : ""}. O histórico de preços fica preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
