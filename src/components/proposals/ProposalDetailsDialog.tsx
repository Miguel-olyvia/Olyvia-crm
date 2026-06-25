import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Calendar,
  User,
  Building2,
  Mail,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Package,
  Receipt,
  Link2,
  ExternalLink,
  Copy,
  Send,
  History,
  Percent,
  Briefcase,
  UserPlus,
  MessageCircle,
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { DocumentsTab } from "@/components/shared/DocumentsTab";
import { formatCurrency } from "@/lib/utils";
import { WhatsAppSendDialog } from "@/components/whatsapp/WhatsAppSendDialog";
import { type WhatsAppContext } from "@/hooks/useWhatsApp";
import { ProposalPortalPreview } from "@/components/proposals/ProposalPortalPreview";
import { resolveLineDetails, type LineResolution } from "@/utils/quoteCostResolver";

interface ProposalItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  sort_order: number;
}

interface QuoteLine {
  id: string;
  descricao_snapshot: string | null;
  qt: number;
  total_sem_iva: number;
  total_com_iva: number;
  iva_percent: number | null;
  ordem: number;
  section_name?: string | null;
  custo_material_unit?: number;
  custo_mao_obra_unit?: number;
  margem_percent?: number;
  int_percent?: number;
  discount_percent?: number;
  cost_price?: number;
  unidade?: string | null;
  item_description?: string | null;
  selected_attributes?: Record<string, any> | null;
  product_id?: string | null;
  service_id?: string | null;
  bundle_id?: string | null;
}

interface QuoteItem {
  id: string;
  quote_number: string | null;
  total: number | null;
  estado: string;
  created_at?: string;
  desconto_global_percent?: number | null;
  quote_lines?: QuoteLine[];
}

interface QuoteSectionGroup {
  id: string;
  quote: QuoteItem;
  sectionName: string | null;
  lines: QuoteLine[];
  subtotal: number;
  vat: number;
  total: number;
}

const splitQuoteIntoDisplayGroups = (quote: QuoteItem): QuoteSectionGroup[] => {
  const sortedLines = [...(quote.quote_lines || [])].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  if (sortedLines.length === 0) {
    const total = quote.total || 0;
    return [{
      id: `${quote.id}-default`,
      quote,
      sectionName: null,
      lines: [],
      subtotal: total,
      vat: 0,
      total,
    }];
  }

  const groupedLines = sortedLines.reduce<Record<string, QuoteLine[]>>((acc, line) => {
    const sectionName = line.section_name?.trim() || "Itens";
    if (!acc[sectionName]) {
      acc[sectionName] = [];
    }
    acc[sectionName].push(line);
    return acc;
  }, {});

  return Object.entries(groupedLines).map(([sectionName, lines], index) => {
    const subtotal = lines.reduce((sum, line) => sum + (line.total_sem_iva || 0), 0);
    const total = lines.reduce((sum, line) => sum + (line.total_com_iva || 0), 0);

    return {
      id: `${quote.id}-${sectionName}-${index}`,
      quote,
      sectionName,
      lines,
      subtotal,
      vat: total - subtotal,
      total,
    };
  });
};

interface Client {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
}

interface ProposalSend {
  id: string;
  recipient_email: string;
  sent_at: string;
  first_opened_at: string | null;
  open_count: number;
}

interface ProposalDetailsDialogProps {  
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: {
    id: string;
    title: string;
    description: string | null;
    value: number;
    probability: number | null;
    status: string;
    stage_id: string | null;
    valid_until: string | null;
    created_at: string;
    notes: string | null;
    deal_id: string | null;
    deals: { id: string; title: string } | null;
    proposal_workflow_stages?: {
      id: string;
      name: string;
      label: string;
      color: string;
    } | null;
  } | null;
  onSendProposal?: () => void;
  onViewHistory?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
}

