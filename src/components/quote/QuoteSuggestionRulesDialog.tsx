import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { Plus, Pencil, Trash2, ChevronsUpDown, Check, Loader2, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useQuoteSuggestionRulesAdmin,
  type QuoteSuggestionRule,
  type QuoteSuggestionRuleInput,
  type SuggestionSourceField,
  type SuggestionQuantityFormulaType,
  type SuggestionRounding,
  type SuggestionTargetType,
} from "@/hooks/useQuoteSuggestionRulesAdmin";

interface QuoteSuggestionRulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null | undefined;
}

const SOURCE_FIELD_LABELS: Record<SuggestionSourceField, string> = {
  area_m2: "Área (m²)",
  demolir: "A demolir",
  proteger: "A proteger",
  intervencao: "Tipo de intervenção",
};

const FORMULA_LABELS: Record<SuggestionQuantityFormulaType, string> = {
  multiplier: "Multiplicador (área × valor)",
  fixed: "Quantidade fixa",
  per_unit_area: "Por unidade de área",
};

const ROUNDING_LABELS: Record<SuggestionRounding, string> = {
  ceil: "Arredondar para cima",
  floor: "Arredondar para baixo",
  round: "Arredondar normal",
  none: "Sem arredondamento",
};

const TARGET_TYPE_LABELS: Record<SuggestionTargetType, string> = {
  product: "Produto",
  service: "Serviço",
  catalog_item: "Item de catálogo",
};

interface CatalogTargetOption {
  id: string;
  label: string;
  sub?: string | null;
}

/**
 * Combobox simples de produto/serviço/item de catálogo, filtrado por
 * organização. `InlineProductSelector.tsx` (sugerido inicialmente como base a
 * reaproveitar) afinal não faz pesquisa — só mostra a descrição atual e um
 * botão para editar — por isso este componente pesquisa diretamente nas
 * tabelas `products` / `services` / `catalog_items`, no mesmo espírito do
 * carregamento em `useBundleCatalogItems.ts`.
 */
