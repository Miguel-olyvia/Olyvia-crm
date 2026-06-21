import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { DynamicFormField } from "./DynamicFormField";
import {
  createSupabaseLeadDialogFieldDefinitionResolverClient,
  resolveLeadDialogFieldDefinitions,
  type LeadDialogFieldDefinition,
} from "@/lib/leads/fieldDefinitions";

interface Lead {
  id: string;
  organization_id?: string;
  campaign_id: string | null;
  entity_id: string | null;
  field_values: Record<string, any> | null;
  status: string;
  source: string | null;
  notes: string | null;
  assigned_to: string | null;
  workflow_stage_id?: string | null;
}

export interface LeadEditDialogUpdate {
  leadId: string;
  entityId: string | null;
  status: string;
  assignedTo: string | null;
  source: string | null;
  notes: string | null;
  workflowStageId: string | null;
  fieldValues: Record<string, any>;
}

interface LeadEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  companyId: string;
  companyUsers: { id: string; name: string }[];
  onLeadUpdated: (payload?: LeadEditDialogUpdate) => void;
}

const NOTES_FIELD_KEYS = ["notas", "notes", "observacoes", "observações"];

const GENERAL_FIELD_ALIASES: Record<string, string[]> = {
  first_name: ["first_name", "nome", "name", "primeiro_nome", "firstname", "firstName"],
  last_name: ["last_name", "apelido", "surname", "sobrenome", "lastname", "lastName"],
  email: ["email", "e-mail", "e_mail", "mail"],
  phone: ["phone", "telefone", "telemovel", "telemóvel", "mobile", "celular", "contacto"],
  company_name: ["company_name", "empresa", "company", "nome_empresa", "organizacao", "organização"],
  address: ["address", "morada", "endereco", "endereço", "rua", "address_line1"],
  postal_code: ["postal_code", "codigo_postal", "código_postal", "cp", "cep", "zip", "zipcode"],
  city: ["city", "cidade", "localidade"],
};