export function ProposalDetailsDialog({
  open,
  onOpenChange,
  proposal,
  onSendProposal,
  onViewHistory,
  onAccept,
  onReject,
}: ProposalDetailsDialogProps) {
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [lineCostMap, setLineCostMap] = useState<Record<string, LineResolution>>({});
  const [client, setClient] = useState<Client | null>(null);
  const [sends, setSends] = useState<ProposalSend[]>([]);
  const [extendedData, setExtendedData] = useState<any>(null);
  const [pipelineJourney, setPipelineJourney] = useState<Array<{ label: string; date: string; icon: string; color: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [portalPreviewOpen, setPortalPreviewOpen] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    if (open && proposal?.id) {
      loadDetails();
    }
  }, [open, proposal?.id]);

  const loadDetails = async () => {
    if (!proposal?.id) return;
    setLoading(true);

    try {
      // Load all details in parallel
      const [itemsRes, quotesRes, extendedRes, sendsRes] = await Promise.all([
        supabase
          .from("proposal_items")
          .select("*")
          .eq("proposal_id", proposal.id)
          .order("sort_order"),
        supabase
          .from("quotes")
          .select("id, quote_number, total, estado, created_at, desconto_global_percent, quote_lines(id, descricao_snapshot, qt, total_sem_iva, total_com_iva, iva_percent, ordem, section_name, custo_material_unit, custo_mao_obra_unit, margem_percent, int_percent, discount_percent, cost_price, unidade, item_description, selected_attributes, product_id, service_id, bundle_id)")
          .eq("proposal_id", proposal.id),
        supabase
          .from("proposals")
          .select(`
            *,
            proposal_templates(id, name)
          `)
          .eq("id", proposal.id)
          .single(),
        supabase
          .from("proposal_sends")
          .select("id, recipient_email, sent_at, first_opened_at, open_count")
          .eq("proposal_id", proposal.id)
          .order("sent_at", { ascending: false })
          .limit(5),
      ]);

      const loadedItems: ProposalItem[] = itemsRes.data || [];
      
      // Fallback: populate items from quote lines if proposal_items is empty
      setItems(loadedItems);
      let loadedQuotes = (quotesRes.data || []) as QuoteItem[];
      
      // Fallback: find quotes via pipeline_links if none found directly
      if (loadedQuotes.length === 0) {
        const { data: pLink } = await (supabase as any)
          .from("pipeline_links")
          .select("quote_id")
          .eq("proposal_id", proposal.id)
          .eq("status", "active")
          .maybeSingle();
        
        if (pLink?.quote_id) {
          const { data: linkedQuote } = await supabase
            .from("quotes")
            .select("id, quote_number, total, estado, created_at, desconto_global_percent, quote_lines(id, descricao_snapshot, qt, total_sem_iva, total_com_iva, iva_percent, ordem, section_name, custo_material_unit, custo_mao_obra_unit, margem_percent, int_percent, discount_percent, cost_price, unidade, item_description, selected_attributes, product_id, service_id, bundle_id)")
            .eq("id", pLink.quote_id)
            .single();
          if (linkedQuote) {
            loadedQuotes = [linkedQuote as unknown as QuoteItem];
          }
        }
      }
      setQuotes(loadedQuotes);

      // Resolve unit costs in real-time (handles bundles, products, services).
      try {
        const allLines = loadedQuotes.flatMap((q: any) => q.quote_lines || []);
        if (allLines.length > 0) {
          const map = await resolveLineDetails(allLines as any);
          setLineCostMap(map);
        } else {
          setLineCostMap({});
        }
      } catch (e) {
        console.error("[ProposalDetailsDialog] resolveLineDetails failed", e);
        setLineCostMap({});
      }
      setExtendedData(extendedRes.data);
      
      // Resolve client/entity info via entity_id
      const entityId = (extendedRes.data as any)?.entity_id;
      if (entityId) {
        const [entityRes, emailRes, phoneRes] = await Promise.all([
          supabase.from("anew_entities").select("id, display_name, first_name, last_name, type").eq("id", entityId).single(),
          supabase.from("anew_entity_emails").select("email").eq("entity_id", entityId).eq("is_primary", true).maybeSingle(),
          (supabase as any).from("anew_entity_phones").select("phone_number, country_code").eq("entity_id", entityId).eq("is_primary", true).maybeSingle(),
        ]);
        if (entityRes.data) {
          setClient({
            id: entityRes.data.id,
            first_name: entityRes.data.first_name,
            last_name: entityRes.data.last_name,
            company_name: entityRes.data.type === 'organization' ? entityRes.data.display_name : null,
            email: emailRes.data?.email || null,
            phone: phoneRes?.data?.phone_number || null,
          });
        } else {
          setClient(null);
        }
      } else {
        setClient(null);
      }
      
      setSends(sendsRes.data || []);

      // Load pipeline journey
      const journey: Array<{ label: string; date: string; icon: string; color: string }> = [];
      
      // Proposal creation
      if (extendedRes.data) {
        journey.push({
          label: "Proposta criada",
          date: extendedRes.data.created_at,
          icon: "file",
          color: "text-primary",
        });
      }

      // Load pipeline link to find related entities
      const { data: pipelineLink } = await (supabase as any)
        .from("pipeline_links")
        .select("*, deals(id, title, created_at, entity_id), anew_leads(id, created_at, field_values), quotes(id, quote_number, created_at, estado)")
        .eq("proposal_id", proposal.id)
        .eq("status", "active")
        .maybeSingle();

      if (pipelineLink) {
        // Lead entry
        if (pipelineLink.anew_leads) {
          const fv = (pipelineLink.anew_leads.field_values || {}) as Record<string, string>;
          const leadName = fv.nome || fv.first_name || "Lead";
          journey.unshift({
            label: `Lead captado: ${leadName}`,
            date: pipelineLink.anew_leads.created_at,
            icon: "lead",
            color: "text-blue-500",
          });
        }

        // Deal creation
        if (pipelineLink.deals) {
          journey.splice(journey.length > 1 ? 1 : 0, 0, {
            label: `Pedido criado: ${pipelineLink.deals.title}`,
            date: pipelineLink.deals.created_at,
            icon: "deal",
            color: "text-purple-500",
          });
        }

        // Quote
        if (pipelineLink.quotes) {
          const qDate = pipelineLink.quotes.created_at;
          const insertIdx = journey.findIndex(j => j.icon === "file");
          journey.splice(insertIdx >= 0 ? insertIdx : journey.length, 0, {
            label: `Orçamento ${pipelineLink.quotes.quote_number || ""} — ${pipelineLink.quotes.estado}`,
            date: qDate,
            icon: "quote",
            color: "text-amber-500",
          });
        }
      }

      // Sent
      if (extendedRes.data?.sent_at) {
        journey.push({ label: "Proposta enviada", date: extendedRes.data.sent_at, icon: "send", color: "text-blue-600" });
      }
      // Viewed
      if (extendedRes.data?.viewed_at) {
        journey.push({ label: "Proposta visualizada", date: extendedRes.data.viewed_at, icon: "eye", color: "text-purple-600" });
      }
      // Accepted
      if (extendedRes.data?.accepted_at) {
        journey.push({ label: "Proposta aceite", date: extendedRes.data.accepted_at, icon: "check", color: "text-green-600" });
      }
      // Rejected
      if (extendedRes.data?.rejected_at) {
        journey.push({ label: "Proposta rejeitada", date: extendedRes.data.rejected_at, icon: "x", color: "text-red-600" });
      }

      // Sort by date
      journey.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setPipelineJourney(journey);
    } catch (error) {
      console.error("Error loading proposal details:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyPublicLink = () => {
    if (extendedData?.public_token) {
      const link = `${window.location.origin}/proposal/${extendedData.public_token}`;
      navigator.clipboard.writeText(link);
      toast({
        title: "Link copiado",
        description: "O link público foi copiado para a área de transferência.",
      });
    }
  };

  const openPublicLink = () => {
    if (extendedData?.public_token) {
      const link = `${window.location.origin}/proposal/${extendedData.public_token}`;
      window.open(link, "_blank");
    }
  };

  const getStageBadge = () => {
    const stage = proposal?.proposal_workflow_stages;
    if (stage) {
      return (
        <Badge
          style={{ backgroundColor: stage.color, color: "#fff" }}
          className="font-medium"
        >
          {stage.label}
        </Badge>
      );
    }
    return <Badge variant="secondary">{proposal?.status}</Badge>;
  };

  const calculateItemsTotal = () => {
    return items.reduce((sum, item) => {
      const subtotal = item.quantity * item.unit_price;
      const vat = subtotal * (item.vat_rate / 100);
      return sum + subtotal + vat;
    }, 0);
  };

  const calculateQuotesTotal = () => {
    return quotes.reduce((sum, q) => sum + (q.total || 0), 0);
  };

  const quoteDisplayGroups = quotes.flatMap(splitQuoteIntoDisplayGroups);
  const quoteSectionsByQuoteId = quoteDisplayGroups.reduce<Record<string, number>>((acc, group) => {
    acc[group.quote.id] = (acc[group.quote.id] || 0) + 1;
    return acc;
  }, {});

  if (!proposal) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <FileText className="w-5 h-5 text-primary" />
              {proposal.title}
            </DialogTitle>
            <Button variant="outline" size="sm" className="gap-1 mr-6" onClick={() => setPortalPreviewOpen(true)}>
              <Eye className="h-4 w-4" /> Preview Portal
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6 overflow-auto" style={{ maxHeight: 'calc(90vh - 120px)' }}>
          <div className="space-y-6 pb-4">
            {/* Header Info */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {getStageBadge()}
                {proposal.probability !== null && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Percent className="w-3 h-3" />
                    {proposal.probability}%
                  </Badge>
                )}
              </div>
              <span className="text-3xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(proposal.value)}
              </span>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2">
              {extendedData?.public_token && extendedData?.public_link_enabled && (
                <>
                  <Button variant="outline" size="sm" onClick={copyPublicLink}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copiar Link
                  </Button>
                  <Button variant="outline" size="sm" onClick={openPublicLink}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Ver Proposta
                  </Button>
                </>
              )}
              {onSendProposal && (
                <Button variant="outline" size="sm" onClick={onSendProposal}>
                  <Send className="w-4 h-4 mr-2" />
                  Enviar
                </Button>
              )}
              {onViewHistory && (
                <Button variant="outline" size="sm" onClick={onViewHistory}>
                  <History className="w-4 h-4 mr-2" />
                  Histórico
                </Button>
              )}
              {client?.phone && (
                <Button variant="outline" size="sm" onClick={() => setShowWhatsAppDialog(true)} className="gap-2 text-green-600 hover:text-green-700">
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </Button>
              )}
            </div>

            {/* Accept / Reject Actions */}
            {proposal.status !== "accepted" && proposal.status !== "rejected" && (onAccept || onReject) && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-muted/50 to-muted/30 border">
                <div className="flex-1">
                  <p className="text-sm font-medium">Decisão sobre a proposta</p>
                  <p className="text-xs text-muted-foreground">Aceitar ou recusar esta proposta comercial</p>
                </div>
                <div className="flex items-center gap-2">
                  {onReject && (
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all duration-200 font-semibold px-6 rounded-full"
                      onClick={onReject}
                    >
                      <XCircle className="w-5 h-5 mr-2" />
                      Recusar
                    </Button>
                  )}
                  {onAccept && (
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg shadow-green-500/25 hover:shadow-green-500/40 transition-all duration-200 font-semibold px-6 rounded-full"
                      onClick={onAccept}
                    >
                      <CheckCircle2 className="w-5 h-5 mr-2" />
                      Aceitar Proposta
                    </Button>
                  )}
                </div>
              </div>
            )}

            <Separator />

            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="info">Informações</TabsTrigger>
                <TabsTrigger value="items">
                  Itens {items.length > 0 && `(${items.length})`}
                </TabsTrigger>
                <TabsTrigger value="documentos">Documentos</TabsTrigger>
                <TabsTrigger value="tracking">Rastreamento</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="mt-4 space-y-4">
                {/* Client Info */}
                {client && (
                  <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                      <User className="w-4 h-4" />
                      Cliente
                    </div>
                    <p className="font-semibold">{client.company_name || [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Cliente'}</p>
                    {client.email && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Mail className="w-3 h-3" />
                        {client.email}
                      </p>
                    )}
                  </div>
                )}

                {/* Deal Info */}
                {proposal.deals && (
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                      <Building2 className="w-4 h-4" />
                      Pedido de Proposta
                    </div>
                    <p className="font-semibold">{proposal.deals.title}</p>
                  </div>
                )}

                {/* Description & Notes */}
                {proposal.description && (
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">Descrição</Label>
                    <p className="text-sm bg-muted/30 p-3 rounded-lg">
                      {proposal.description}
                    </p>
                  </div>
                )}

                {proposal.notes && (
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">Notas</Label>
                    <p className="text-sm bg-muted/30 p-3 rounded-lg">
                      {proposal.notes}
                    </p>
                  </div>
                )}

                {/* Template */}
                {extendedData?.proposal_templates && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Template:</span>
                    <span className="font-medium">{extendedData.proposal_templates.name}</span>
                  </div>
                )}

                {/* Associated Quotes */}
                {quoteDisplayGroups.length > 0 && (
                  <div className="space-y-3 border-2 border-primary/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Receipt className="w-4 h-4 text-primary" />
                      Orçamentos Associados
                      <Badge variant="secondary" className="text-xs">{quoteDisplayGroups.length}</Badge>
                    </div>
                    <div className="space-y-4">
                      {quoteDisplayGroups.map((group) => {
                        const quote = group.quote;
                        const hasMultipleSections = (quoteSectionsByQuoteId[quote.id] || 0) > 1;

                        return (
                        <div key={group.id} className="space-y-3">
                          {/* Quote Header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <Receipt className="w-4 h-4 text-primary" />
                              </div>
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-sm">{quote.quote_number || "Sem número"}</p>
                                  {hasMultipleSections && group.sectionName && (
                                    <Badge variant="secondary" className="text-[10px]">
                                      {group.sectionName}
                                    </Badge>
                                  )}
                                </div>
                                {quote.created_at && (
                                  <p className="text-xs text-muted-foreground">
                                    {format(new Date(quote.created_at), "dd MMM yyyy", { locale: pt })}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs capitalize">
                                {quote.estado}
                              </Badge>
                              <span className="font-bold text-green-600 dark:text-green-400">
                                {formatCurrency(!hasMultipleSections ? (quote.total ?? group.total) : group.total)}
                              </span>
                            </div>
                          </div>

                          {/* Quote Lines Table */}
                          {group.lines.length > 0 && (
                            <div className="border rounded-md overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-muted/50 text-muted-foreground uppercase tracking-wider">
                                    <th className="text-left p-2 font-medium">Descrição</th>
                                    <th className="text-center p-2 font-medium w-14">QTD</th>
                                    <th className="text-right p-2 font-medium w-20">Preço Unit.</th>
                                    <th className="text-center p-2 font-medium w-12">IVA</th>
                                    <th className="text-center p-2 font-medium w-12">Desc.</th>
                                    <th className="text-center p-2 font-medium w-16">Margem</th>
                                    <th className="text-right p-2 font-medium w-24">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.lines.map((line) => {
                                    const unitPriceVal = line.qt > 0 ? line.total_sem_iva / line.qt : 0;
                                    const resolvedUnitCost = lineCostMap[line.id]?.unitCost ?? 0;
                                    const fallbackCost = line.cost_price || ((line.custo_material_unit || 0) + (line.custo_mao_obra_unit || 0));
                                    const costVal = resolvedUnitCost > 0 ? resolvedUnitCost : fallbackCost;
                                    const margin = costVal > 0 && unitPriceVal > 0
                                      ? ((unitPriceVal - costVal) / unitPriceVal) * 100
                                      : 0;
                                    const hasCostVal = costVal > 0;
                                    const attrs = line.selected_attributes as Record<string, any> | null;
                                    const attrEntries = attrs ? Object.entries(attrs).filter(([_, v]) => v && v !== '') : [];

                                    return (
                                      <tr key={line.id} className="border-t border-muted/30 align-top">
                                        <td className="p-2">
                                          <span className="font-medium">{line.descricao_snapshot || "-"}</span>
                                          {attrEntries.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                              {attrEntries.map(([key, val]) => (
                                                <span key={key} className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                                                  {key}: {typeof val === 'object' ? (val.label || val.value || JSON.stringify(val)) : String(val)}
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                        </td>
                                        <td className="p-2 text-center">{line.qt}{line.unidade ? ` ${line.unidade}` : ''}</td>
                                        <td className="p-2 text-right">{formatCurrency(unitPriceVal)}</td>
                                        <td className="p-2 text-center text-muted-foreground">{line.iva_percent || 0}%</td>
                                        <td className="p-2 text-center">
                                          {(line.discount_percent || 0) > 0 ? (
                                            <span className="text-orange-600 dark:text-orange-400 font-medium">{line.discount_percent}%</span>
                                          ) : (quote.desconto_global_percent ?? 0) > 0 ? (
                                            <span className="text-orange-500 dark:text-orange-400 font-medium">{quote.desconto_global_percent}%</span>
                                          ) : (
                                            <span className="text-muted-foreground">—</span>
                                          )}
                                        </td>
                                        <td className="p-2 text-center">
                                          {hasCostVal ? (
                                            <span className={`font-medium ${margin >= 30 ? 'text-green-600 dark:text-green-400' : margin >= 15 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                                              {margin.toFixed(1)}%
                                            </span>
                                          ) : (
                                            <span className="text-muted-foreground">—</span>
                                          )}
                                        </td>
                                        <td className="p-2 text-right">
                                          <p className="font-semibold">{formatCurrency(line.total_com_iva)}</p>
                                          <p className="text-[10px] text-muted-foreground">{formatCurrency(line.total_sem_iva)} s/IVA</p>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                              {/* Quote subtotals */}
                              <div className="border-t bg-muted/30 p-2 text-xs space-y-1">
                                <div className="flex justify-end gap-6">
                                  <span className="text-muted-foreground">Subtotal</span>
                                  <span>{formatCurrency(group.subtotal)}</span>
                                </div>
                                {!hasMultipleSections && (quote.desconto_global_percent ?? 0) > 0 && (
                                  <div className="flex justify-end gap-6 text-orange-600 dark:text-orange-400">
                                    <span>Desconto global ({quote.desconto_global_percent}%)</span>
                                    <span>-{formatCurrency(group.subtotal * (quote.desconto_global_percent ?? 0) / 100)}</span>
                                  </div>
                                )}
                                <div className="flex justify-end gap-6">
                                  <span className="text-muted-foreground">IVA</span>
                                  <span>{formatCurrency(
                                    (!hasMultipleSections && (quote.desconto_global_percent ?? 0) > 0)
                                      ? (quote.total ?? 0) - group.subtotal * (1 - (quote.desconto_global_percent ?? 0) / 100)
                                      : group.vat
                                  )}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )})}
                    </div>
                  </div>
                )}

                {/* Dates Grid */}
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Válido Até
                    </Label>
                    <p className="font-medium">
                      {proposal.valid_until
                        ? format(new Date(proposal.valid_until), "dd/MM/yyyy", { locale: pt })
                        : "-"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Criado em
                    </Label>
                    <p className="font-medium">
                      {format(new Date(proposal.created_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                    </p>
                  </div>
                  {extendedData?.request_date && (
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-xs">Data Pedido</Label>
                      <p className="font-medium">
                        {format(new Date(extendedData.request_date), "dd/MM/yyyy HH:mm", { locale: pt })}
                      </p>
                    </div>
                  )}
                  {extendedData?.delivered_at && (
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-xs">Entregue em</Label>
                      <p className="font-medium">
                        {format(new Date(extendedData.delivered_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="items" className="mt-4 space-y-4">
                {/* Show proposal items */}
                {items.length > 0 && (
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-lg bg-muted/30 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="font-medium">{item.description}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {item.quantity}x @ {formatCurrency(item.unit_price)} • IVA {item.vat_rate}%
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">
                              {formatCurrency(item.quantity * item.unit_price * (1 + item.vat_rate / 100))}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex justify-between items-center pt-2">
                      <span className="font-medium">Total Itens</span>
                      <span className="text-lg font-bold text-green-600 dark:text-green-400">
                        {formatCurrency(calculateItemsTotal())}
                      </span>
                    </div>
                  </div>
                )}

                {/* Show quote lines if no proposal items */}
                {items.length === 0 && quotes.some(q => q.quote_lines && q.quote_lines.length > 0) && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Itens do orçamento associado:</p>
                    {quotes.map(quote => (
                      quote.quote_lines && quote.quote_lines.length > 0 && (
                        <div key={quote.id} className="space-y-2">
                          {/* Table header */}
                          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b">
                            <div className="col-span-4">Descrição</div>
                            <div className="col-span-1 text-center">Qtd</div>
                            <div className="col-span-2 text-right">Preço Unit.</div>
                            <div className="col-span-1 text-center">IVA</div>
                            <div className="col-span-1 text-center">Desc.</div>
                            <div className="col-span-1 text-center">Margem</div>
                            <div className="col-span-2 text-right">Total</div>
                          </div>
                          {[...quote.quote_lines]
                            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
                            .map((line) => {
                              // Preço de venda unitário s/ IVA
                              const unitPrice = line.qt > 0 ? line.total_sem_iva / line.qt : 0;
                              
                              // Custo unitário — resolver em tempo real (bundles/products/services); snapshot só como fallback.
                              const resolvedCost = lineCostMap[line.id]?.unitCost ?? 0;
                              const fallbackCost = line.cost_price || ((line.custo_material_unit || 0) + (line.custo_mao_obra_unit || 0));
                              const custoUnit = resolvedCost > 0 ? resolvedCost : fallbackCost;
                              
                              // Margem = (preço venda s/IVA - custo) / preço venda s/IVA * 100
                              const profitMargin = custoUnit > 0 && unitPrice > 0
                                ? ((unitPrice - custoUnit) / unitPrice) * 100
                                : 0;
                              const hasCost = custoUnit > 0;

                              // Parse selected attributes
                              const attrs = line.selected_attributes as Record<string, any> | null;
                              const attrEntries = attrs ? Object.entries(attrs).filter(([_, v]) => v && v !== '') : [];
                              
                              return (
                                <div key={line.id} className="space-y-0">
                                  <div className="grid grid-cols-12 gap-2 px-3 py-2.5 rounded-t-lg bg-muted/30 items-center text-sm">
                                    <div className="col-span-4">
                                      <p className="font-medium text-sm leading-tight">{line.descricao_snapshot || "-"}</p>
                                      {line.item_description && (
                                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{line.item_description}</p>
                                      )}
                                    </div>
                                    <div className="col-span-1 text-center text-muted-foreground">
                                      {line.qt}{line.unidade ? ` ${line.unidade}` : 'x'}
                                    </div>
                                    <div className="col-span-2 text-right text-muted-foreground">
                                      {formatCurrency(unitPrice)}
                                    </div>
                                    <div className="col-span-1 text-center text-muted-foreground">
                                      {line.iva_percent || 0}%
                                    </div>
                                    <div className="col-span-1 text-center">
                                      {(line.discount_percent || 0) > 0 ? (
                                        <span className="text-orange-600 dark:text-orange-400 font-medium">{line.discount_percent}%</span>
                                      ) : (
                                        <span className="text-muted-foreground">—</span>
                                      )}
                                    </div>
                                    <div className="col-span-1 text-center">
                                      {hasCost ? (
                                        <span className={`font-medium ${profitMargin >= 30 ? 'text-green-600 dark:text-green-400' : profitMargin >= 15 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                                          {profitMargin.toFixed(1)}%
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">—</span>
                                      )}
                                    </div>
                                    <div className="col-span-2 text-right">
                                      <p className="font-semibold">{formatCurrency(line.total_com_iva)}</p>
                                      <p className="text-[10px] text-muted-foreground">{formatCurrency(line.total_sem_iva)} s/ IVA</p>
                                    </div>
                                  </div>
                                  {attrEntries.length > 0 && (
                                    <div className="px-3 py-1.5 bg-muted/15 rounded-b-lg border-t border-border/30 flex flex-wrap gap-x-3 gap-y-1">
                                      {attrEntries.map(([key, val]) => (
                                        <span key={key} className="text-[11px] text-muted-foreground">
                                          <span className="font-medium">{key}:</span> {typeof val === 'object' ? (val.label || val.value || JSON.stringify(val)) : String(val)}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          <Separator />
                          <div className="flex justify-between items-center pt-2">
                            <span className="font-medium">Total</span>
                            <span className="text-lg font-bold text-green-600 dark:text-green-400">
                              {formatCurrency(quote.total || 0)}
                            </span>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}

                {items.length === 0 && !quotes.some(q => q.quote_lines && q.quote_lines.length > 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>Sem itens adicionados</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="tracking" className="mt-4 space-y-4">
                {/* Pipeline Journey Timeline */}
                {pipelineJourney.length > 0 && (
                  <div className="space-y-3">
                    <Label className="text-muted-foreground text-sm">Jornada do Pipeline</Label>
                    <div className="relative space-y-0">
                      {pipelineJourney.map((step, idx) => {
                        const IconComp = step.icon === "lead" ? UserPlus
                          : step.icon === "deal" ? Briefcase
                          : step.icon === "quote" ? Receipt
                          : step.icon === "file" ? FileText
                          : step.icon === "send" ? Send
                          : step.icon === "eye" ? Eye
                          : step.icon === "check" ? CheckCircle2
                          : step.icon === "x" ? XCircle
                          : Clock;
                        
                        return (
                          <div key={idx} className="flex items-start gap-3 relative">
                            {/* Vertical line */}
                            {idx < pipelineJourney.length - 1 && (
                              <div className="absolute left-[11px] top-7 w-0.5 h-[calc(100%)] bg-border" />
                            )}
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 bg-background border-2 border-current ${step.color}`}>
                              <IconComp className="w-3 h-3" />
                            </div>
                            <div className="pb-4 min-w-0">
                              <p className="text-sm font-medium leading-tight">{step.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {format(new Date(step.date), "dd/MM/yyyy HH:mm", { locale: pt })}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Recent Sends */}
                {sends.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-sm">Últimos Envios</Label>
                    <div className="space-y-2">
                      {sends.map((send) => (
                        <div
                          key={send.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                            <span>{send.recipient_email}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{format(new Date(send.sent_at), "dd/MM HH:mm")}</span>
                            {send.first_opened_at && (
                              <Badge variant="outline" className="text-xs bg-green-500/10">
                                <Eye className="w-3 h-3 mr-1" />
                                {send.open_count}x
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pipelineJourney.length === 0 && sends.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>Sem histórico disponível</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="documentos" className="mt-4">
                {extendedData?.organization_id ? (
                  <DocumentsTab
                    entityType="proposal"
                    entityId={proposal.id}
                    organizationId={extendedData.organization_id}
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">A carregar…</div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>

    {/* WhatsApp Dialog */}
    <WhatsAppSendDialog
      open={showWhatsAppDialog}
      onOpenChange={setShowWhatsAppDialog}
      context={client?.phone ? {
        module: "proposals",
        recipientName: [client.first_name, client.last_name].filter(Boolean).join(" ") || client.company_name || "Cliente",
        recipientPhone: client.phone,
        proposalTitle: proposal?.title,
        proposalValue: proposal?.value,
        proposalLink: extendedData?.public_token && extendedData?.public_link_enabled 
          ? `${window.location.origin}/proposal/${extendedData.public_token}` 
          : undefined,
        dealId: proposal?.deal_id || undefined,
      } : null}
    />
    <ProposalPortalPreview open={portalPreviewOpen} onOpenChange={setPortalPreviewOpen} proposalId={proposal.id} />
    </>
  );
}
