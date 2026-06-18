import { useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, X } from "lucide-react";
import type { CRule, CSlot, CBlock, CSlotOption } from "./hooks/useConfigTemplate";

const RULE_TYPE_OPTIONS: {
  value: CRule["rule_type"];
  label: string;
  description: string;
}[] = [
  { value: "compatibility", label: "Compatibilidade entre escolhas", description: "Permitir/bloquear valores conforme outra escolha." },
  { value: "visibility", label: "Mostrar ou esconder uma escolha", description: "Mostrar ou esconder uma escolha conforme outra." },
  { value: "requirement", label: "Tornar uma escolha obrigatória", description: "Forçar o cliente a preencher outra escolha." },
  { value: "quantity", label: "Definir quantidade automaticamente", description: "Pré-definir a quantidade de outra escolha." },
  { value: "defaulting", label: "Pré-selecionar valor por defeito", description: "Selecionar automaticamente um valor noutra escolha." },
];

const TARGET_ACTION_OPTIONS: {
  value: CRule["target_action"];
  label: string;
  description: string;
}[] = [
  { value: "allow_options", label: "Permitir apenas certos valores", description: "Restringe os valores possíveis na escolha alvo." },
  { value: "deny_options", label: "Bloquear certos valores", description: "Esconde valores incompatíveis na escolha alvo." },
  { value: "show_slot", label: "Mostrar a escolha alvo", description: "Torna a escolha alvo visível." },
  { value: "hide_slot", label: "Esconder a escolha alvo", description: "Oculta a escolha alvo." },
  { value: "require_slot", label: "Tornar a escolha alvo obrigatória", description: "Cliente tem de preencher a escolha alvo." },
  { value: "set_quantity", label: "Definir quantidade", description: "Atribui uma quantidade fixa à escolha alvo." },
  { value: "set_default", label: "Pré-selecionar valor", description: "Define um valor por defeito na escolha alvo." },
];

const OPERATOR_OPTIONS = [
  { value: "equals", label: "é igual a" },
  { value: "not_equals", label: "é diferente de" },
  { value: "in", label: "está entre (lista)" },
  { value: "not_in", label: "não está entre (lista)" },
];

const ruleTypeLabel = (v: CRule["rule_type"]) =>
  RULE_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
const targetActionLabel = (v: CRule["target_action"]) =>
  TARGET_ACTION_OPTIONS.find((o) => o.value === v)?.label ?? v;
const operatorLabel = (v: string | null | undefined) =>
  OPERATOR_OPTIONS.find((o) => o.value === v)?.label ?? v ?? "";

interface Props {
  rules: CRule[];
  slots: CSlot[];
  blocks: CBlock[];
  options: CSlotOption[];
  onAdd: (payload: Partial<CRule> & { rule_type: CRule["rule_type"]; target_action: CRule["target_action"] }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/** Slots that have a discrete list of options (so source value can be a dropdown) */
function slotHasOptionList(slot: CSlot | undefined): boolean {
  if (!slot) return false;
  return slot.slot_type === "attribute_value" || slot.slot_type === "component_product";
}

export function RulesEditor({ rules, slots, blocks, options, onAdd, onDelete }: Props) {
  const [ruleType, setRuleType] = useState<CRule["rule_type"]>("compatibility");
  const [sourceSlotId, setSourceSlotId] = useState<string>("");
  const [sourceOperator, setSourceOperator] = useState<string>("equals");
  const [sourceValueSingle, setSourceValueSingle] = useState<string>("");
  const [sourceValueMulti, setSourceValueMulti] = useState<string[]>([]);
  const [sourceValueText, setSourceValueText] = useState<string>("");
  const [sourceValueBool, setSourceValueBool] = useState<boolean>(true);
  const [targetSlotId, setTargetSlotId] = useState<string>("");
  const [targetAction, setTargetAction] = useState<CRule["target_action"]>("deny_options");
  const [targetOptionIds, setTargetOptionIds] = useState<string[]>([]);
  const [targetQuantity, setTargetQuantity] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const blockById = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);
  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);
  const optionById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  const slotFullName = (id: string | null) => {
    if (!id) return "—";
    const s = slotById.get(id);
    if (!s) return "—";
    const b = blockById.get(s.block_id);
    return b ? `${b.label} › ${s.label}` : s.label;
  };

