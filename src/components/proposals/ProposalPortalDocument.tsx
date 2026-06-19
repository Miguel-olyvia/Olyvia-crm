import { useEffect, useState, useMemo } from "react";
import { format } from "date-fns";
import DOMPurify from "dompurify";
import { pt } from "date-fns/locale";
import { FileText, Mail, MessageCircle, Phone, Download, CheckSquare, Smartphone, ShieldCheck, Loader2, Square, CheckSquare2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  InputOTP, InputOTPGroup, InputOTPSlot,
} from "@/components/ui/input-otp";
import type { ProposalPortalCommercial } from "@/components/proposals/proposalPortalData";
import { formatCurrency } from "@/lib/utils";

interface ProposalPortalDocumentProps {
  proposal: any;
  template: any | null;
  quotes: any[];
  quoteLines: Record<string, any[]>;
  quoteFees?: Record<string, any[]>;
  commercial: ProposalPortalCommercial | null;
  company: any | null;
  mode?: "preview" | "portal";
  statusLabel?: string;
  canActOnProposal?: boolean;
  actionLoading?: boolean;
  // OTP props
  otpStep?: "idle" | "sending" | "input" | "verifying" | "verified";
  otpCode?: string;
  maskedPhone?: string;
  otpError?: string;
  onSendOtp?: () => void;
  onVerifyOtp?: () => void;
  onOtpCodeChange?: (code: string) => void;
  onAcceptQuote?: (quoteId: string) => void;
  onRejectQuote?: (quoteId: string) => void;
  onSignProposal?: () => void;
  onRejectProposal?: () => void;
  onAskQuestion?: () => void;
  onDownloadPdf?: () => void;
  onSelectedQuotesChange?: (selectedIds: string[]) => void;
}

type DocumentSection = {
  id?: string;
  type: string;
  label?: string;
  visible?: boolean;
  settings?: Record<string, any>;
};

const DOCUMENT_SECTION_TYPES = new Set([
  "header",
  "description",
  "terms",
  "notes",
  "validity",
  "company_info",
  "client_info",
  "footer",
  "quote_items",
]);

const hasUsefulText = (value: unknown) => {
  if (typeof value !== "string") return false;
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: [] }).trim().length > 0;
};

const parseDesignSettings = (value: unknown): Record<string, any> => {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
};

