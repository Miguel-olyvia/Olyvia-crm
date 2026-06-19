import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EditableLabel } from "./EditableLabel";
import { MeasureSlotPanel } from "./MeasureSlotPanel";
import type { CSlot, CSlotOption } from "./hooks/useConfigTemplate";

interface AttrOption {
  /** value to display in the dropdown (and to label the option) */
  label: string;
  /** raw value_text to persist on product_attribute_values */
  valueText: string;
  /** optional color swatch */
  hex?: string | null;
}
interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
}

interface AttributeMeta {
  value_type: string | null;
  pricing_type: string | null;
  is_measurement: boolean | null;
}

interface Props {
  slot: CSlot | null;
  options: CSlotOption[];
  organizationId: string | null;
  productId: string | null;
  onAdd: (
    slotId: string,
    payload: { label: string; attribute_value_id?: string | null; component_product_id?: string | null }
  ) => Promise<void>;
  onUpdate: (id: string, patch: { label?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function SlotOptionsEditor({ slot, options, organizationId, productId, onAdd, onUpdate, onDelete }: Props) {
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [labelTouched, setLabelTouched] = useState(false);
  const [pickedValueText, setPickedValueText] = useState<string>("");
  const [componentId, setComponentId] = useState<string>("");
  const [attrOptions, setAttrOptions] = useState<AttrOption[]>([]);
  const [attributeIssue, setAttributeIssue] = useState<string | null>(null);
  const [components, setComponents] = useState<ProductRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!slot) return;
    // Reset transient pickers/lists whenever the slot or its attribute changes
    setAttrOptions([]);
    setComponents([]);
    setPickedValueText("");
    setComponentId("");
    setLabel("");
    setLabelTouched(false);
    setAttributeIssue(null);
    if (slot.slot_type === "attribute_value" && slot.attribute_id) {
      (async () => {
        // 1) attribute definition: allowed_values (jsonb array of strings)
        const { data: attr } = await supabase
          .from("product_attributes")
          .select("allowed_values, options, value_type, pricing_type, is_measurement")
          .eq("id", slot.attribute_id)
          .maybeSingle();

        const attrMeta = attr as AttributeMeta & { allowed_values?: unknown; options?: unknown } | null;
        const isNonSelectableAttribute =
          !!attrMeta &&
          (attrMeta.is_measurement === true ||
            attrMeta.pricing_type === "range" ||
            attrMeta.value_type === "number");

        if (isNonSelectableAttribute) {
          setAttributeIssue("Este atributo é do tipo medida/intervalo. Para ele, use o tipo de escolha “Medida”, não “Escolha de atributo”.");
          setAttrOptions([]);
          return;
        }

        const list: AttrOption[] = [];
        const seen = new Set<string>();

        const pushVal = (raw: unknown, hex?: string | null, display?: string | null) => {
          if (raw == null) return;
          const v = String(raw).trim();
          if (!v) return;
          const key = v.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          list.push({ valueText: v, label: display?.trim() || v, hex: hex ?? null });
        };

        const av = (attr as any)?.allowed_values;
        if (Array.isArray(av)) {
          for (const v of av) pushVal(v);
        }
        const opts = (attr as any)?.options;
        if (Array.isArray(opts)) {
          for (const v of opts) pushVal(v);
        }

        // 2) attribute_option_groups → attribute_option_group_values
        const { data: groups } = await supabase
          .from("attribute_option_groups")
          .select("id")
          .eq("attribute_id", slot.attribute_id)
          .eq("is_active", true);

        const groupIds = (groups ?? []).map((g: any) => g.id);
        if (groupIds.length) {
          const { data: gvals } = await supabase
            .from("attribute_option_group_values")
            .select("value_text, display_name, hex_color, sort_order")
            .in("group_id", groupIds)
            .eq("is_active", true)
            .order("sort_order", { ascending: true });
          for (const gv of gvals ?? []) {
            pushVal((gv as any).value_text, (gv as any).hex_color, (gv as any).display_name);
          }
        }

        setAttrOptions(list);
      })();
    }
    if (slot.slot_type === "component_product" && organizationId) {
      (async () => {
        const { data } = await supabase
          .from("products")
          .select("id, name, sku, product_organizations!inner(organization_id)")
          .eq("product_kind", "component")
          .eq("product_organizations.organization_id", organizationId)
          .is("deleted_at", null)
          .order("name")
          .limit(100);
        setComponents((data ?? []) as unknown as ProductRow[]);
      })();
    }
  }, [slot?.id, slot?.attribute_id, slot?.slot_type, organizationId]);

