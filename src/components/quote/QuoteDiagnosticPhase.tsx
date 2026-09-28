import { useEffect, useRef, useState } from "react";
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
import { Plus, Trash2, Wrench, ArrowRight, Loader2 } from "lucide-react";
import {
  useQuoteDiagnostic,
  type QuoteDiagnosticArea,
  type SaveDiagnosticAreaInput,
} from "@/hooks/useQuoteDiagnostic";
import DiagnosticServicePicker, {
  type DiagnosticServicePickerService,
} from "@/components/quote/DiagnosticServicePicker";

const BLUR_DEBOUNCE_MS = 700;

/** Campo de origem de um registo já aceite para a área — mantido aqui como
 * tipo local desde que o motor de sugestões por regra/IA foi removido (ver
 * migration 20261130160000_service_labor_model_fix_and_manual_diagnostic_source.sql
 * para a origem "manual"). */
type DiagnosticSourceField = "area_m2" | "demolir" | "proteger" | "intervencao";

/** Uma sugestão já aceite, tal como fica gravada (auto-suficiente) em
 * `quote_diagnostic_area_suggestions` — usada só para mostrar a lista de "já
 * registado para a ordem de trabalho" dentro de cada área. Inclui a origem
 * "manual" (escolha direta de um serviço, sem regra nem IA — ver migration
 * 20261130160000_service_labor_model_fix_and_manual_diagnostic_source.sql). */
interface AcceptedSuggestionRow {
  id: string;
  source: "rule" | "ai" | "manual";
  source_field: DiagnosticSourceField | "servico_direto";
  target_type: "product" | "service" | "catalog_item" | null;
  descricao: string | null;
  unidade: string | null;
  suggested_qty: number;
}

