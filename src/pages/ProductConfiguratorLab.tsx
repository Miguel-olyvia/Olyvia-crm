import { useEffect, useMemo, useState, useCallback } from "react";
import Layout from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, FlaskConical, Search, Settings2, Pencil, RefreshCw, Loader2 } from "lucide-react";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { ProductKindDialog, isValidKind, type ProductKind } from "@/components/configurator-lab/ProductKindDialog";
import { ConfiguratorEditorDialog } from "@/components/configurator-lab/ConfiguratorEditorDialog";

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  product_kind: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  category?: { name: string } | null;
  subcategory?: { name: string } | null;
  has_template?: boolean;
  active_version?: number | null;
}

const KIND_BADGE_VARIANT: Record<ProductKind, "default" | "secondary" | "outline" | "destructive"> = {
  simple: "secondary",
  component: "outline",
  configurable: "default",
};

const PAGE_SIZE = 10;

export default function ProductConfiguratorLab() {
  const { activeCompany } = useCompany();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "none" | ProductKind>("all");
  const [tplFilter, setTplFilter] = useState<"all" | "with" | "without">("all");

  const [allRows, setAllRows] = useState<ProductRow[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);

  const [editingKindFor, setEditingKindFor] = useState<ProductRow | null>(null);
  const [editorFor, setEditorFor] = useState<ProductRow | null>(null);
  const [savingKind, setSavingKind] = useState(false);

  const loadProducts = useCallback(async () => {
    if (!activeCompany?.id) return;
    setLoading(true);
    try {
      const term = search.trim().toLowerCase();
      let q = supabase
        .from("products")
        .select(`
          id, name, sku, product_kind, category_id, subcategory_id,
          category:product_categories!category_id(name),
          subcategory:product_categories!subcategory_id(name)
        `)
        .is("deleted_at", null)
        .order("name")
        .limit(2000);

      if (term) q = q.or(`sku.ilike.%${term}%,name.ilike.%${term}%`);
      if (kindFilter !== "all") {
        if (kindFilter === "none") q = q.is("product_kind", null);
        else q = q.eq("product_kind", kindFilter);
      }

      const { data: prods, error } = await q;
      if (error) throw error;

      const ids = (prods ?? []).map((p: any) => p.id);
      if (ids.length === 0) {
        setAllRows([]);
        return;
      }

      // Org membership filter
      const { data: poRows, error: poErr } = await supabase
        .from("product_organizations")
        .select("product_id")
        .eq("organization_id", activeCompany.id)
        .in("product_id", ids);
      if (poErr) throw poErr;
      const allowed = new Set((poRows ?? []).map((r: any) => r.product_id));
      const filteredProds = (prods ?? []).filter((p: any) => allowed.has(p.id));

      // Templates lookup (single query)
      const filteredIds = filteredProds.map((p: any) => p.id);
      const tplMap = new Map<string, { has: boolean; activeVersion: number | null }>();
      if (filteredIds.length > 0) {
        const { data: tpls } = await supabase
          .from("product_configuration_templates")
          .select("product_id, version, is_active")
          .eq("organization_id", activeCompany.id)
          .in("product_id", filteredIds);
        (tpls ?? []).forEach((t: any) => {
          const cur = tplMap.get(t.product_id) ?? { has: true, activeVersion: null };
          cur.has = true;
          if (t.is_active) cur.activeVersion = t.version;
          tplMap.set(t.product_id, cur);
        });
      }

      let rows: ProductRow[] = filteredProds.map((p: any) => {
        const t = tplMap.get(p.id);
        return {
          ...p,
          has_template: !!t?.has,
          active_version: t?.activeVersion ?? null,
        };
      });

      if (tplFilter === "with") rows = rows.filter((r) => r.has_template);
      else if (tplFilter === "without") rows = rows.filter((r) => !r.has_template);

      setAllRows(rows);
      setVisibleCount(PAGE_SIZE);
    } catch (err: any) {
      console.error("[ConfiguratorLab] load error", err);
      toast({
        title: "Erro a carregar produtos",
        description: err.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id, search, kindFilter, tplFilter, toast]);

  useEffect(() => {
    const handle = setTimeout(loadProducts, 250);
    return () => clearTimeout(handle);
  }, [loadProducts]);

  const visibleRows = useMemo(() => allRows.slice(0, visibleCount), [allRows, visibleCount]);
  const hasMore = visibleCount < allRows.length;

  const { loadMoreRef } = useInfiniteScroll({
    onLoadMore: () => setVisibleCount((c) => Math.min(c + PAGE_SIZE, allRows.length)),
    hasMore,
    isLoading: loading,
  });

  const handleSaveKind = async (newKind: ProductKind | null) => {
    if (!editingKindFor) return;
    setSavingKind(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({ product_kind: newKind })
        .eq("id", editingKindFor.id);
      if (error) throw error;

      setAllRows((prev) =>
        prev.map((p) => (p.id === editingKindFor.id ? { ...p, product_kind: newKind } : p))
      );
      toast({
        title: "Tipo atualizado",
        description: `${editingKindFor.name} → ${newKind ?? "sem tipo"}`,
      });
      setEditingKindFor(null);
    } catch (err: any) {
      console.error("[ConfiguratorLab] save kind error", err);
      toast({
        title: "Erro a guardar",
        description: err.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setSavingKind(false);
    }
  };

  return (
    <>
      <div className="container mx-auto p-6 space-y-4 max-w-[1400px]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <FlaskConical className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Configurador de produtos (modo de teste)</h1>
              <p className="text-sm text-muted-foreground">
                Lista os produtos da empresa ativa. Defina o tipo e configure a estrutura sem afetar o que está à venda.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadProducts} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Test-mode banner */}
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex gap-3 p-3">
            <AlertTriangle className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <strong>Modo de teste.</strong> Nada do que faz aqui é enviado para orçamentos, propostas, stock ou preços ao cliente.
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card>
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Pesquisar por nome ou SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={kindFilter} onValueChange={(v: any) => setKindFilter(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="none">Sem tipo</SelectItem>
                <SelectItem value="simple">Simple</SelectItem>
                <SelectItem value="component">Component</SelectItem>
                <SelectItem value="configurable">Configurable</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tplFilter} onValueChange={(v: any) => setTplFilter(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Com / sem template</SelectItem>
                <SelectItem value="with">Com template</SelectItem>
                <SelectItem value="without">Sem template</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Template</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && allRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    A carregar...
                  </TableCell>
                </TableRow>
              ) : visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Sem produtos para mostrar.
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((p) => {
                  const kind = p.product_kind;
                  const kindBadgeVariant = !kind
                    ? "outline"
                    : isValidKind(kind)
                    ? KIND_BADGE_VARIANT[kind]
                    : "destructive";
                  const isConfigurable = kind === "configurable";

                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.sku ?? "—"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{p.category?.name ?? "—"}</div>
                        {p.subcategory?.name && (
                          <div className="text-xs text-muted-foreground">{p.subcategory.name}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={kindBadgeVariant}>
                          {kind ?? "sem tipo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {p.has_template ? (
                          <Badge variant="secondary">
                            {p.active_version ? `Ativo v${p.active_version}` : "Rascunho"}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem template</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <TooltipProvider>
                          <div className="inline-flex gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setEditingKindFor(p)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Definir tipo</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={!isConfigurable}
                                    onClick={() => setEditorFor(p)}
                                  >
                                    <Settings2 className="h-4 w-4" />
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {isConfigurable
                                  ? "Abrir configurador"
                                  : "Disponível apenas para produtos Configurable"}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          {hasMore && (
            <div ref={loadMoreRef} className="p-3 text-center text-xs text-muted-foreground">
              A carregar mais…
            </div>
          )}
        </Card>

        {/* Dialogs */}
        <ProductKindDialog
          open={!!editingKindFor}
          onOpenChange={(o) => !o && setEditingKindFor(null)}
          productName={editingKindFor?.name ?? ""}
          productSku={editingKindFor?.sku ?? null}
          currentKind={editingKindFor?.product_kind ?? null}
          saving={savingKind}
          onSave={handleSaveKind}
        />

        <ConfiguratorEditorDialog
          open={!!editorFor}
          onOpenChange={(o) => !o && setEditorFor(null)}
          productId={editorFor?.id ?? null}
          productName={editorFor?.name ?? ""}
          productSku={editorFor?.sku ?? null}
          organizationId={activeCompany?.id ?? null}
        />
      </div>
    </>
  );
}