export function ProposalPortalDocument({
  proposal,
  template,
  quotes,
  quoteLines,
  quoteFees = {},
  commercial,
  company,
  mode = "preview",
  statusLabel = "A aguardar decisão",
  canActOnProposal = false,
  actionLoading = false,
  otpStep = "idle",
  otpCode = "",
  maskedPhone = "",
  otpError = "",
  onSendOtp,
  onVerifyOtp,
  onOtpCodeChange,
  onAcceptQuote,
  onRejectQuote,
  onSignProposal,
  onRejectProposal,
  onAskQuestion,
  onDownloadPdf,
  onSelectedQuotesChange,
}: ProposalPortalDocumentProps) {
  const isPreview = mode === "preview";
  const primaryColor = template?.primary_color || "#7C3AED";
  const designSettings = parseDesignSettings(template?.design_settings);
  const theme = {
    textColor: designSettings.text_color || template?.text_color || "inherit",
    secondaryTextColor: designSettings.text_secondary_color || "hsl(var(--muted-foreground))",
    contentBlockBg: designSettings.content_block_bg || template?.background_color || "hsl(var(--background))",
    surfaceColor: designSettings.surface_color || "hsl(var(--muted) / 0.5)",
    borderColor: designSettings.border_color || "hsl(var(--border))",
    paddingCard: Number(designSettings.padding_card ?? 20),
    gapSections: Number(designSettings.gap_sections ?? 20),
    borderRadius: Number(designSettings.border_radius ?? 8),
    fontFamily: designSettings.font_family || template?.font_family || "inherit",
    headerBgColor: designSettings.header_bg_color || template?.background_color || "hsl(var(--background))",
    headerTextColor: designSettings.header_text_color || template?.text_color || "inherit",
  };
  const fontFamily = theme.fontFamily;
  const logoUrl = template?.logo_url || company?.logo_url || null;
  const hasMultipleQuotes = quotes.length > 1;

  const documentSections = useMemo<DocumentSection[]>(() => {
    const configured = Array.isArray(template?.sections)
      ? template.sections.filter((section: any) => DOCUMENT_SECTION_TYPES.has(section?.type))
      : [];

    if (configured.length > 0) {
      return configured.filter((section: DocumentSection) => section.visible !== false);
    }

    return [
      { id: "fallback_header", type: "header", label: "Cabeçalho", visible: true, settings: { customTitle: "PROPOSTA", showLogo: true, showDate: true } },
      { id: "fallback_company", type: "company_info", label: "Empresa", visible: template?.show_company_info !== false, settings: { sectionLabel: "Empresa" } },
      { id: "fallback_quote_items", type: "quote_items", label: "Detalhes do Orçamento", visible: template?.show_quote_details !== false, settings: { sectionLabel: "Detalhes do Orçamento" } },
      { id: "fallback_terms", type: "terms", label: "Condições Gerais", visible: template?.show_terms !== false, settings: { sectionLabel: "Condições Gerais" } },
      { id: "fallback_footer", type: "footer", label: "Rodapé", visible: true, settings: {} },
    ].filter((section) => section.visible !== false);
  }, [template]);

  // Build section map for all quotes
  const allSections = useMemo(() => {
    const result: { key: string; quoteId: string; sectionName: string; items: any[] }[] = [];
    quotes.forEach(quote => {
      const lines = quoteLines[quote.id] || [];
      const sections: Record<string, any[]> = {};
      lines.forEach(line => {
        const sectionName = line.section_name || "Itens";
        if (!sections[sectionName]) sections[sectionName] = [];
        sections[sectionName].push(line);
      });
      Object.entries(sections).forEach(([name, items]) => {
        result.push({ key: `${quote.id}::${name}`, quoteId: quote.id, sectionName: name, items });
      });
    });
    return result;
  }, [quotes, quoteLines]);

  // Determine if we need selection UI (multiple quotes OR multiple sections in a single quote)
  const hasMultipleSectionsInSingleQuote = !hasMultipleQuotes && allSections.length > 1;
  const needsSelection = hasMultipleQuotes || hasMultipleSectionsInSingleQuote;

  // Quote selection state (for multi-quote)
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<Set<string>>(
    () => new Set(quotes.map(q => q.id))
  );

  // Section selection state (for multi-section within single quote)
  const [selectedSectionKeys, setSelectedSectionKeys] = useState<Set<string>>(
    () => new Set(allSections.map(s => s.key))
  );

  // H6 — reset selection when quotes/sections change (parent reload after accept/reject)
  useEffect(() => {
    setSelectedQuoteIds(new Set(quotes.map(q => q.id)));
    setSelectedSectionKeys(new Set(allSections.map(s => s.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, allSections]);

  useEffect(() => {
    if (hasMultipleQuotes) {
      onSelectedQuotesChange?.(Array.from(selectedQuoteIds));
    } else if (hasMultipleSectionsInSingleQuote) {
      onSelectedQuotesChange?.(selectedSectionKeys.size > 0 && quotes[0]?.id ? [quotes[0].id] : []);
    } else if (quotes[0]?.id) {
      onSelectedQuotesChange?.([quotes[0].id]);
    } else {
      onSelectedQuotesChange?.([]);
    }
  }, [hasMultipleQuotes, hasMultipleSectionsInSingleQuote, onSelectedQuotesChange, quotes, selectedQuoteIds, selectedSectionKeys]);

  const toggleQuoteSelection = (quoteId: string) => {
    setSelectedQuoteIds(prev => {
      const next = new Set(prev);
      if (next.has(quoteId)) next.delete(quoteId);
      else next.add(quoteId);
      return next;
    });
  };

  const toggleSectionSelection = (sectionKey: string) => {
    setSelectedSectionKeys(prev => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  };

  const hasSelectedQuotes = hasMultipleQuotes ? selectedQuoteIds.size > 0 : selectedSectionKeys.size > 0;

  // Calculate selected total
  const selectedTotal = useMemo(() => {
    if (hasMultipleQuotes) {
      return quotes
        .filter(q => selectedQuoteIds.has(q.id))
        .reduce((sum, q) => sum + (q.total || 0), 0);
    }
    if (hasMultipleSectionsInSingleQuote) {
      return allSections
        .filter(s => selectedSectionKeys.has(s.key))
        .reduce((sum, s) => {
          return sum + s.items.reduce((itemSum, item) => itemSum + (item.total_com_iva || 0), 0);
        }, 0);
    }
    return proposal.value;
  }, [quotes, selectedQuoteIds, hasMultipleQuotes, hasMultipleSectionsInSingleQuote, allSections, selectedSectionKeys, proposal.value]);

  // M2: formatCurrency now imported from @/lib/utils


  const isAccepted = proposal.status === "accepted";
  const isRejected = proposal.status === "rejected";
  const validUntilFormatted = proposal.valid_until
    ? format(new Date(proposal.valid_until), "d 'de' MMMM 'de' yyyy", { locale: pt })
    : null;

  const renderQuoteItems = () => (
    template?.show_quote_details !== false && quotes.length > 0 && (
            <div className="space-y-4">
              {quotes.map((quote) => {
                const lines = quoteLines[quote.id] || [];
                const sections: Record<string, any[]> = {};
    
                lines.forEach((line) => {
                  const sectionName = line.section_name || "Itens";
                  if (!sections[sectionName]) {
                    sections[sectionName] = [];
                  }
                  sections[sectionName].push(line);
                });
    
                const showQuoteActions =
                  canActOnProposal && quote.estado !== "aceite" && quote.estado !== "rejeitado";
    
                const sectionEntries = Object.entries(sections);
                const hasMultipleSections = sectionEntries.length > 1;
    
                const isQuoteSelected = selectedQuoteIds.has(quote.id);
                const isQuoteDecided = quote.estado === "aceite" || quote.estado === "rejeitado";
    
                // If multiple sections, render each as a separate card
                if (hasMultipleSections) {
                  return (
                    <div key={quote.id} className={`space-y-4 rounded-xl transition-all ${hasMultipleQuotes && !isQuoteDecided ? (isQuoteSelected ? 'ring-2 ring-primary/40 p-2' : 'opacity-60 p-2') : ''}`}>
                      {hasMultipleQuotes && canActOnProposal && !isQuoteDecided && (
                        <div className="flex items-center gap-2 px-2 pt-1">
                          <Checkbox
                            checked={isQuoteSelected}
                            onCheckedChange={() => toggleQuoteSelection(quote.id)}
                            className="h-5 w-5"
                            disabled={isPreview}
                          />
                          <span className="text-sm font-medium">
                            {isQuoteSelected ? "✓ Orçamento selecionado" : "Selecionar este orçamento"}
                          </span>
                        </div>
                      )}
                      {sectionEntries.map(([sectionName, items], sectionIdx) => {
                        const sectionSubtotal = items.reduce((sum, item) => sum + (item.total_sem_iva || 0), 0);
                        const sectionTotalComIva = items.reduce((sum, item) => sum + (item.total_com_iva || 0), 0);
                        const sectionIva = sectionTotalComIva - sectionSubtotal;
                        const sectionKey = `${quote.id}::${sectionName}`;
                        const isSectionSelected = selectedSectionKeys.has(sectionKey);
    
                        return (
                          <Card 
                            key={`${quote.id}-${sectionName}`}
                            className={`transition-all ${hasMultipleSectionsInSingleQuote && canActOnProposal && !isQuoteDecided ? (isSectionSelected ? 'ring-2 ring-primary/40' : 'opacity-60') : ''}`}
                          >
                            <CardHeader className="pb-3 flex flex-row items-center justify-between">
                              <CardTitle className="text-base flex items-center gap-2">
                                {hasMultipleSectionsInSingleQuote && canActOnProposal && !isQuoteDecided && (
                                  <Checkbox
                                    checked={isSectionSelected}
                                    onCheckedChange={() => toggleSectionSelection(sectionKey)}
                                    className="h-5 w-5"
                                    disabled={isPreview}
                                  />
                                )}
                                📋 {sectionName}
                                <Badge variant="outline" className="text-xs font-normal">
                                  {quote.quote_number || quote.title || ""}
                                </Badge>
                              </CardTitle>
                              <div className="flex items-center gap-2">
                                {hasMultipleSectionsInSingleQuote && canActOnProposal && !isQuoteDecided && (
                                  <span className="text-xs text-muted-foreground">
                                    {isSectionSelected ? "✓ Selecionado" : "Não selecionado"}
                                  </span>
                                )}
                                {sectionIdx === 0 && onDownloadPdf && (
                                  <Button variant="outline" size="sm" className="gap-1.5" onClick={onDownloadPdf}>
                                    <Download className="h-3.5 w-3.5" /> Download PDF
                                  </Button>
                                )}
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b-2 border-border">
                                      <th className="py-2 pr-4 text-left font-medium text-muted-foreground uppercase text-xs tracking-wide">Item</th>
                                      <th className="px-2 py-2 text-center font-medium text-muted-foreground uppercase text-xs tracking-wide">QTD</th>
                                      <th className="px-2 py-2 text-right font-medium text-muted-foreground uppercase text-xs tracking-wide">Preço Unit.</th>
                                      <th className="py-2 pl-2 text-right font-medium text-muted-foreground uppercase text-xs tracking-wide">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.map((item: any) => (
                                      <tr key={item.id} className="border-b border-border/50">
                                        <td className="py-3 pr-4">
                                          <p className="font-medium">{item.descricao_snapshot}</p>
                                          {item.item_description && (
                                            <p className="mt-0.5 text-xs text-muted-foreground">{item.item_description}</p>
                                          )}
                                        </td>
                                        <td className="px-2 py-3 text-center">{item.qt || 1}</td>
                                        <td className="px-2 py-3 text-right">
                                          {item.qt && item.total_sem_iva ? formatCurrency(item.total_sem_iva / item.qt) : "—"}
                                        </td>
                                        <td className="py-3 pl-2 text-right font-medium">{formatCurrency(item.total_sem_iva || 0)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
    
                              <div className="space-y-1 border-t pt-3 text-sm">
                                {(() => {
                                  const globalDiscount = Number((quote as any).desconto_global_percent) || 0;
                                  const discountFactor = 1 - globalDiscount / 100;
                                  const discountAmount = sectionSubtotal * globalDiscount / 100;
                                  const discountedSubtotal = sectionSubtotal * discountFactor;
                                  const adjustedTotal = items.reduce((sum: number, item: any) =>
                                    sum + (item.total_sem_iva || 0) * discountFactor * (1 + (item.iva_percent || 23) / 100), 0);
                                  const adjustedIva = adjustedTotal - discountedSubtotal;
                                  return (
                                    <>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Subtotal</span>
                                        <span>{formatCurrency(sectionSubtotal)}</span>
                                      </div>
                                      {globalDiscount > 0 && (
                                        <div className="flex justify-between text-orange-600 dark:text-orange-400">
                                          <span>Desconto global ({globalDiscount}%)</span>
                                          <span>-{formatCurrency(discountAmount)}</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">IVA</span>
                                        <span>{formatCurrency(globalDiscount > 0 ? adjustedIva : sectionIva)}</span>
                                      </div>
                                      <div className="flex justify-between border-t pt-1 text-base font-bold" style={{ borderTop: `2px solid ${primaryColor}` }}>
                                        <span>Total</span>
                                        <span style={{ color: primaryColor }}>{formatCurrency(globalDiscount > 0 ? adjustedTotal : sectionTotalComIva)}</span>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
    
                      {/* Overall quote totals and actions */}
                      <Card>
                        <CardContent className="pt-6 space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {hasMultipleQuotes && canActOnProposal && !isQuoteDecided && (
                                <Checkbox
                                  checked={isQuoteSelected}
                                  onCheckedChange={() => toggleQuoteSelection(quote.id)}
                                  className="h-5 w-5"
                                  disabled={isPreview}
                                />
                              )}
                              <span className="text-base font-bold" style={{ color: primaryColor }}>
                                Total do Orçamento {quote.quote_number || ""}
                              </span>
                            </div>
                            <span className="text-base font-bold" style={{ color: primaryColor }}>
                              {formatCurrency(quote.total || 0)}
                            </span>
                          </div>
    
                          {hasMultipleQuotes && canActOnProposal && !isQuoteDecided && (
                            <p className="text-xs text-muted-foreground">
                              {isQuoteSelected ? "✓ Selecionado para aceitação" : "Desmarque para excluir este orçamento"}
                            </p>
                          )}
    
                          {/* Botões por orçamento removidos: aceitação só via OTP/SMS no fundo da proposta */}
    
                          {quote.estado === "aceite" && (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">✅ Orçamento aceite</Badge>
                          )}
                          {quote.estado === "rejeitado" && (
                            <Badge variant="destructive">❌ Orçamento rejeitado</Badge>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  );
                }
    
                // Single section: render as before in one card
                return (
                  <Card key={quote.id} className={`transition-all ${hasMultipleQuotes && !isQuoteDecided ? (isQuoteSelected ? 'ring-2 ring-primary/40' : 'opacity-60') : ''}`}>
                    <CardHeader className="pb-3 flex flex-row items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        {hasMultipleQuotes && canActOnProposal && !isQuoteDecided && (
                          <Checkbox
                            checked={isQuoteSelected}
                            onCheckedChange={() => toggleQuoteSelection(quote.id)}
                            className="h-5 w-5"
                            disabled={isPreview}
                          />
                        )}
                        📋 Orçamento {quote.quote_number || quote.title || ""}
                      </CardTitle>
                      {onDownloadPdf && (
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={onDownloadPdf}>
                          <Download className="h-3.5 w-3.5" /> Download PDF
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {sectionEntries.map(([sectionName, items]) => (
                        <div key={sectionName}>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b-2 border-border">
                                  <th className="py-2 pr-4 text-left font-medium text-muted-foreground uppercase text-xs tracking-wide">Item</th>
                                  <th className="px-2 py-2 text-center font-medium text-muted-foreground uppercase text-xs tracking-wide">QTD</th>
                                  <th className="px-2 py-2 text-right font-medium text-muted-foreground uppercase text-xs tracking-wide">Preço Unit.</th>
                                  <th className="py-2 pl-2 text-right font-medium text-muted-foreground uppercase text-xs tracking-wide">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((item: any) => (
                                  <tr key={item.id} className="border-b border-border/50">
                                    <td className="py-3 pr-4">
                                      <p className="font-medium">{item.descricao_snapshot}</p>
                                      {item.item_description && (
                                        <p className="mt-0.5 text-xs text-muted-foreground">{item.item_description}</p>
                                      )}
                                    </td>
                                    <td className="px-2 py-3 text-center">{item.qt || 1}</td>
                                    <td className="px-2 py-3 text-right">
                                      {item.qt && item.total_sem_iva ? formatCurrency(item.total_sem_iva / item.qt) : "—"}
                                    </td>
                                    <td className="py-3 pl-2 text-right font-medium">{formatCurrency(item.total_sem_iva || 0)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
    
                      <div className="space-y-1 border-t pt-3 text-sm">
                        {(() => {
                          const globalDiscount = Number((quote as any).desconto_global_percent) || 0;
                          const ivaRate = Number(quote.iva_rate || 23);
                          const productsSubtotal = Number(quote.subtotal) || 0;
                          const total = Number(quote.total) || 0;
                          // Try individual fees from quote_fees (authenticated users); fallback to total_fees field (anon/portal)
                          const namedFees = quoteFees[quote.id] || [];
                          const namedFeesSubtotal = namedFees.reduce((s: number, f: any) => s + (Number(f.calculated_value) || 0), 0);
                          const totalFeesField = Number((quote as any).total_fees) || 0;
                          const fallbackFeesSubtotal = namedFeesSubtotal === 0 && totalFeesField > 0
                            ? totalFeesField / (1 + ivaRate / 100)
                            : 0;
                          const feesSubtotal = namedFeesSubtotal > 0 ? namedFeesSubtotal : fallbackFeesSubtotal;
                          const correctedSubtotal = productsSubtotal + feesSubtotal;
                          const discountAmount = correctedSubtotal * globalDiscount / 100;
                          const discountedSubtotal = correctedSubtotal * (1 - globalDiscount / 100);
                          const iva = globalDiscount > 0 ? total - discountedSubtotal : total - correctedSubtotal;
                          return (
                            <>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Subtotal</span>
                                <span>{formatCurrency(productsSubtotal)}</span>
                              </div>
                              {namedFees.length > 0
                                ? namedFees.map((fee: any) => (
                                    <div key={fee.id} className="flex justify-between">
                                      <span className="text-muted-foreground">{fee.service_fee_types?.name || 'Taxa de Serviço'}</span>
                                      <span>{formatCurrency(Number(fee.calculated_value) || 0)}</span>
                                    </div>
                                  ))
                                : feesSubtotal > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Taxas de Serviço</span>
                                      <span>{formatCurrency(feesSubtotal)}</span>
                                    </div>
                                  )
                              }
                              {globalDiscount > 0 && (
                                <div className="flex justify-between text-orange-600 dark:text-orange-400">
                                  <span>Desconto global ({globalDiscount}%)</span>
                                  <span>-{formatCurrency(discountAmount)}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">IVA ({ivaRate}%)</span>
                                <span>{formatCurrency(iva)}</span>
                              </div>
                              <div className="flex justify-between border-t pt-1 text-base font-bold" style={{ borderTop: `2px solid ${primaryColor}` }}>
                                <span>Total</span>
                                <span style={{ color: primaryColor }}>{formatCurrency(total)}</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
    
                      {hasMultipleQuotes && canActOnProposal && !isQuoteDecided && (
                        <p className="text-xs text-muted-foreground">
                          {isQuoteSelected ? "✓ Selecionado para aceitação" : "Desmarque para excluir este orçamento"}
                        </p>
                      )}
    
                      {/* Botões por orçamento removidos: aceitação só via OTP/SMS no fundo da proposta */}
    
                      {quote.estado === "aceite" && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">✅ Orçamento aceite</Badge>
                      )}
                      {quote.estado === "rejeitado" && (
                        <Badge variant="destructive">❌ Orçamento rejeitado</Badge>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )
  );

  const sectionLabel = (section: DocumentSection, fallback: string) =>
    section.settings?.sectionLabel || section.label || fallback;

  const sectionTitle = (section: DocumentSection, fallback: string) => {
    const label = sectionLabel(section, fallback);
    if (!label || section.settings?.showTitle === false) return null;
    return (
      <div
        className="mb-3 px-3 py-2 text-sm font-semibold"
        style={{
          backgroundColor: theme.surfaceColor,
          color: theme.textColor,
          borderRadius: Math.max(theme.borderRadius - 2, 0),
        }}
      >
        {label}
      </div>
    );
  };

  const renderContentBlock = (section: DocumentSection, fallbackLabel: string, html: string) => {
    if (!hasUsefulText(html)) return null;
    return (
      <section
        key={section.id || section.type}
        style={{ color: theme.textColor }}
      >
        {sectionTitle(section, fallbackLabel)}
        <div
          className="prose prose-sm max-w-none"
          style={{
            color: theme.secondaryTextColor,
            backgroundColor: theme.contentBlockBg,
            border: `1px solid ${theme.borderColor}`,
            borderRadius: theme.borderRadius,
            padding: theme.paddingCard,
          }}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
        />
      </section>
    );
  };

  const renderHeaderSection = (section: DocumentSection) => {
    const title = section.settings?.customTitle || sectionLabel(section, "PROPOSTA");
    const showLogo = section.settings?.showLogo !== false;
    const showDate = section.settings?.showDate !== false;
    const hasHeaderText = hasUsefulText(template?.header_text);
    if (!title && !showLogo && !showDate && !hasHeaderText) return null;

    return (
      <section
        key={section.id || "header"}
        style={{
          backgroundColor: theme.headerBgColor,
          color: theme.headerTextColor,
          border: `1px solid ${theme.borderColor}`,
          borderRadius: theme.borderRadius,
          padding: theme.paddingCard,
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            {title && <h2 className="text-xl font-bold">{title}</h2>}
            {showDate && (
              <p className="text-sm" style={{ color: theme.secondaryTextColor }}>
                {format(new Date(proposal.created_at), "dd/MM/yyyy", { locale: pt })}
              </p>
            )}
          </div>
          {showLogo && logoUrl && <img src={logoUrl} alt="Logo" className="h-14 w-auto object-contain" />}
        </div>
        {hasHeaderText && (
          <div
            className="prose prose-sm mt-4 max-w-none"
            style={{ color: theme.secondaryTextColor }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(template.header_text) }}
          />
        )}
      </section>
    );
  };

  const renderCompanySection = (section: DocumentSection) => {
    if (!company?.name && !logoUrl) return null;
    return (
      <section key={section.id || "company_info"} style={{ color: theme.textColor }}>
        {sectionTitle(section, "Empresa")}
        <div
          className="flex items-center gap-4"
          style={{
            backgroundColor: theme.contentBlockBg,
            border: `1px solid ${theme.borderColor}`,
            borderLeft: `4px solid ${primaryColor}`,
            borderRadius: theme.borderRadius,
            padding: theme.paddingCard,
          }}
        >
          {logoUrl && <img src={logoUrl} alt="Logo" className="h-12 w-auto object-contain" />}
          {company?.name && <h2 className="text-lg font-bold" style={{ color: primaryColor }}>{company.name}</h2>}
        </div>
      </section>
    );
  };

  const renderClientSection = (section: DocumentSection) => {
    const client = proposal.client || proposal.clients || proposal.anew_clients || null;
    const name = client?.name || client?.display_name || client?.company_name || [client?.first_name, client?.last_name].filter(Boolean).join(" ");
    if (!name && !client?.email && !client?.phone) return null;
    return (
      <section key={section.id || "client_info"} style={{ color: theme.textColor }}>
        {sectionTitle(section, "Cliente")}
        <div
          className="space-y-1 text-sm"
          style={{
            backgroundColor: theme.contentBlockBg,
            border: `1px solid ${theme.borderColor}`,
            borderRadius: theme.borderRadius,
            padding: theme.paddingCard,
          }}
        >
          {name && <p className="font-semibold">{name}</p>}
          {client?.email && <p style={{ color: theme.secondaryTextColor }}>{client.email}</p>}
          {client?.phone && <p style={{ color: theme.secondaryTextColor }}>{client.phone}</p>}
        </div>
      </section>
    );
  };

  const renderValiditySection = (section: DocumentSection) => {
    if (!proposal.valid_until) return null;
    return renderContentBlock(
      section,
      "Validade",
      `Proposta válida até <strong>${format(new Date(proposal.valid_until), "dd/MM/yyyy", { locale: pt })}</strong>.`
    );
  };

  const getNotesContent = (section: DocumentSection) => {
    const quoteNotes = quotes
      .map((quote) => quote.client_notes)
      .filter(hasUsefulText)
      .join("\n\n");

    return section.settings?.content || proposal.notes || quoteNotes || "";
  };

  const renderFooterSection = (section: DocumentSection) => {
    const footerContent = section.settings?.content || template?.footer_text || "";
    if (!hasUsefulText(footerContent)) return null;

    return (
      <section key={section.id || "footer"} style={{ color: theme.textColor }}>
        {section.settings?.showTitle === true && section.settings?.sectionLabel
          ? sectionTitle(section, "Rodapé")
          : null}
        <div
          className="prose prose-sm max-w-none"
          style={{
            color: theme.secondaryTextColor,
            backgroundColor: theme.contentBlockBg,
            border: `1px solid ${theme.borderColor}`,
            borderRadius: theme.borderRadius,
            padding: theme.paddingCard,
          }}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(footerContent) }}
        />
      </section>
    );
  };

  const renderDocumentSection = (section: DocumentSection) => {
    switch (section.type) {
      case "header":
        return renderHeaderSection(section);
      case "company_info":
        return renderCompanySection(section);
      case "client_info":
        return renderClientSection(section);
      case "description":
        return renderContentBlock(section, "Descrição do trabalho", section.settings?.content || proposal.description || "");
      case "notes":
        return renderContentBlock(section, "Notas", getNotesContent(section));
      case "validity":
        return renderValiditySection(section);
      case "quote_items":
        return renderQuoteItems();
      case "terms":
        return renderContentBlock(section, "Condições Gerais", template?.terms_conditions || "");
      case "footer":
        return renderFooterSection(section);
      default:
        return null;
    }
  };

  const renderDocumentSections = () => {
    const rendered = documentSections.map(renderDocumentSection).filter(Boolean);
    if (rendered.length === 0) return null;
    return (
      <div className="document-template-sections" style={{ display: "flex", flexDirection: "column", gap: theme.gapSections }}>
        {rendered}
      </div>
    );
  };

  return (
    <div className="space-y-5" style={{ fontFamily }}>
      {/* Decision Banner - only for portal mode when can act */}
      {!isPreview && canActOnProposal && otpStep !== "verified" && (
        <div className="rounded-xl border bg-gradient-to-r from-primary/5 to-primary/10 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-foreground">Proposta aguarda a sua decisão</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Reveja os orçamentos abaixo, aceite ou peça alterações.
              {validUntilFormatted && <> Proposta válida até <strong>{validUntilFormatted}</strong>.</>}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {onDownloadPdf && (
              <Button variant="outline" className="gap-2" onClick={onDownloadPdf}>
                <Download className="h-4 w-4" /> Download PDF
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Accepted Banner */}
      {isAccepted && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800 p-5">
          <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-300">✅ Proposta aceite</h3>
          {proposal.accepted_at && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
              Aceite em {format(new Date(proposal.accepted_at), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: pt })}
            </p>
          )}
          {proposal.acceptance_ip && (
            <p className="text-xs text-emerald-500 dark:text-emerald-500 mt-1">
              IP: {proposal.acceptance_ip} • Verificação por SMS OTP
            </p>
          )}
        </div>
      )}
      {isRejected && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
          <h3 className="text-lg font-bold text-destructive">❌ Proposta rejeitada</h3>
          {proposal.rejected_at && (
            <p className="text-sm text-destructive/80 mt-1">
              Rejeitada em {format(new Date(proposal.rejected_at), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: pt })}
            </p>
          )}
        </div>
      )}

      {/* Proposal Info Card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              Proposta — {proposal.title}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {proposal.proposal_number} · Criada a {format(new Date(proposal.created_at), "dd/MM/yyyy", { locale: pt })}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0" style={{ borderColor: `${primaryColor}50`, color: primaryColor }}>
            📋 {statusLabel}
          </Badge>
        </CardHeader>
        <CardContent>
          {(() => {
            const quotesSubtotalSum = (quotes || []).reduce((acc: number, q: any) => {
              const namedFees = quoteFees[q.id] || [];
              const namedFeesSubtotal = namedFees.reduce((s: number, f: any) => s + (Number(f.calculated_value) || 0), 0);
              const totalFeesField = Number(q?.total_fees) || 0;
              const ivaRate = Number(q?.iva_rate || 23);
              const feesSubtotal = namedFeesSubtotal > 0
                ? namedFeesSubtotal
                : (totalFeesField > 0 ? totalFeesField / (1 + ivaRate / 100) : 0);
              return acc + (Number(q?.subtotal) || 0) + feesSubtotal;
            }, 0);
            const quotesTotalSum = (quotes || []).reduce((acc: number, q: any) => acc + (Number(q?.total) || 0), 0);
            const displayTotal = quotesTotalSum > 0 ? quotesTotalSum : Number(proposal.value) || 0;
            const displaySubtotal = quotesSubtotalSum > 0
              ? quotesSubtotalSum
              : (Number(proposal.subtotal) || (Number(proposal.value) || 0) / 1.23);
            return (
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor Total</p>
              <p className="text-lg font-bold" style={{ color: primaryColor }}>{formatCurrency(displayTotal)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Subtotal (s/ IVA)</p>
              <p className="text-lg font-bold">{formatCurrency(displaySubtotal)}</p>
            </div>
            {proposal.valid_until && template?.show_validity !== false && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Válida até</p>
                <p className="text-lg font-bold">{format(new Date(proposal.valid_until), "dd/MM/yyyy", { locale: pt })}</p>
              </div>
            )}
            {commercial && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Comercial</p>
                <p className="text-lg font-bold">{commercial.name}</p>
              </div>
            )}
          </div>
            );
          })()}
        </CardContent>
      </Card>

      {renderDocumentSections()}

      {/* OTP SMS Verification Section */}
      {canActOnProposal && (
        <Card className="border-2 border-dashed border-primary/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Verificação por SMS
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Para aceitar esta proposta, enviaremos um código de verificação por SMS para o seu telemóvel.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {isPreview ? (
              <div className="text-center space-y-3 pointer-events-none opacity-50">
                <Button size="lg" className="gap-2" disabled>
                  <Smartphone className="h-5 w-5" />
                  Enviar código SMS
                </Button>
              </div>
            ) : (
              <>
                {otpStep === "idle" && (
                  <div className="text-center space-y-3">
                    <Button
                      size="lg"
                      className="gap-2"
                      onClick={onSendOtp}
                      disabled={actionLoading}
                    >
                      <Smartphone className="h-5 w-5" />
                      Enviar código SMS
                    </Button>
                    {otpError && (
                      <p className="text-sm text-destructive">{otpError}</p>
                    )}
                  </div>
                )}

                {otpStep === "sending" && (
                  <div className="text-center space-y-3 py-4">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground">A enviar código SMS...</p>
                  </div>
                )}

                {otpStep === "input" && (
                  <div className="text-center space-y-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        Código enviado para <span className="font-mono font-bold text-foreground">{maskedPhone}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">Válido por 5 minutos</p>
                    </div>
                    <div className="flex justify-center">
                      <InputOTP maxLength={6} value={otpCode} onChange={(val) => onOtpCodeChange?.(val)}>
                        <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    {otpError && (
                      <p className="text-sm text-destructive">{otpError}</p>
                    )}
                    <div className="flex gap-3 justify-center">
                      <Button variant="outline" size="sm" onClick={onSendOtp} disabled={actionLoading}>
                        Reenviar código
                      </Button>
                      <Button
                        size="sm"
                        className="gap-2"
                        onClick={onVerifyOtp}
                        disabled={otpCode.length !== 6 || actionLoading}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Verificar
                      </Button>
                    </div>
                  </div>
                )}

                {otpStep === "verifying" && (
                  <div className="text-center space-y-3 py-4">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground">A verificar código e assinar proposta...</p>
                  </div>
                )}

                {otpStep === "verified" && (
                  <div className="text-center space-y-3 py-4">
                    <ShieldCheck className="h-10 w-10 mx-auto text-emerald-600" />
                    <p className="text-sm font-medium text-emerald-600">Código verificado! Proposta aceite com sucesso.</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Buttons - Bottom */}
      {canActOnProposal && otpStep === "idle" && (
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="text-center mb-4">
              <h3 className="text-xl font-bold">Pronto para avançar?</h3>
              {needsSelection ? (
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Selecione os orçamentos que pretende aceitar e confirme via SMS.
                  </p>
                  <p className="text-sm font-semibold" style={{ color: primaryColor }}>
                    {hasMultipleQuotes 
                      ? `${selectedQuoteIds.size} de ${quotes.length} orçamentos selecionados`
                      : `${selectedSectionKeys.size} de ${allSections.length} secções selecionadas`
                    } — Total: {formatCurrency(selectedTotal)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">Aceite a proposta via SMS ou solicite alterações.</p>
              )}
            </div>
            <div className={`flex flex-col sm:flex-row gap-3 justify-center ${isPreview ? "pointer-events-none opacity-50" : ""}`}>
              <Button
                variant="outline"
                size="lg"
                className="gap-2"
                disabled={actionLoading}
                onClick={onAskQuestion}
              >
                💬 Tenho dúvidas
              </Button>
              <Button
                variant="destructive"
                size="lg"
                className="gap-2"
                disabled={actionLoading}
                onClick={onRejectProposal}
              >
                ✕ Rejeitar
              </Button>
              <Button
                size="lg"
                className="gap-2"
                style={{ backgroundColor: hasSelectedQuotes ? "#16a34a" : undefined }}
                disabled={actionLoading || (!isPreview && !hasSelectedQuotes)}
                onClick={onSendOtp}
              >
                <CheckSquare className="h-5 w-5 text-white" />
                <span className="text-white">Aceitar e Assinar</span>
              </Button>
            </div>
            {needsSelection && !hasSelectedQuotes && !isPreview && (
              <p className="text-center text-sm text-destructive mt-3">
                Selecione pelo menos um {hasMultipleSectionsInSingleQuote ? "secção" : "orçamento"} para poder aceitar a proposta.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Footer: Company + Commercial info */}
      <div className="text-center text-sm text-muted-foreground space-y-1 pt-4">
        {company && <p>Proposta enviada por <strong>{company.name}</strong></p>}
        {commercial && (
          <>
            <p>Dúvidas? Contacte {commercial.name}
              {commercial.phone && <>{" "}<a href={`tel:${commercial.phone}`} className="font-medium hover:text-foreground">{commercial.phone}</a></>}
              {commercial.email && <>{" "}<a href={`mailto:${commercial.email}`} className="font-medium hover:text-foreground">{commercial.email}</a></>}
            </p>
          </>
        )}
      </div>

      {isPreview && (
        <p className="pt-2 text-center text-xs italic text-muted-foreground">
          Os botões de ação estão desativados neste preview.
        </p>
      )}
    </div>
  );
}
