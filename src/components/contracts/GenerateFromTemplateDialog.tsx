import { useState, useMemo } from "react";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Eye, Sparkles, FileText, Loader2, CheckCircle, ChevronRight, Star, ExternalLink, Pencil,
} from "lucide-react";
import { substituteVariables, type ContractVariableData } from "@/utils/contractVariables";
import { gatherContractData, applyQuoteItemsToken } from "@/components/contracts/contractDocument";
import { useNavigate } from "react-router-dom";

interface Template {
  id: string;
  name: string;
  body_html: string;
  doc_settings?: any;
  is_default: boolean;
}

interface GenerateFromTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: Template[];
  contract: any;
  orgId: string | undefined;
  hasExistingBody: boolean;
  onGenerated: (html: string, templateId: string, templateName: string) => void;
}

type Step = "select" | "preview";

export function GenerateFromTemplateDialog({
  open, onOpenChange, templates, contract, orgId, hasExistingBody, onGenerated,
}: GenerateFromTemplateDialogProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("select");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [finalHtml, setFinalHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [quickPreviewHtml, setQuickPreviewHtml] = useState("");

  const defaultTemplate = useMemo(
    () => templates.find(t => t.is_default) || null,
    [templates]
  );

  const handleReset = () => {
    setStep("select");
    setSelectedTemplate(null);
    setPreviewHtml("");
    setFinalHtml("");
    setPreviewingId(null);
    setQuickPreviewHtml("");
  };

  const handleClose = (v: boolean) => {
    if (!v) handleReset();
    onOpenChange(v);
  };

  const handleSelectTemplate = async (template: Template) => {
    setLoading(true);
    setSelectedTemplate(template);
    try {
      const variableData = await gatherContractData(contract, orgId);
      const templateDocSettings = template.doc_settings || {};
      const primaryColor = templateDocSettings?.primary_color || "#7C3AED";
      const baseWithItems = applyQuoteItemsToken(template.body_html, variableData, templateDocSettings, primaryColor);
      const highlightedHtml = substituteVariables(baseWithItems, variableData, true);
      setPreviewHtml(highlightedHtml);
      // Pass pre-substitution HTML so handleGenerated can detect ALL custom tokens
      // (including "fixed" vars with defaults). finalizeGeneration applies substituteVariables.
      setFinalHtml(baseWithItems);
      setStep("preview");
    } catch (err: any) {
      toast.error("Erro ao preparar preview: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!selectedTemplate || !finalHtml) return;
    onGenerated(finalHtml, selectedTemplate.id, selectedTemplate.name);
    handleClose(false);
  };

  const handleQuickPreview = async (template: Template) => {
    if (previewingId === template.id) {
      setPreviewingId(null);
      setQuickPreviewHtml("");
      return;
    }
    setPreviewingId(template.id);
    // Show first ~500 chars of raw HTML as text preview
    const snippet = template.body_html?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) || "";
    setQuickPreviewHtml(snippet);
  };

  const countClauses = (html: string): number => {
    if (!html) return 0;
    const patterns = [
      /PRIMEIRA/gi, /SEGUNDA/gi, /TERCEIRA/gi, /QUARTA/gi, /QUINTA/gi,
      /SEXTA/gi, /SÉTIMA/gi, /OITAVA/gi, /NONA/gi, /DÉCIMA/gi,
      /Cláusula/gi, /CLÁUSULA/gi,
    ];
    const matches = new Set<number>();
    patterns.forEach(p => {
      let m;
      while ((m = p.exec(html)) !== null) {
        matches.add(m.index);
      }
    });
    return matches.size || 0;
  };

  // No templates state
  if (templates.length === 0) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Gerar Contrato
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-8 space-y-4">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <div>
              <p className="font-medium text-sm">Sem minutas criadas</p>
              <p className="text-xs text-muted-foreground mt-1">
                Crie a sua primeira minuta de contrato em Templates para poder gerar contratos automaticamente.
              </p>
            </div>
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { handleClose(false); navigate("/contract-templates"); }}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Ir para Templates
              </Button>
              <Button variant="outline" size="sm" onClick={() => { handleClose(false); }}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Escrever manualmente
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {step === "select" ? "Seleccionar Minuta" : "Preview do Contrato"}
          </DialogTitle>
        </DialogHeader>

        {step === "select" && (
          <div className="flex flex-col gap-4 overflow-hidden">
            {/* Warning for existing body */}
            {hasExistingBody && (
              <div className="text-xs text-orange-600 bg-orange-50 dark:bg-orange-950/30 p-2.5 rounded-lg flex items-start gap-2">
                <span className="mt-0.5">⚠️</span>
                <span>O corpo atual do contrato será substituído pelo conteúdo da minuta seleccionada com as variáveis preenchidas.</span>
              </div>
            )}

            {/* Suggestion for default template */}
            {defaultTemplate && (
              <div className="border border-primary/30 bg-primary/5 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="h-4.5 w-4.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Sugerimos: {defaultTemplate.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Esta é a minuta padrão da sua organização
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSelectTemplate(defaultTemplate)}
                    disabled={loading}
                    className="flex-shrink-0 gap-1.5"
                  >
                    {loading && selectedTemplate?.id === defaultTemplate.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5" />
                    )}
                    Usar esta
                  </Button>
                </div>
              </div>
            )}

            <Separator />

            {/* Template list */}
            <ScrollArea className="flex-1 max-h-[400px]">
              <div className="space-y-2 pr-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Minutas disponíveis ({templates.length})
                </p>
                {templates.map(t => {
                  const clauses = countClauses(t.body_html);
                  return (
                    <div key={t.id}>
                      <div
                        className="group border rounded-lg p-3 hover:border-primary/40 hover:bg-accent/30 transition-colors cursor-pointer"
                        onClick={() => handleSelectTemplate(t)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate">{t.name}</p>
                                {t.is_default && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5 flex-shrink-0">
                                    <Star className="h-2.5 w-2.5" /> Default
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5">
                                {clauses > 0 && (
                                  <span className="text-[11px] text-muted-foreground">{clauses} cláusulas</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => { e.stopPropagation(); handleQuickPreview(t); }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      </div>
                      {/* Quick preview */}
                      {previewingId === t.id && quickPreviewHtml && (
                        <div className="ml-11 mt-1 mb-2 p-3 bg-muted/50 rounded-md border border-dashed">
                          <p className="text-xs text-muted-foreground line-clamp-4">{quickPreviewHtml}…</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-col gap-4 overflow-hidden flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("select")} className="gap-1.5 text-xs">
                  ← Voltar
                </Button>
                <Separator orientation="vertical" className="h-5" />
                <span className="text-sm text-muted-foreground">
                  Minuta: <span className="font-medium text-foreground">{selectedTemplate?.name}</span>
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#d1fae5" }} /> Preenchido
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#fef3c7" }} /> Em falta
                </span>
              </div>
            </div>

            {/* A4-style preview */}
            <ScrollArea className="flex-1 max-h-[55vh]">
              <div className="mx-auto bg-white dark:bg-gray-950 shadow-lg border rounded-lg" style={{ maxWidth: "210mm", padding: "20mm 25mm" }}>
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml) }}
                />
              </div>
            </ScrollArea>

            <div className="flex items-center justify-between pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setStep("select")}>
                Escolher outra
              </Button>
              <Button onClick={handleConfirm} className="gap-1.5">
                <CheckCircle className="h-4 w-4" /> Confirmar e gerar
              </Button>
            </div>
          </div>
        )}

        {loading && step === "select" && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center rounded-lg">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
