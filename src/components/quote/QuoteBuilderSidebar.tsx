import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Save, Mail, Eye, Download, ClipboardList, Home, UtensilsCrossed, Paintbrush, Wrench, ChevronDown, MessageCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { InlineQuoteData } from "@/components/proposals/InlineQuoteBuilder";

interface SectionSummary {
  name: string;
  itemCount: number;
  subtotal: number;
}

interface QuoteTotals {
  totalSemIva: number;
  totalIva: number;
  totalComIva: number;
  totalComDesconto: number;
  grandTotal: number;
  fees?: any[];
  totalFeesWithVat?: number;
  vatBreakdown?: { rate: number; base: number; vat: number }[];
}

// Extract bundle components from a quote line, regardless of where they live
// (top-level, selected_attributes, or selected_attributes.bundle_components_data).
function getLineBundleComponents(line: any): any[] {
  if (Array.isArray(line?.bundle_components)) return line.bundle_components;
  if (Array.isArray(line?.selected_attributes?.bundle_components)) return line.selected_attributes.bundle_components;
  if (Array.isArray(line?.selected_attributes?.bundle_components_data)) return line.selected_attributes.bundle_components_data;
  return [];
}

interface QuoteBuilderSidebarProps {
  sections: string[];
  lines: any[];
  totals: QuoteTotals;
  descontoPercent: number;
  ivaRate: number;
  onSave: () => void;
  onSaveAndSendEmail?: () => void;
  onSaveAndSendWhatsApp?: () => void;
  loading: boolean;
  dealId: string | null;
  templates: any[];
  onLoadTemplate: (codigo: string) => void;
  onPreviewPdf?: () => void;
  onDownloadPdf?: () => void;
  downloadingPdf?: boolean;
  inlineQuotes?: InlineQuoteData[];
}

