import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  GripVertical, Plus, Pencil, Trash2, Eye, EyeOff, Lock, ChevronUp, ChevronDown,
} from "lucide-react";

export interface FieldConfig {
  key: string;
  label: string;
  type: string;
  isRequired: boolean;
  isVisible: boolean;
  isCustom: boolean;
  defaultValue?: string;
  options?: string[];
  placeholder?: string;
  sortOrder: number;
}

export const STANDARD_USER_FIELDS = [
  { key: "name", label: "Nome", required: true, locked: true },
  { key: "email", label: "Email", required: true, locked: true },
  { key: "password", label: "Password", required: true, locked: true },
  { key: "phone", label: "Telefone", required: false, locked: false },
  { key: "position", label: "Cargo", required: false, locked: false },
  { key: "location", label: "Localização", required: false, locked: false },
  { key: "organization", label: "Organização", required: false, locked: false },
  { key: "nif", label: "NIF", required: false, locked: false },
  { key: "address", label: "Morada", required: false, locked: false },
];

export function getDefaultFieldConfig(): FieldConfig[] {
  return STANDARD_USER_FIELDS.map((sf, index) => ({
    key: sf.key,
    label: sf.label,
    type: "text",
    isRequired: sf.required,
    isVisible: true,
    isCustom: false,
    sortOrder: index,
  }));
}

const FIELD_TYPES = [
  { value: "text", label: "Texto" },
  { value: "email", label: "Email" },
  { value: "tel", label: "Telefone" },
  { value: "number", label: "Número" },
  { value: "date", label: "Data" },
  { value: "select", label: "Seleção" },
  { value: "textarea", label: "Área de Texto" },
  { value: "checkbox", label: "Checkbox" },
];

interface FieldFormData {
  key: string;
  label: string;
  type: string;
  isRequired: boolean;
  placeholder: string;
  defaultValue: string;
  options: string;
}