  // Auto-fill label from picked value unless the user has manually edited it
  useEffect(() => {
    if (!pickedValueText) return;
    if (labelTouched) return;
    const found = attrOptions.find((o) => o.valueText === pickedValueText);
    if (found) setLabel(found.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedValueText, attrOptions]);

  if (!slot) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Valores possíveis</CardTitle>
          <CardDescription>
            Selecione uma escolha (ao centro) para definir os valores que o cliente pode escolher.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const slotOptions = options.filter((o) => o.slot_id === slot.id);
  const isAttr = slot.slot_type === "attribute_value";
  const isComp = slot.slot_type === "component_product";
  const isMeasure = slot.slot_type === "measure";

  if (isMeasure) {
    return <MeasureSlotPanel slot={slot} />;
  }

  /**
   * For attribute_value slots, the FK on product_config_slot_options.attribute_value_id
   * points to product_attribute_values (per-product). We upsert a row for
   * (productId, attribute_id) with the chosen value_text and use its id.
   */
  async function ensureAttributeValueId(): Promise<string | null> {
    if (!isAttr || !slot?.attribute_id || !productId || !pickedValueText) return null;

    // Try to find existing row for this (product, attribute) — schema enforces UNIQUE(product_id, attribute_id)
    const { data: existing, error: selErr } = await supabase
      .from("product_attribute_values")
      .select("id, value_text")
      .eq("product_id", productId)
      .eq("attribute_id", slot.attribute_id)
      .maybeSingle();
    if (selErr) throw selErr;

    if (existing) {
      // Update value_text to the picked one (so labels render correctly)
      if ((existing as any).value_text !== pickedValueText) {
        const { error: updErr } = await supabase
          .from("product_attribute_values")
          .update({ value_text: pickedValueText })
          .eq("id", (existing as any).id);
        if (updErr) throw updErr;
      }
      return (existing as any).id as string;
    }

    const { data: inserted, error: insErr } = await supabase
      .from("product_attribute_values")
      .insert({
        product_id: productId,
        attribute_id: slot.attribute_id,
        value_text: pickedValueText,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    return (inserted as any).id as string;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Valores para "{slot.label}"</CardTitle>
        <CardDescription>
          Adicione cada valor que o cliente vai poder escolher. (Os preços serão configurados numa fase seguinte.)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 rounded-md border border-dashed p-3 bg-muted/30">
          {isAttr && (
            <div className="space-y-1.5">
              <Label className="text-xs">Escolher valor</Label>
              <Select value={pickedValueText} onValueChange={setPickedValueText} disabled={!!attributeIssue || attrOptions.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={attributeIssue ?? (attrOptions.length ? "Escolher um valor da lista..." : "Este atributo não tem valores")} />
                </SelectTrigger>
                <SelectContent>
                  {attrOptions.map((v) => (
                    <SelectItem key={v.valueText} value={v.valueText}>
                      <span className="inline-flex items-center gap-2">
                        {v.hex && (
                          <span
                            className="inline-block h-3 w-3 rounded-sm border border-border"
                            style={{ backgroundColor: v.hex }}
                          />
                        )}
                        {v.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {attributeIssue ? (
                <p className="text-[11px] text-muted-foreground">
                  {attributeIssue}
                </p>
              ) : attrOptions.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Este atributo ainda não tem valores. Vá a <strong>Atributos</strong> para os criar.
                </p>
              )}
            </div>
          )}
          {isComp && (
            <div className="space-y-1.5">
              <Label className="text-xs">Escolher produto componente</Label>
              <Select value={componentId} onValueChange={setComponentId}>
                <SelectTrigger><SelectValue placeholder="Escolher um componente..." /></SelectTrigger>
                <SelectContent>
                  {components.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.sku ? `(${p.sku})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Como aparece ao cliente</Label>
            <Input
              value={label}
              onChange={(e) => { setLabel(e.target.value); setLabelTouched(true); }}
              placeholder={isAttr ? "Preenche automaticamente ao escolher" : "ex: Pega cromada"}
            />
          </div>
        <Button
          size="sm"
          className="w-full"
          disabled={
            !label.trim() ||
            busy ||
            (isAttr && (!pickedValueText || !productId)) ||
            (isComp && !componentId)
          }
          onClick={async () => {
            setBusy(true);
            try {
              let attrValueId: string | null = null;
              if (isAttr) {
                attrValueId = await ensureAttributeValueId();
                if (!attrValueId) {
                  toast({
                    title: "Não foi possível guardar",
                    description: "Falhou a associação do valor ao produto.",
                    variant: "destructive",
                  });
                  return;
                }
              }
              await onAdd(slot.id, {
                label: label.trim(),
                attribute_value_id: attrValueId,
                component_product_id: isComp ? componentId : null,
              });
              setLabel("");
              setLabelTouched(false);
              setPickedValueText("");
              setComponentId("");
            } catch (e: any) {
              toast({
                title: "Erro ao adicionar opção",
                description: e?.message ?? "Erro desconhecido",
                variant: "destructive",
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Adicionar valor
        </Button>
        </div>

        <div className="border rounded-md divide-y">
          {slotOptions.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Ainda não adicionou valores.
            </div>
          ) : (
            slotOptions.map((o) => (
              <div key={o.id} className="flex items-center justify-between px-3 py-2">
                <div className="text-sm flex-1 min-w-0">
                  <EditableLabel
                    value={o.label}
                    onSave={(next) => onUpdate(o.id, { label: next })}
                  />
                </div>
                <Button variant="ghost" size="icon" onClick={() => onDelete(o.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