  // Slots agrupados por secção para os dropdowns
  const groupedSlots = useMemo(() => {
    const sortedBlocks = [...blocks].sort((a, b) => a.sort_order - b.sort_order);
    return sortedBlocks
      .map((b) => ({
        block: b,
        slots: slots.filter((s) => s.block_id === b.id).sort((a, c) => a.sort_order - c.sort_order),
      }))
      .filter((g) => g.slots.length > 0);
  }, [blocks, slots]);

  const sourceSlot = sourceSlotId ? slotById.get(sourceSlotId) : undefined;
  const targetSlot = targetSlotId ? slotById.get(targetSlotId) : undefined;

  const sourceOptions = useMemo(
    () => (sourceSlotId ? options.filter((o) => o.slot_id === sourceSlotId) : []),
    [sourceSlotId, options]
  );
  const targetOptions = useMemo(
    () => (targetSlotId ? options.filter((o) => o.slot_id === targetSlotId) : []),
    [targetSlotId, options]
  );

  const sourceIsList = slotHasOptionList(sourceSlot);
  const sourceIsBool = sourceSlot?.slot_type === "boolean";
  const sourceIsNumeric = sourceSlot?.slot_type === "quantity" || sourceSlot?.slot_type === "measure";
  const isMultiOperator = sourceOperator === "in" || sourceOperator === "not_in";
  const needsSourceValue = sourceOperator !== ""; // always for these ops

  // Effects-related flags
  const isAllowDeny = targetAction === "allow_options" || targetAction === "deny_options";
  const isSetQuantity = targetAction === "set_quantity";
  const isSetDefault = targetAction === "set_default";
  const targetNeedsOptionList =
    (isAllowDeny || isSetDefault) && slotHasOptionList(targetSlot);

  const resetValueInputs = () => {
    setSourceValueSingle("");
    setSourceValueMulti([]);
    setSourceValueText("");
    setSourceValueBool(true);
    setTargetOptionIds([]);
    setTargetQuantity("");
  };

  const toggleMulti = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const buildSourceValue = (): any => {
    if (!sourceSlot) return sourceValueText || null;
    if (sourceIsBool) return sourceValueBool;
    if (sourceIsList) {
      if (isMultiOperator) return sourceValueMulti;
      const opt = optionById.get(sourceValueSingle);
      // Persist option label for readability + id for matching
      return opt ? { option_id: opt.id, label: opt.label } : sourceValueSingle || null;
    }
    if (sourceIsNumeric) {
      const n = Number(sourceValueText);
      return Number.isFinite(n) ? n : sourceValueText || null;
    }
    return sourceValueText || null;
  };

