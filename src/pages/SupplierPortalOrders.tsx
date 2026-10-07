import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ClipboardList, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useSupplierPortal } from "@/contexts/SupplierPortalContext";
import { isNoSupplierAccess, spErrorMessage, spListOrders, type SpOrderFilter } from "@/lib/supplierPortal/spRpc";
import { SP_ORDERS_QUERY_KEY } from "@/components/supplier-portal/useSpOrdersToConfirm";
import { SpOrderBadges } from "@/components/supplier-portal/SpOrderBadges";
import { formatSpDate, formatSpMoney } from "@/components/supplier-portal/spOrderFormat";

const PAGE_SIZE = 25;
const ALL_COMPANIES = "__all__";

const FILTERS: { value: SpOrderFilter; label: string }[] = [
  { value: "to_confirm", label: "Por confirmar" },
  { value: "confirmed", label: "Confirmadas" },
  { value: "open", label: "Em curso" },
  { value: "received", label: "Recebidas" },
  { value: "cancelled", label: "Canceladas" },
  { value: "all", label: "Todas" },
];

function parseFilter(value: string | null): SpOrderFilter {
  return FILTERS.some((f) => f.value === value) ? (value as SpOrderFilter) : "to_confirm";
}

/** Portal do Fornecedor — lista de encomendas (sp_list_orders). */
export default function SupplierPortalOrders() {
  const { account, companies, refresh } = useSupplierPortal();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const filter = parseFilter(params.get("estado"));
  const orgParam = params.get("empresa");
  const orgId = orgParam && companies.some((c) => c.organization_id === orgParam) ? orgParam : null;

  const [searchInput, setSearchInput] = useState(params.get("q") ?? "");
  const [search, setSearch] = useState(searchInput.trim());
  const [page, setPage] = useState(0);

  const updateParam = (key: string, value: string | null) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  };

  // Pesquisa com atraso para não chamar a RPC a cada tecla.
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(0);
  }, [filter, orgId, search]);

  const accountId = account?.id ?? null;
  const query = useQuery({
    queryKey: [SP_ORDERS_QUERY_KEY, accountId, "list", filter, orgId, search, page],
    queryFn: () => spListOrders({ orgId, status: filter, search, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    enabled: !!accountId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: (count, err) => !isNoSupplierAccess(err) && count < 1,
  });

  useEffect(() => {
    if (query.error && isNoSupplierAccess(query.error)) void refresh();
  }, [query.error, refresh]);

  const data = query.data;
  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  const showCompany = companies.length > 1;

  useEffect(() => {
    if (data && page > 0 && page >= pageCount) setPage(pageCount - 1);
  }, [data, page, pageCount]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Encomendas</h1>
          <p className="text-sm text-muted-foreground">
            Encomendas que as empresas lhe enviaram pelo portal. Abra uma encomenda para ver o detalhe, descarregar o PDF e
            confirmar.
          </p>
        </div>
        <Button
          variant="outline"
          className="h-11 gap-2 self-start sm:self-auto"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={cn("h-4 w-4", query.isFetching && "animate-spin")} aria-hidden="true" />
          Atualizar
        </Button>
      </div>

      {/* Separadores de estado com contagem (counts não dependem do estado escolhido). */}
      <div role="tablist" aria-label="Estado das encomendas" className="flex gap-1 overflow-x-auto border-b">
        {FILTERS.map((f) => {
          const selected = f.value === filter;
          const count = data?.counts?.[f.value];
          return (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => updateParam("estado", f.value === "to_confirm" ? null : f.value)}
              className={cn(
                "flex items-center gap-1.5 h-11 px-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                selected
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              )}
            >
              {f.label}
              {count !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[11px] leading-5 min-w-5 text-center",
                    selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="sp-orders-search">Pesquisar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="sp-orders-search"
              type="search"
              placeholder="Número da encomenda ou empresa"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                updateParam("q", e.target.value.trim() || null);
              }}
              className="pl-9 h-11"
            />
          </div>
        </div>
        {showCompany && (
          <div className="space-y-1 sm:w-64">
            <Label htmlFor="sp-orders-company">Empresa</Label>
            <Select
              value={orgId ?? ALL_COMPANIES}
              onValueChange={(v) => updateParam("empresa", v === ALL_COMPANIES ? null : v)}
            >
              <SelectTrigger id="sp-orders-company" className="h-11">
                <SelectValue placeholder="Todas as empresas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_COMPANIES}>Todas as empresas</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.organization_id} value={c.organization_id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {query.error && !isNoSupplierAccess(query.error) && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-2">
            {spErrorMessage(query.error)}
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              Tentar de novo
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {query.isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground" role="status">
          A carregar encomendas…
        </p>
      ) : items.length === 0 && !query.error ? (
        <div className="rounded-lg border bg-background py-12 px-4 text-center space-y-2">
          <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">
            {search || orgId ? "Nenhuma encomenda com estes filtros." : filter === "to_confirm" ? "Não tem encomendas por confirmar." : "Sem encomendas."}
          </p>
          {filter !== "all" && (
            <Button variant="link" onClick={() => updateParam("estado", "all")}>
              Ver todas as encomendas
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Telemóvel: cartões */}
          <ul className="space-y-2 md:hidden">
            {items.map((o) => (
              <li key={o.purchase_order_id}>
                <Link
                  to={`/supplier-portal/orders/${o.purchase_order_id}`}
                  className="block rounded-lg border bg-background p-3 space-y-1.5 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{o.order_number}</p>
                      <p className="text-xs text-muted-foreground truncate">{o.organization.name}</p>
                    </div>
                    <SpOrderBadges orderStatus={o.order_status} publicationStatus={o.publication_status} className="justify-end" />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {formatSpDate(o.order_date)} · {o.lines} linha(s)
                    </span>
                    <span className="font-medium text-foreground">{formatSpMoney(o.total, o.currency)}</span>
                  </div>
                  {o.promised_date && (
                    <p className="text-xs text-muted-foreground">Entrega prevista: {formatSpDate(o.promised_date)}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          {/* Ecrã largo: tabela */}
          <div className="hidden md:block rounded-lg border bg-background overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Encomenda</TableHead>
                  {showCompany && <TableHead>Empresa</TableHead>}
                  <TableHead>Data</TableHead>
                  <TableHead>Entrega pedida</TableHead>
                  <TableHead>Entrega prevista</TableHead>
                  <TableHead className="text-right">Linhas</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((o) => (
                  <TableRow
                    key={o.purchase_order_id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/supplier-portal/orders/${o.purchase_order_id}`)}
                  >
                    <TableCell className="font-medium">
                      <Link
                        to={`/supplier-portal/orders/${o.purchase_order_id}`}
                        className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {o.order_number}
                      </Link>
                    </TableCell>
                    {showCompany && <TableCell className="max-w-[18ch] truncate" title={o.organization.name}>{o.organization.name}</TableCell>}
                    <TableCell>{formatSpDate(o.order_date)}</TableCell>
                    <TableCell>{formatSpDate(o.expected_delivery)}</TableCell>
                    <TableCell>{formatSpDate(o.promised_date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{o.lines}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatSpMoney(o.total, o.currency)}</TableCell>
                    <TableCell>
                      <SpOrderBadges orderStatus={o.order_status} publicationStatus={o.publication_status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span aria-live="polite">
              {from}–{to} de {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-11 w-11 p-0"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || query.isFetching}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                className="h-11 w-11 p-0"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1 || query.isFetching}
                aria-label="Página seguinte"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
