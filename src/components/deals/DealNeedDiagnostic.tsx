import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Package, Wrench, X, Loader2, Stethoscope } from "lucide-react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import DiagnosticServicePicker, { type DiagnosticServicePickerService } from "@/components/quote/DiagnosticServicePicker";

/**
 * Aba "Diagnóstico" do diálogo Editar Necessidade (DealNeedsSection.tsx).
 *
 * Uma necessidade = uma área de diagnóstico. Substitui, para o fluxo do deal,
 * o modelo de cartões por área do QuoteDiagnosticPhase.tsx (que continua
 * intocado).
 *
 * Divisão de responsabilidades:
 *   · os 6 campos de texto/número vivem no estado do pai (vão para as colunas
 *     diag_* de deal_needs no payload da RPC rpc_update_deal_needs);
 *   · os serviços escolhidos no picker entram em `linkedItems` do pai (aba
 *     Itens) — é isso que os faz viajar para o orçamento pela importação que
 *     já existe;
 *   · os materiais da ficha técnica são SÓ INFORMATIVOS para o armazém: não
 *     entram no orçamento, não entram em linkedItems e não somam ao valor da
 *     necessidade. O pai persiste-os em deal_need_diagnostic_materials.
 *
 * Este componente só faz as leituras necessárias para explodir a ficha técnica
 * do serviço escolhido e devolve tudo ao pai via onServiceAccepted.
 */

/** Material da ficha técnica, em memória, antes/depois de persistido. */
export interface DealNeedDiagnosticMaterial {
  /** id da linha em deal_need_diagnostic_materials, ou `temp-...` enquanto não gravado. */
  id: string;
  service_id: string | null;
  product_id: string | null;
  descricao: string;
  quantity: number;
  unidade: string | null;
}

/** Serviço já aceite (derivado de linkedItems do pai). */
export interface DealNeedDiagnosticService {
  key: string;
  service_id: string;
  name: string;
  quantity: number;
}

export interface DealNeedDiagnosticAcceptedService {
  service_id: string;
  name: string;
  /** preço unitário de retalho, para o cálculo de valor da aba Itens. */
  price?: number;
  quantity: number;
  materials: DealNeedDiagnosticMaterial[];
}

interface DealNeedDiagnosticProps {
  organizationId: string | null;
  readOnly?: boolean;

  areaM2: string;
  onAreaM2Change: (value: string) => void;
  demolirDescricao: string;
  onDemolirDescricaoChange: (value: string) => void;
  demolirM2: string;
  onDemolirM2Change: (value: string) => void;
  protegerDescricao: string;
  onProtegerDescricaoChange: (value: string) => void;
  intervencaoTipo: string;
  onIntervencaoTipoChange: (value: string) => void;
  intervencaoDescricao: string;
  onIntervencaoDescricaoChange: (value: string) => void;

  services: DealNeedDiagnosticService[];
  onServiceAccepted: (accepted: DealNeedDiagnosticAcceptedService) => void;
  onRemoveService: (serviceId: string) => void;

  materials: DealNeedDiagnosticMaterial[];
  onRemoveMaterial: (materialId: string) => void;
}

interface ServiceMaterialRow {
  product_id: string;
  quantity: number | null;
  uom_id: string | null;
  reference_area_m2: number | null;
  reference_quantity: number | null;
  product?: { name: string } | null;
  uom?: { code: string } | null;
}

let tempMaterialSeq = 0;
const nextTempMaterialId = () => `temp-mat-${Date.now()}-${tempMaterialSeq++}`;

