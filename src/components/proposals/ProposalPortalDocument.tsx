import { useEffect, useState, useMemo } from "react";
import DOMPurify from "dompurify";
import { FileText, Mail, MessageCircle, Phone, Download, CheckSquare, Square, CheckSquare2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { ProposalPortalCommercial } from "@/components/proposals/proposalPortalData";
import { formatCurrency } from "@/lib/utils";
import { ProposalPortalOtpSection } from "@/components/proposals/ProposalPortalOtpSection";
import { formatarData, formatarDataHora } from "@/portal-i18n/formato";
import { traduzir } from "@/portal-i18n/traduzir";
import { traduzirEm } from "@/portal-i18n/traduzirEm";
import { ehPortalIdioma, type PortalIdioma } from "@/portal-i18n/tipos";
import type { PortalTraducao } from "@/portal-i18n/usePortalT";
import { aplicarVersaoProposta, normalizarCodigo, obterIdioma } from "@/lib/idiomaDocumento";
import { computeQuoteTotals, computeLineVatAmount, aggregateQuoteTotals } from "@/utils/quotes/computeQuoteTotals";
import { getLineDisplayUnitPrice } from "@/utils/quotes/quoteLinePricing";

/**
 * Total c/IVA de uma linha, calculado como o PDF o calcula: num bundle o IVA é
 * repartido pelos componentes (material a 23%, mão de obra a 6%).
 *
 * NÃO usar a coluna `total_com_iva` gravada: até à correção do handleSave ela
 * foi escrita com o `iva_percent` flat da linha, que o AddItemsDialog fixa em
 * 23 nos bundles. Somá-la por secção dava secções que não fechavam com o total
 * do orçamento mostrado logo abaixo (€1.692,31 contra €1.632,88 no Q-2026-1749).
 * Calcular aqui corrige também os orçamentos já gravados, sem depender de
 * serem regravados.
 */
const lineTotalComIva = (item: any): number => {
  const base = Number(item?.total_sem_iva) || 0;
  return base + computeLineVatAmount(item, base);
};

interface ProposalPortalDocumentProps {
  proposal: any;
  template: any | null;
  quotes: any[];
  quoteLines: Record<string, any[]>;
  quoteFees?: Record<string, any[]>;
  commercial: ProposalPortalCommercial | null;
  company: any | null;
  mode?: "preview" | "portal";
  /**
   * Idioma dos textos do documento. Por omissão português: o CRM (pré-visualização) não passa a prop e fica como
   * sempre; o portal do cliente passa o idioma escolhido. Conteúdo escrito pela organização não é traduzido.
   */
  idioma?: PortalIdioma;
  /**
   * Idiomas do documento, por ordem (omissão ['pt']; quando vem, manda sobre `idioma`). O template passa por
   * aplicarVersaoProposta em cada um e o miolo (secções do template) corre uma vez por versão, cada uma com o seu
   * título; com um só idioma não há título de versão. Os controlos interativos (caixas de seleção, OTP,
   * aceitar/rejeitar, total selecionado) ficam só na primeira versão; as seguintes saem em modo de leitura.
   * Quem decide os idiomas é quem chama (ver resolverIdiomasDaProposta): este componente mostra o que lhe pedem.
   */
  idiomasDoDocumento?: string[];
  statusLabel?: string;
  canActOnProposal?: boolean;
  actionLoading?: boolean;
  // OTP props
  otpStep?: "idle" | "sending" | "input" | "verifying" | "verified";
  otpCode?: string;
  maskedPhone?: string;
  otpError?: string;
  /** Primeiro envio do código (Enviar código SMS e Aceitar e Assinar). */
  onSendOtp?: () => void;
  /** Reenviar código; se não vier, usa onSendOtp. */
  onResendOtp?: () => void;
  /** Segundos que faltam até se poder reenviar o código (0 = livre). Só afecta o Reenviar. */
  otpCooldown?: number;
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

/**
 * Rótulos que o editor de templates grava por omissão em `section.label`, por tipo de secção (chave sem prefixo).
 * Em inglês, um `label` igual ao de fábrica em português é tratado como omissão e traduz-se; um renomeado fica.
 */
const ROTULOS_DE_FABRICA: Record<string, string[]> = {
  header: ["cabecalho"],
  company_info: ["empresa", "infoEmpresa"],
  client_info: ["cliente"],
  description: ["descricao"],
  notes: ["notas"],
  validity: ["validade", "validadeAte"],
  terms: ["condicoes"],
  footer: ["rodape"],
  quote_items: ["detalhes"],
};
const PREFIXO_SECAO = "pc.docProposta.secao.";

/**
 * O editor de templates também grava por omissão os TÍTULOS em português (settings.sectionLabel «CLIENTE»,
 * «CONDIÇÕES GERAIS», «Válida até»; settings.customTitle «PROPOSTA»). Compara-se sem caixa nem acentos para
 * reconhecer esses valores de fábrica; o que a organização escreveu de facto é diferente e fica como vem.
 */
const normalizarTitulo = (texto: string): string =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Nome da secção quando as linhas não têm `section_name`: sentinela independente do idioma (traduz-se só ao mostrar). */
const SECAO_SEM_NOME = "\u0000sem-nome";

/** Uma versão de idioma do documento: as palavras do ecrã, o template já resolvido e as suas secções. */
interface VersaoDoDocumento {
  codigo: string;
  lingua: PortalIdioma;
  t: PortalTraducao["t"];
  template: any | null;
  documentSections: DocumentSection[];
}

/** As secções visíveis do template, ou as de omissão (com os rótulos no idioma de `t`) se não houver nenhuma. */
function seccoesDoDocumento(template: any | null, t: PortalTraducao["t"]): DocumentSection[] {
  const configured = Array.isArray(template?.sections)
    ? template.sections.filter((section: any) => DOCUMENT_SECTION_TYPES.has(section?.type))
    : [];

  if (configured.length > 0) {
    return configured.filter((section: DocumentSection) => section.visible !== false);
  }

  return [
    { id: "fallback_header", type: "header", label: t("pc.docProposta.secao.cabecalho"), visible: true, settings: { customTitle: t("pc.docProposta.secao.tituloProposta"), showLogo: true, showDate: true } },
    { id: "fallback_company", type: "company_info", label: t("pc.docProposta.secao.empresa"), visible: template?.show_company_info !== false, settings: { sectionLabel: t("pc.docProposta.secao.empresa") } },
    { id: "fallback_quote_items", type: "quote_items", label: t("pc.docProposta.secao.detalhes"), visible: template?.show_quote_details !== false, settings: { sectionLabel: t("pc.docProposta.secao.detalhes") } },
    { id: "fallback_terms", type: "terms", label: t("pc.docProposta.secao.condicoes"), visible: template?.show_terms !== false, settings: { sectionLabel: t("pc.docProposta.secao.condicoes") } },
    { id: "fallback_footer", type: "footer", label: t("pc.docProposta.secao.rodape"), visible: true, settings: {} },
  ].filter((section) => section.visible !== false);
}

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
  idioma = "pt",
  idiomasDoDocumento,
  statusLabel,
  canActOnProposal = false,
  actionLoading = false,
  otpStep = "idle",
  otpCode = "",
  maskedPhone = "",
  otpError = "",
  onSendOtp,
  onResendOtp,
  otpCooldown = 0,
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
  // Os idiomas vêm das props (nunca do armazém do portal): `idiomasDoDocumento` manda quando traz algum código
  // registado; senão vale `idioma`, e um valor estranho cai em português.
  const chaveIdiomas = (idiomasDoDocumento ?? []).join("+");
  const codigos = useMemo<string[]>(() => {
    const pedidos = chaveIdiomas.split("+").map((c) => normalizarCodigo(c)).filter((c): c is string => c !== null);
    const unicos = Array.from(new Set(pedidos));
    return unicos.length > 0 ? unicos : [ehPortalIdioma(idioma) ? idioma : "pt"];
  }, [chaveIdiomas, idioma]);
  // Uma versão por idioma: o template resolvido (a MESMA referência se não houver versão) e as palavras do ecrã.
  const versoes = useMemo<VersaoDoDocumento[]>(
    () =>
      codigos.map((codigo) => {
        const { idioma: lingua, t } = traduzirEm(codigo as PortalIdioma);
        const templateDaVersao = aplicarVersaoProposta(template, codigo);
        return { codigo, lingua, t, template: templateDaVersao, documentSections: seccoesDoDocumento(templateDaVersao, t) };
      }),
    [codigos, template],
  );
  // O que fica fora das versões (cartões, faixas, OTP, ações) fala o idioma da primeira.
  const { lingua, t } = versoes[0];
  // O dinheiro não segue o idioma: formatCurrency de sempre (€1.234,56) em português e em inglês.
  const money = (value: number): string => formatCurrency(value);
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

  // Build section map for all quotes
  const allSections = useMemo(() => {
    const result: { key: string; quoteId: string; sectionName: string; items: any[] }[] = [];
    quotes.forEach(quote => {
      const lines = quoteLines[quote.id] || [];
      const sections: Record<string, any[]> = {};
      lines.forEach(line => {
        const sectionName = line.section_name || SECAO_SEM_NOME;
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
          return sum + s.items.reduce((itemSum, item) => itemSum + lineTotalComIva(item), 0);
        }, 0);
    }
    return proposal.value;
  }, [quotes, selectedQuoteIds, hasMultipleQuotes, hasMultipleSectionsInSingleQuote, allSections, selectedSectionKeys, proposal.value]);

  // M2: formatCurrency now imported from @/lib/utils


  const isAccepted = proposal.status === "accepted";
  const isRejected = proposal.status === "rejected";
  const validUntilFormatted = proposal.valid_until
    ? formatarData(new Date(proposal.valid_until), lingua, "longo")
    : null;

  // O miolo de UMA versão de idioma: as secções do template resolvido, com as palavras desse idioma. Só a primeira
  // versão é interativa; as seguintes saem em modo de leitura (sem caixas de seleção, realce de seleção nem PDF).
  // Dentro desta função `template`, `lingua` e `t` são os DA VERSÃO (escondem os de fora de propósito).
  const renderMiolo = (versao: VersaoDoDocumento, primeira: boolean) => {
    const { template, lingua, t, documentSections } = versao;
    const agir = canActOnProposal && primeira;
    const comSelecao = primeira;
    const baixarPdf = primeira ? onDownloadPdf : undefined;
    // O nome da secção sem nome é uma sentinela (não entra no texto traduzido): mudar de idioma não muda as chaves
    // da seleção. Só se traduz ao mostrar.
    const nomeSecaoVisivel = (nome: string): string => (nome === SECAO_SEM_NOME ? t("pc.docProposta.itens") : nome);

    const renderQuoteItems = () => (
      template?.show_quote_details !== false && quotes.length > 0 && (
              <div className="space-y-4">
                {quotes.map((quote) => {
                  const lines = quoteLines[quote.id] || [];
                  const sections: Record<string, any[]> = {};
    
                  lines.forEach((line) => {
                    const sectionName = line.section_name || SECAO_SEM_NOME;
                    if (!sections[sectionName]) {
                      sections[sectionName] = [];
                    }
                    sections[sectionName].push(line);
                  });
    
                  const showQuoteActions =
                    agir && quote.estado !== "aceite" && quote.estado !== "rejeitado";
    
                  const sectionEntries = Object.entries(sections);
                  const hasMultipleSections = sectionEntries.length > 1;
    
                  const isQuoteSelected = selectedQuoteIds.has(quote.id);
                  const isQuoteDecided = quote.estado === "aceite" || quote.estado === "rejeitado";
    
                  // If multiple sections, render each as a separate card
                  if (hasMultipleSections) {
                    return (
                      <div key={quote.id} className={`space-y-4 rounded-xl transition-all ${hasMultipleQuotes && comSelecao && !isQuoteDecided ? (isQuoteSelected ? 'ring-2 ring-primary/40 p-2' : 'opacity-60 p-2') : ''}`}>
                        {hasMultipleQuotes && agir && !isQuoteDecided && (
                          <div className="flex items-center gap-2 px-2 pt-1">
                            <Checkbox
                              checked={isQuoteSelected}
                              onCheckedChange={() => toggleQuoteSelection(quote.id)}
                              className="h-5 w-5"
                              disabled={isPreview}
                            />
                            <span className="text-sm font-medium">
                              {isQuoteSelected ? t("pc.docProposta.orcamento.selecionado") : t("pc.docProposta.orcamento.selecionar")}
                            </span>
                          </div>
                        )}
                        {sectionEntries.map(([sectionName, items], sectionIdx) => {
                          const sectionSubtotal = items.reduce((sum, item) => sum + (item.total_sem_iva || 0), 0);
                          const sectionKey = `${quote.id}::${sectionName}`;
                          const isSectionSelected = selectedSectionKeys.has(sectionKey);
    
                          return (
                            <Card 
                              key={`${quote.id}-${sectionName}`}
                              className={`transition-all ${hasMultipleSectionsInSingleQuote && agir && !isQuoteDecided ? (isSectionSelected ? 'ring-2 ring-primary/40' : 'opacity-60') : ''}`}
                            >
                              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                                <CardTitle className="text-base flex items-center gap-2">
                                  {hasMultipleSectionsInSingleQuote && agir && !isQuoteDecided && (
                                    <Checkbox
                                      checked={isSectionSelected}
                                      onCheckedChange={() => toggleSectionSelection(sectionKey)}
                                      className="h-5 w-5"
                                      disabled={isPreview}
                                    />
                                  )}
                                  📋 {nomeSecaoVisivel(sectionName)}
                                  <Badge variant="outline" className="text-xs font-normal">
                                    {quote.quote_number || quote.title || ""}
                                  </Badge>
                                </CardTitle>
                                <div className="flex items-center gap-2">
                                  {hasMultipleSectionsInSingleQuote && agir && !isQuoteDecided && (
                                    <span className="text-xs text-muted-foreground">
                                      {isSectionSelected ? t("pc.docProposta.secaoSelecionada") : t("pc.docProposta.secaoNaoSelecionada")}
                                    </span>
                                  )}
                                  {sectionIdx === 0 && baixarPdf && (
                                    <Button variant="outline" size="sm" className="gap-1.5" onClick={baixarPdf}>
                                      <Download className="h-3.5 w-3.5" /> {t("pc.docProposta.baixarPdf")}
                                    </Button>
                                  )}
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b-2 border-border">
                                        <th className="py-2 pr-4 text-left font-medium text-muted-foreground uppercase text-xs tracking-wide">{t("pc.docProposta.tabela.item")}</th>
                                        <th className="px-2 py-2 text-center font-medium text-muted-foreground uppercase text-xs tracking-wide">{t("pc.docProposta.tabela.qtd")}</th>
                                        <th className="px-2 py-2 text-right font-medium text-muted-foreground uppercase text-xs tracking-wide">{t("pc.docProposta.tabela.precoUnit")}</th>
                                        <th className="py-2 pl-2 text-right font-medium text-muted-foreground uppercase text-xs tracking-wide">{t("pc.docProposta.tabela.total")}</th>
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
                                            {item.qt ? money(getLineDisplayUnitPrice(item)) : "—"}
                                          </td>
                                          <td className="py-3 pl-2 text-right font-medium">{money(item.total_sem_iva || 0)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
    
                                <div className="space-y-1 border-t pt-3 text-sm">
                                  {(() => {
                                    const globalDiscount = Number((quote as any).desconto_global_percent) || 0;
                                    const discountAmount = sectionSubtotal * globalDiscount / 100;
                                    // IVA por taxa com a conta do PDF (bundles repartidos por
                                    // componente); o desconto global reduz a base de cada linha.
                                    const sectionTotals = computeQuoteTotals(items, [], globalDiscount);
                                    const adjustedTotal = sectionTotals.total;
                                    return (
                                      <>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">{t("pc.docProposta.totais.subtotal")}</span>
                                          <span>{money(sectionSubtotal)}</span>
                                        </div>
                                        {globalDiscount > 0 && (
                                          <div className="flex justify-between text-orange-600 dark:text-orange-400">
                                            <span>{t("pc.docProposta.totais.descontoGlobal", { percentagem: globalDiscount })}</span>
                                            <span>-{money(discountAmount)}</span>
                                          </div>
                                        )}
                                        {sectionTotals.vatBreakdown.map((b) => (
                                          <div key={b.rate} className="flex justify-between">
                                            <span className="text-muted-foreground">{t("pc.docProposta.totais.iva", { taxa: b.rate })}</span>
                                            <span>{money(b.vat)}</span>
                                          </div>
                                        ))}
                                        <div className="flex justify-between border-t pt-1 text-base font-bold" style={{ borderTop: `2px solid ${primaryColor}` }}>
                                          <span>{t("pc.docProposta.tabela.total")}</span>
                                          <span style={{ color: primaryColor }}>{money(adjustedTotal)}</span>
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
                            {(() => {
                              // Each section card above only shows its OWN
                              // subtotal/discount/IVA — the service fee is never
                              // tied to a single section (it belongs to the whole
                              // quote), so without this it never appeared
                              // anywhere: the client saw the sections not add up
                              // to "Total do Orçamento" with no explanation why.
                              const namedFees = quoteFees[quote.id] || [];
                              const globalDiscount = Number((quote as any).desconto_global_percent) || 0;
                              const totals = computeQuoteTotals(lines, namedFees, globalDiscount);
                              if (namedFees.length === 0) return null;
                              return (
                                <div className="space-y-1 border-b pb-3 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">{t("pc.docProposta.totais.subtotalTodasSecoes")}</span>
                                    <span>{money(totals.subtotalBruto)}</span>
                                  </div>
                                  {namedFees.map((fee: any) => (
                                    <div key={fee.id} className="flex justify-between">
                                      <span className="text-muted-foreground">{fee.service_fee_types?.name || t("pc.docProposta.taxaServico")}</span>
                                      <span>{money(Number(fee.calculated_value) || 0)}</span>
                                    </div>
                                  ))}
                                  {globalDiscount > 0 && (
                                    <div className="flex justify-between text-orange-600 dark:text-orange-400">
                                      <span>{t("pc.docProposta.totais.descontoGlobal", { percentagem: globalDiscount })}</span>
                                      <span>-{money(totals.discountValue)}</span>
                                    </div>
                                  )}
                                  {totals.vatBreakdown.map((b) => (
                                    <div key={b.rate} className="flex justify-between">
                                      <span className="text-muted-foreground">{t("pc.docProposta.totais.iva", { taxa: b.rate })}</span>
                                      <span>{money(b.vat)}</span>
                                    </div>
                                  ))}
                                  {totals.roundedFeeVatBreakdown.map((f, i) => (
                                    <div key={`fee-${i}`} className="flex justify-between">
                                      <span className="text-muted-foreground">{t("pc.docProposta.totais.ivaTaxaTraco", { taxa: f.rate, nome: f.name })}</span>
                                      <span>{money(f.vat)}</span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {hasMultipleQuotes && agir && !isQuoteDecided && (
                                  <Checkbox
                                    checked={isQuoteSelected}
                                    onCheckedChange={() => toggleQuoteSelection(quote.id)}
                                    className="h-5 w-5"
                                    disabled={isPreview}
                                  />
                                )}
                                <span className="text-base font-bold" style={{ color: primaryColor }}>
                                  {t("pc.docProposta.totais.totalOrcamento", { numero: quote.quote_number || "" })}
                                </span>
                              </div>
                              <span className="text-base font-bold" style={{ color: primaryColor }}>
                                {money(quote.total || 0)}
                              </span>
                            </div>

                            {hasMultipleQuotes && agir && !isQuoteDecided && (
                              <p className="text-xs text-muted-foreground">
                                {isQuoteSelected ? t("pc.docProposta.orcamento.selecionadoParaAceitar") : t("pc.docProposta.orcamento.desmarcarParaExcluir")}
                              </p>
                            )}
    
                            {/* Botões por orçamento removidos: aceitação só via OTP/SMS no fundo da proposta */}
    
                            {quote.estado === "aceite" && (
                              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{t("pc.docProposta.orcamento.aceite")}</Badge>
                            )}
                            {quote.estado === "rejeitado" && (
                              <Badge variant="destructive">{t("pc.docProposta.orcamento.rejeitado")}</Badge>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    );
                  }
    
                  // Single section: render as before in one card
                  return (
                    <Card key={quote.id} className={`transition-all ${hasMultipleQuotes && comSelecao && !isQuoteDecided ? (isQuoteSelected ? 'ring-2 ring-primary/40' : 'opacity-60') : ''}`}>
                      <CardHeader className="pb-3 flex flex-row items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          {hasMultipleQuotes && agir && !isQuoteDecided && (
                            <Checkbox
                              checked={isQuoteSelected}
                              onCheckedChange={() => toggleQuoteSelection(quote.id)}
                              className="h-5 w-5"
                              disabled={isPreview}
                            />
                          )}
                          📋 {t("pc.docProposta.orcamento.titulo", { numero: quote.quote_number || quote.title || "" })}
                        </CardTitle>
                        {baixarPdf && (
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={baixarPdf}>
                            <Download className="h-3.5 w-3.5" /> {t("pc.docProposta.baixarPdf")}
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
                                    <th className="py-2 pr-4 text-left font-medium text-muted-foreground uppercase text-xs tracking-wide">{t("pc.docProposta.tabela.item")}</th>
                                    <th className="px-2 py-2 text-center font-medium text-muted-foreground uppercase text-xs tracking-wide">{t("pc.docProposta.tabela.qtd")}</th>
                                    <th className="px-2 py-2 text-right font-medium text-muted-foreground uppercase text-xs tracking-wide">{t("pc.docProposta.tabela.precoUnit")}</th>
                                    <th className="py-2 pl-2 text-right font-medium text-muted-foreground uppercase text-xs tracking-wide">{t("pc.docProposta.tabela.total")}</th>
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
                                        {item.qt ? money(getLineDisplayUnitPrice(item)) : "—"}
                                      </td>
                                      <td className="py-3 pl-2 text-right font-medium">{money(item.total_sem_iva || 0)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
    
                        <div className="space-y-1 border-t pt-3 text-sm">
                          {(() => {
                            // Reuses the exact same pure function the PDF is built from
                            // (src/utils/quotes/computeQuoteTotals.ts), instead of a
                            // parallel re-implementation. That old version (a) applied
                            // the global discount to subtotal+fees instead of just the
                            // subtotal, and (b) fell back to Number(quote.iva_rate || 23)
                            // — quote.iva_rate is a stale header default, not the real
                            // per-line VAT config, and `|| 23` also silently overrides a
                            // legitimate 0% (auto-liquidação) with 23%. Both bugs made
                            // this preview disagree with the PDF whenever a quote had a
                            // discount and/or a 0%-VAT fee.
                            const namedFees = quoteFees[quote.id] || [];
                            const globalDiscount = Number((quote as any).desconto_global_percent) || 0;
                            const totals = computeQuoteTotals(lines, namedFees, globalDiscount);
                            const total = Number(quote.total) || totals.total;
                            return (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">{t("pc.docProposta.totais.subtotal")}</span>
                                  <span>{money(totals.subtotalBruto)}</span>
                                </div>
                                {namedFees.length > 0 && namedFees.map((fee: any) => (
                                  <div key={fee.id} className="flex justify-between">
                                    <span className="text-muted-foreground">{fee.service_fee_types?.name || t("pc.docProposta.taxaServico")}</span>
                                    <span>{money(Number(fee.calculated_value) || 0)}</span>
                                  </div>
                                ))}
                                {globalDiscount > 0 && (
                                  <div className="flex justify-between text-orange-600 dark:text-orange-400">
                                    <span>{t("pc.docProposta.totais.descontoGlobal", { percentagem: globalDiscount })}</span>
                                    <span>-{money(totals.discountValue)}</span>
                                  </div>
                                )}
                                {totals.vatBreakdown.map((b) => (
                                  <div key={b.rate} className="flex justify-between">
                                    <span className="text-muted-foreground">{t("pc.docProposta.totais.iva", { taxa: b.rate })}</span>
                                    <span>{money(b.vat)}</span>
                                  </div>
                                ))}
                                {totals.roundedFeeVatBreakdown.map((f, i) => (
                                  <div key={`fee-${i}`} className="flex justify-between">
                                    <span className="text-muted-foreground">{t("pc.docProposta.totais.ivaTaxaTraco", { taxa: f.rate, nome: f.name })}</span>
                                    <span>{money(f.vat)}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between border-t pt-1 text-base font-bold" style={{ borderTop: `2px solid ${primaryColor}` }}>
                                  <span>{t("pc.docProposta.tabela.total")}</span>
                                  <span style={{ color: primaryColor }}>{money(total)}</span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
    
                        {hasMultipleQuotes && agir && !isQuoteDecided && (
                          <p className="text-xs text-muted-foreground">
                            {isQuoteSelected ? t("pc.docProposta.orcamento.selecionadoParaAceitar") : t("pc.docProposta.orcamento.desmarcarParaExcluir")}
                          </p>
                        )}
    
                        {/* Botões por orçamento removidos: aceitação só via OTP/SMS no fundo da proposta */}
    
                        {quote.estado === "aceite" && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{t("pc.docProposta.orcamento.aceite")}</Badge>
                        )}
                        {quote.estado === "rejeitado" && (
                          <Badge variant="destructive">{t("pc.docProposta.orcamento.rejeitado")}</Badge>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}

                {(() => {
                  // Totais da proposta com o IVA discriminado por taxa, como no PDF.
                  // Mesma regra do cartão do topo: havendo orçamentos aceites só esses
                  // contam; antes de qualquer decisão, todos os não rejeitados.
                  const hasAcceptedQuote = quotes.some((q: any) => q?.estado === "aceite");
                  const valueQuotes = quotes.filter((q: any) =>
                    (hasAcceptedQuote ? q?.estado === "aceite" : q?.estado !== "rejeitado")
                    && (quoteLines[q.id] || []).length > 0
                  );
                  if (valueQuotes.length === 0) return null;
                  const totals = aggregateQuoteTotals(valueQuotes.map((q: any) => ({
                    lines: quoteLines[q.id] || [],
                    fees: quoteFees[q.id] || [],
                    descontoPercent: Number(q.desconto_global_percent) || 0,
                  })));
                  return (
                    <Card>
                      <CardContent className="pt-6">
                        <div className="ml-auto max-w-sm space-y-1 text-sm">
                          <div className="flex justify-between font-medium">
                            <span>{t("pc.docProposta.totais.subtotalSemIva")}</span>
                            <span>{money(totals.subtotalWithFees)}</span>
                          </div>
                          {totals.vatBreakdown.map((b) => (
                            <div key={b.rate} className="flex justify-between">
                              <span className="text-muted-foreground">{t("pc.docProposta.totais.ivaTaxa", { taxa: b.rate })}</span>
                              <span>{money(b.vat)}</span>
                            </div>
                          ))}
                          {totals.feeVatBreakdown.map((f, i) => (
                            <div key={`fee-${i}`} className="flex justify-between">
                              <span className="text-muted-foreground">{t("pc.docProposta.totais.ivaTaxaParenteses", { taxa: f.rate, nome: f.name })}</span>
                              <span>{money(f.vat)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("pc.docProposta.totais.ivaTotal")}</span>
                            <span>{money(totals.totalIva)}</span>
                          </div>
                          <div className="flex justify-between border-t pt-1 text-base font-bold" style={{ borderTop: `2px solid ${primaryColor}` }}>
                            <span>{t("pc.docProposta.totais.totalGeral")}</span>
                            <span style={{ color: primaryColor }}>{money(totals.total)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}
              </div>
            )
    );

    // `fallbackKey` é a chave do rótulo por omissão. O que a organização definiu (sectionLabel, ou um label
    // renomeado) fica como vem; só o rótulo de fábrica ou em falta segue o idioma. Em português, a regra de sempre.
    // Em inglês, um texto igual a um de fábrica em português (sem caixa nem acentos) traduz-se; outro fica como vem.
    const traduzSeDeFabrica = (valor: string, tipo: string, extras: string[] = []): string => {
      if (lingua === "pt") return valor;
      const alvo = normalizarTitulo(valor);
      const chave = [...(ROTULOS_DE_FABRICA[tipo] ?? []), ...extras].find(
        (k) => normalizarTitulo(traduzir("pt", PREFIXO_SECAO + k)) === alvo,
      );
      return chave ? t(PREFIXO_SECAO + chave) : valor;
    };

    const sectionLabel = (section: DocumentSection, fallbackKey: string): string => {
      const custom = section.settings?.sectionLabel;
      if (custom) return traduzSeDeFabrica(custom, section.type);
      const label = section.label;
      if (lingua === "pt") return label || t(fallbackKey);
      if (!label) return t(fallbackKey);
      return traduzSeDeFabrica(label, section.type);
    };

    const sectionTitle = (section: DocumentSection, fallbackKey: string) => {
      const label = sectionLabel(section, fallbackKey);
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

    const renderContentBlock = (section: DocumentSection, fallbackKey: string, html: string) => {
      if (!hasUsefulText(html)) return null;
      return (
        <section
          key={section.id || section.type}
          style={{ color: theme.textColor }}
        >
          {sectionTitle(section, fallbackKey)}
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
      const customTitle = section.settings?.customTitle;
      const title = customTitle
        ? traduzSeDeFabrica(customTitle, section.type, ["tituloProposta"])
        : sectionLabel(section, "pc.docProposta.secao.tituloProposta");
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
                  {formatarData(new Date(proposal.created_at), lingua, "numerico")}
                </p>
              )}
            </div>
            {showLogo && logoUrl && <img src={logoUrl} alt={company?.name || ""} className="h-14 w-auto object-contain" />}
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
          {sectionTitle(section, "pc.docProposta.secao.empresa")}
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
            {logoUrl && <img src={logoUrl} alt="" className="h-12 w-auto object-contain" />}
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
          {sectionTitle(section, "pc.docProposta.secao.cliente")}
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
        "pc.docProposta.secao.validade",
        t("pc.docProposta.validadeTexto", { data: formatarData(new Date(proposal.valid_until), lingua, "numerico") })
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
            ? sectionTitle(section, "pc.docProposta.secao.rodape")
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
          return renderContentBlock(section, "pc.docProposta.secao.descricao", section.settings?.content || proposal.description || "");
        case "notes":
          return renderContentBlock(section, "pc.docProposta.secao.notas", getNotesContent(section));
        case "validity":
          return renderValiditySection(section);
        case "quote_items":
          return renderQuoteItems();
        case "terms":
          return renderContentBlock(section, "pc.docProposta.secao.condicoes", template?.terms_conditions || "");
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

    return renderDocumentSections();
  };

  return (
    <div className="space-y-5" style={{ fontFamily }}>
      {/* Decision Banner - only for portal mode when can act */}
      {!isPreview && canActOnProposal && otpStep !== "verified" && (
        <div className="rounded-xl border bg-gradient-to-r from-primary/5 to-primary/10 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-foreground">{t("pc.docProposta.decisao.titulo")}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t("pc.docProposta.decisao.texto")}
              {validUntilFormatted && <>{" "}{t("pc.docProposta.decisao.validaAte")} <strong>{validUntilFormatted}</strong>.</>}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {onDownloadPdf && (
              <Button variant="outline" className="gap-2" onClick={onDownloadPdf}>
                <Download className="h-4 w-4" /> {t("pc.docProposta.baixarPdf")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Accepted Banner */}
      {isAccepted && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800 p-5">
          <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{t("pc.docProposta.aceite.titulo")}</h3>
          {proposal.accepted_at && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
              {t("pc.docProposta.aceite.em", { data: formatarDataHora(new Date(proposal.accepted_at), lingua, "longo") })}
            </p>
          )}
          {proposal.acceptance_ip && (
            <p className="text-xs text-emerald-500 dark:text-emerald-500 mt-1">
              {t("pc.docProposta.aceite.ip", { ip: proposal.acceptance_ip })}
            </p>
          )}
        </div>
      )}
      {isRejected && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
          <h3 className="text-lg font-bold text-destructive">{t("pc.docProposta.rejeitada.titulo")}</h3>
          {proposal.rejected_at && (
            <p className="text-sm text-destructive/80 mt-1">
              {t("pc.docProposta.rejeitada.em", { data: formatarDataHora(new Date(proposal.rejected_at), lingua, "longo") })}
            </p>
          )}
        </div>
      )}

      {/* Proposal Info Card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              {t("pc.docProposta.cartao.titulo", { titulo: String(proposal.title ?? "") })}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {t("pc.docProposta.cartao.criada", { numero: String(proposal.proposal_number ?? ""), data: formatarData(new Date(proposal.created_at), lingua, "numerico") })}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0" style={{ borderColor: `${primaryColor}50`, color: primaryColor }}>
            📋 {statusLabel ?? t("pc.docProposta.estadoOmissao")}
          </Badge>
        </CardHeader>
        <CardContent>
          {(() => {
            // Mirrors calculate_proposal_value_from_quotes() (DB trigger): once
            // at least one linked quote is accepted, only accepted quotes count
            // toward the total — rejected alternatives must not inflate what
            // the client sees. Before any decision, every non-rejected quote
            // counts as the pipeline estimate.
            const hasAcceptedQuote = (quotes || []).some((q: any) => q?.estado === "aceite");
            const valueQuotes = (quotes || []).filter((q: any) =>
              hasAcceptedQuote ? q?.estado === "aceite" : q?.estado !== "rejeitado"
            );
            const quotesSubtotalSum = valueQuotes.reduce((acc: number, q: any) => {
              const namedFees = quoteFees[q.id] || [];
              const namedFeesSubtotal = namedFees.reduce((s: number, f: any) => s + (Number(f.calculated_value) || 0), 0);
              const totalFeesField = Number(q?.total_fees) || 0;
              // `?? 23`, not `|| 23` — see comment on the single-quote footer above:
              // a legitimate 0% (auto-liquidação) must not be overridden by the default.
              const ivaRate = Number(q?.iva_rate ?? 23);
              const feesSubtotal = namedFeesSubtotal > 0
                ? namedFeesSubtotal
                : (totalFeesField > 0 ? totalFeesField / (1 + ivaRate / 100) : 0);
              return acc + (Number(q?.subtotal) || 0) + feesSubtotal;
            }, 0);
            const quotesTotalSum = valueQuotes.reduce((acc: number, q: any) => acc + (Number(q?.total) || 0), 0);
            const displayTotal = quotesTotalSum > 0 ? quotesTotalSum : Number(proposal.value) || 0;
            const displaySubtotal = quotesSubtotalSum > 0
              ? quotesSubtotalSum
              : (Number(proposal.subtotal) || (Number(proposal.value) || 0) / 1.23);
            return (
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("pc.docProposta.cartao.valorTotal")}</p>
              <p className="text-lg font-bold" style={{ color: primaryColor }}>{money(displayTotal)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("pc.docProposta.cartao.subtotalSemIva")}</p>
              <p className="text-lg font-bold">{money(displaySubtotal)}</p>
            </div>
            {proposal.valid_until && template?.show_validity !== false && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("pc.docProposta.cartao.validaAte")}</p>
                <p className="text-lg font-bold">{formatarData(new Date(proposal.valid_until), lingua, "numerico")}</p>
              </div>
            )}
            {commercial && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("pc.docProposta.cartao.comercial")}</p>
                <p className="text-lg font-bold">{commercial.name}</p>
              </div>
            )}
          </div>
            );
          })()}
        </CardContent>
      </Card>

      {versoes.length > 1
        ? versoes.map((versao, indice) => {
            const miolo = renderMiolo(versao, indice === 0);
            if (!miolo) return null;
            return (
              <section key={versao.codigo} lang={versao.codigo} className="space-y-5">
                <h2 className="text-lg font-semibold" style={{ color: primaryColor }}>
                  {obterIdioma(versao.codigo)?.nomeNativo ?? versao.codigo}
                </h2>
                {miolo}
              </section>
            );
          })
        : renderMiolo(versoes[0], true)}

      {/* OTP SMS Verification Section */}
      {canActOnProposal && (
        <ProposalPortalOtpSection
          t={t}
          isPreview={isPreview}
          otpStep={otpStep}
          otpCode={otpCode}
          maskedPhone={maskedPhone}
          otpError={otpError}
          otpCooldown={otpCooldown}
          actionLoading={actionLoading}
          onSendOtp={onSendOtp}
          onResendOtp={onResendOtp}
          onVerifyOtp={onVerifyOtp}
          onOtpCodeChange={onOtpCodeChange}
        />
      )}

      {/* Action Buttons - Bottom */}
      {canActOnProposal && otpStep === "idle" && (
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="text-center mb-4">
              <h3 className="text-xl font-bold">{t("pc.docProposta.acao.pronto")}</h3>
              {needsSelection ? (
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {t("pc.docProposta.acao.selecioneOrcamentos")}
                  </p>
                  <p className="text-sm font-semibold" style={{ color: primaryColor }}>
                    {hasMultipleQuotes 
                      ? t("pc.docProposta.acao.orcamentosSelecionados", { n: selectedQuoteIds.size, total: quotes.length })
                      : t("pc.docProposta.acao.secoesSelecionadas", { n: selectedSectionKeys.size, total: allSections.length })
                    } — {t("pc.docProposta.tabela.total")}: {money(selectedTotal)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">{t("pc.docProposta.acao.aceiteOuAltere")}</p>
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
                {t("pc.docProposta.acao.duvidas")}
              </Button>
              <Button
                variant="destructive"
                size="lg"
                className="gap-2"
                disabled={actionLoading}
                onClick={onRejectProposal}
              >
                {t("pc.docProposta.acao.rejeitar")}
              </Button>
              <Button
                size="lg"
                className="gap-2"
                style={{ backgroundColor: hasSelectedQuotes ? "#16a34a" : undefined }}
                disabled={actionLoading || (!isPreview && !hasSelectedQuotes)}
                onClick={onSendOtp}
              >
                <CheckSquare className="h-5 w-5 text-white" />
                <span className="text-white">{t("pc.docProposta.acao.aceitarAssinar")}</span>
              </Button>
            </div>
            {needsSelection && !hasSelectedQuotes && !isPreview && (
              <p className="text-center text-sm text-destructive mt-3">
                {t("pc.docProposta.acao.selecionePeloMenos", { tipo: t(hasMultipleSectionsInSingleQuote ? "pc.docProposta.acao.tipoSecao" : "pc.docProposta.acao.tipoOrcamento") })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Footer: Company + Commercial info */}
      <div className="text-center text-sm text-muted-foreground space-y-1 pt-4">
        {company && <p>{t("pc.docProposta.rodape.enviadaPor")} <strong>{company.name}</strong></p>}
        {commercial && (
          <>
            <p>{t("pc.docProposta.rodape.duvidas", { nome: String(commercial.name ?? "") })}
              {commercial.phone && <>{" "}<a href={`tel:${commercial.phone}`} className="font-medium hover:text-foreground">{commercial.phone}</a></>}
              {commercial.email && <>{" "}<a href={`mailto:${commercial.email}`} className="font-medium hover:text-foreground">{commercial.email}</a></>}
            </p>
          </>
        )}
      </div>

      {isPreview && (
        <p className="pt-2 text-center text-xs italic text-muted-foreground">
          {t("pc.docProposta.preview.aviso")}
        </p>
      )}
    </div>
  );
}