function MarginBadge({ margin }: { margin: number }) {
  const color = margin > 30 ? "bg-green-100 text-green-700 border-green-200" : margin >= 15 ? "bg-yellow-100 text-yellow-700 border-yellow-200" : "bg-red-100 text-red-700 border-red-200";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${color}`}>{margin.toFixed(1)}%</span>;
}

// Calculate totals for an inline quote, splitting bundle component VAT
// across each component's own rate (matches PDF + main quote logic).
function calculateInlineQuoteTotals(iq: InlineQuoteData) {
  let totalSemIva = 0;
  let totalIva = 0;
  const vatByRate: Record<number, { base: number; vat: number }> = {};

  iq.lines.filter(l => l.qt > 0).forEach(line => {
    const custoUnit = line.custo_material_unit + line.custo_mao_obra_unit;
    const isManual = custoUnit === 0 && line.retail_price_unit != null;
    const unitPrice = isManual
      ? (line.retail_price_unit || 0)
      : custoUnit * (1 + line.margem_percent / 100) * (1 + line.int_percent / 100);
    const precoBase = unitPrice * line.qt;
    const lineDiscount = line.discount_percent || 0;
    const precoSemIva = precoBase * (1 - lineDiscount / 100);

    const bundleComponents = getLineBundleComponents(line);
    const componentsTotal = bundleComponents.reduce(
      (s: number, c: any) => s + (parseFloat(String(c.unit_price || 0)) * parseFloat(String(c.quantity || 0))),
      0,
    );
    const hasMixedVat = bundleComponents.length > 0 && componentsTotal > 0;

    // Apply global discount to base BEFORE computing VAT (matches PDF + main quote logic).
    const globalFactor = 1 - (iq.desconto_global_percent || 0) / 100;
    const precoSemIvaDescontado = precoSemIva * globalFactor;

    let ivaValor = 0;
    if (hasMixedVat) {
      bundleComponents.forEach((c: any) => {
        const cUnit = parseFloat(String(c.unit_price || 0));
        const cQty = parseFloat(String(c.quantity || 0));
        const cRate = parseFloat(String(c.vat_rate ?? 23));
        const share = (cUnit * cQty) / componentsTotal;
        const base = precoSemIvaDescontado * share;
        const vat = base * (cRate / 100);
        ivaValor += vat;
        if (!vatByRate[cRate]) vatByRate[cRate] = { base: 0, vat: 0 };
        vatByRate[cRate].base += base;
        vatByRate[cRate].vat += vat;
      });
    } else {
      ivaValor = precoSemIvaDescontado * (line.iva_percent / 100);
      const rate = line.iva_percent;
      if (!vatByRate[rate]) vatByRate[rate] = { base: 0, vat: 0 };
      vatByRate[rate].base += precoSemIvaDescontado;
      vatByRate[rate].vat += ivaValor;
    }

    totalSemIva += precoSemIva;
    totalIva += ivaValor;
  });

  const globalFactor = 1 - (iq.desconto_global_percent || 0) / 100;
  const totalSemIvaComDesconto = totalSemIva * globalFactor;
  const totalComIva = totalSemIvaComDesconto + totalIva;
  const totalComDesconto = totalSemIvaComDesconto + totalIva;
  const vatBreakdown = Object.entries(vatByRate)
    .map(([rate, data]) => ({ rate: Number(rate), base: data.base, vat: data.vat }))
    .sort((a, b) => b.rate - a.rate);

  return { totalSemIva, totalIva, totalComIva, totalComDesconto, vatBreakdown };
}

export function QuoteBuilderSidebar({
  sections,
  lines,
  totals,
  descontoPercent,
  ivaRate,
  onSave,
  onSaveAndSendEmail,
  onSaveAndSendWhatsApp,
  loading,
  dealId,
  templates,
  onLoadTemplate,
  onPreviewPdf,
  onDownloadPdf,
  downloadingPdf = false,
  inlineQuotes = [],
}: QuoteBuilderSidebarProps) {
  const [dealBudget, setDealBudget] = useState<number | null>(null);
  const [dealEntityName, setDealEntityName] = useState<string>("");

  // Load deal budget
  useEffect(() => {
    if (!dealId) { setDealBudget(null); return; }
    const load = async () => {
      const { data } = await (supabase as any)
        .from("deals")
        .select("value, entity_id")
        .eq("id", dealId)
        .single();
      if (data?.value) setDealBudget(parseFloat(data.value));
      if (data?.entity_id) {
        const { data: entity } = await (supabase as any)
          .from("anew_entities")
          .select("display_name")
          .eq("id", data.entity_id)
          .single();
        setDealEntityName(entity?.display_name?.split(" ")[0] || "Cliente");
      }
    };
    load();
  }, [dealId]);

  // Calculate section summaries for main quote
  const sectionSummaries: SectionSummary[] = sections.map(sectionName => {
    const sectionLines = lines.filter(l => l.section_name === sectionName && l.qt > 0);
    const subtotal = sectionLines.reduce((sum: number, line: any) => {
      const custoUnit = line.custo_material_unit + line.custo_mao_obra_unit;
      const isManual = custoUnit === 0 && (line.retail_price_unit !== undefined && line.retail_price_unit !== null);
      const unitPrice = isManual
        ? (line.retail_price_unit || 0)
        : custoUnit * (1 + line.margem_percent / 100) * (1 + line.int_percent / 100);
      const preco = unitPrice * line.qt;
      const lineDiscount = line.discount_percent || 0;
      return sum + preco * (1 - lineDiscount / 100);
    }, 0);
    return { name: sectionName, itemCount: sectionLines.length, subtotal };
  }).filter(s => s.itemCount > 0);

  const validLines = lines.filter(l => l.qt > 0);

  // Calculate margin only if cost_price is explicitly set on at least one line
  const linesWithCost = validLines.filter((l: any) => l.cost_price && l.cost_price > 0);
  const hasCostData = linesWithCost.length > 0;
  let totalCost = 0;
  let totalSales = 0;
  if (hasCostData) {
    validLines.forEach((line: any) => {
      const costUnit = line.cost_price || 0;
      totalCost += costUnit * line.qt;
      const preco = (line.custo_material_unit + line.custo_mao_obra_unit) * (1 + line.margem_percent / 100) * (1 + line.int_percent / 100);
      const precoDesc = preco * (1 - (line.discount_percent || 0) / 100);
      totalSales += precoDesc * line.qt;
    });
  }
  const globalMargin = hasCostData && totalSales > 0 ? ((totalSales - totalCost) / totalSales) * 100 : 0;
  const profit = totalSales - totalCost;

  // Calculate inline quote summaries
  const inlineQuoteSummaries = inlineQuotes
    .filter(iq => iq.lines.filter(l => l.qt > 0).length > 0)
    .map(iq => {
      const iqTotals = calculateInlineQuoteTotals(iq);
      const iqValidLines = iq.lines.filter(l => l.qt > 0);
      return {
        title: iq.title || "Orçamento",
        itemCount: iqValidLines.length,
        totalSemIva: iqTotals.totalSemIva,
        totalComDesconto: iqTotals.totalComDesconto,
        totalComIva: iqTotals.totalComIva,
        totalIva: iqTotals.totalIva,
        vatBreakdown: iqTotals.vatBreakdown,
      };
    });

  const hasInlineQuotes = inlineQuoteSummaries.length > 0;

  // Consolidated totals (main + inline quotes)
  const mainFinal = totals.grandTotal || (descontoPercent > 0 ? totals.totalComDesconto : totals.totalComIva);
  const inlineTotalFinal = inlineQuoteSummaries.reduce((s, iq) => s + iq.totalComDesconto, 0);
  const consolidatedTotal = mainFinal + inlineTotalFinal;

  const totalAllItems = validLines.length + inlineQuoteSummaries.reduce((s, iq) => s + iq.itemCount, 0);
  const totalQuoteCount = 1 + inlineQuoteSummaries.length;

  const budgetPercent = dealBudget && dealBudget > 0 ? (consolidatedTotal / dealBudget) * 100 : null;
  const budgetExcessPercent = dealBudget && dealBudget > 0 ? ((consolidatedTotal - dealBudget) / dealBudget) * 100 : null;

  const templateIcons: Record<string, any> = {
    "Casa de Banho": Home,
    "Cozinha": UtensilsCrossed,
    "Pintura": Paintbrush,
    "Remodelação": Wrench,
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">📊 Resumo {hasInlineQuotes ? "Consolidado" : "do Orçamento"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Main quote summary */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Orçamento Principal
            </p>
            {sectionSummaries.map(s => (
              <div key={s.name} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{s.name} ({s.itemCount})</span>
                <span className="font-medium">{formatCurrency(s.subtotal)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-medium pt-1">
              <span>Subtotal</span>
              <span>{formatCurrency(totals.totalSemIva)}</span>
            </div>
          </div>

          {/* Inline quotes summaries */}
          {inlineQuoteSummaries.map((iq, idx) => (
            <div key={idx} className="border-t pt-2 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {iq.title} ({iq.itemCount} itens)
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal (s/IVA)</span>
                <span className="font-medium">{formatCurrency(iq.totalSemIva)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total c/IVA</span>
                <span className="font-medium">{formatCurrency(iq.totalComDesconto)}</span>
              </div>
            </div>
          ))}

          {/* Totals breakdown */}
          <div className="border-t pt-2 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal ({totalAllItems} itens)</span>
              <span className="font-medium">
                {formatCurrency(totals.totalSemIva + inlineQuoteSummaries.reduce((s, iq) => s + iq.totalSemIva, 0))}
              </span>
            </div>
            {descontoPercent > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Desconto ({descontoPercent}%)</span>
                <span>-{formatCurrency((totals.totalSemIva + inlineQuoteSummaries.reduce((s, iq) => s + iq.totalSemIva, 0)) * (descontoPercent / 100))}</span>
              </div>
            )}
            {(() => {
              // Merge product VAT breakdowns from main quote + inline quotes by rate.
              const merged = new Map<number, number>();
              (totals.vatBreakdown || []).forEach(b => merged.set(b.rate, (merged.get(b.rate) || 0) + b.vat));
              inlineQuoteSummaries.forEach(iq => {
                (iq.vatBreakdown || []).forEach(b => merged.set(b.rate, (merged.get(b.rate) || 0) + b.vat));
              });
              const rows = Array.from(merged.entries())
                .filter(([, v]) => v > 0)
                .sort((a, b) => b[0] - a[0]);
              return rows.map(([rate, vat]) => (
                <div key={rate} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">IVA {rate.toFixed(0)}%</span>
                  <span className="font-medium">{formatCurrency(vat)}</span>
                </div>
              ));
            })()}
          </div>

          {/* Service Fees — base sem IVA, com IVA da taxa em linha separada */}
          {totals.fees && totals.fees.length > 0 && (
            <div className="border-t pt-2 space-y-1">
              {totals.fees.map((fee: any) => (
                <React.Fragment key={fee.id}>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{fee.name}</span>
                    <span className="font-medium">{formatCurrency(fee.calculatedValue)}</span>
                  </div>
                  {fee.vatAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        IVA {Number(fee.vatRate || 0).toFixed(0)}% ({fee.name})
                      </span>
                      <span className="font-medium">{formatCurrency(fee.vatAmount)}</span>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          <div className="border-t-2 border-primary pt-3">
            <div className="flex justify-between items-center">
              <span className="font-bold text-lg">Total {hasInlineQuotes ? "Global" : ""}</span>
              <span className="font-bold text-2xl text-primary">{formatCurrency(consolidatedTotal)}</span>
            </div>
          </div>

          {/* Mini Stats */}
          <div className={`grid ${hasInlineQuotes ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
            <div className="text-center p-2 border rounded-lg">
              <p className="text-lg font-bold">{totalAllItems}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Itens</p>
            </div>
            <div className="text-center p-2 border rounded-lg">
              <p className="text-lg font-bold">{sectionSummaries.length}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Secções</p>
            </div>
            {hasInlineQuotes && (
              <div className="text-center p-2 border rounded-lg">
                <p className="text-lg font-bold">{totalQuoteCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Orçamentos</p>
              </div>
            )}
          </div>
          {/* Margin Card - only shown when cost data exists */}
          {hasCostData && (
            <div className={`rounded-lg p-4 text-center border ${globalMargin > 30 ? "bg-green-50 border-green-200" : globalMargin >= 15 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"}`}>
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Margem Global</p>
              <p className={`text-3xl font-bold ${globalMargin > 30 ? "text-green-600" : globalMargin >= 15 ? "text-yellow-600" : "text-red-600"}`}>
                {globalMargin.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Custo: {formatCurrency(totalCost)} · Lucro: {formatCurrency(profit)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Budget Check */}
      {dealBudget && dealBudget > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">🔥 Orçamento do Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Budget d{dealEntityName ? `o ${dealEntityName}` : "o Cliente"}:</span>
              <span className="font-bold">{formatCurrency(dealBudget)}</span>
            </div>
            <Progress value={Math.min(budgetPercent || 0, 100)} className="h-2.5" />
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                {formatCurrency(consolidatedTotal)}{budgetExcessPercent !== null && budgetExcessPercent > 0 ? ` (${budgetExcessPercent.toFixed(0)}% acima do budget)` : budgetExcessPercent !== null && budgetExcessPercent < 0 ? ` (${Math.abs(budgetExcessPercent).toFixed(0)}% abaixo do budget)` : ""}
              </span>
              {budgetPercent !== null && (
                <Badge variant={budgetPercent <= 100 ? "default" : "destructive"} className={budgetPercent <= 100 ? "bg-green-600 text-xs" : "text-xs"}>
                  {budgetPercent <= 100 ? "✅ Dentro do budget" : "⚠ Acima do budget"}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Templates */}
      {templates.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">📋 Templates Rápidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-1">
              {templates.map(template => {
                const IconComp = templateIcons[template.name] || ClipboardList;
                return (
                  <button
                    key={template.id}
                    title={template.name}
                    className="border rounded-lg p-2.5 text-center hover:bg-primary/5 hover:border-primary/40 transition-colors flex flex-col items-center justify-center min-h-[68px]"
                    onClick={() => onLoadTemplate(template.codigo)}
                  >
                    <IconComp className="h-5 w-5 mb-1 text-primary shrink-0" />
                    <p className="text-[11px] font-medium leading-tight line-clamp-2 break-words">{template.name}</p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="space-y-2">
        <Button className="w-full" size="lg" onClick={onSave} disabled={loading}>
          <Save className="w-4 h-4 mr-2" />
          {loading ? "A guardar..." : "Guardar Orçamento"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="w-full bg-green-600 hover:bg-green-700" size="lg" disabled={loading}>
              <Mail className="w-4 h-4 mr-2" />
              Guardar e Enviar ao Cliente
              <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={onSaveAndSendEmail} className="cursor-pointer">
              <Mail className="w-4 h-4 mr-2" />
              Enviar por Email
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSaveAndSendWhatsApp} className="cursor-pointer">
              <MessageCircle className="w-4 h-4 mr-2 text-green-600" />
              Enviar por WhatsApp
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" className="w-full" size="sm" onClick={onPreviewPdf}>
          <Eye className="w-4 h-4 mr-2" />
          Pré-visualizar PDF
        </Button>
        <Button variant="outline" className="w-full" size="sm" onClick={onDownloadPdf} disabled={!onDownloadPdf || downloadingPdf}>
          <Download className="w-4 h-4 mr-2" />
          {downloadingPdf ? "A gerar PDF..." : "Download PDF"}
        </Button>
        <Button variant="outline" className="w-full" size="sm">
          <ClipboardList className="w-4 h-4 mr-2" />
          Guardar como Template
        </Button>
      </div>
    </div>
  );
}
