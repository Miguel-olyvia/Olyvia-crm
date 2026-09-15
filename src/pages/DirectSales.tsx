import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Pencil, Plus, Receipt, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { PermissionGate } from "@/components/PermissionGate";
import { DirectSaleEditor } from "@/components/directSales/DirectSaleEditor";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { cn, formatCurrency } from "@/lib/utils";

// Venda Direta — Fase 2: listagem. Fluxo alternativo, mais leve, ao caminho
// Orçamento -> Proposta -> Contrato (migration 20261130230000).
//
// Fora do âmbito desta fase (colunas já existem em direct_sales, mas NÃO são
// mostradas nem escritas aqui): envio ao portal/aceitação (sent_at/accepted_at),
// proforma, PDF, ligação a Encomendas Clientes (client_contract_id) e o
// documento interno com margem.
//
// `(supabase as any)`: direct_sales ainda não existe em
// src/integrations/supabase/types.ts (tipos gerados não regenerados após a
// migration; regenerá-los está fora do âmbito). Mesmo padrão já usado em
// ServiceMaterialsEditor.tsx e Services.tsx.

const PAGE_SIZE = 50;

type DirectSaleStatus = "rascunho" | "enviada" | "aceite" | "rejeitada" | "cancelada";

interface DirectSaleRow {
  id: string;
  sale_number: string | null;
  entity_id: string | null;
  client_id: string | null;
  title: string | null;
  status: DirectSaleStatus | string;
  total: number | null;
  invoice_status: string | null;
  created_at: string;
  /** Resolvido a partir de anew_entities depois da query principal. */
  client_name: string | null;
}

/** Cor do badge por estado — paleta alinhada com as outras listagens do módulo de aquisição. */
const STATUS_BADGE_CLASS: Record<string, string> = {
  rascunho: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  enviada: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  aceite: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejeitada: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  cancelada: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

const INVOICE_BADGE_CLASS: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  emitida: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
};

const STATUS_OPTIONS: DirectSaleStatus[] = ["rascunho", "enviada", "aceite", "rejeitada", "cancelada"];

