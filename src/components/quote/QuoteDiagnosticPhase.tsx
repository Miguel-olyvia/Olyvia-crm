import { useCallback, useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Settings2, ArrowRight, Loader2 } from "lucide-react";
import {
  useQuoteDiagnostic,
  type QuoteDiagnosticArea,
  type SaveDiagnosticAreaInput,
} from "@/hooks/useQuoteDiagnostic";
import {
  useQuoteDiagnosticSuggestions,
  type DiagnosticSourceField,
  type DiagnosticSuggestion,
} from "@/hooks/useQuoteDiagnosticSuggestions";
import { DiagnosticSuggestionPanel } from "@/components/quote/DiagnosticSuggestionPanel";
import { QuoteSuggestionRulesDialog } from "@/components/quote/QuoteSuggestionRulesDialog";

const BLUR_DEBOUNCE_MS = 700;

/** Forma mínima de uma linha aceite na Fase 1, para o QuoteBuilder anexar ao
 * seu estado `lines` (com `visible_to_client: false`). O contrato de props
 * original só previa quoteId/organizationId/onPhase1Complete — este callback
 * é uma extensão aditiva e opcional, necessária para que uma sugestão aceite
 * chegue a alguma parte (ver nota no relatório final).
 *
 * Os campos de proveniência (diagnostic_area_id/source_field/source/...)
 * alimentam o `p_diagnostic_suggestions` que o QuoteBuilder envia a
 * `rpc_save_quote` — sem eles, `quote_diagnostic_area_suggestions` nunca
 * seria escrita. */
export interface AcceptedDiagnosticLine {
  product_id: string | null;
  service_id: string | null;
  catalog_item_id: string | null;
  descricao_snapshot: string;
  qt: number;
  unidade: string | null;
  diagnostic_area_id: string;
  source_field: DiagnosticSourceField;
  source: "rule" | "ai";
  rule_id?: string | null;
  ai_rationale?: string | null;
  ai_confidence?: number | null;
}

interface QuoteDiagnosticPhaseProps {
  quoteId: string;
  organizationId: string;
  onPhase1Complete: () => void;
  onAcceptSuggestionLine?: (line: AcceptedDiagnosticLine) => void;
}

function isAreaComplete(area: SaveDiagnosticAreaInput): boolean {
  return Boolean(
    area.nome_area?.trim() &&
      area.area_m2 != null &&
      area.demolir_descricao?.trim() &&
      area.proteger_descricao?.trim() &&
      area.intervencao_tipo?.trim() &&
      area.intervencao_descricao?.trim(),
  );
}

/**
 * Camada de estado local sobre `useQuoteDiagnosticSuggestions`: o resultado
 * da mutação é só de leitura, mas o painel precisa de qty editável e de
 * remover uma sugestão da lista ao rejeitá-la — sem isso reabrir a mesma
 * pesquisa.
 */
function SuggestionSlot({
  hook,
  slotKey,
  sourceField,
  onAccept,
  onRetry,
}: {
  hook: ReturnType<typeof useQuoteDiagnosticSuggestions>;
  slotKey: "demolir" | "proteger" | "intervencao";
  sourceField: DiagnosticSourceField;
  onAccept: (suggestion: DiagnosticSuggestion) => void;
  onRetry: () => void;
}) {
  const [visible, setVisible] = useState<DiagnosticSuggestion[]>([]);

  useEffect(() => {
    setVisible(hook.suggestions);
  }, [hook.suggestions]);

  return (
    <DiagnosticSuggestionPanel
      suggestions={visible}
      isLoadingRules={hook.isLoadingRules}
      isLoadingAiFallback={hook.isLoadingAiFallback}
      aiError={hook.aiError}
      onAccept={(s) => {
        onAccept(s);
        setVisible((prev) => prev.filter((v) => v.client_id !== s.client_id));
      }}
      onReject={(s) => setVisible((prev) => prev.filter((v) => v.client_id !== s.client_id))}
      onQtyChange={(s, newQty) =>
        setVisible((prev) => prev.map((v) => (v.client_id === s.client_id ? { ...v, qty: newQty } : v)))
      }
      onRetry={onRetry}
    />
  );
}