const GENERAL_FIELDS = [
  { key: "first_name", label: "Nome" },
  { key: "last_name", label: "Apelido" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Telefone" },
  { key: "company_name", label: "Empresa" },
  { key: "address", label: "Morada" },
  { key: "postal_code", label: "Código Postal" },
  { key: "city", label: "Cidade" },
];

const normalizeFieldKey = (key: string) => key.toLowerCase().trim();
const isNotesFieldKey = (key: string) => NOTES_FIELD_KEYS.includes(normalizeFieldKey(key));
const isGeneralFieldKey = (key: string) => Object.values(GENERAL_FIELD_ALIASES).some((aliases) => aliases.includes(normalizeFieldKey(key)));

const getGeneralFieldValue = (values: Record<string, any>, key: string) => {
  const aliases = GENERAL_FIELD_ALIASES[key] || [key];
  for (const alias of aliases) {
    const rawValue = values?.[alias];
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    if (typeof rawValue === "object") {
      return String(rawValue.address_line1 || rawValue.street || rawValue.value || "");
    }
    return String(rawValue);
  }
  return "";
};

const fieldDefinitionResolverClient = createSupabaseLeadDialogFieldDefinitionResolverClient(supabase);

export function AnewLeadEditDialog({
  open,
  onOpenChange,
  lead,
  companyId,
  companyUsers,
  onLeadUpdated,
}: LeadEditDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [fieldDefs, setFieldDefs] = useState<LeadDialogFieldDefinition[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [status, setStatus] = useState("new");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load field definitions and populate form when dialog opens
  useEffect(() => {
    if (open && lead) {
      loadFieldDefs();
      populateForm();
    }
  }, [open, lead]);

  const loadFieldDefs = async () => {
    if (!lead) return;
    setLoading(true);
    
    try {
      const resolvedDefinitions = await resolveLeadDialogFieldDefinitions(
        {
          campaignId: lead.campaign_id,
          organizationId: companyId,
        },
        fieldDefinitionResolverClient,
      );

      setFieldDefs(resolvedDefinitions);
    } catch (error) {
      console.error("Error loading field definitions:", error);
    } finally {
      setLoading(false);
    }
  };

  const populateForm = () => {
    if (!lead) return;
    
    // Clone field_values, excluding _meta
    const values = { ...(lead.field_values || {}) };
    delete values._meta;
    
    setFieldValues(values);
    setStatus(lead.status || "new");
    setSource(lead.source || "");
    setNotes(lead.notes || "");
    setAssignedTo(lead.assigned_to);
  };

  const handleFieldChange = (key: string, value: any) => {
    setFieldValues(prev => ({ ...prev, [key]: value }));
  };

  const handleGeneralFieldChange = (generalKey: string, value: string) => {
    const aliases = GENERAL_FIELD_ALIASES[generalKey] || [generalKey];
    const existingAlias = aliases.find((alias) => Object.prototype.hasOwnProperty.call(fieldValues, alias)) || aliases[0];
    handleFieldChange(existingAlias, value);
  };

  const resolveWorkflowStageId = async (statusValue: string) => {
    const { data, error } = await supabase
      .from("lead_workflow_stages")
      .select("id, organization_id")
      .eq("name", statusValue)
      .or(`organization_id.eq.${companyId},organization_id.is.null`);

    if (error) throw error;

    const organizationStage = data?.find((stage) => stage.organization_id === companyId);
    return organizationStage?.id || data?.find((stage) => stage.organization_id === null)?.id || null;
  };

  const handleSave = async () => {
    if (!lead) return;
    
    setSaving(true);
    try {
      // Preserve _meta if it exists
      const existingMeta = lead.field_values?._meta;
      const updatedFieldValues = {
        ...fieldValues,
        ...(existingMeta ? { _meta: existingMeta } : {}),
      };

      const statusChanged = status !== lead.status;
      const updatePayload: Record<string, any> = {
        field_values: updatedFieldValues,
        status,
        source: source || null,
        notes: notes || null,
        assigned_to: assignedTo,
        updated_at: new Date().toISOString(),
      };

      let workflowStageId = lead.workflow_stage_id || null;
      if (statusChanged) {
        workflowStageId = await resolveWorkflowStageId(status);
        if (workflowStageId) {
          updatePayload.workflow_stage_id = workflowStageId;
        }
      }

      const { error } = await supabase
        .from("anew_leads")
        .update(updatePayload as any)
        .eq("id", lead.id);

      if (error) throw error;

      // Sync entity display_name with updated field values
      if (lead.entity_id) {
        const firstName = getGeneralFieldValue(updatedFieldValues, "first_name");
        const lastName = getGeneralFieldValue(updatedFieldValues, "last_name");
        const companyName = getGeneralFieldValue(updatedFieldValues, "company_name");
        const newDisplayName = companyName || [firstName, lastName].filter(Boolean).join(" ") || undefined;
        
        if (newDisplayName) {
          const entityUpdate: Record<string, any> = { display_name: newDisplayName.trim() };
          if (firstName) entityUpdate.first_name = firstName;
          if (lastName) entityUpdate.last_name = lastName;
          await supabase.from("anew_entities").update(entityUpdate as any).eq("id", lead.entity_id);
        }
      }

      if (statusChanged && workflowStageId) {
        const { error: workflowError } = await supabase.functions.invoke("execute-workflow", {
          body: {
            source_entity: "lead",
            entity_id: lead.id,
            new_stage_id: workflowStageId,
            old_stage_id: lead.workflow_stage_id || null,
            organization_id: companyId,
          },
        });

        if (workflowError) {
          throw workflowError;
        }
      }

      toast({
        title: "Lead atualizada",
        description: "Os dados da lead foram guardados com sucesso.",
      });

      onLeadUpdated({
        leadId: lead.id,
        entityId: lead.entity_id,
        status,
        assignedTo,
        source: source || null,
        notes: notes || null,
        workflowStageId,
        fieldValues: updatedFieldValues,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving lead:", error);
      toast({
        title: "Erro",
        description: "Não foi possível guardar as alterações.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const statusOptions = [
    { value: "new", label: "Nova" },
    { value: "contacted", label: "Contactada" },
    { value: "qualified", label: "Qualificada" },
    { value: "converted", label: "Convertida" },
    { value: "lost", label: "Perdida" },
    { value: "incomplete", label: "Incompleta" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Lead</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <OlyviaLoader size={28} />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Status, Source, Assigned To */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Fonte</Label>
                <Input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="Ex: Website, Referência..."
                />
              </div>
              
              <div className="space-y-2">
                <Label>Atribuído a</Label>
                <Select 
                  value={assignedTo || "unassigned"} 
                  onValueChange={(v) => setAssignedTo(v === "unassigned" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Não atribuído</SelectItem>
                    {companyUsers.map(user => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold border-b pb-2">Dados da Lead</h4>
              <div className="grid grid-cols-2 gap-4">
                {GENERAL_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label>{field.label}</Label>
                    <Input
                      value={getGeneralFieldValue(fieldValues, field.key)}
                      onChange={(e) => handleGeneralFieldChange(field.key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Dynamic Fields from Campaign/Company */}
            {fieldDefs.filter((field) => !isNotesFieldKey(field.field_key) && !isGeneralFieldKey(field.field_key)).length > 0 && (
              <div className="space-y-4">
                <h4 className="text-sm font-semibold border-b pb-2">Campos do Formulário</h4>
                <div className="grid grid-cols-2 gap-4">
                  {fieldDefs
                    .filter((field) => !isNotesFieldKey(field.field_key) && !isGeneralFieldKey(field.field_key))
                    .map(field => (
                      <DynamicFormField
                        key={field.id}
                        field={field}
                        value={fieldValues[field.field_key] ?? ""}
                        onChange={(val) => handleFieldChange(field.field_key, val)}
                      />
                    ))}
                </div>
              </div>
            )}

            {/* Notes - hide if field definitions already have a notes field */}
            {!fieldDefs.some(f => isNotesFieldKey(f.field_key)) && (
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Adicionar notas sobre esta lead..."
                  rows={3}
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                A guardar...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Guardar Alterações
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
