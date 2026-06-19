import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pencil, Check, X, Loader2, Variable, Link2, Edit3, Archive, RotateCcw, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CustomVariable {
  id: string;
  organization_id: string;
  variable_key: string;
  label: string;
  description: string | null;
  default_value: string | null;
  category: string;
  is_active: boolean;
  sort_order: number;
  linked_field_key: string | null;
  prompt_type?: string | null;
}

interface LeadFieldDef {
  field_key: string;
  field_label: string;
  field_type: string;
  client_field_mapping: string | null;
  contact_field_mapping: string | null;
}

// Fields already covered by fixed Entity variables — excluded from the dropdown
const ENTITY_COVERED_KEYS = new Set([
  "first_name", "last_name", "email", "phone", "address", "city", "postal_code", "company",
  "po_email", "po_telefone", "po_morada", "po_codigo_postal", "po_localidade",
]);

interface Props {
  onInsertVariable?: (key: string) => void;
}

type VarMode = "fixed" | "linked" | "prompt";
type PromptType = "text" | "textarea" | "number" | "date";

interface FormState {
  label: string;
  key: string;
  description: string;
  default_value: string;
  mode: VarMode;
  linked_field_key: string;
  prompt_type: PromptType;
}

const EMPTY_FORM: FormState = { label: "", key: "", description: "", default_value: "", mode: "prompt", linked_field_key: "", prompt_type: "text" };


