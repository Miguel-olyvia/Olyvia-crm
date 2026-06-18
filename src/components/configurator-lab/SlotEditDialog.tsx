import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { CSlot } from "./hooks/useConfigTemplate";

const SLOT_TYPE_OPTIONS: { value: CSlot["slot_type"]; label: string; description: string }[] = [
  { value: "attribute_value", label: "Escolha de atributo (ex: cor, material)", description: "Cliente escolhe entre valores de um atributo já criado." },
  { value: "component_product", label: "Escolha de componente (outro produto)", description: "Cliente escolhe um produto componente do catálogo." },
  { value: "quantity", label: "Quantidade (número)", description: "Cliente indica uma quantidade numérica." },
  { value: "measure", label: "Medida (largura/altura/comprimento)", description: "Cliente introduz uma medida." },
  { value: "boolean", label: "Sim / Não (opcional)", description: "Cliente ativa ou desativa uma opção." },
  { value: "custom_input", label: "Texto livre (gravação, observação)", description: "Cliente escreve um texto personalizado." },
];

interface AttributeRow {
  id: string;
  label: string;
  value_type: string | null;
  pricing_type: string | null;
  is_measurement: boolean | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  slot: CSlot | null;
  optionsCount: number;
  organizationId: string | null;
  onSave: (
    id: string,
    patch: Partial<Pick<CSlot, "label" | "required" | "slot_type" | "attribute_id">> & { wipeOptions?: boolean }
  ) => Promise<void>;
}

export function SlotEditDialog({ open, onOpenChange, slot, optionsCount, organizationId, onSave }: Props) {
  const [label, setLabel] = useState("");
  const [required, setRequired] = useState(false);
  const [slotType, setSlotType] = useState<CSlot["slot_type"]>("attribute_value");
  const [attributeId, setAttributeId] = useState<string>("");
  const [attributes, setAttributes] = useState<AttributeRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && slot) {
      setLabel(slot.label);
      setRequired(slot.required);
      setSlotType(slot.slot_type);
      setAttributeId(slot.attribute_id ?? "");
    }
  }, [open, slot?.id]);

  useEffect(() => {
    if (!open || !organizationId) return;
    if (slotType !== "attribute_value" && slotType !== "measure") {
      setAttributes([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("product_attributes")
        .select("id, label, value_type, pricing_type, is_measurement")
        .eq("organization_id", organizationId)
        .order("label")
        .limit(200);
      if (data) {
        const all = data as unknown as AttributeRow[];
        const filtered = slotType === "measure"
          ? all.filter((attr) => attr.is_measurement || attr.pricing_type === "range" || attr.value_type === "number")
          : all.filter((attr) => !(attr.is_measurement || attr.pricing_type === "range" || attr.value_type === "number"));
        setAttributes(filtered);
      }
    })();
  }, [open, organizationId, slotType]);

  if (!slot) return null;

  const typeChanged = slotType !== slot.slot_type;
  const needsAttribute = slotType === "attribute_value" || slotType === "measure";
  const attributeChanged =
    needsAttribute && (attributeId || null) !== (slot.attribute_id ?? null);
  const willWipeOptions = (typeChanged || attributeChanged) && optionsCount > 0;

  const canSave =
    label.trim().length > 0 &&
    (!needsAttribute || !!attributeId) &&
    (label !== slot.label ||
      required !== slot.required ||
      slotType !== slot.slot_type ||
      (needsAttribute && (attributeId || null) !== (slot.attribute_id ?? null)));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(slot.id, {
        label: label.trim(),
        required,
        slot_type: slotType,
        attribute_id: needsAttribute ? attributeId || null : null,
        wipeOptions: willWipeOptions,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar escolha</DialogTitle>
          <DialogDescription>Atualize como esta escolha aparece e funciona para o cliente.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome visível para o cliente</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Obrigatória</div>
              <div className="text-xs text-muted-foreground">
                Se sim, o cliente tem de escolher um valor antes de continuar.
              </div>
            </div>
            <Switch checked={required} onCheckedChange={setRequired} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de escolha</Label>
            <Select value={slotType} onValueChange={(v) => setSlotType(v as CSlot["slot_type"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SLOT_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <div className="flex flex-col">
                      <span>{t.label}</span>
                      <span className="text-[11px] text-muted-foreground">{t.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsAttribute && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                {slotType === "measure" ? "Qual atributo de medida?" : "Qual atributo?"}
              </Label>
              <Select value={attributeId} onValueChange={setAttributeId}>
                <SelectTrigger><SelectValue placeholder={attributes.length ? "Escolher atributo..." : "Sem atributos compatíveis"} /></SelectTrigger>
                <SelectContent>
                  {attributes.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {willWipeOptions && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Os valores atuais vão ser apagados</AlertTitle>
              <AlertDescription className="text-xs">
                Esta escolha tem <strong>{optionsCount}</strong>{" "}
                {optionsCount === 1 ? "valor configurado" : "valores configurados"}.
                Como vai mudar {typeChanged ? "o tipo de escolha" : "o atributo associado"},
                esses valores deixam de fazer sentido e serão removidos. Vai ter de adicioná-los de novo.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!canSave || saving} onClick={handleSave}>
            {saving ? "A guardar..." : willWipeOptions ? "Guardar e apagar valores" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