function AreaCard({
  area,
  organizationId,
  onSave,
  onRemove,
  onAcceptSuggestionLine,
}: {
  area: QuoteDiagnosticArea;
  organizationId: string;
  onSave: (areaId: string, data: SaveDiagnosticAreaInput) => void;
  onRemove: (areaId: string) => void;
  onAcceptSuggestionLine?: (line: AcceptedDiagnosticLine) => void;
}) {
  const [form, setForm] = useState<SaveDiagnosticAreaInput>({
    nome_area: area.nome_area,
    area_m2: area.area_m2,
    demolir_descricao: area.demolir_descricao,
    demolir_m2: area.demolir_m2,
    proteger_descricao: area.proteger_descricao,
    intervencao_tipo: area.intervencao_tipo,
    intervencao_descricao: area.intervencao_descricao,
  });

  const set = <K extends keyof SaveDiagnosticAreaInput>(key: K, value: SaveDiagnosticAreaInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Grava (upsert) 700ms depois da última alteração — não a cada tecla.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onSave(area.id, { ...form, status: isAreaComplete(form) ? "completo" : "em_preenchimento" });
    }, BLUR_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  // Um slot de sugestões por campo-gatilho (demolir / proteger / intervenção).
  const demolirSuggestions = useQuoteDiagnosticSuggestions();
  const protegerSuggestions = useQuoteDiagnosticSuggestions();
  const intervencaoSuggestions = useQuoteDiagnosticSuggestions();

  const blurTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const timers = blurTimersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const requestSuggestions = useCallback(
    (
      slotKey: "demolir" | "proteger" | "intervencao",
      sourceField: DiagnosticSourceField,
      hook: ReturnType<typeof useQuoteDiagnosticSuggestions>,
      latestForm: SaveDiagnosticAreaInput,
    ) => {
      if (blurTimersRef.current[slotKey]) clearTimeout(blurTimersRef.current[slotKey]);
      blurTimersRef.current[slotKey] = setTimeout(() => {
        hook.getSuggestions({
          diagnosticAreaId: area.id,
          sourceField,
          organizationId,
          areaData: {
            area_m2: latestForm.area_m2 ?? null,
            demolir_descricao: latestForm.demolir_descricao ?? null,
            proteger_descricao: latestForm.proteger_descricao ?? null,
            intervencao_tipo: latestForm.intervencao_tipo ?? null,
            intervencao_descricao: latestForm.intervencao_descricao ?? null,
          },
        });
      }, BLUR_DEBOUNCE_MS);
    },
    [area.id, organizationId],
  );

  const handleAccept = (suggestion: DiagnosticSuggestion, sourceField: DiagnosticSourceField) => {
    onAcceptSuggestionLine?.({
      product_id: suggestion.target_type === "product" ? suggestion.product_id ?? null : null,
      service_id: suggestion.target_type === "service" ? suggestion.service_id ?? null : null,
      catalog_item_id: suggestion.target_type === "catalog_item" ? suggestion.catalog_item_id ?? null : null,
      descricao_snapshot: suggestion.descricao,
      qt: suggestion.qty,
      unidade: suggestion.unidade ?? null,
      diagnostic_area_id: area.id,
      source_field: sourceField,
      source: suggestion.source,
      rule_id: suggestion.rule_id ?? null,
      ai_rationale: suggestion.rationale ?? null,
      ai_confidence: suggestion.confidence ?? null,
    });
  };

  const renderSuggestionSlot = (
    hook: ReturnType<typeof useQuoteDiagnosticSuggestions>,
    slotKey: "demolir" | "proteger" | "intervencao",
    sourceField: DiagnosticSourceField,
  ) => (
    <SuggestionSlot
      hook={hook}
      slotKey={slotKey}
      sourceField={sourceField}
      onAccept={(s) => handleAccept(s, sourceField)}
      onRetry={() => requestSuggestions(slotKey, sourceField, hook, form)}
    />
  );

  return (
    <Card>
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 space-y-1.5">
            <Label>Nome da área</Label>
            <Input
              value={form.nome_area || ""}
              onChange={(e) => set("nome_area", e.target.value)}
              placeholder="Ex: Casa de banho principal"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive shrink-0 mt-6"
            onClick={() => onRemove(area.id)}
            aria-label="Remover área"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label>Área (m²)</Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={form.area_m2 ?? ""}
            onChange={(e) => set("area_m2", e.target.value === "" ? null : Number(e.target.value))}
            className="max-w-[160px]"
          />
        </div>

        <div className="space-y-1.5">
          <Label>O que é necessário demolir</Label>
          <Textarea
            value={form.demolir_descricao || ""}
            onChange={(e) => set("demolir_descricao", e.target.value)}
            onBlur={() => requestSuggestions("demolir", "demolir", demolirSuggestions, form)}
            rows={2}
          />
          {renderSuggestionSlot(demolirSuggestions, "demolir", "demolir")}
        </div>

        <div className="space-y-1.5">
          <Label>O que é necessário proteger</Label>
          <Textarea
            value={form.proteger_descricao || ""}
            onChange={(e) => set("proteger_descricao", e.target.value)}
            onBlur={() => requestSuggestions("proteger", "proteger", protegerSuggestions, form)}
            rows={2}
          />
          {renderSuggestionSlot(protegerSuggestions, "proteger", "proteger")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tipo de intervenção</Label>
            <Input
              value={form.intervencao_tipo || ""}
              onChange={(e) => set("intervencao_tipo", e.target.value)}
              onBlur={() => requestSuggestions("intervencao", "intervencao", intervencaoSuggestions, form)}
              placeholder="Ex: demolição, remodelação..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição da intervenção</Label>
            <Input
              value={form.intervencao_descricao || ""}
              onChange={(e) => set("intervencao_descricao", e.target.value)}
              onBlur={() => requestSuggestions("intervencao", "intervencao", intervencaoSuggestions, form)}
            />
          </div>
        </div>
        {renderSuggestionSlot(intervencaoSuggestions, "intervencao", "intervencao")}

        <div className="flex justify-end">
          <Badge variant={isAreaComplete(form) ? "default" : "secondary"} className="text-xs">
            {isAreaComplete(form) ? "Completa" : "Por preencher"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function QuoteDiagnosticPhase({
  quoteId,
  organizationId,
  onPhase1Complete,
  onAcceptSuggestionLine,
}: QuoteDiagnosticPhaseProps) {
  const { toast } = useToast();
  const {
    areas,
    isLoadingAreas,
    saveArea,
    completePhase1,
    isCompletingPhase1,
    totalAreas,
    completeAreas,
    allAreasComplete,
    refetchAreas,
  } = useQuoteDiagnostic(quoteId);

  const [rulesDialogOpen, setRulesDialogOpen] = useState(false);
  const [openAccordionItems, setOpenAccordionItems] = useState<string[]>([]);

  useEffect(() => {
    // Abre todas as áreas por omissão, sem sobrepor uma escolha manual do
    // utilizador depois da primeira carga.
    if (areas.length > 0 && openAccordionItems.length === 0) {
      setOpenAccordionItems(areas.map((a) => a.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas.length]);

  const handleSaveArea = async (areaId: string, data: SaveDiagnosticAreaInput) => {
    try {
      await saveArea({ id: areaId, ...data });
    } catch (err: any) {
      captureFlowError(err, "quote-lifecycle");
      toast({ title: "Erro ao gravar área", description: err.message, variant: "destructive" });
    }
  };

  const handleAddArea = async () => {
    try {
      await saveArea({
        organization_id: organizationId,
        phase: "fase_1",
        nome_area: "Nova área",
        status: "em_preenchimento",
        sort_order: areas.length,
      });
    } catch (err: any) {
      captureFlowError(err, "quote-lifecycle");
      toast({ title: "Erro ao criar área", description: err.message, variant: "destructive" });
    }
  };

  const handleRemoveArea = async (areaId: string) => {
    if (!window.confirm("Remover esta área do diagnóstico?")) return;
    try {
      // Sem RPC de eliminação no contrato desta fase — apaga diretamente,
      // assumindo que a RLS da tabela restringe à organização do orçamento
      // (ver nota no relatório final).
      const { error } = await supabase.from("quote_diagnostic_areas").delete().eq("id", areaId);
      if (error) throw error;
      refetchAreas();
    } catch (err: any) {
      captureFlowError(err, "quote-lifecycle");
      toast({ title: "Erro ao remover área", description: err.message, variant: "destructive" });
    }
  };

  const handleCompletePhase1 = async () => {
    try {
      await completePhase1();
      onPhase1Complete();
    } catch (err: any) {
      captureFlowError(err, "quote-lifecycle");
      toast({
        title: "Não é possível avançar",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto py-4 max-w-4xl pb-28">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Diagnóstico da obra — Fase 1</h1>
          <p className="text-sm text-muted-foreground">
            Preencha cada área a intervencionar. As sugestões de itens ficam só visíveis internamente — nunca no PDF ou portal do cliente.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setRulesDialogOpen(true)}>
          <Settings2 className="h-4 w-4 mr-1" /> Gerir regras de sugestão
        </Button>
      </div>

      {isLoadingAreas ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 mr-2 animate-spin" /> A carregar diagnóstico...
        </div>
      ) : (
        <>
          <Accordion
            type="multiple"
            value={openAccordionItems}
            onValueChange={setOpenAccordionItems}
            className="space-y-3"
          >
            {areas.map((area) => (
              <AccordionItem key={area.id} value={area.id} className="border rounded-lg px-3">
                <AccordionTrigger className="hover:no-underline">
                  <span className="flex items-center gap-2">
                    {area.nome_area || "Área sem nome"}
                    <Badge variant={area.status === "completo" ? "default" : "secondary"} className="text-xs">
                      {area.status === "completo" ? "Completa" : "Por preencher"}
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <AreaCard
                    area={area}
                    organizationId={organizationId}
                    onSave={handleSaveArea}
                    onRemove={handleRemoveArea}
                    onAcceptSuggestionLine={onAcceptSuggestionLine}
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <Button type="button" variant="outline" className="mt-4" onClick={handleAddArea}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar área
          </Button>
        </>
      )}

      <QuoteSuggestionRulesDialog
        open={rulesDialogOpen}
        onOpenChange={setRulesDialogOpen}
        organizationId={organizationId}
      />

      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur px-6 py-3 flex items-center justify-between z-40">
        <span className="text-sm text-muted-foreground">
          Fase 1: {completeAreas} de {totalAreas} áreas completas
        </span>
        <Button type="button" onClick={handleCompletePhase1} disabled={!allAreasComplete || isCompletingPhase1}>
          {isCompletingPhase1 ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
          Avançar para itens do orçamento
        </Button>
      </div>
    </div>
  );
}