const DirectSales = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { activeCompany, isLoading: companyLoading } = useCompany();

  const [sales, setSales] = useState<DirectSaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  /** Id monotónico do pedido de listagem em curso — ver `loadSales`. */
  const latestRequestIdRef = useRef(0);

  /**
   * Carrega uma página de vendas diretas da empresa ativa.
   *
   * O estado é filtrado no servidor; a pesquisa por número/cliente/título é
   * aplicada em memória sobre as linhas já carregadas — o nome do cliente vive
   * em anew_entities (tabela diferente, com RLS própria), logo não dá para o
   * incluir num `.or()` sobre direct_sales sem perder as correspondências por
   * nome. Com "Carregar mais" o utilizador alarga o conjunto pesquisável.
   *
   * Guarda de resposta obsoleta (mesmo efeito do `cancelled` usado no editor,
   * mas por id de pedido, porque esta função é chamada de vários sítios —
   * efeito inicial, "Carregar mais" e `onSaved` do editor): cada chamada
   * reclama o id mais recente e só essa pode escrever no estado. Sem isto, uma
   * resposta lenta de um filtro anterior podia aterrar por cima da lista certa.
   */
  const loadSales = useCallback(async (offset: number, replace: boolean) => {
    if (!activeCompany?.id) return;
    const requestId = ++latestRequestIdRef.current;
    if (replace) setLoading(true); else setLoadingMore(true);

    try {
      let query = (supabase as any)
        .from("direct_sales")
        .select("id, sale_number, entity_id, client_id, title, status, total, invoice_status, created_at")
        .eq("organization_id", activeCompany.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (requestId !== latestRequestIdRef.current) return;

      const rows = (data || []) as any[];

      // Nomes dos clientes num único round-trip (anew_entities), como em
      // EntitySearchInput.collectFromRows. Um erro aqui não pode esconder a
      // listagem — as linhas ficam sem nome, mas aparecem.
      const entityIds = Array.from(new Set(rows.map((r) => r.entity_id).filter(Boolean))) as string[];
      const nameByEntityId = new Map<string, string>();
      if (entityIds.length > 0) {
        const { data: entities } = await supabase
          .from("anew_entities")
          .select("id, display_name, first_name, last_name")
          .in("id", entityIds);
        (entities || []).forEach((entity: any) => {
          const name =
            entity.display_name ||
            [entity.first_name, entity.last_name].filter(Boolean).join(" ").trim();
          if (name) nameByEntityId.set(entity.id, name);
        });
      }

      const mapped: DirectSaleRow[] = rows.map((row) => ({
        id: row.id,
        sale_number: row.sale_number ?? null,
        entity_id: row.entity_id ?? null,
        client_id: row.client_id ?? null,
        title: row.title ?? null,
        status: row.status,
        total: row.total === null || row.total === undefined ? null : Number(row.total),
        invoice_status: row.invoice_status ?? null,
        created_at: row.created_at,
        client_name: row.entity_id ? nameByEntityId.get(row.entity_id) ?? null : null,
      }));

      if (requestId !== latestRequestIdRef.current) return;
      setSales((prev) => (replace ? mapped : [...prev, ...mapped]));
      // Sem contagem total de propósito (mesmo padrão de Stocks.tsx/
      // ClientOrders.tsx): "há mais?" infere-se de a página ter vindo cheia.
      setHasMore(rows.length === PAGE_SIZE);
    } catch (error: any) {
      if (requestId !== latestRequestIdRef.current) return;
      toast({
        title: t("directSales.toast.loadError"),
        description: error?.message,
        variant: "destructive",
      });
    } finally {
      // Só o pedido mais recente mexe nos spinners: um pedido obsoleto a
      // limpá-los deixava a UI a dizer "pronto" com um pedido novo a caminho.
      if (requestId === latestRequestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
    // `t`/`toast` são estáveis o suficiente; incluí-los só recriava a função.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.id, statusFilter]);

  useEffect(() => {
    if (!activeCompany?.id) {
      // Invalida qualquer pedido em voo antes de limpar, senão uma resposta
      // da empresa anterior repovoava a lista depois de a limpar.
      latestRequestIdRef.current += 1;
      setSales([]);
      setLoading(false);
      return;
    }
    loadSales(0, true);
  }, [activeCompany?.id, loadSales]);

  const filteredSales = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return sales;
    return sales.filter((sale) =>
      [sale.sale_number, sale.client_name, sale.title]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term)),
    );
  }, [sales, searchTerm]);

  const hasActiveFilters = searchTerm.trim().length > 0 || statusFilter !== "all";

  const handleOpenNew = () => {
    setEditingId(null);
    setEditorOpen(true);
  };

  const handleOpenExisting = (id: string) => {
    setEditingId(id);
    setEditorOpen(true);
  };

  const formatDate = (value: string | null) => {
    if (!value) return "—";
    try {
      return format(parseISO(value), "dd/MM/yyyy");
    } catch {
      return "—";
    }
  };

  if (companyLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <OlyviaLoader size={40} />
      </div>
    );
  }

  if (!activeCompany) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold">{t("directSales.title")}</h1>
          <p className="text-muted-foreground">{t("directSales.description")}</p>
        </div>
        <NoOrganizationState inline />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Receipt className="h-7 w-7 text-muted-foreground" />
            <div>
              <h1 className="mb-1 text-3xl font-bold">{t("directSales.title")}</h1>
              <p className="text-muted-foreground">{t("directSales.description")}</p>
            </div>
          </div>
          <PermissionGate permission="direct_sales.create">
            <Button onClick={handleOpenNew}>
              <Plus className="mr-2 h-4 w-4" />
              {t("directSales.new")}
            </Button>
          </PermissionGate>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t("directSales.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label={t("directSales.searchPlaceholder")}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("directSales.table.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("directSales.filters.statusAll")}</SelectItem>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`directSales.status.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
              }}
            >
              {t("directSales.filters.clear")}
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <OlyviaLoader size={36} />
          </div>
        ) : filteredSales.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground" />
              <h2 className="text-lg font-semibold">
                {hasActiveFilters ? t("directSales.emptyFiltered.title") : t("directSales.empty.title")}
              </h2>
              <p className="max-w-md text-sm text-muted-foreground">
                {hasActiveFilters
                  ? t("directSales.emptyFiltered.description")
                  : t("directSales.empty.description")}
              </p>
              {hasActiveFilters ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter("all");
                  }}
                >
                  {t("directSales.filters.clear")}
                </Button>
              ) : (
                <PermissionGate permission="direct_sales.create">
                  <Button onClick={handleOpenNew}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t("directSales.new")}
                  </Button>
                </PermissionGate>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("directSales.table.number")}</TableHead>
                  <TableHead>{t("directSales.table.client")}</TableHead>
                  <TableHead>{t("directSales.table.saleTitle")}</TableHead>
                  <TableHead>{t("directSales.table.status")}</TableHead>
                  <TableHead className="text-right">{t("directSales.table.total")}</TableHead>
                  <TableHead>{t("directSales.table.invoice")}</TableHead>
                  <TableHead>{t("directSales.table.date")}</TableHead>
                  <TableHead className="text-right">{t("directSales.table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map((sale) => (
                  <TableRow
                    key={sale.id}
                    className="cursor-pointer"
                    onClick={() => handleOpenExisting(sale.id)}
                  >
                    <TableCell className="font-medium">{sale.sale_number || "—"}</TableCell>
                    <TableCell>{sale.client_name || "—"}</TableCell>
                    <TableCell className="max-w-[260px] truncate">{sale.title || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("border-transparent", STATUS_BADGE_CLASS[sale.status] || "")}
                      >
                        {t(`directSales.status.${sale.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(sale.total ?? 0)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "border-transparent",
                          INVOICE_BADGE_CLASS[sale.invoice_status || "pendente"] || "",
                        )}
                      >
                        {t(`directSales.invoiceStatus.${sale.invoice_status || "pendente"}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(sale.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenExisting(sale.id);
                        }}
                        aria-label={t("directSales.table.actions")}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {hasMore && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => loadSales(sales.length, false)}
                  disabled={loadingMore}
                >
                  {loadingMore ? t("directSales.loading") : t("common.loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* A rota já exige direct_sales.view. O editor abre em leitura quando a
          venda não está em rascunho ou quando faltam direct_sales.create/edit —
          a decisão é tomada lá dentro, para não duplicar a regra em dois sítios. */}
      <DirectSaleEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        saleId={editingId}
        onSaved={() => loadSales(0, true)}
      />
    </>
  );
};

export default DirectSales;