export function TemplateFieldsConfig({
  fields,
  onFieldsChange,
  customAttributes = [],
  onCustomAttributesChange,
}: {
  fields: FieldConfig[];
  onFieldsChange: (fields: FieldConfig[]) => void;
  customAttributes?: FieldConfig[];
  onCustomAttributesChange?: (attrs: FieldConfig[]) => void;
}) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingField, setEditingField] = useState<FieldConfig | null>(null);
  const [fieldForm, setFieldForm] = useState<FieldFormData>({
    key: "", label: "", type: "text", isRequired: false, placeholder: "", defaultValue: "", options: "",
  });

  const isLockedField = (key: string) => {
    return STANDARD_USER_FIELDS.some(sf => sf.key === key && sf.locked);
  };

  const toggleVisibility = (key: string) => {
    if (isLockedField(key)) return;
    onFieldsChange(fields.map(f => f.key === key ? { ...f, isVisible: !f.isVisible } : f));
  };

  const toggleRequired = (key: string) => {
    if (isLockedField(key)) return;
    onFieldsChange(fields.map(f => f.key === key ? { ...f, isRequired: !f.isRequired } : f));
  };

  const moveField = (index: number, direction: "up" | "down") => {
    const newFields = [...fields];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newFields.length) return;
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    onFieldsChange(newFields.map((f, i) => ({ ...f, sortOrder: i })));
  };

  const openAddCustomField = () => {
    setEditingField(null);
    setFieldForm({ key: "", label: "", type: "text", isRequired: false, placeholder: "", defaultValue: "", options: "" });
    setShowAddDialog(true);
  };

  const openEditField = (field: FieldConfig) => {
    setEditingField(field);
    setFieldForm({
      key: field.key,
      label: field.label,
      type: field.type,
      isRequired: field.isRequired,
      placeholder: field.placeholder || "",
      defaultValue: field.defaultValue || "",
      options: field.options?.join(", ") || "",
    });
    setShowAddDialog(true);
  };

  const handleSaveField = () => {
    if (!fieldForm.label.trim()) return;

    const key = fieldForm.key || fieldForm.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const options = fieldForm.type === "select" && fieldForm.options
      ? fieldForm.options.split(",").map(o => o.trim()).filter(Boolean)
      : undefined;

    if (editingField) {
      // Editing existing custom field
      if (editingField.isCustom && onCustomAttributesChange) {
        onCustomAttributesChange(
          customAttributes.map(f =>
            f.key === editingField.key
              ? { ...f, label: fieldForm.label, type: fieldForm.type, isRequired: fieldForm.isRequired, placeholder: fieldForm.placeholder || undefined, defaultValue: fieldForm.defaultValue || undefined, options }
              : f
          )
        );
      } else {
        onFieldsChange(
          fields.map(f =>
            f.key === editingField.key
              ? { ...f, label: fieldForm.label, type: fieldForm.type, isRequired: fieldForm.isRequired, placeholder: fieldForm.placeholder || undefined, defaultValue: fieldForm.defaultValue || undefined, options }
              : f
          )
        );
      }
    } else {
      // Adding new custom field
      const newField: FieldConfig = {
        key,
        label: fieldForm.label.trim(),
        type: fieldForm.type,
        isRequired: fieldForm.isRequired,
        isVisible: true,
        isCustom: true,
        placeholder: fieldForm.placeholder || undefined,
        defaultValue: fieldForm.defaultValue || undefined,
        options,
        sortOrder: customAttributes.length + fields.length,
      };

      if (onCustomAttributesChange) {
        onCustomAttributesChange([...customAttributes, newField]);
      } else {
        onFieldsChange([...fields, newField]);
      }
    }

    setShowAddDialog(false);
  };

  const removeCustomField = (key: string) => {
    if (onCustomAttributesChange) {
      onCustomAttributesChange(customAttributes.filter(f => f.key !== key));
    }
  };

  const sortedFields = [...fields].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-4">
      {/* Standard Fields */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-sm font-medium">Campos Standard</Label>
          <Badge variant="secondary" className="text-xs">{fields.filter(f => f.isVisible).length} visíveis</Badge>
        </div>
        <ScrollArea className="max-h-64 border rounded-lg">
          <div className="divide-y">
            {sortedFields.map((field, index) => {
              const locked = isLockedField(field.key);
              return (
                <div key={field.key} className="flex items-center gap-2 px-3 py-2 group">
                  {/* Reorder */}
                  <div className="flex flex-col shrink-0">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveField(index, "up")}
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      disabled={index === sortedFields.length - 1}
                      onClick={() => moveField(index, "down")}
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Field info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm ${!field.isVisible ? "text-muted-foreground line-through" : ""}`}>
                        {field.label}
                      </span>
                      {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                      {field.isRequired && <Badge variant="destructive" className="text-[10px] px-1 py-0">*</Badge>}
                    </div>
                  </div>

                  {/* Actions */}
                  {!locked && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" onClick={() => toggleVisibility(field.key)} className="p-1 text-muted-foreground hover:text-foreground">
                        {field.isVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                      <button type="button" onClick={() => toggleRequired(field.key)} className="p-1 text-muted-foreground hover:text-foreground">
                        <span className={`text-xs font-bold ${field.isRequired ? "text-destructive" : ""}`}>*</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Custom Attributes */}
      {onCustomAttributesChange && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium">Campos Personalizados</Label>
            <Button variant="outline" size="sm" onClick={openAddCustomField}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
            </Button>
          </div>
          {customAttributes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
              Nenhum campo personalizado
            </p>
          ) : (
            <div className="space-y-1 border rounded-lg divide-y">
              {customAttributes.map(attr => (
                <div key={attr.key} className="flex items-center gap-2 px-3 py-2 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{attr.label}</span>
                      <Badge variant="outline" className="text-[10px]">{attr.type}</Badge>
                      {attr.isRequired && <Badge variant="destructive" className="text-[10px] px-1 py-0">*</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => openEditField(attr)} className="p-1 text-muted-foreground hover:text-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => removeCustomField(attr.key)} className="p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Field Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingField ? "Editar Campo" : "Novo Campo Personalizado"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do Campo *</Label>
              <Input
                value={fieldForm.label}
                onChange={e => setFieldForm(p => ({ ...p, label: e.target.value }))}
                placeholder="Ex: Departamento"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={fieldForm.type} onValueChange={v => setFieldForm(p => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(ft => (
                    <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {fieldForm.type === "select" && (
              <div>
                <Label>Opções (separadas por vírgula)</Label>
                <Input
                  value={fieldForm.options}
                  onChange={e => setFieldForm(p => ({ ...p, options: e.target.value }))}
                  placeholder="Opção 1, Opção 2, Opção 3"
                />
              </div>
            )}
            <div>
              <Label>Placeholder</Label>
              <Input
                value={fieldForm.placeholder}
                onChange={e => setFieldForm(p => ({ ...p, placeholder: e.target.value }))}
                placeholder="Texto de ajuda..."
              />
            </div>
            <div>
              <Label>Valor Padrão</Label>
              <Input
                value={fieldForm.defaultValue}
                onChange={e => setFieldForm(p => ({ ...p, defaultValue: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={fieldForm.isRequired}
                onCheckedChange={v => setFieldForm(p => ({ ...p, isRequired: !!v }))}
              />
              Campo obrigatório
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveField} disabled={!fieldForm.label.trim()}>
              {editingField ? "Guardar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