interface QuoteDiagnosticPhaseProps {
  quoteId: string;
  organizationId: string;
  onPhase1Complete: () => void;
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

const ACCEPTED_SOURCE_FIELD_LABELS: Record<DiagnosticSourceField | "servico_direto", string> = {
  area_m2: "Área",
  demolir: "A demolir",
  proteger: "A proteger",
  intervencao: "Intervenção",
  servico_direto: "Serviço direto",
};

/** Lista, só de leitura (+ remover), do que já foi registado para esta área
 * — a fonte de dados para a futura nota de encomenda/ordem de trabalho.
 * Nunca cria nem depende de quote_lines. */
function AcceptedSuggestionsList({
  areaId,
  refreshKey,
  onRemoved,
}: {
  areaId: string;
  refreshKey: number;
  onRemoved: () => void;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<AcceptedSuggestionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("quote_diagnostic_area_suggestions")
          .select("id, source, source_field, target_type, descricao, unidade, suggested_qty")
          .eq("diagnostic_area_id", areaId)
          .order("created_at", { ascending: true });
        if (error) throw error;
        if (!cancelled) setRows((data as AcceptedSuggestionRow[] | null) || []);
      } catch (err) {
        captureFlowError(err, "quote-lifecycle");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [areaId, refreshKey]);

  const handleRemove = async (id: string) => {
    try {
      const { error } = await supabase.from("quote_diagnostic_area_suggestions").delete().eq("id", id);
      if (error) throw error;
      setRows((prev) => prev.filter((r) => r.id !== id));
      onRemoved();
    } catch (err: any) {
      captureFlowError(err, "quote-lifecycle");
      toast({ title: "Erro ao remover registo", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading || rows.length === 0) return null;

  return (
    <div className="space-y-1.5 rounded-md border bg-muted/30 p-2.5">
      <p className="text-xs font-medium text-muted-foreground">
        Já registado para a ordem de trabalho
      </p>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {ACCEPTED_SOURCE_FIELD_LABELS[row.source_field]}
            </Badge>
            <span className="flex-1 truncate">{row.descricao || "(sem descrição)"}</span>
            <span className="shrink-0 text-muted-foreground">
              {row.suggested_qty}
              {row.unidade ? ` ${row.unidade}` : ""}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => handleRemove(row.id)}
              aria-label="Remover registo"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AreaCard({
  area,
  organizationId,
  onSave,
  onRemove,
}: {
  area: QuoteDiagnosticArea;
  organizationId: string;
  onSave: (areaId: string, data: SaveDiagnosticAreaInput) => void;
  onRemove: (areaId: string) => void;
}) {
  const { toast } = useToast();
  // Incrementado sempre que uma sugestão é aceite/removida, para forçar
  // AcceptedSuggestionsList a reler a tabela (é uma leitura direta, não um
  // estado partilhado — mais simples do que sincronizar duas cópias).
  const [acceptedRefreshKey, setAcceptedRefreshKey] = useState(0);
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

  // Depois de aceite uma sugestão de serviço (regra/IA ou escolha manual —
  // ver handleAcceptManualService), lê a ficha técnica desse serviço
  // (public.service_materials — migration
  // 20261130130000_service_technical_sheet_materials.sql) e regista cada
  // material automaticamente como se fosse uma sugestão de produto aceite —
  // sem passar pelas regras/IA. Best effort: nunca lança, só regista o erro
  // e não bloqueia o fluxo normal (o registo do próprio serviço já teve
  // sucesso nesse ponto).
  // `areaM2`: área atual da zona (valor do formulário, ver
  // handleAcceptManualService), usada para a regra de três
  // simples por material (reference_area_m2/reference_quantity — migration
  // 20261130170000_service_technical_sheet_quantity_per_area.sql, já
  // aplicada à BD). Quando null (área ainda não preenchida) ou quando o
  // material não tem a regra configurada, mantém-se a quantity fixa da
  // linha, tal como antes.
  const acceptServiceTechnicalSheetMaterials = async (
    serviceId: string,
    areaM2: number | null,
  ): Promise<number> => {
    try {
      const { data, error } = await (supabase as any)
        .from("service_materials")
        .select(
          "product_id, quantity, uom_id, reference_area_m2, reference_quantity, product:products(name), uom:uom_id(code)",
        )
        .eq("service_id", serviceId)
        .is("deleted_at", null);
      if (error) throw error;

      const rows = (data as Array<{
        product_id: string;
        quantity: number;
        uom_id: string | null;
        reference_area_m2: number | null;
        reference_quantity: number | null;
        product?: { name: string } | null;
        uom?: { code: string } | null;
      }> | null) || [];

      for (const row of rows) {
        let qty = Number(row.quantity) || 0;
        if (
          row.reference_area_m2 != null &&
          row.reference_quantity != null &&
          row.reference_area_m2 > 0 &&
          areaM2 != null
        ) {
          qty = Math.ceil((row.reference_quantity / row.reference_area_m2) * areaM2);
        }

        const { error: acceptError } = await supabase.rpc("rpc_record_diagnostic_suggestion_accepted", {
          p_diagnostic_area_id: area.id,
          p_source: "manual",
          p_source_field: "servico_direto",
          p_target_type: "product",
          p_descricao: row.product?.name || "Material da ficha técnica",
          p_qty: qty,
          p_product_id: row.product_id,
          p_service_id: null,
          p_catalog_item_id: null,
          p_unidade: row.uom?.code ?? null,
          p_rule_id: null,
          p_ai_rationale: null,
          p_ai_confidence: null,
        });
        if (acceptError) throw acceptError;
      }

      return rows.length;
    } catch (err) {
      captureFlowError(err, "quote-lifecycle");
      return 0;
    }
  };

  // Escolha direta de um serviço do catálogo (sem regra nem IA envolvidas —
  // ver DiagnosticServicePicker.tsx). Reaproveita a mesma RPC auto-suficiente
  // e a mesma lógica de materiais da ficha técnica já usada para sugestões
  // aceites de regra/IA.
  const handleAcceptManualService = async (service: DiagnosticServicePickerService) => {
    try {
      // Usa o valor do formulário e só depois o persistido: a gravação da área
      // tem debounce de 700ms, pelo que area.area_m2 pode ainda estar vazio
      // quando o utilizador adiciona o serviço logo a seguir a escrever a área.
      const areaM2 = form.area_m2 ?? area.area_m2 ?? null;

      // Quantidade sugerida do próprio serviço pela regra de três simples
      // (technical_sheet_reference_area_m2/technical_sheet_reference_quantity
      // — migration 20261130170000_service_technical_sheet_quantity_per_area.sql,
      // já aplicada à BD). Estes 2 campos não vêm do DiagnosticServicePicker
      // (useBundleCatalogItems não os devolve) — leitura extra por id, tal
      // como acceptServiceTechnicalSheetMaterials já faz para os materiais.
      // Sem área definida ou sem a regra configurada, mantém-se o
      // comportamento atual (quantidade fixa em 1).
      let qty = 1;
      if (areaM2 != null) {
        const { data: serviceData, error: serviceError } = await (supabase as any)
          .from("services")
          .select("technical_sheet_reference_area_m2, technical_sheet_reference_quantity")
          .eq("id", service.id)
          .maybeSingle();
        if (serviceError) throw serviceError;

        const refArea = serviceData?.technical_sheet_reference_area_m2 ?? null;
        const refQuantity = serviceData?.technical_sheet_reference_quantity ?? null;
        if (refArea != null && refQuantity != null && refArea > 0) {
          qty = Math.ceil((refQuantity / refArea) * areaM2);
        }
      }

      const { error } = await supabase.rpc("rpc_record_diagnostic_suggestion_accepted", {
        p_diagnostic_area_id: area.id,
        p_source: "manual",
        p_source_field: "servico_direto",
        p_target_type: "service",
        p_descricao: service.name,
        p_qty: qty,
        p_product_id: null,
        p_service_id: service.id,
        p_catalog_item_id: null,
        p_unidade: null,
        p_rule_id: null,
        p_ai_rationale: null,
        p_ai_confidence: null,
      });
      if (error) throw error;

      setAcceptedRefreshKey((k) => k + 1);

      const materialsCount = await acceptServiceTechnicalSheetMaterials(service.id, areaM2);
      if (materialsCount > 0) {
        setAcceptedRefreshKey((k) => k + 1);
      }

      toast({
        title: "Serviço adicionado",
        description:
          materialsCount > 0
            ? `${materialsCount} material(is) da ficha técnica adicionado(s).`
            : "Sem materiais na ficha técnica.",
      });
    } catch (err: any) {
      captureFlowError(err, "quote-lifecycle");
      toast({ title: "Erro ao adicionar serviço", description: err.message, variant: "destructive" });
    }
  };

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

        <AcceptedSuggestionsList
          areaId={area.id}
          refreshKey={acceptedRefreshKey}
          onRemoved={() => setAcceptedRefreshKey((k) => k + 1)}
        />

        {/* A área fica acima dos serviços: é ela que define as quantidades dos
            materiais da ficha técnica (regra de três simples). */}
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Área (m²)</Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={form.area_m2 ?? ""}
            onChange={(e) => set("area_m2", e.target.value === "" ? null : Number(e.target.value))}
            className="max-w-[160px]"
          />
        </div>

        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Wrench className="h-4 w-4 text-primary" /> Serviços necessários
              </p>
              <p className="text-xs text-muted-foreground">
                Escolha diretamente os serviços do catálogo necessários para esta área.
              </p>
            </div>
            <DiagnosticServicePicker
              organizationId={organizationId}
              onSelect={handleAcceptManualService}
              disabled={form.area_m2 == null}
            />
          </div>
          {form.area_m2 == null && (
            <p className="text-xs text-muted-foreground">
              Preencha a área (m²) para calcular as quantidades dos materiais.
            </p>
          )}
        </div>

        <div className="space-y-3 pt-1">
          <p className="text-xs text-muted-foreground">
            Nota descritiva (uso interno, não aparece no PDF/portal).
          </p>

          <div className="space-y-1.5">
            <Label className="text-muted-foreground">O que é necessário demolir</Label>
            <Textarea
              value={form.demolir_descricao || ""}
              onChange={(e) => set("demolir_descricao", e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-muted-foreground">O que é necessário proteger</Label>
            <Textarea
              value={form.proteger_descricao || ""}
              onChange={(e) => set("proteger_descricao", e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Tipo de intervenção</Label>
              <Input
                value={form.intervencao_tipo || ""}
                onChange={(e) => set("intervencao_tipo", e.target.value)}
                placeholder="Ex: demolição, remodelação..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Descrição da intervenção</Label>
              <Input
                value={form.intervencao_descricao || ""}
                onChange={(e) => set("intervencao_descricao", e.target.value)}
              />
            </div>
          </div>
        </div>

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
