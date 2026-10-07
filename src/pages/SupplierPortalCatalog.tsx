import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, FileDown, Info, Pencil, Plus, Power, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useSupplierPortal } from "@/contexts/SupplierPortalContext";
import {
  isNoSupplierAccess,
  spCatalogList,
  spCatalogSetActive,
  spErrorMessage,
  type SpCatalogItem,
} from "@/lib/supplierPortal/spRpc";
import { downloadSupplierCatalogTemplate, exportSupplierPortalCatalogXlsx } from "@/utils/supplierPortalCatalogTemplate";
import { SupplierCatalogItemDialog } from "@/components/supplier-portal/SupplierCatalogItemDialog";
import { SupplierCatalogImportDialog } from "@/components/supplier-portal/SupplierCatalogImportDialog";

const PAGE_SIZE = 50;
const QUERY_KEY = "supplier-portal-catalog";

function formatNumber(n: number | null, opts?: Intl.NumberFormatOptions): string {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("pt-PT", { maximumFractionDigits: 4, ...opts });
}

function formatPrice(item: SpCatalogItem): string {
  if (item.base_price === null || item.base_price === undefined) return "—";
  try {
    return Number(item.base_price).toLocaleString("pt-PT", {
      style: "currency",
      currency: item.currency || "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  } catch {
    return `${formatNumber(item.base_price)} ${item.currency}`;
  }
}

/** Portal do Fornecedor — catálogo (sp_catalog_list / upsert / set_active / import). */
export default function SupplierPortalCatalog() {
  const { account, canManageCatalog, refresh } = useSupplierPortal();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<SpCatalogItem | null>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Pesquisa com atraso para não chamar a RPC a cada tecla.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setSelected(new Set());
  }, [search, includeInactive, page]);

  const accountId = account?.id ?? null;
  const query = useQuery({
    queryKey: [QUERY_KEY, accountId, search, includeInactive, page],
    queryFn: () => spCatalogList({ search, limit: PAGE_SIZE, offset: page * PAGE_SIZE, includeInactive }),
    enabled: !!accountId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: (count, err) => !isNoSupplierAccess(err) && count < 1,
  });

  useEffect(() => {
    if (query.error && isNoSupplierAccess(query.error)) void refresh();
  }, [query.error, refresh]);

  const data = query.data;
  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const canEdit = canManageCatalog && (data?.can_edit ?? true);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);

  // Página fora do intervalo (p.ex. depois de desativar os últimos da página).
  useEffect(() => {
    if (data && page > 0 && page >= pageCount) setPage(pageCount - 1);
  }, [data, page, pageCount]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY, accountId] });

  const handleError = (err: unknown, title: string) => {
    if (isNoSupplierAccess(err)) {
      void refresh();
      return;
    }
    toast({ title, description: spErrorMessage(err), variant: "destructive" });
  };

  const setActive = async (ids: string[], active: boolean) => {
    if (ids.length === 0) return;
    setBusyIds((s) => new Set([...s, ...ids]));
    try {
      const res = await spCatalogSetActive(ids, active);
      toast({
        title: active ? "Artigos ativados" : "Artigos desativados",
        description: `${res.updated} artigo(s) ${active ? "ativado(s)" : "desativado(s)"}.`,
      });
      setSelected(new Set());
      await invalidate();
    } catch (err) {
      handleError(err, active ? "Não foi possível ativar" : "Não foi possível desativar");
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const all: SpCatalogItem[] = [];
      for (let offset = 0; ; offset += 500) {
        const res = await spCatalogList({ search: null, limit: 500, offset, includeInactive: true });
        all.push(...res.items);
        if (res.items.length < 500 || all.length >= res.total) break;
      }
      if (all.length === 0) {
        toast({ title: "Catálogo vazio", description: "Ainda não tem artigos para exportar." });
        return;
      }
      exportSupplierPortalCatalogXlsx(all, account?.display_name ?? "fornecedor");
    } catch (err) {
      handleError(err, "Não foi possível exportar");
    } finally {
      setExporting(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setItemDialogOpen(true);
  };
  const openEdit = (item: SpCatalogItem) => {
    setEditing(item);
    setItemDialogOpen(true);
  };

  const allOnPageSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(items.map((i) => i.id)) : new Set());
  const toggleOne = (id: string, checked: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const selectedIds = Array.from(selected);
  const selectedItems = items.filter((i) => selected.has(i.id));
  const anySelectedActive = selectedItems.some((i) => i.is_active);
  const anySelectedInactive = selectedItems.some((i) => !i.is_active);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Catálogo</h1>
          <p className="text-sm text-muted-foreground">
            {query.isLoading ? "A carregar…" : `${total.toLocaleString("pt-PT")} artigo(s)${includeInactive ? "" : " ativos"}`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button variant="outline" className="h-11 gap-2" onClick={downloadSupplierCatalogTemplate}>
            <FileDown className="h-4 w-4" aria-hidden="true" />
            Descarregar modelo
          </Button>
          <Button variant="outline" className="h-11 gap-2" onClick={() => void handleExport()} disabled={exporting}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {exporting ? "A exportar…" : "Exportar"}
          </Button>
          {canEdit && (
            <>
              <Button variant="outline" className="h-11 gap-2" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                Importar
              </Button>
              <Button className="h-11 gap-2" onClick={openNew}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Novo artigo
              </Button>
            </>
          )}
        </div>
      </div>

      {!canEdit && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Está em modo de consulta. Só o utilizador principal da conta pode criar, alterar, importar ou desativar artigos.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Pesquisar por referência, nome, código de barras ou marca"
            aria-label="Pesquisar artigos"
            className="h-11 pl-9"
            maxLength={100}
          />
        </div>
        <div className="flex items-center gap-2 min-h-11">
          <Switch
            id="sp-include-inactive"
            checked={includeInactive}
            onCheckedChange={(v) => {
              setIncludeInactive(v);
              setPage(0);
            }}
          />
          <Label htmlFor="sp-include-inactive" className="cursor-pointer">Mostrar inativos</Label>
        </div>
      </div>

      {canEdit && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2" role="region" aria-label="Ações em lote">
          <span className="text-sm px-2">{selectedIds.length} selecionado(s)</span>
          {anySelectedInactive && (
            <Button variant="outline" className="h-11" disabled={busyIds.size > 0} onClick={() => void setActive(selectedIds, true)}>
              Ativar
            </Button>
          )}
          {anySelectedActive && (
            <Button variant="outline" className="h-11" disabled={busyIds.size > 0} onClick={() => void setActive(selectedIds, false)}>
              Desativar
            </Button>
          )}
          <Button variant="ghost" className="h-11" onClick={() => setSelected(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}

      {query.error && !isNoSupplierAccess(query.error) && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="flex flex-wrap items-center gap-2">
            {spErrorMessage(query.error)}
            <Button variant="outline" size="sm" className="h-11" onClick={() => void query.refetch()}>
              Tentar de novo
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!query.isLoading && !query.error && items.length === 0 && (
        <div className="rounded-lg border bg-background p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            {search ? "Nenhum artigo corresponde à pesquisa." : "Ainda não tem artigos no catálogo."}
          </p>
          {!search && canEdit && (
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button className="h-11 gap-2" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                Importar Excel/CSV
              </Button>
              <Button variant="outline" className="h-11 gap-2" onClick={openNew}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Novo artigo
              </Button>
            </div>
          )}
        </div>
      )}

      {items.length > 0 && (
        <>
          {/* Desktop/tablet: tabela */}
          <div className="hidden md:block rounded-lg border bg-background" aria-busy={query.isFetching}>
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  {canEdit && (
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allOnPageSelected}
                        onCheckedChange={(v) => toggleAll(v === true)}
                        aria-label="Selecionar todos os artigos desta página"
                      />
                    </TableHead>
                  )}
                  <TableHead>Ref.</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cód. barras</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">Mínimo</TableHead>
                  <TableHead className="text-right">Prazo</TableHead>
                  <TableHead>Estado</TableHead>
                  {canEdit && <TableHead className="w-28 text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} className={item.is_active ? undefined : "opacity-60"}>
                    {canEdit && (
                      <TableCell>
                        <Checkbox
                          checked={selected.has(item.id)}
                          onCheckedChange={(v) => toggleOne(item.id, v === true)}
                          aria-label={`Selecionar ${item.supplier_ref}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs whitespace-nowrap">{item.supplier_ref}</TableCell>
                    <TableCell className="max-w-[28ch]">
                      <p className="truncate" title={item.name}>{item.name}</p>
                      {item.brand && <p className="text-xs text-muted-foreground truncate">{item.brand}</p>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{item.barcode ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {item.unit_label ?? "—"}
                      {item.units_per_pack ? <span className="text-xs text-muted-foreground"> · {formatNumber(item.units_per_pack)}/emb.</span> : null}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatPrice(item)}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.moq)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {item.lead_time_days === null ? "—" : `${item.lead_time_days} d`}
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.is_active ? "secondary" : "outline"}>{item.is_active ? "Ativo" : "Inativo"}</Badge>
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => openEdit(item)} aria-label={`Editar ${item.supplier_ref}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11"
                          disabled={busyIds.has(item.id)}
                          onClick={() => void setActive([item.id], !item.is_active)}
                          aria-label={item.is_active ? `Desativar ${item.supplier_ref}` : `Ativar ${item.supplier_ref}`}
                          title={item.is_active ? "Desativar" : "Ativar"}
                        >
                          <Power className={item.is_active ? "h-4 w-4 text-destructive" : "h-4 w-4 text-emerald-600"} />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Telemóvel: cartões */}
          <ul className="md:hidden space-y-2" aria-busy={query.isFetching}>
            {items.map((item) => (
              <li key={item.id} className={`rounded-lg border bg-background p-3 space-y-2 ${item.is_active ? "" : "opacity-70"}`}>
                <div className="flex items-start gap-3">
                  {canEdit && (
                    <div className="h-11 w-6 flex items-center">
                      <Checkbox
                        checked={selected.has(item.id)}
                        onCheckedChange={(v) => toggleOne(item.id, v === true)}
                        aria-label={`Selecionar ${item.supplier_ref}`}
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-muted-foreground break-all">{item.supplier_ref}</p>
                    <p className="font-medium break-words">{item.name}</p>
                    {item.brand && <p className="text-xs text-muted-foreground">{item.brand}</p>}
                  </div>
                  <Badge variant={item.is_active ? "secondary" : "outline"}>{item.is_active ? "Ativo" : "Inativo"}</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Preço</dt>
                  <dd className="text-right">{formatPrice(item)}</dd>
                  <dt className="text-muted-foreground">Unidade</dt>
                  <dd className="text-right">
                    {item.unit_label ?? "—"}
                    {item.units_per_pack ? ` · ${formatNumber(item.units_per_pack)}/emb.` : ""}
                  </dd>
                  <dt className="text-muted-foreground">Mínimo</dt>
                  <dd className="text-right">{formatNumber(item.moq)}</dd>
                  <dt className="text-muted-foreground">Prazo</dt>
                  <dd className="text-right">{item.lead_time_days === null ? "—" : `${item.lead_time_days} dias`}</dd>
                  {item.barcode && (
                    <>
                      <dt className="text-muted-foreground">Cód. barras</dt>
                      <dd className="text-right font-mono break-all">{item.barcode}</dd>
                    </>
                  )}
                </dl>
                {canEdit && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-11 gap-2" onClick={() => openEdit(item)}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 gap-2"
                      disabled={busyIds.has(item.id)}
                      onClick={() => void setActive([item.id], !item.is_active)}
                    >
                      <Power className="h-4 w-4" aria-hidden="true" />
                      {item.is_active ? "Desativar" : "Ativar"}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <nav className="flex items-center justify-between gap-2" aria-label="Paginação">
            <p className="text-sm text-muted-foreground">
              {from.toLocaleString("pt-PT")}–{to.toLocaleString("pt-PT")} de {total.toLocaleString("pt-PT")}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="h-11 w-11 p-0"
                disabled={page === 0 || query.isFetching}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm tabular-nums">
                {page + 1} / {pageCount}
              </span>
              <Button
                variant="outline"
                className="h-11 w-11 p-0"
                disabled={page + 1 >= pageCount || query.isFetching}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Página seguinte"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </nav>
        </>
      )}

      {canEdit && (
        <>
          <SupplierCatalogItemDialog
            open={itemDialogOpen}
            item={editing}
            onOpenChange={setItemDialogOpen}
            onNoAccess={() => {
              setItemDialogOpen(false);
              void refresh();
            }}
            onSaved={(saved, created) => {
              setItemDialogOpen(false);
              toast({
                title: created ? "Artigo criado" : "Artigo guardado",
                description: `${saved.supplier_ref} · ${saved.name}`,
              });
              void invalidate();
            }}
          />
          <SupplierCatalogImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            onImported={() => void invalidate()}
            onNoAccess={() => void refresh()}
          />
        </>
      )}
    </div>
  );
}
