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
import { Trash2, Plus, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SlotEditDialog } from "./SlotEditDialog";
import type { CSlot, CSlotOption } from "./hooks/useConfigTemplate";

interface AttributeRow {
  id: string;
  label: string;
  value_type: string | null;
  pricing_type: string | null;
  is_measurement: boolean | null;
}

interface Props {
  blockId: string | null;
  slots: CSlot[];
  options: CSlotOption[];
  selectedSlotId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (
    blockId: string,
    payload: {
      slot_key: string;
      label: string;
      slot_type: CSlot["slot_type"];
      attribute_id?: string | null;
    }
  ) => Promise<void>;
  onUpdate: (
    id: string,
    patch: Partial<Pick<CSlot, "label" | "required" | "slot_type" | "attribute_id">> & { wipeOptions?: boolean }
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  organizationId: string | null;
}

// User-friendly labels + descriptions for each slot type
const SLOT_TYPE_OPTIONS: {
  value: CSlot["slot_type"];
  label: string;
  description: string;
}[] = [
  {
    value: "attribute_value",
    label: "Escolha de atributo (ex: cor, material)",
    description: "Cliente escolhe entre valores de um atributo já criado.",
  },
  {
    value: "component_product",
    label: "Escolha de componente (outro produto)",
    description: "Cliente escolhe um produto componente do catálogo.",
  },
  {
    value: "quantity",
    label: "Quantidade (número)",
    description: "Cliente indica uma quantidade numérica.",
  },
  {
    value: "measure",
    label: "Medida (largura/altura/comprimento)",
    description: "Cliente introduz uma medida (mm, cm, etc.).",
  },
  {
    value: "boolean",
    label: "Sim / Não (opcional)",
    description: "Cliente ativa ou desativa uma opção.",
  },
  {
    value: "custom_input",
    label: "Texto livre (gravação, observação)",
    description: "Cliente escreve um texto personalizado.",
  },
];

const SLOT_TYPE_BADGE: Record<CSlot["slot_type"], string> = {
  attribute_value: "Escolha de atributo",
  component_product: "Componente",
  quantity: "Quantidade",
  measure: "Medida",
  boolean: "Sim/Não",
  custom_input: "Texto livre",
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function SlotsEditor({
  blockId,
  slots,
  options,
  selectedSlotId,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
  organizationId,
}: Props) {
  const [label, setLabel] = useState("");
  const [slotType, setSlotType] = useState<CSlot["slot_type"]>("attribute_value");
  const [attributeId, setAttributeId] = useState<string>("");
  const [attributes, setAttributes] = useState<AttributeRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [editingSlot, setEditingSlot] = useState<CSlot | null>(null);

  useEffect(() => {
    if ((slotType !== "attribute_value" && slotType !== "measure") || !organizationId) return;
    (async () => {
      const { data, error } = await supabase
        .from("product_attributes")
        .select("id, label, value_type, pricing_type, is_measurement")
        .eq("organization_id", organizationId)
        .order("label")
        .limit(200);
      if (!error && data) {
        const all = data as unknown as AttributeRow[];
        const filtered = slotType === "measure"
          ? all.filter((attr) => attr.is_measurement || attr.pricing_type === "range" || attr.value_type === "number")
          : all.filter((attr) => !(attr.is_measurement || attr.pricing_type === "range" || attr.value_type === "number"));
        setAttributes(filtered);
      }
    })();
  }, [slotType, organizationId]);

  // Reset attribute when switching slot type
  useEffect(() => {
    setAttributeId("");
  }, [slotType]);

  if (!blockId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Escolhas</CardTitle>
          <CardDescription>
            Selecione uma secção à esquerda para gerir as escolhas que o cliente vai poder fazer.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const blockSlots = slots.filter((s) => s.block_id === blockId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Escolhas desta secção</CardTitle>
        <CardDescription>
          Cada "escolha" é algo que o cliente decide (ex: a cor, o material, uma medida).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 rounded-md border border-dashed p-3 bg-muted/30">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome visível para o cliente</Label>
            <Input
              placeholder='ex: "Cor da estrutura"'
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de escolha</Label>
            <Select value={slotType} onValueChange={(v) => setSlotType(v as CSlot["slot_type"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
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

          {(slotType === "attribute_value" || slotType === "measure") && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                {slotType === "measure" ? "Qual atributo de medida?" : "Qual atributo?"}
              </Label>
              <Select value={attributeId} onValueChange={setAttributeId}>
                <SelectTrigger>
                  <SelectValue placeholder={attributes.length ? "Escolher atributo..." : "Sem atributos compatíveis"} />
                </SelectTrigger>
                <SelectContent>
                  {attributes.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {slotType === "measure"
                  ? "Os intervalos de preço por medida são definidos no atributo."
                  : <>Os valores possíveis (ex: lista de cores) são geridos em <strong>Atributos</strong>.</>}
              </p>
            </div>
          )}

          <Button
            size="sm"
            className="w-full"
            disabled={
              !label.trim() ||
              busy ||
              ((slotType === "attribute_value" || slotType === "measure") && !attributeId)
            }
            onClick={async () => {
              setBusy(true);
              try {
                const key = slugify(label) || `escolha_${Date.now()}`;
                await onAdd(blockId, {
                  slot_key: key,
                  label: label.trim(),
                  slot_type: slotType,
                  attribute_id: (slotType === "attribute_value" || slotType === "measure") ? attributeId : null,
                });
                setLabel("");
                setAttributeId("");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Adicionar escolha
          </Button>
        </div>

        <div className="border rounded-md divide-y">
          {blockSlots.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Esta secção ainda não tem escolhas.
            </div>
          ) : (
            blockSlots.map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-accent/50 ${
                  selectedSlotId === s.id ? "bg-accent" : ""
                }`}
                onClick={() => onSelect(s.id)}
                title="Clique para definir os valores; use o lápis para editar a escolha"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{s.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {SLOT_TYPE_BADGE[s.slot_type] ?? s.slot_type}
                    {s.required ? " · obrigatória" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingSlot(s);
                    }}
                    title="Editar escolha"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(s.id);
                    }}
                    title="Remover escolha"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <SlotEditDialog
          open={!!editingSlot}
          onOpenChange={(o) => !o && setEditingSlot(null)}
          slot={editingSlot}
          optionsCount={editingSlot ? options.filter((o) => o.slot_id === editingSlot.id).length : 0}
          organizationId={organizationId}
          onSave={onUpdate}
        />
      </CardContent>
    </Card>
  );
}