function CatalogTargetSelector({
  organizationId,
  targetType,
  value,
  onChange,
}: {
  organizationId: string | null | undefined;
  targetType: SuggestionTargetType;
  value: string | null;
  onChange: (id: string | null, label: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [options, setOptions] = useState<CatalogTargetOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  useEffect(() => {
    // Muda o tipo de alvo: a seleção anterior deixa de fazer sentido.
    setSelectedLabel(null);
  }, [targetType]);

  // Resolve o rótulo do valor já guardado (edição de uma regra existente).
  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSelectedLabel(null);
      return;
    }
    (async () => {
      const table = targetType === "product" ? "products" : targetType === "service" ? "services" : "catalog_items";
      const nameCol = targetType === "catalog_item" ? "descricao" : "name";
      const { data } = await (supabase as any).from(table).select(`id, ${nameCol}`).eq("id", value).maybeSingle();
      if (!cancelled && data) setSelectedLabel(data[nameCol]);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, targetType]);

  useEffect(() => {
    let cancelled = false;
    if (!organizationId) return;
    setLoading(true);
    (async () => {
      try {
        let rows: any[] = [];
        if (targetType === "product") {
          const query = supabase
            .from("products")
            .select("id, name, sku")
            .eq("organization_id", organizationId)
            .eq("is_active", true)
            .order("name")
            .limit(30);
          const { data } = debouncedSearch ? await query.ilike("name", `%${debouncedSearch}%`) : await query;
          rows = (data || []).map((p: any) => ({ id: p.id, label: p.name, sub: p.sku }));
        } else if (targetType === "service") {
          const query = supabase
            .from("services")
            .select("id, name")
            .eq("organization_id", organizationId)
            .eq("is_active", true)
            .order("name")
            .limit(30);
          const { data } = debouncedSearch ? await query.ilike("name", `%${debouncedSearch}%`) : await query;
          rows = (data || []).map((s: any) => ({ id: s.id, label: s.name }));
        } else {
          const query = (supabase as any)
            .from("catalog_items")
            .select("id, descricao, categoria")
            .eq("organization_id", organizationId)
            .eq("ativo", true)
            .order("descricao")
            .limit(30);
          const { data } = debouncedSearch ? await query.ilike("descricao", `%${debouncedSearch}%`) : await query;
          rows = (data || []).map((c: any) => ({ id: c.id, label: c.descricao, sub: c.categoria }));
        }
        if (!cancelled) setOptions(rows);
      } catch (err) {
        console.error("[CatalogTargetSelector] search failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, targetType, debouncedSearch]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selectedLabel || `Escolher ${TARGET_TYPE_LABELS[targetType].toLowerCase()}...`}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={`Pesquisar ${TARGET_TYPE_LABELS[targetType].toLowerCase()}...`}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && <CommandEmpty>Sem resultados.</CommandEmpty>}
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.id}
                  value={opt.id}
                  onSelect={() => {
                    onChange(opt.id, opt.label);
                    setSelectedLabel(opt.label);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === opt.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col">
                    <span>{opt.label}</span>
                    {opt.sub && <span className="text-xs text-muted-foreground">{opt.sub}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const emptyRuleForm = (organizationId: string): QuoteSuggestionRuleInput => ({
  organization_id: organizationId,
  phase: "fase_1",
  name: "",
  source_field: "intervencao",
  intervention_type: null,
  match_keyword: null,
  quantity_formula_type: "multiplier",
  quantity_multiplier: 1,
  quantity_fixed: null,
  rounding: "round",
  target_type: "product",
  product_id: null,
  service_id: null,
  catalog_item_id: null,
  default_qt_unit: null,
  priority: 100,
  is_active: true,
});

function RuleForm({
  organizationId,
  initialRule,
  onCancel,
  onSaved,
}: {
  organizationId: string;
  initialRule: QuoteSuggestionRule | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { createRule, updateRule, isCreatingRule, isUpdatingRule } = useQuoteSuggestionRulesAdmin(organizationId);
  const [form, setForm] = useState<QuoteSuggestionRuleInput>(
    initialRule ? { ...initialRule } : emptyRuleForm(organizationId),
  );
  const saving = isCreatingRule || isUpdatingRule;

  const set = <K extends keyof QuoteSuggestionRuleInput>(key: K, value: QuoteSuggestionRuleInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleTargetTypeChange = (targetType: SuggestionTargetType) => {
    setForm((prev) => ({
      ...prev,
      target_type: targetType,
      product_id: null,
      service_id: null,
      catalog_item_id: null,
    }));
  };

  const targetValue =
    form.target_type === "product" ? form.product_id : form.target_type === "service" ? form.service_id : form.catalog_item_id;

  const handleTargetChange = (id: string | null) => {
    if (form.target_type === "product") set("product_id", id);
    else if (form.target_type === "service") set("service_id", id);
    else set("catalog_item_id", id);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Nome em falta", description: "Dê um nome à regra.", variant: "destructive" });
      return;
    }
    if (!targetValue) {
      toast({ title: "Alvo em falta", description: "Escolha o produto/serviço/item de catálogo desta regra.", variant: "destructive" });
      return;
    }
    try {
      if (initialRule) {
        await updateRule({ id: initialRule.id, ...form });
      } else {
        await createRule(form);
      }
      toast({ title: "Regra guardada" });
      onSaved();
    } catch (err: any) {
      captureFlowError(err, "quote-lifecycle");
      toast({ title: "Erro ao guardar regra", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar à lista
      </Button>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1.5">
          <Label>Nome da regra</Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex: Proteção de piso em intervenções de demolição" />
        </div>

        <div className="space-y-1.5">
          <Label>Campo de origem</Label>
          <Select value={form.source_field} onValueChange={(v) => set("source_field", v as SuggestionSourceField)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(SOURCE_FIELD_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Tipo de intervenção (opcional)</Label>
          <Input
            value={form.intervention_type || ""}
            onChange={(e) => set("intervention_type", e.target.value || null)}
            placeholder="Ex: demolição"
          />
        </div>

        <div className="col-span-2 space-y-1.5">
          <Label>Palavra-chave a corresponder no texto (opcional)</Label>
          <Input
            value={form.match_keyword || ""}
            onChange={(e) => set("match_keyword", e.target.value || null)}
            placeholder="Ex: azulejo"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Fórmula de quantidade</Label>
          <Select
            value={form.quantity_formula_type}
            onValueChange={(v) => set("quantity_formula_type", v as SuggestionQuantityFormulaType)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(FORMULA_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {form.quantity_formula_type === "fixed" ? (
          <div className="space-y-1.5">
            <Label>Quantidade fixa</Label>
            <Input
              type="number"
              step="0.01"
              value={form.quantity_fixed ?? ""}
              onChange={(e) => set("quantity_fixed", e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Multiplicador</Label>
            <Input
              type="number"
              step="0.01"
              value={form.quantity_multiplier ?? ""}
              onChange={(e) => set("quantity_multiplier", e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Arredondamento</Label>
          <Select value={form.rounding} onValueChange={(v) => set("rounding", v as SuggestionRounding)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ROUNDING_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Unidade por omissão (opcional)</Label>
          <Input value={form.default_qt_unit || ""} onChange={(e) => set("default_qt_unit", e.target.value || null)} placeholder="Ex: m²" />
        </div>

        <div className="col-span-2 space-y-1.5">
          <Label>Tipo de alvo</Label>
          <Select value={form.target_type} onValueChange={(v) => handleTargetTypeChange(v as SuggestionTargetType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TARGET_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2 space-y-1.5">
          <Label>{TARGET_TYPE_LABELS[form.target_type]} sugerido</Label>
          <CatalogTargetSelector
            organizationId={organizationId}
            targetType={form.target_type}
            value={targetValue}
            onChange={(id) => handleTargetChange(id)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Prioridade (menor = primeiro)</Label>
          <Input type="number" value={form.priority} onChange={(e) => set("priority", Number(e.target.value) || 0)} />
        </div>

        <div className="flex items-center gap-2 pt-6">
          <Switch checked={form.is_active} onCheckedChange={(checked) => set("is_active", checked)} />
          <Label className="!mt-0">Regra ativa</Label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="button" onClick={handleSubmit} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Guardar regra
        </Button>
      </div>
    </div>
  );
}

export function QuoteSuggestionRulesDialog({ open, onOpenChange, organizationId }: QuoteSuggestionRulesDialogProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<QuoteSuggestionRule | "new" | null>(null);
  const { rules, isLoadingRules, deleteRule, isDeletingRule } = useQuoteSuggestionRulesAdmin(organizationId);

  useEffect(() => {
    if (!open) setEditing(null);
  }, [open]);

  const handleDelete = async (rule: QuoteSuggestionRule) => {
    if (!window.confirm(`Eliminar a regra "${rule.name}"?`)) return;
    try {
      await deleteRule(rule.id);
      toast({ title: "Regra eliminada" });
    } catch (err: any) {
      captureFlowError(err, "quote-lifecycle");
      toast({ title: "Erro ao eliminar regra", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerir regras de sugestão</DialogTitle>
          <DialogDescription>
            Regras automáticas que sugerem itens de orçamento a partir do diagnóstico de cada área (Fase 1).
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          organizationId ? (
            <RuleForm
              organizationId={organizationId}
              initialRule={editing === "new" ? null : editing}
              onCancel={() => setEditing(null)}
              onSaved={() => setEditing(null)}
            />
          ) : null
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setEditing("new")} disabled={!organizationId}>
                <Plus className="h-4 w-4 mr-1" /> Nova regra
              </Button>
            </div>

            <ScrollArea className="max-h-[50vh]">
              {isLoadingRules ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> A carregar regras...
                </div>
              ) : rules.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Ainda não há regras de sugestão configuradas.
                </p>
              ) : (
                <div className="space-y-2">
                  {rules.map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{rule.name}</span>
                          {!rule.is_active && <Badge variant="secondary">Inativa</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {SOURCE_FIELD_LABELS[rule.source_field]} · {TARGET_TYPE_LABELS[rule.target_type]} · prioridade {rule.priority}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(rule)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDelete(rule)}
                          disabled={isDeletingRule}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
