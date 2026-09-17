import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { FileDown, KeyRound, MoreHorizontal, Pencil, Plus, Receipt, Search, Send, SendHorizontal, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { PermissionGate } from "@/components/PermissionGate";
import { DirectSaleEditor } from "@/components/directSales/DirectSaleEditor";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useClientPortalAccess } from "@/hooks/useClientPortalAccess";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { downloadBlob, generateProformaPdfBlob } from "@/utils/generateProformaPdfBlob";
import { generateInternalSalePdfBlob } from "@/utils/generateInternalSalePdfBlob";
import { usePermissions } from "@/hooks/usePermissions";
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
  /**
   * Número da proforma (PF-YYYY-NNNN), preenchido por trigger na aceitação
   * (20261201150000_venda_direta_proforma_numeracao.sql). NULL enquanto a
   * venda não for aceite — é isso que decide se há documento para descarregar.
   */
  proforma_number: string | null;
  proforma_issued_at: string | null;
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
  const { hasPermission } = usePermissions();

  // Mesma permissão que governa "ver margens e custos" nos orçamentos. A venda
  // direta não tem permissão própria de custos, e criar uma obrigaria a
  // atribuí-la aos papéis antes de alguém poder ver o documento.
  const canViewCosts = hasPermission("quotes.view_costs");
  const { activeCompany, isLoading: companyLoading } = useCompany();

  const [sales, setSales] = useState<DirectSaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  /** Venda cujo "Marcar como enviada" está em curso — trava só esse item. */
  const [markingSentId, setMarkingSentId] = useState<string | null>(null);

  /** Venda cuja proforma está a ser gerada — a geração do PDF demora, trava só esse item. */
  const [generatingProformaId, setGeneratingProformaId] = useState<string | null>(null);

  /** Idem, para o documento interno de custo e margem (Fase 6A). */
  const [generatingInternalId, setGeneratingInternalId] = useState<string | null>(null);

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
        .select("id, sale_number, entity_id, client_id, title, status, total, invoice_status, created_at, proforma_number, proforma_issued_at")
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
        proforma_number: row.proforma_number ?? null,
        proforma_issued_at: row.proforma_issued_at ?? null,
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

  /**
   * Escreve `status = 'enviada'` (única escrita deste estado no ficheiro — o
   * item de menu e o envio para o portal passam os dois por aqui).
   *
   * Sem estágios/workflow, ao contrário do molde `handleMarkAsSent` de
   * Proposals.tsx: `direct_sales` não tem `stage_id`, o ciclo de vida vive só
   * na coluna `status`.
   *
   * A guarda de `rascunho` é feita no próprio UPDATE (`.eq("status",
   * "rascunho")`) e não em memória: é o servidor a decidir, logo uma venda
   * entretanto aceite/cancelada noutro separador nunca é puxada para trás. Por
   * isso o retorno distingue "skipped" (nenhuma linha correspondeu — já não
   * estava em rascunho) de "error" (a escrita falhou de facto).
   *
   * Não faz toasts nem recarrega a lista: cada chamador decide o que dizer ao
   * utilizador, porque o significado da falha é diferente nos dois caminhos.
   */
  const markSaleAsSent = useCallback(
    async (saleId: string): Promise<{ outcome: "updated" | "skipped" | "error"; message?: string }> => {
      if (!activeCompany?.id) return { outcome: "error", message: "Nenhuma organização ativa." };
      try {
        // Identidade de negócio (anew_users.id), não o auth uid — é o que os
        // triggers de auditoria esperam em `set_audit_context`.
        const businessUserId = await resolveCurrentBusinessUserId();
        if (!businessUserId) return { outcome: "error", message: "Utilizador não identificado." };
        await supabase.rpc("set_audit_context", { p_user_id: businessUserId, p_source: "ui" });

        // Filtro pela organização ativa além do id, como em `loadSales`: a RLS
        // já protege, mas o scoping explícito impede que um id de outra
        // organização (lista obsoleta, empresa trocada entretanto) seja tocado.
        const { data, error } = await (supabase as any)
          .from("direct_sales")
          .update({ status: "enviada", sent_at: new Date().toISOString() })
          .eq("id", saleId)
          .eq("organization_id", activeCompany.id)
          .eq("status", "rascunho")
          .select("id")
          .maybeSingle();
        if (error) throw error;
        return { outcome: data ? "updated" : "skipped" };
      } catch (error: any) {
        return { outcome: "error", message: error?.message };
      }
    },
    [activeCompany?.id],
  );

  /**
   * Envio ao portal do cliente — mesma edge function usada por Propostas e
   * Encomendas Clientes.
   *
   * Nas propostas quem marca `sent` é a edge function send-proposal-email
   * (index.ts:352), não a publicação no portal. A venda direta não tem função
   * de email própria: o email de credenciais do portal É o ato de envio, logo
   * o equivalente fiel é publicar no portal marcar `enviada` — caso contrário
   * a venda ficava em `rascunho` e o portal não deixava o cliente aceitar.
   *
   * Só promove a partir de `rascunho`: reenviar credenciais ou republicar uma
   * venda já aceite não pode reverter o estado (garantido no UPDATE).
   *
   * Declarado depois de `loadSales`/`markSaleAsSent` porque o callback depende
   * das duas. O id vai num ref preenchido imediatamente antes da chamada
   * porque `onSuccess` do hook não recebe argumentos; um ref (e não estado)
   * evita um render extra e é lido de forma síncrona no callback.
   */
  const portalTargetSaleIdRef = useRef<string | null>(null);

  const { generatePortalAccess, loading: portalAccessLoading } = useClientPortalAccess({
    onSuccess: async () => {
      const saleId = portalTargetSaleIdRef.current;
      portalTargetSaleIdRef.current = null;
      if (saleId) {
        const result = await markSaleAsSent(saleId);
        // O acesso ao portal já foi criado e o email já saiu. Um toast de erro
        // aqui levava o utilizador a pensar que o envio falhou e a repeti-lo —
        // avisamos apenas que o estado não acompanhou, com o item "Marcar como
        // enviada" ainda disponível para corrigir à mão.
        if (result.outcome === "error") {
          toast({
            title: "Enviado, mas o estado não foi atualizado",
            description:
              "O cliente recebeu o acesso ao portal. A venda continua em rascunho — use \"Marcar como enviada\" para corrigir.",
          });
        }
      }
      // Sempre depois da escrita: recarregar antes mostrava o estado antigo.
      await loadSales(0, true);
    },
  });

  /** Envolve a chamada ao portal para o `onSuccess` saber de que venda se trata. */
  const handleSendToPortal = (saleId: string, forceNewPassword?: boolean) => {
    portalTargetSaleIdRef.current = saleId;
    generatePortalAccess("direct_sale", saleId, forceNewPassword);
  };

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

  /**
   * Ação de ESTADO no menu, para quem faça chegar a venda ao cliente por outra
   * via que não o portal. As propostas têm o equivalente (`handleMarkAsSent` em
   * Proposals.tsx), por isso mantém-se mesmo com o portal já a marcar sozinho.
   *
   * Consequência intencional: ao sair de `rascunho` o editor passa a leitura
   * (DirectSaleEditor) — é o mesmo corte que o portal exige para permitir a
   * aceitação, que só está disponível a partir de `enviada`.
   */
  const handleMarkAsSent = async (sale: DirectSaleRow) => {
    if (markingSentId) return;
    setMarkingSentId(sale.id);
    try {
      const result = await markSaleAsSent(sale.id);
      if (result.outcome === "error") {
        toast({ title: "Erro", description: result.message, variant: "destructive" });
      } else if (result.outcome === "skipped") {
        // A lista dizia rascunho, o servidor já não concorda (outro separador,
        // outro utilizador). Recarregar abaixo mostra o estado real.
        toast({
          title: "A venda já não está em rascunho",
          description: "O estado foi entretanto alterado — a listagem foi atualizada.",
        });
      } else {
        toast({ title: "Venda direta marcada como enviada" });
      }
      await loadSales(0, true);
    } finally {
      setMarkingSentId(null);
    }
  };

  /**
   * Descarrega a proforma (documento NÃO fiscal) da venda direta aceite.
   *
   * Só é oferecido quando `proforma_number` existe — o número nasce do trigger
   * na aceitação, e sem número não há documento. O gerador volta a validar isso
   * do lado dele, para o caso de a listagem estar desatualizada.
   *
   * Lê a venda outra vez lá dentro (modo CRM, sem `prefetched`): a listagem só
   * traz o cabeçalho resumido, e o documento precisa das linhas, da empresa
   * emitente e do cliente.
   */
  const handleDownloadProforma = async (sale: DirectSaleRow) => {
    if (generatingProformaId) return;
    setGeneratingProformaId(sale.id);
    try {
      const { blob, fileName } = await generateProformaPdfBlob(sale.id);
      downloadBlob(blob, fileName);
    } catch (error: any) {
      toast({
        title: "Não foi possível gerar a proforma",
        description: error?.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingProformaId(null);
    }
  };

  /**
   * Documento interno de custo e margem (Fase 6A).
   *
   * Sem exigir proforma: ao contrário da proforma, este documento faz sentido
   * antes da aceitação — serve para decidir o preço, não para o comunicar. O
   * acesso é travado pela permissão `quotes.view_costs` no menu; aqui o guarda
   * é só contra cliques repetidos.
   */
  const handleDownloadInternalDoc = async (sale: DirectSaleRow) => {
    if (generatingInternalId) return;
    setGeneratingInternalId(sale.id);
    try {
      const { blob, fileName } = await generateInternalSalePdfBlob(sale.id);
      downloadBlob(blob, fileName);
    } catch (error: any) {
      toast({
        title: "Não foi possível gerar o documento interno",
        description: error?.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingInternalId(null);
    }
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
                      {/* A linha inteira é clicável (abre o editor). Tanto o
                          trigger como cada item têm de travar a propagação,
                          senão o clique chega ao `onClick` da linha e o editor
                          abre por cima da ação escolhida. */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={t("directSales.table.actions")}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleOpenExisting(sale.id);
                            }}
                          >
                            <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                          </DropdownMenuItem>
                          <PermissionGate permission="direct_sales.edit">
                            {/* Só faz sentido em rascunho: marcar como enviada
                                uma venda já aceite/rejeitada/cancelada andaria
                                para trás no ciclo de vida. */}
                            {sale.status === "rascunho" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
                                  Estado
                                </DropdownMenuLabel>
                                <DropdownMenuItem
                                  disabled={markingSentId === sale.id}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleMarkAsSent(sale);
                                  }}
                                >
                                  <SendHorizontal className="mr-2 h-3.5 w-3.5 text-blue-600" /> Marcar como enviada
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
                              Portal
                            </DropdownMenuLabel>
                            <DropdownMenuItem
                              disabled={portalAccessLoading}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleSendToPortal(sale.id);
                              }}
                            >
                              <Send className="mr-2 h-3.5 w-3.5 text-purple-600" /> Enviar para Portal Cliente
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={portalAccessLoading}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleSendToPortal(sale.id, true);
                              }}
                            >
                              <KeyRound className="mr-2 h-3.5 w-3.5" /> Reenviar credenciais
                            </DropdownMenuItem>
                          </PermissionGate>
                          {/* Proforma: documento NÃO fiscal, só existe depois de
                              a venda ser aceite (é aí que o trigger atribui o
                              proforma_number). Sem número não há documento, por
                              isso o item nem aparece.

                              Fora do PermissionGate de direct_sales.edit de
                              propósito: descarregar um documento é leitura, e a
                              rota já exige direct_sales.view. */}
                          {(sale.proforma_number || canViewCosts) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
                                Documentos
                              </DropdownMenuLabel>
                            </>
                          )}
                          {sale.proforma_number && (
                            <>
                              <DropdownMenuItem
                                disabled={generatingProformaId === sale.id}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDownloadProforma(sale);
                                }}
                              >
                                <FileDown className="mr-2 h-3.5 w-3.5 text-emerald-600" />
                                {generatingProformaId === sale.id
                                  ? "A gerar proforma…"
                                  : "Descarregar proforma"}
                              </DropdownMenuItem>
                            </>
                          )}

                          {/* Documento interno de custo e margem (Fase 6A).
                              Atrás de `quotes.view_costs`, a permissão que já
                              governa "ver margens e custos" — quem não a tem
                              nem vê o item.

                              Ao contrário da proforma, não depende de
                              proforma_number: serve para decidir o preço antes
                              de enviar, não só para analisar depois. */}
                          {canViewCosts && (
                            <DropdownMenuItem
                              disabled={generatingInternalId === sale.id}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDownloadInternalDoc(sale);
                              }}
                            >
                              <TrendingUp className="mr-2 h-3.5 w-3.5 text-amber-600" />
                              {generatingInternalId === sale.id
                                ? "A gerar documento…"
                                : "Documento interno (custos)"}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