  const buildTargetValue = (): any => {
    if (isAllowDeny) return targetOptionIds;
    if (isSetDefault) return targetOptionIds[0] ? { option_id: targetOptionIds[0] } : null;
    if (isSetQuantity) {
      const n = Number(targetQuantity);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const canAdd = useMemo(() => {
    if (!sourceSlotId || !targetSlotId) return false;
    if (sourceIsList) {
      if (isMultiOperator && sourceValueMulti.length === 0) return false;
      if (!isMultiOperator && !sourceValueSingle) return false;
    } else if (!sourceIsBool && !sourceValueText.trim()) {
      return false;
    }
    if (isAllowDeny && targetOptionIds.length === 0) return false;
    if (isSetDefault && targetOptionIds.length !== 1) return false;
    if (isSetQuantity && !targetQuantity.trim()) return false;
    return true;
  }, [
    sourceSlotId, targetSlotId, sourceIsList, sourceIsBool, isMultiOperator,
    sourceValueMulti, sourceValueSingle, sourceValueText,
    isAllowDeny, isSetDefault, isSetQuantity, targetOptionIds, targetQuantity,
  ]);

  const renderRuleSummary = (r: CRule) => {
    const srcSlot = r.source_slot_id ? slotById.get(r.source_slot_id) : undefined;
    const tgtSlot = r.target_slot_id ? slotById.get(r.target_slot_id) : undefined;

    const srcVal = (() => {
      const v = r.source_value;
      if (v == null) return "—";
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
      if (Array.isArray(v)) {
        return v.map((id) => optionById.get(id)?.label ?? String(id)).join(", ");
      }
      if (typeof v === "object" && (v as any).option_id) {
        return optionById.get((v as any).option_id)?.label ?? (v as any).label ?? "—";
      }
      if (typeof v === "object" && (v as any).label) return (v as any).label;
      return JSON.stringify(v);
    })();

    const tgtVal = (() => {
      const v = r.target_value;
      if (v == null) return null;
      if (Array.isArray(v)) {
        return v.map((id) => optionById.get(id)?.label ?? String(id)).join(", ");
      }
      if (typeof v === "object" && (v as any).option_id) {
        return optionById.get((v as any).option_id)?.label ?? null;
      }
      return String(v);
    })();

    return (
      <div className="text-xs text-muted-foreground mt-0.5">
        Quando <strong>{slotFullName(r.source_slot_id)}</strong>{" "}
        {operatorLabel(r.source_operator)}{" "}
        <strong>{srcVal}</strong>{" "}
        → {targetActionLabel(r.target_action).toLowerCase()}
        {tgtVal ? <> <strong>{tgtVal}</strong></> : null}
        {" "}em <strong>{slotFullName(r.target_slot_id)}</strong>
        {srcSlot || tgtSlot ? "" : ""}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Regras entre escolhas</CardTitle>
        <CardDescription>
          Define como as escolhas se afetam umas às outras (ex: "Se a cor for X, então só permitir A e B").
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 rounded-md border border-dashed p-3 bg-muted/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">O que esta regra faz</Label>
              <Select value={ruleType} onValueChange={(v) => setRuleType(v as CRule["rule_type"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RULE_TYPE_OPTIONS.map((t) => (
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

            <div className="space-y-1.5">
              <Label className="text-xs">Efeito</Label>
              <Select value={targetAction} onValueChange={(v) => { setTargetAction(v as CRule["target_action"]); setTargetOptionIds([]); setTargetQuantity(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TARGET_ACTION_OPTIONS.map((t) => (
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
          </div>

          <div className="rounded-md border bg-background p-3 space-y-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quando…</div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">A escolha</Label>
                <Select value={sourceSlotId} onValueChange={(v) => { setSourceSlotId(v); resetValueInputs(); }}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {groupedSlots.map((g) => (
                      <div key={g.block.id}>
                        <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {g.block.label}
                        </div>
                        {g.slots.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Comparação</Label>
                <Select
                  value={sourceOperator}
                  onValueChange={(v) => { setSourceOperator(v); setSourceValueMulti([]); setSourceValueSingle(""); }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPERATOR_OPTIONS
                      .filter((o) => sourceIsList || (o.value !== "in" && o.value !== "not_in"))
                      .map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor</Label>
                {!sourceSlot ? (
                  <Input disabled placeholder="Escolha primeiro a escolha…" />
                ) : sourceIsBool ? (
                  <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-background">
                    <Switch checked={sourceValueBool} onCheckedChange={setSourceValueBool} />
                    <span className="text-sm">{sourceValueBool ? "Sim" : "Não"}</span>
                  </div>
                ) : sourceIsList && isMultiOperator ? (
                  <MultiOptionPicker
                    options={sourceOptions}
                    selected={sourceValueMulti}
                    onToggle={(id) => toggleMulti(sourceValueMulti, setSourceValueMulti, id)}
                    placeholder={sourceOptions.length ? "Escolher valores…" : "Sem valores configurados"}
                  />
                ) : sourceIsList ? (
                  <Select
                    value={sourceValueSingle}
                    onValueChange={setSourceValueSingle}
                    disabled={sourceOptions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={sourceOptions.length ? "Escolher valor…" : "Sem valores configurados"} />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={sourceIsNumeric ? "number" : "text"}
                    value={sourceValueText}
                    onChange={(e) => setSourceValueText(e.target.value)}
                    placeholder={sourceIsNumeric ? "ex: 100" : 'ex: "texto livre"'}
                  />
                )}
              </div>
            </div>

            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">Então aplicar a…</div>

            <div className="space-y-1.5">
              <Label className="text-xs">Escolha alvo</Label>
              <Select value={targetSlotId} onValueChange={(v) => { setTargetSlotId(v); setTargetOptionIds([]); }}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {groupedSlots.map((g) => (
                    <div key={g.block.id}>
                      <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {g.block.label}
                      </div>
                      {g.slots.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {targetNeedsOptionList && (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {isAllowDeny
                    ? (targetAction === "allow_options" ? "Valores permitidos na escolha alvo" : "Valores bloqueados na escolha alvo")
                    : "Valor por defeito"}
                </Label>
                {isSetDefault ? (
                  <Select
                    value={targetOptionIds[0] ?? ""}
                    onValueChange={(v) => setTargetOptionIds([v])}
                    disabled={targetOptions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={targetOptions.length ? "Escolher valor…" : "Sem valores configurados"} />
                    </SelectTrigger>
                    <SelectContent>
                      {targetOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <MultiOptionPicker
                    options={targetOptions}
                    selected={targetOptionIds}
                    onToggle={(id) => toggleMulti(targetOptionIds, setTargetOptionIds, id)}
                    placeholder={targetOptions.length ? "Escolher valores…" : "Sem valores configurados"}
                  />
                )}
              </div>
            )}

            {isSetQuantity && (
              <div className="space-y-1.5">
                <Label className="text-xs">Quantidade</Label>
                <Input
                  type="number"
                  value={targetQuantity}
                  onChange={(e) => setTargetQuantity(e.target.value)}
                  placeholder="ex: 1"
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Mensagem para o cliente (opcional)</Label>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder='ex: "Esta cor não está disponível para esta porta"'
            />
          </div>

          <Button
            size="sm"
            className="w-full"
            disabled={busy || !canAdd}
            onClick={async () => {
              setBusy(true);
              try {
                await onAdd({
                  rule_type: ruleType,
                  target_action: targetAction,
                  source_slot_id: sourceSlotId || null,
                  target_slot_id: targetSlotId || null,
                  source_operator: sourceOperator || null,
                  source_value: buildSourceValue(),
                  target_value: buildTargetValue(),
                  message: message || null,
                });
                resetValueInputs();
                setMessage("");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Adicionar regra
          </Button>
        </div>

        <div className="border rounded-md divide-y">
          {rules.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Ainda não criou regras.</div>
          ) : (
            rules.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{ruleTypeLabel(r.rule_type)}</div>
                  {renderRuleSummary(r)}
                  {r.message && (
                    <div className="text-xs italic text-muted-foreground mt-1">"{r.message}"</div>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => onDelete(r.id)} title="Remover regra">
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

function MultiOptionPicker({
  options,
  selected,
  onToggle,
  placeholder,
}: {
  options: CSlotOption[];
  selected: string[];
  onToggle: (id: string) => void;
  placeholder: string;
}) {
  if (options.length === 0) {
    return (
      <div className="rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
        {placeholder}
      </div>
    );
  }
  return (
    <div className="rounded-md border bg-background p-2 space-y-1 max-h-44 overflow-y-auto">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 pb-2 mb-1 border-b">
          {selected.map((id) => {
            const o = options.find((x) => x.id === id);
            if (!o) return null;
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded bg-primary/10 text-primary px-2 py-0.5 text-xs">
                {o.label}
                <button type="button" onClick={() => onToggle(id)} className="hover:opacity-70">
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
      {options.map((o) => {
        const checked = selected.includes(o.id);
        return (
          <label
            key={o.id}
            className="flex items-center gap-2 px-1 py-1 rounded hover:bg-accent/50 cursor-pointer text-sm"
          >
            <Checkbox checked={checked} onCheckedChange={() => onToggle(o.id)} />
            <span>{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}