export function DealNeedDiagnostic({
  organizationId,
  readOnly = false,
  areaM2,
  onAreaM2Change,
  demolirDescricao,
  onDemolirDescricaoChange,
  demolirM2,
  onDemolirM2Change,
  protegerDescricao,
  onProtegerDescricaoChange,
  intervencaoTipo,
  onIntervencaoTipoChange,
  intervencaoDescricao,
  onIntervencaoDescricaoChange,
  services,
  onServiceAccepted,
  onRemoveService,
  materials,
  onRemoveMaterial,
}: DealNeedDiagnosticProps) {
  const { toast } = useToast();
  const [loadingService, setLoadingService] = useState(false);

  const parsedArea = areaM2.trim() === "" ? null : Number(areaM2);
  const effectiveArea = parsedArea != null && Number.isFinite(parsedArea) && parsedArea > 0 ? parsedArea : null;

  const handlePickService = async (service: DiagnosticServicePickerService) => {
    if (readOnly) return;
    setLoadingService(true);
    try {
      // 1. Quantidade do próprio serviço pela regra de três simples
      //    (technical_sheet_reference_area_m2 / technical_sheet_reference_quantity),
      //    mesma regra do QuoteDiagnosticPhase.tsx. Sem área definida ou sem a
      //    regra configurada, fica 1.
      let qty = 1;
      const { data: serviceData, error: serviceError } = await supabase
        .from("services")
        .select("technical_sheet_reference_area_m2, technical_sheet_reference_quantity")
        .eq("id", service.id)
        .maybeSingle();
      if (serviceError) throw serviceError;

      if (effectiveArea != null) {
        const refArea = serviceData?.technical_sheet_reference_area_m2 ?? null;
        const refQuantity = serviceData?.technical_sheet_reference_quantity ?? null;
        if (refArea != null && refQuantity != null && refArea > 0) {
          qty = Math.ceil((refQuantity / refArea) * effectiveArea);
        }
      }

      // 2. Preço de retalho, para o cálculo de valor já existente na aba Itens.
      let price: number | undefined;
      try {
        const { data: priceRows } = await supabase
          .from("service_prices")
          .select("price, price_type")
          .eq("service_id", service.id);
        const rows = priceRows || [];
        price = rows.find((p: any) => p.price_type === "retail")?.price ?? rows[0]?.price ?? undefined;
      } catch (priceErr) {
        captureFlowError(priceErr, "deal-lifecycle"); // best effort: sem preço, fica 0 no total
      }

      // 3. Ficha técnica -> materiais informativos para o armazém.
      //    Regra de três copiada de QuoteDiagnosticPhase.tsx:243-251.
      const materialsOut: DealNeedDiagnosticMaterial[] = [];
      try {
        const { data, error } = await supabase
          .from("service_materials")
          .select(
            "product_id, quantity, uom_id, reference_area_m2, reference_quantity, product:products(name), uom:uom_id(code)",
          )
          .eq("service_id", service.id)
          .is("deleted_at", null);
        if (error) throw error;

        const rows: ServiceMaterialRow[] = data || [];
        for (const row of rows) {
          let matQty = Number(row.quantity) || 0;
          if (
            row.reference_area_m2 != null &&
            row.reference_quantity != null &&
            row.reference_area_m2 > 0 &&
            effectiveArea != null
          ) {
            matQty = Math.ceil((row.reference_quantity / row.reference_area_m2) * effectiveArea);
          }
          materialsOut.push({
            id: nextTempMaterialId(),
            service_id: service.id,
            product_id: row.product_id,
            descricao: row.product?.name || "Material da ficha técnica",
            quantity: matQty,
            unidade: row.uom?.code ?? null,
          });
        }
      } catch (matErr) {
        // best effort: o serviço em si já foi aceite, não bloqueia o fluxo.
        captureFlowError(matErr, "deal-lifecycle");
      }

      onServiceAccepted({
        service_id: service.id,
        name: service.name,
        price,
        quantity: qty,
        materials: materialsOut,
      });

      toast({
        title: "Serviço adicionado",
        description:
          materialsOut.length > 0
            ? `${materialsOut.length} material(is) da ficha técnica adicionado(s).`
            : "Sem materiais na ficha técnica.",
      });
    } catch (err: any) {
      captureFlowError(err, "deal-lifecycle");
      toast({ title: "Erro ao adicionar serviço", description: err.message, variant: "destructive" });
    } finally {
      setLoadingService(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-muted/20 p-3">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Stethoscope className="h-3.5 w-3.5" />
          Diagnóstico técnico desta necessidade. Cada necessidade corresponde a uma área.
        </p>
      </div>

      {/* ─── Área ─── */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Área</Label>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Área (m²)</Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            placeholder="0"
            value={areaM2}
            onChange={e => onAreaM2Change(e.target.value)}
            disabled={readOnly}
            className="h-9 max-w-[160px]"
          />
          <p className="text-[11px] text-muted-foreground">
            A área define as quantidades dos materiais da ficha técnica.
          </p>
        </div>
      </div>

      <Separator />

      {/* ─── Serviços necessários ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Wrench className="h-3 w-3" /> Serviços necessários
          </Label>
          {!readOnly && organizationId && (
            <DiagnosticServicePicker
              organizationId={organizationId}
              onSelect={handlePickService}
              disabled={effectiveArea == null || loadingService}
            />
          )}
        </div>

        {effectiveArea == null && (
          <p className="text-[11px] text-muted-foreground">
            Preencha a área (m²) para calcular as quantidades dos materiais.
          </p>
        )}

        {loadingService && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar ficha técnica...
          </p>
        )}

        {services.length === 0 ? (
          <div className="text-center py-6 space-y-1.5">
            <div className="mx-auto h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Sem serviços escolhidos</p>
            <p className="text-xs text-muted-foreground max-w-[280px] mx-auto">
              Os serviços escolhidos aqui ficam também associados na aba Itens e seguem para o orçamento.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {services.map(svc => (
              <div key={svc.key} className="flex items-center gap-2.5 p-2.5 rounded-lg border bg-card">
                <div className="h-8 w-8 rounded-md bg-accent/50 flex items-center justify-center flex-shrink-0">
                  <Wrench className="h-4 w-4 text-accent-foreground" />
                </div>
                <span className="text-sm font-medium truncate flex-1">{svc.name}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">x{svc.quantity}</Badge>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                    onClick={() => onRemoveService(svc.service_id)}
                    aria-label={`Remover serviço ${svc.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Materiais da ficha técnica (só informativos) ─── */}
      {materials.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Package className="h-3 w-3" /> Materiais da ficha técnica
            </Label>
            <div className="rounded-lg border border-amber-200/60 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/20 p-3 space-y-2">
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                Apenas informativo para o armazém — não entra no orçamento nem soma ao valor da necessidade.
              </p>
              {materials.map(mat => (
                <div key={mat.id} className="flex items-center gap-2.5 p-2 rounded-md border bg-card">
                  <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate flex-1">{mat.descricao}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {mat.quantity}{mat.unidade ? ` ${mat.unidade}` : ""}
                  </span>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive flex-shrink-0"
                      onClick={() => onRemoveMaterial(mat.id)}
                      aria-label={`Remover material ${mat.descricao}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <Separator />

      {/* ─── Demolição ─── */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Demolição</Label>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">O que é necessário demolir</Label>
          <Textarea
            value={demolirDescricao}
            onChange={e => onDemolirDescricaoChange(e.target.value)}
            placeholder="Descreva o que tem de ser demolido..."
            rows={2}
            disabled={readOnly}
            className="resize-none text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">m² a demolir</Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            placeholder="0"
            value={demolirM2}
            onChange={e => onDemolirM2Change(e.target.value)}
            disabled={readOnly}
            className="h-9 max-w-[160px]"
          />
        </div>
      </div>

      <Separator />

      {/* ─── Proteção ─── */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Proteção</Label>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">O que é necessário proteger</Label>
          <Textarea
            value={protegerDescricao}
            onChange={e => onProtegerDescricaoChange(e.target.value)}
            placeholder="Descreva o que tem de ser protegido..."
            rows={2}
            disabled={readOnly}
            className="resize-none text-sm"
          />
        </div>
      </div>

      <Separator />

      {/* ─── Intervenção ─── */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Intervenção</Label>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Tipo de intervenção</Label>
          <Input
            value={intervencaoTipo}
            onChange={e => onIntervencaoTipoChange(e.target.value)}
            placeholder="Ex: demolição, remodelação..."
            disabled={readOnly}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Descrição da intervenção</Label>
          <Textarea
            value={intervencaoDescricao}
            onChange={e => onIntervencaoDescricaoChange(e.target.value)}
            placeholder="Descreva a intervenção a realizar..."
            rows={3}
            disabled={readOnly}
            className="resize-none text-sm"
          />
        </div>
      </div>
    </div>
  );
}

export default DealNeedDiagnostic;