export function CustomVariablesManager({ onInsertVariable }: Props) {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDeleteVar, setConfirmDeleteVar] = useState<CustomVariable | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data: variables = [], isLoading } = useQuery({
    queryKey: ["custom-contract-variables", activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany?.id) return [];
      const { data, error } = await (supabase as any)
        .from("custom_contract_variables")
        .select("*")
        .eq("organization_id", activeCompany.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as CustomVariable[];
    },
    enabled: !!activeCompany?.id,
  });

  const { data: archivedVariables = [] } = useQuery({
    queryKey: ["custom-contract-variables-archived", activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany?.id) return [];
      const { data, error } = await (supabase as any)
        .from("custom_contract_variables")
        .select("*")
        .eq("organization_id", activeCompany.id)
        .eq("is_active", false)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CustomVariable[];
    },
    enabled: !!activeCompany?.id,
  });

  const { data: leadFields = [] } = useQuery({
    queryKey: ["lead-field-defs-for-custom-vars", activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany?.id) return [];
      const { data, error } = await (supabase as any)
        .from("lead_field_definitions")
        .select("field_key, field_label, field_type, client_field_mapping, contact_field_mapping")
        .eq("organization_id", activeCompany.id)
        .eq("is_active", true)
        .order("field_label", { ascending: true });
      if (error) throw error;
      return (data || []) as LeadFieldDef[];
    },
    enabled: !!activeCompany?.id,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["custom-contract-variables"] });
    queryClient.invalidateQueries({ queryKey: ["custom-contract-variables-archived"] });
  };

  const eligibleFields = useMemo(() => {
    return leadFields.filter(f =>
      !ENTITY_COVERED_KEYS.has(f.field_key) &&
      !f.client_field_mapping &&
      !f.contact_field_mapping
    );
  }, [leadFields]);

  const fieldLabelByKey = useMemo(() => {
    const m = new Map<string, string>();
    leadFields.forEach(f => m.set(f.field_key, f.field_label));
    return m;
  }, [leadFields]);

  const createMutation = useMutation({
    mutationFn: async (data: FormState): Promise<{ reactivated: boolean }> => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Não autenticado");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");
      const key = data.key || `{{${data.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")}}}`;
      const formattedKey = key.startsWith("{{") ? key : `{{${key}}}`;

      // Check for existing row with this key (active or archived)
      const { data: existing } = await (supabase as any)
        .from("custom_contract_variables")
        .select("id, is_active")
        .eq("organization_id", activeCompany?.id)
        .eq("variable_key", formattedKey)
        .maybeSingle();

      if (existing) {
        if (existing.is_active) {
          throw new Error(`Já existe uma variável activa com a chave ${formattedKey}`);
        }
        // Reactivate the soft-deleted row with new values
        const { data: reactivated, error: rErr } = await (supabase as any)
          .from("custom_contract_variables")
          .update({
            label: data.label,
            description: data.description || null,
            default_value: data.mode === "prompt" ? null : (data.default_value || null),
            linked_field_key: data.mode === "linked" ? (data.linked_field_key || null) : null,
            prompt_type: data.mode === "prompt" ? data.prompt_type : "text",
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select("id");
        if (rErr) throw rErr;
        if (!reactivated || reactivated.length === 0) throw new Error("Sem permissão para reactivar variável");
        return { reactivated: true };
      }


      const { data: inserted, error } = await (supabase as any).from("custom_contract_variables").insert({
        organization_id: activeCompany?.id,
        variable_key: formattedKey,
        label: data.label,
        description: data.description || null,
        default_value: data.mode === "prompt" ? null : (data.default_value || null),
        linked_field_key: data.mode === "linked" ? (data.linked_field_key || null) : null,
        prompt_type: data.mode === "prompt" ? data.prompt_type : "text",
        created_by: businessUserId,
      }).select("id");

      if (error) {
        if ((error as any).code === "23505") {
          throw new Error(`Já existe uma variável com a chave ${formattedKey}`);
        }
        throw error;
      }
      if (!inserted || inserted.length === 0) throw new Error("Sem permissão para criar variável");
      return { reactivated: false };
    },
    onSuccess: (res) => {
      invalidateAll();
      toast.success(res.reactivated ? "Variável reactivada com os novos dados" : "Variável criada");
      resetForm();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: FormState & { id: string }) => {
      const { data: updated, error } = await (supabase as any)
        .from("custom_contract_variables")
        .update({
          label: data.label,
          description: data.description || null,
          default_value: data.mode === "prompt" ? null : (data.default_value || null),
          linked_field_key: data.mode === "linked" ? (data.linked_field_key || null) : null,
          prompt_type: data.mode === "prompt" ? data.prompt_type : "text",
          updated_at: new Date().toISOString(),
        })

        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!updated || updated.length === 0) throw new Error("Sem permissão para guardar variável");
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Variável actualizada");
      resetForm();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: deleted, error } = await (supabase as any)
        .from("custom_contract_variables")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0) throw new Error("Sem permissão para eliminar variável");
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Variável arquivada");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: r, error } = await (supabase as any)
        .from("custom_contract_variables")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!r || r.length === 0) throw new Error("Sem permissão para reactivar variável");
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Variável reactivada");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const hardDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("custom_contract_variables")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Variável eliminada permanentemente");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setIsAdding(false);
    setEditingId(null);
  };

  const handleEdit = (v: CustomVariable) => {
    setEditingId(v.id);
    const mode: VarMode = v.linked_field_key
      ? "linked"
      : (v.default_value == null || v.default_value === "") ? "prompt" : "fixed";
    setForm({
      label: v.label,
      key: v.variable_key,
      description: v.description || "",
      default_value: v.default_value || "",
      mode,
      linked_field_key: v.linked_field_key || "",
      prompt_type: ((v.prompt_type as PromptType) || "text"),
    });

    setIsAdding(false);
  };

  const handleSave = () => {
    if (!form.label.trim()) { toast.error("Preencha o nome da variável"); return; }
    if (form.mode === "linked" && !form.linked_field_key) {
      toast.error("Escolha a propriedade da lead a ligar");
      return;
    }
    if (editingId) {
      updateMutation.mutate({ ...form, id: editingId });
    } else {
      createMutation.mutate(form);
    }
  };

  const autoKey = form.label
    ? `{{${form.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")}}}`
    : "";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Variable className="h-3.5 w-3.5" /> Variáveis Personalizadas
        </h4>
        {!isAdding && !editingId && (
          <div className="flex items-center gap-1.5">
            {archivedVariables.length > 0 && (
              <Button
                type="button"
                variant={showArchived ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setShowArchived((v) => !v)}
                title="Variáveis arquivadas"
              >
                <Archive className="h-3 w-3" />
                Arquivadas ({archivedVariables.length})
                {showArchived ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setIsAdding(true)}>
              <Plus className="h-3 w-3" /> Nova Variável
            </Button>
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Variáveis podem ser de <strong>texto fixo</strong> (valor sempre igual), <strong>ligadas a uma propriedade da lead</strong> (lê dinamicamente, usa o valor padrão como fallback) ou <strong>preenchidas no contrato</strong> (o valor é pedido ao gerar). Propriedades já cobertas por variáveis de Entidade (nome, email, telefone, morada, NIF) não aparecem na lista.
      </p>

      {/* Add/Edit form */}
      {(isAdding || editingId) && (
        <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
          {/* Tipo */}
          <div className="space-y-1">
            <Label className="text-[11px]">Tipo</Label>
            <RadioGroup
              value={form.mode}
              onValueChange={(v) => setForm({ ...form, mode: v as VarMode })}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="fixed" id="var-mode-fixed" className="h-3.5 w-3.5" />
                <Label htmlFor="var-mode-fixed" className="text-xs font-normal cursor-pointer">Texto fixo</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="linked" id="var-mode-linked" className="h-3.5 w-3.5" />
                <Label htmlFor="var-mode-linked" className="text-xs font-normal cursor-pointer">Ligada a propriedade</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="prompt" id="var-mode-prompt" className="h-3.5 w-3.5" />
                <Label htmlFor="var-mode-prompt" className="text-xs font-normal cursor-pointer">Preencher no contrato</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Nome *</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Ex: Nome do Projecto"
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Chave (auto-gerada)</Label>
              <Input
                value={editingId ? form.key : autoKey}
                readOnly={!!editingId}
                onChange={(e) => !editingId && setForm({ ...form, key: e.target.value })}
                placeholder="{{nome_projecto}}"
                className="h-7 text-xs font-mono bg-muted/30"
              />
            </div>
          </div>

          {form.mode === "linked" && (
            <div className="space-y-1">
              <Label className="text-[11px]">Propriedade ligada *</Label>
              {eligibleFields.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic py-1">
                  Todas as propriedades da lead já estão cobertas por variáveis de Entidade.
                </p>
              ) : (
                <Select
                  value={form.linked_field_key}
                  onValueChange={(v) => setForm({ ...form, linked_field_key: v })}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Escolher propriedade da lead..." />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleFields.map(f => (
                      <SelectItem key={f.field_key} value={f.field_key} className="text-xs">
                        {f.field_label}
                        <span className="text-muted-foreground/60 ml-2 font-mono">({f.field_key})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {form.mode === "prompt" ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Descrição</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Para que serve esta variável"
                  className="h-7 text-xs"
                />
                <p className="text-[11px] text-muted-foreground italic mt-1">
                  O valor será pedido ao gerar o contrato.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Tipo de campo</Label>
                <Select
                  value={form.prompt_type}
                  onValueChange={(v) => setForm({ ...form, prompt_type: v as PromptType })}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text" className="text-xs">Texto curto</SelectItem>
                    <SelectItem value="textarea" className="text-xs">Texto longo</SelectItem>
                    <SelectItem value="number" className="text-xs">Número</SelectItem>
                    <SelectItem value="date" className="text-xs">Data</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Descrição</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Para que serve esta variável"
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">
                  {form.mode === "linked" ? "Valor padrão (fallback)" : "Valor padrão"}
                </Label>
                <Input
                  value={form.default_value}
                  onChange={(e) => setForm({ ...form, default_value: e.target.value })}
                  placeholder={form.mode === "linked" ? "Quando lead não tem valor" : "Valor da variável"}
                  className="h-7 text-xs"
                />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-1.5">
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={resetForm}>
              <X className="h-3 w-3 mr-1" /> Cancelar
            </Button>
            <Button
              type="button" size="sm" className="h-7 text-xs"
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              <Check className="h-3 w-3 mr-1" /> {editingId ? "Guardar" : "Criar"}
            </Button>
          </div>
        </div>
      )}

      {/* Variables list */}
      {isLoading ? (
        <div className="text-center py-3"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>
      ) : variables.length === 0 && !isAdding ? (
        <p className="text-xs text-muted-foreground text-center py-3">
          Nenhuma variável personalizada criada. Clique em "Nova Variável" para começar.
        </p>
      ) : (
        <div className="space-y-1">
          {variables.map((v) => {
            const linkedLabel = v.linked_field_key ? (fieldLabelByKey.get(v.linked_field_key) || v.linked_field_key) : null;
            const isPrompt = !v.linked_field_key && (v.default_value == null || v.default_value === "");
            return (
              <div key={v.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 group">
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10 text-xs font-mono transition-colors shrink-0"
                  title={v.description || v.label}
                  onClick={() => onInsertVariable?.(v.variable_key)}
                >
                  {v.variable_key}
                </Badge>
                <span className="text-xs text-muted-foreground flex-1 truncate">{v.label}</span>
                {linkedLabel && (
                  <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                    <Link2 className="h-2.5 w-2.5" /> {linkedLabel}
                  </Badge>
                )}
                {isPrompt && (
                  <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                    <Edit3 className="h-2.5 w-2.5" /> preencher no contrato
                  </Badge>
                )}
                {v.default_value && (
                  <span className="text-[10px] text-muted-foreground/60 truncate max-w-[100px]">= {v.default_value}</span>
                )}
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEdit(v)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                    onClick={() => deleteMutation.mutate(v.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Archived variables section */}
      {showArchived && archivedVariables.length > 0 && (
        <div className="border-t pt-2 mt-2 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            <Archive className="h-3 w-3" /> Arquivadas
          </div>
          {archivedVariables.map((v) => (
            <div key={v.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 group opacity-60">
              <Badge variant="outline" className="text-xs font-mono shrink-0 line-through">
                {v.variable_key}
              </Badge>
              <span className="text-xs text-muted-foreground flex-1 truncate">{v.label}</span>
              <div className="flex gap-0.5">
                <Button
                  type="button" variant="ghost" size="icon" className="h-6 w-6 text-primary"
                  title="Reactivar"
                  onClick={() => reactivateMutation.mutate(v.id)}
                  disabled={reactivateMutation.isPending}
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
                <Button
                  type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                  title="Eliminar definitivamente"
                  onClick={() => setConfirmDeleteVar(v)}
                  disabled={hardDeleteMutation.isPending}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!confirmDeleteVar} onOpenChange={(open) => !open && setConfirmDeleteVar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar variável definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              Vais eliminar a variável <span className="font-mono font-semibold">{confirmDeleteVar?.variable_key}</span> definitivamente.
              Esta acção não pode ser desfeita e liberta a chave para reutilização.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteVar) hardDeleteMutation.mutate(confirmDeleteVar.id);
                setConfirmDeleteVar(null);
              }}
            >
              Eliminar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
