import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { endOfDay, format, parseISO, startOfDay, subDays } from "date-fns";
import { pt } from "date-fns/locale";
import { CalendarIcon, CheckCircle2, FileDown, MoreHorizontal, Pencil, Plus, Receipt, Search, TrendingUp, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { PermissionGate } from "@/components/PermissionGate";
import { DirectSaleEditor } from "@/components/directSales/DirectSaleEditor";
import { InvoiceRegistrationDialog } from "@/components/directSales/InvoiceRegistrationDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { downloadBlob, generateProformaPdfBlob } from "@/utils/generateProformaPdfBlob";
import { generateInternalSalePdfBlob } from "@/utils/generateInternalSalePdfBlob";
import { generateDirectSalePdfBlob } from "@/utils/generateDirectSalePdfBlob";
import { resolveEntityCommercials } from "@/utils/entityCommercial";
import { usePermissions } from "@/hooks/usePermissions";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import { useComercialUsers } from "@/hooks/useComercialUsers";
import { applySearchTextFilter, splitSearchWords } from "@/lib/searchTextFilter";
import { cn, formatCurrency } from "@/lib/utils";

// Venda Direta — Fase 2: listagem. Fluxo alternativo, mais leve, ao caminho
// Orçamento -> Proposta -> Contrato (migration 20261130230000).
//
// A venda direta NÃO passa pelo portal do cliente: é confirmada no CRM
// ("Confirmar venda" -> rpc_confirm_direct_sale), que a passa a 'aceite',
// emite a proforma e cria a Encomenda de Cliente.
//
// `(supabase as any)`: direct_sales ainda não existe em
// src/integrations/supabase/types.ts (tipos gerados não regenerados após a
// migration; regenerá-los está fora do âmbito). Mesmo padrão já usado em
// ServiceMaterialsEditor.tsx e Services.tsx.

const PAGE_SIZE = 50;

/** Mesmo limiar de Quotes.tsx (MIN_QUOTE_SEARCH_LENGTH): com 1 caracter ninguém filtra. */
const MIN_SEARCH_LENGTH = 2;

/** "Sem resposta": enviada há mais de N dias — o mesmo +5d do atalho das Propostas. */
const NO_RESPONSE_DAYS = 5;

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
   * Comercial responsável pela venda, fotografado na criação a partir do
   * comercial da lead/cliente. NÃO muda quando a entidade é reatribuída — a
   * venda é de quem a fez. Resolvido para nome depois da query principal.
   */
  assigned_to: string | null;
  assigned_to_name: string | null;
  /** Comercial que tem a lead/cliente AGORA. Só se mostra quando difere. */
  current_commercial_name: string | null;
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

// Opções do filtro. 'enviada' e 'rejeitada' saíram: a venda direta deixou de
// passar pelo portal do cliente, logo ninguém chega a esses estados. As vendas
// antigas que lá estejam continuam a mostrar o badge (STATUS_BADGE_CLASS e as
// traduções mantêm-nos).
const STATUS_OPTIONS: DirectSaleStatus[] = ["rascunho", "aceite", "cancelada"];

/** Estados a partir dos quais o CRM pode confirmar a venda (rpc_confirm_direct_sale). */
const CONFIRMABLE_STATUSES: ReadonlyArray<string> = ["rascunho", "enviada"];

const DirectSales = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  // Mesma permissão que governa "ver margens e custos" nos orçamentos. A venda
  // direta não tem permissão própria de custos, e criar uma obrigaria a
  // atribuí-la aos papéis antes de alguém poder ver o documento.
  const canViewCosts = hasPermission("quotes.view_costs");
  const { activeCompany, isLoading: companyLoading } = useCompany();

  // Mesma fonte de Propostas/Orçamentos: `anewUserId` do scope é o id de
  // negócio (anew_users.id), que é o que `direct_sales.assigned_to` guarda.
  const { getPermissionScope, anewUserId: scopeAnewUserId, teamMemberIds, loading: scopeLoading } = usePermissionScope();
  const { comercialUsers } = useComercialUsers(activeCompany?.id || null, {
    viewerScope: getPermissionScope("direct_sales.view"),
    viewerAnewUserId: scopeAnewUserId,
    teamMemberIds,
    scopeLoading,
  });

  const [sales, setSales] = useState<DirectSaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Filtros — mesma barra de Propostas/Orçamentos, todos aplicados no servidor.
  const [searchTerm, setSearchTerm] = useState("");
  // A pesquisa vai para a query: sem debounce cada tecla era um pedido.
  // 400ms, como em Propostas/Orçamentos.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [comercialFilter, setComercialFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [noResponseFilter, setNoResponseFilter] = useState(false);
  const [expiredFilter, setExpiredFilter] = useState(false);
  const [invoicePendingFilter, setInvoicePendingFilter] = useState(false);

  /**
   * Predicado dos filtros, num objeto só para `loadSales` depender de um valor
   * e não de dez. Mudar qualquer filtro recria `loadSales`, e o efeito que a
   * chama volta a pedir a página 0 com `replace` — é esse o reset da paginação.
   *
   * "Só as minhas" enquanto o scope ainda não resolveu fica sem efeito (como em
   * Propostas); quando o id chega o objeto muda e a lista recarrega.
   */
  const saleFilters = useMemo(() => {
    const rawSearch = debouncedSearch.trim();
    return {
      status: statusFilter !== "all" ? statusFilter : null,
      searchWords: rawSearch.length >= MIN_SEARCH_LENGTH ? splitSearchWords(rawSearch) : [],
      onlyMineUserId: onlyMine && scopeAnewUserId ? scopeAnewUserId : null,
      comercial: comercialFilter !== "all" ? comercialFilter : null,
      dateFromIso: dateFrom ? startOfDay(dateFrom).toISOString() : null,
      dateToIso: dateTo ? endOfDay(dateTo).toISOString() : null,
      noResponse: noResponseFilter,
      expired: expiredFilter,
      invoicePending: invoicePendingFilter,
    };
  }, [
    statusFilter, debouncedSearch, onlyMine, scopeAnewUserId, comercialFilter,
    dateFrom, dateTo, noResponseFilter, expiredFilter, invoicePendingFilter,
  ]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  /** Venda cuja confirmação se está a pedir (AlertDialog aberto); null = fechado. */
  const [confirmSale, setConfirmSale] = useState<DirectSaleRow | null>(null);
  /** A RPC de confirmação está em curso — trava o diálogo contra cliques repetidos. */
  const [confirming, setConfirming] = useState(false);

  /** Venda cuja proforma está a ser gerada — a geração do PDF demora, trava só esse item. */
  const [generatingProformaId, setGeneratingProformaId] = useState<string | null>(null);

  /** Idem, para o PDF da venda direta (mesmo aspecto das propostas). */
  const [generatingSalePdfId, setGeneratingSalePdfId] = useState<string | null>(null);

  /** Idem, para o documento interno de custo e margem (Fase 6A). */
  const [generatingInternalId, setGeneratingInternalId] = useState<string | null>(null);

  /** Venda cuja fatura se está a registar (Fase 6B); null = diálogo fechado. */
  const [invoiceSale, setInvoiceSale] = useState<DirectSaleRow | null>(null);

  /** Id monotónico do pedido de listagem em curso — ver `loadSales`. */
  const latestRequestIdRef = useRef(0);

  /**
   * Carrega uma página de vendas diretas da empresa ativa.
   *
   * Todos os filtros são aplicados no servidor. A pesquisa usa
   * `direct_sales.search_text` (trigger, índice trigram — migration
   * 20261201120000), que já junta número, título, descrição e nome/email/
   * telefone do cliente; por isso deixou de ser preciso filtrar em memória só
   * sobre as linhas já carregadas. Os atalhos (sem resposta, expiradas, fatura
   * pendente) somam-se aos restantes filtros por AND.
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
        .select("id, sale_number, entity_id, client_id, title, status, total, invoice_status, created_at, proforma_number, proforma_issued_at, assigned_to")
        .eq("organization_id", activeCompany.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      const f = saleFilters;
      if (f.status) query = query.eq("status", f.status);
      if (f.searchWords.length > 0) query = applySearchTextFilter(query, f.searchWords);
      if (f.onlyMineUserId) query = query.eq("assigned_to", f.onlyMineUserId);
      if (f.comercial === "none") query = query.is("assigned_to", null);
      else if (f.comercial) query = query.eq("assigned_to", f.comercial);
      if (f.dateFromIso) query = query.gte("created_at", f.dateFromIso);
      if (f.dateToIso) query = query.lte("created_at", f.dateToIso);
      // Os limites temporais calculam-se no momento do pedido e não no memo:
      // uma página aberta de um dia para o outro não fica com o "hoje" antigo.
      if (f.noResponse) {
        query = query
          .eq("status", "enviada")
          .lte("sent_at", subDays(new Date(), NO_RESPONSE_DAYS).toISOString());
      }
      if (f.expired) {
        // valid_until é `date`: compara-se com a data local, não com um ISO UTC.
        query = query
          .eq("status", "enviada")
          .lt("valid_until", format(new Date(), "yyyy-MM-dd"));
      }
      if (f.invoicePending) {
        query = query.eq("status", "aceite").eq("invoice_status", "pendente");
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

      // Comercial: dois valores diferentes, de propósito.
      //  · assigned_to  — quem fez a venda, gravado na criação e imutável.
      //  · comercial actual da lead/cliente — lido ao vivo, só para mostrar ao
      //    lado quando a entidade foi reatribuída entretanto.
      // Nenhum dos dois pode impedir a listagem de aparecer, por isso ambos
      // falham em silêncio.
      const assignedIds = Array.from(new Set(rows.map((r) => r.assigned_to).filter(Boolean))) as string[];
      const assignedNameById = new Map<string, string | null>();
      if (assignedIds.length > 0) {
        const { data: users } = await (supabase as any)
          .from("anew_users")
          .select("id, name")
          .in("id", assignedIds);
        ((users || []) as any[]).forEach((u) => assignedNameById.set(u.id, u.name ?? null));
      }
      const currentByEntity = await resolveEntityCommercials(entityIds, activeCompany.id);

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
        assigned_to: row.assigned_to ?? null,
        assigned_to_name: row.assigned_to ? assignedNameById.get(row.assigned_to) ?? null : null,
        // Só interessa quando é OUTRA pessoa: se for a mesma, mostrar duas
        // vezes o mesmo nome só enchia a tabela.
        current_commercial_name: (() => {
          const current = row.entity_id ? currentByEntity.get(row.entity_id) : undefined;
          if (!current || !current.id) return null;
          return current.id === row.assigned_to ? null : current.name;
        })(),
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
  }, [activeCompany?.id, saleFilters]);

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

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    statusFilter !== "all" ||
    onlyMine ||
    comercialFilter !== "all" ||
    !!dateFrom ||
    !!dateTo ||
    noResponseFilter ||
    expiredFilter ||
    invoicePendingFilter;

  /** Um só sítio para limpar — usado pela barra e pelo estado vazio. */
  const clearFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setOnlyMine(false);
    setComercialFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
    setNoResponseFilter(false);
    setExpiredFilter(false);
    setInvoicePendingFilter(false);
  };

  const handleOpenNew = () => {
    setEditingId(null);
    setEditorOpen(true);
  };

  const handleOpenExisting = (id: string) => {
    setEditingId(id);
    setEditorOpen(true);
  };

  /**
   * Confirmação manual da venda no CRM (substitui o envio/aceitação pelo
   * portal do cliente, que deixou de existir para a venda direta).
   *
   * Toda a regra vive em rpc_confirm_direct_sale: passa a venda a 'aceite',
   * atribui a proforma e cria a Encomenda de Cliente (que reserva stock / pede
   * ao fornecedor). Aqui só se chama e se recarrega a lista.
   *
   * `(supabase as any)`: a RPC ainda não existe em types.ts — mesmo padrão de
   * InvoiceRegistrationDialog.tsx.
   */
  const handleConfirmSale = async () => {
    const sale = confirmSale;
    if (!sale || confirming) return;
    setConfirming(true);
    try {
      const { data, error } = await (supabase as any).rpc("rpc_confirm_direct_sale", {
        p_direct_sale_id: sale.id,
      });
      if (error) throw error;
      const proformaNumber = (data as { proforma_number?: string | null } | null)?.proforma_number ?? null;
      toast({
        title: "Venda confirmada",
        description: proformaNumber
          ? `Proforma ${proformaNumber} emitida e Encomenda de Cliente criada.`
          : "Encomenda de Cliente criada.",
      });
      setConfirmSale(null);
    } catch (error: any) {
      toast({
        title: "Não foi possível confirmar a venda",
        description: error?.message,
        variant: "destructive",
      });
    } finally {
      setConfirming(false);
    }
    // Sempre, mesmo em erro: se a venda foi entretanto confirmada noutro
    // separador, a lista passa a mostrar o estado real.
    await loadSales(0, true);
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
   * PDF da venda direta para o cliente, com o mesmo aspecto das propostas.
   *
   * Em qualquer estado: é o documento da proposta de venda, não a proforma —
   * não depende de aceitação nem de proforma_number. Mesmo padrão de
   * handleDownloadProforma (trava por venda, toast com o motivo).
   */
  const handleDownloadSalePdf = async (sale: DirectSaleRow) => {
    if (generatingSalePdfId) return;
    setGeneratingSalePdfId(sale.id);
    try {
      const { blob, fileName } = await generateDirectSalePdfBlob(sale.id);
      downloadBlob(blob, fileName);
    } catch (error: any) {
      toast({
        title: t("directSales.pdf.error"),
        description: error?.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingSalePdfId(null);
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

        {/* Barra de filtros copiada de Propostas/Orçamentos (não há componente
            partilhado): Pesquisa → Só as minhas → Estado → Comercial → Data →
            atalhos → Limpar. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9"
              placeholder={t("directSales.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label={t("directSales.searchPlaceholder")}
            />
          </div>

          <Button
            variant={onlyMine ? "default" : "outline"}
            size="sm"
            className="h-9 gap-1.5"
            aria-pressed={onlyMine}
            onClick={() => setOnlyMine(!onlyMine)}
          >
            👤 {t("directSales.filters.onlyMine")}
          </Button>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[160px]" aria-label={t("directSales.table.status")}>
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

          <Select value={comercialFilter} onValueChange={setComercialFilter}>
            <SelectTrigger className="h-9 w-[160px]" aria-label={t("directSales.table.commercial")}>
              <SelectValue placeholder={t("directSales.table.commercial")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("directSales.filters.commercialAll")}</SelectItem>
              <SelectItem value="none">{t("directSales.filters.commercialNone")}</SelectItem>
              {comercialUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 font-normal">
                <CalendarIcon className="h-4 w-4" />
                {dateFrom && dateTo
                  ? `${format(dateFrom, "dd/MM/yy")} - ${format(dateTo, "dd/MM/yy")}`
                  : dateFrom
                  ? t("directSales.filters.dateFrom", { date: format(dateFrom, "dd/MM/yy") })
                  : dateTo
                  ? t("directSales.filters.dateTo", { date: format(dateTo, "dd/MM/yy") })
                  : t("directSales.filters.date")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={{ from: dateFrom, to: dateTo }}
                onSelect={(range: any) => {
                  setDateFrom(range?.from);
                  setDateTo(range?.to);
                }}
                numberOfMonths={2}
                locale={pt}
              />
              {(dateFrom || dateTo) && (
                <div className="flex justify-end border-t p-2">
                  <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
                    {t("directSales.filters.clearDates")}
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Button
            variant={noResponseFilter ? "default" : "outline"}
            size="sm"
            className={cn("h-9 gap-1", noResponseFilter && "bg-orange-600 hover:bg-orange-700")}
            aria-pressed={noResponseFilter}
            onClick={() => setNoResponseFilter(!noResponseFilter)}
          >
            ⏰ {t("directSales.filters.noResponse")}
          </Button>

          <Button
            variant={expiredFilter ? "default" : "outline"}
            size="sm"
            className={cn("h-9 gap-1", expiredFilter && "bg-red-600 hover:bg-red-700")}
            aria-pressed={expiredFilter}
            onClick={() => setExpiredFilter(!expiredFilter)}
          >
            ⏳ {t("directSales.filters.expired")}
          </Button>

          {/* Azul-céu, a cor do "Registar fatura" no menu — distinto do
              laranja/vermelho dos atalhos de seguimento. */}
          <Button
            variant={invoicePendingFilter ? "default" : "outline"}
            size="sm"
            className={cn("h-9 gap-1", invoicePendingFilter && "bg-sky-600 hover:bg-sky-700")}
            aria-pressed={invoicePendingFilter}
            onClick={() => setInvoicePendingFilter(!invoicePendingFilter)}
          >
            🧾 {t("directSales.filters.invoicePending")}
          </Button>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
              <X className="mr-1 h-4 w-4" /> {t("directSales.filters.clearShort")}
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <OlyviaLoader size={36} />
          </div>
        ) : sales.length === 0 ? (
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
                <Button variant="outline" onClick={clearFilters}>
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
                  <TableHead>{t("directSales.table.commercial")}</TableHead>
                  <TableHead>{t("directSales.table.saleTitle")}</TableHead>
                  <TableHead>{t("directSales.table.status")}</TableHead>
                  <TableHead className="text-right">{t("directSales.table.total")}</TableHead>
                  <TableHead>{t("directSales.table.invoice")}</TableHead>
                  <TableHead>{t("directSales.table.date")}</TableHead>
                  <TableHead className="text-right">{t("directSales.table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => (
                  <TableRow
                    key={sale.id}
                    className="cursor-pointer"
                    onClick={() => handleOpenExisting(sale.id)}
                  >
                    <TableCell className="font-medium">{sale.sale_number || "—"}</TableCell>
                    <TableCell>{sale.client_name || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{sale.assigned_to_name || "—"}</span>
                        {/* Só aparece quando a lead mudou de mãos depois da
                            venda: a venda continua do primeiro comercial, e
                            isto diz com quem falar hoje. */}
                        {sale.current_commercial_name && (
                          <span className="text-[11px] text-muted-foreground">
                            {t("directSales.table.leadNowWith", { name: sale.current_commercial_name })}
                          </span>
                        )}
                      </div>
                    </TableCell>
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
                          {/* Confirmação manual (substitui o portal). Só a partir
                              de rascunho ou de uma 'enviada' antiga: confirmar
                              uma venda já aceite/rejeitada/cancelada não faz
                              sentido — a RPC volta a validar do lado dela. */}
                          {CONFIRMABLE_STATUSES.includes(sale.status) && (
                            <PermissionGate permission="direct_sales.edit">
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
                                Estado
                              </DropdownMenuLabel>
                              <DropdownMenuItem
                                disabled={confirming}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setConfirmSale(sale);
                                }}
                              >
                                <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-emerald-600" /> Confirmar venda
                              </DropdownMenuItem>
                            </PermissionGate>
                          )}
                          {/* Proforma: documento NÃO fiscal, só existe depois de
                              a venda ser aceite (é aí que o trigger atribui o
                              proforma_number). Sem número não há documento, por
                              isso o item nem aparece.

                              Fora do PermissionGate de direct_sales.edit de
                              propósito: descarregar um documento é leitura, e a
                              rota já exige direct_sales.view.

                              O grupo aparece sempre: o PDF da venda direta
                              existe em qualquer estado. */}
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
                            Documentos
                          </DropdownMenuLabel>
                          <DropdownMenuItem
                            disabled={generatingSalePdfId === sale.id}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDownloadSalePdf(sale);
                            }}
                          >
                            <FileDown className="mr-2 h-3.5 w-3.5 text-blue-600" />
                            {generatingSalePdfId === sale.id
                              ? t("directSales.pdf.generating")
                              : t("directSales.pdf.download")}
                          </DropdownMenuItem>
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

                          {/* Registo da fatura (Fase 6B). Só depois de aceite,
                              porque é essa a regra que a RPC também aplica —
                              faturar uma venda que ainda pode ser rejeitada não
                              faz sentido. Atrás de direct_sales.edit: é escrita. */}
                          {sale.status === "aceite" && (
                            <PermissionGate permission="direct_sales.edit">
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setInvoiceSale(sale);
                                }}
                              >
                                <Receipt className="mr-2 h-3.5 w-3.5 text-sky-600" />
                                {sale.invoice_status === "emitida"
                                  ? "Ver/editar fatura"
                                  : "Registar fatura"}
                              </DropdownMenuItem>
                            </PermissionGate>
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

      <InvoiceRegistrationDialog
        open={invoiceSale !== null}
        onOpenChange={(next) => { if (!next) setInvoiceSale(null); }}
        directSaleId={invoiceSale?.id ?? null}
        saleNumber={invoiceSale?.sale_number ?? null}
        onSaved={() => loadSales(0, true)}
      />

      <AlertDialog
        open={confirmSale !== null}
        onOpenChange={(next) => { if (!next && !confirming) setConfirmSale(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar venda</AlertDialogTitle>
            <AlertDialogDescription>
              Confirmar a venda {confirmSale?.sale_number || ""}? Vai ser criada a Encomenda de
              Cliente e o stock reservado/pedido ao fornecedor. A venda deixa de poder ser editada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirming}
              onClick={(e) => {
                // Sem preventDefault o AlertDialog fecha logo, antes de a RPC
                // responder; fecha-se à mão no sucesso.
                e.preventDefault();
                void handleConfirmSale();
              }}
            >
              {confirming ? "A confirmar…" : "Confirmar venda"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default DirectSales;
