import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PipelineBreadcrumb } from "@/components/pipeline/PipelineBreadcrumb";
import { ContractBodyTab } from "@/components/contracts/ContractBodyTab";
import { extractPromptTokens } from "@/utils/contractVariables";
import { DocumentsTab } from "@/components/shared/DocumentsTab";
import {
  FileText, Calendar, User, Euro, Send, Pencil, Loader2, Clock, Building2, Hash, CreditCard, StickyNote, CheckCircle, AlertTriangle, Paperclip, Edit3,
} from "lucide-react";

interface PromptVar { key: string; label: string; description: string | null; promptType: "text" | "textarea" | "number" | "date"; }

interface ContractDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: any | null;
  proposals: any[];
  templates: any[];
  onSave: (data: { proposal_id: string; template_id: string; start_date: string; end_date: string; notes: string; payment_terms: string; prompt_values?: Record<string, string>; id?: string }) => void;
  saving: boolean;
  isNew?: boolean;
  getProposalName: (p: any) => string;
  getProposalTotal: (p: any) => number;
  formatCurrency: (v: number | null, c: string | null) => string;
  getTranslatedStatus: (s: string) => string;
}

const statusConfig: Record<string, { color: string; icon: React.ReactNode; bg: string }> = {
  draft: { color: "text-yellow-600", icon: <Pencil className="h-3.5 w-3.5" />, bg: "bg-yellow-100 dark:bg-yellow-900/30" },
  pending_signature: { color: "text-blue-600", icon: <Send className="h-3.5 w-3.5" />, bg: "bg-blue-100 dark:bg-blue-900/30" },
  signed: { color: "text-green-600", icon: <CheckCircle className="h-3.5 w-3.5" />, bg: "bg-green-100 dark:bg-green-900/30" },
  active: { color: "text-green-600", icon: <CheckCircle className="h-3.5 w-3.5" />, bg: "bg-green-100 dark:bg-green-900/30" },
  expired: { color: "text-red-600", icon: <AlertTriangle className="h-3.5 w-3.5" />, bg: "bg-red-100 dark:bg-red-900/30" },
  cancelled: { color: "text-muted-foreground", icon: <AlertTriangle className="h-3.5 w-3.5" />, bg: "bg-muted" },
};

export function ContractDetailDialog({
  open, onOpenChange, contract, proposals, templates, onSave, saving, isNew,
  getProposalName, getProposalTotal, formatCurrency, getTranslatedStatus,
}: ContractDetailDialogProps) {
  const { activeCompany } = useCompany();
  const [formData, setFormData] = useState({
    proposal_id: "", template_id: "", start_date: "", end_date: "", notes: "", payment_terms: "",
  });
  const [promptValues, setPromptValues] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("detalhes");

  useEffect(() => {
    if (open) {
      if (contract) {
        setFormData({
          proposal_id: contract.proposal_id || "",
          template_id: contract.contract_template_id || contract.template_id || "",
          start_date: contract.start_date || "",
          end_date: contract.end_date || "",
          notes: contract.notes || "",
          payment_terms: contract.payment_terms || "",
        });
        setActiveTab("detalhes");
      } else {
        setFormData({ proposal_id: "", template_id: "", start_date: "", end_date: "", notes: "", payment_terms: "" });
        setActiveTab("detalhes");
      }
      setPromptValues(contract?.prompt_values && typeof contract.prompt_values === "object" ? { ...contract.prompt_values } : {});
    }
  }, [open, contract]);

  // Carrega variáveis customizadas em modo "Preencher no contrato" (sem default e sem linked field)
  const { data: promptCustomVars = [] } = useQuery({
    queryKey: ["custom-contract-prompt-vars", activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany?.id) return [] as Array<{ variable_key: string; label: string; description: string | null; prompt_type: string | null }>;
      const { data, error } = await (supabase as any)
        .from("custom_contract_variables")
        .select("variable_key, label, description, prompt_type")
        .eq("organization_id", activeCompany.id)
        .eq("is_active", true)
        .is("default_value", null)
        .is("linked_field_key", null);
      if (error) throw error;
      return (data || []) as Array<{ variable_key: string; label: string; description: string | null; prompt_type: string | null }>;
    },
    enabled: !!activeCompany?.id && open,
  });


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = contract ? { ...formData, id: contract.id } : { ...formData };
    onSave(payload);
  };

  const now = new Date();
  const contractProgress = useMemo(() => {
    if (!contract?.start_date || !contract?.end_date) return null;
    const start = new Date(contract.start_date).getTime();
    const end = new Date(contract.end_date).getTime();
    const total = end - start;
    if (total <= 0) return null;
    const elapsed = now.getTime() - start;
    const pct = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
    const daysLeft = Math.ceil((end - now.getTime()) / (1000 * 60 * 60 * 24));
    const totalDays = Math.ceil(total / (1000 * 60 * 60 * 24));
    return { pct, daysLeft, totalDays };
  }, [contract]);

  const sc = statusConfig[contract?.status] || statusConfig.draft;
  const selectedTemplate = useMemo(
    () => templates.find((template: any) => template.id === formData.template_id) || null,
    [templates, formData.template_id]
  );

  // Deteta variáveis "Preencher no contrato" presentes no corpo da minuta selecionada.
  // Scanneia o HTML primeiro para tokens desconhecidos, depois faz lookup no DB — mais
  // robusto do que iterar o DB e testar regex (evita falhas por chip-spans ou entidades).
  const promptVars = useMemo<PromptVar[]>(() => {
    const body = selectedTemplate?.body_html || "";
    if (!body || !formData.template_id) return [];

    const unknownKeys = extractPromptTokens(body);
    if (unknownKeys.length === 0) return [];

    const varMap = new Map<string, typeof promptCustomVars[0]>();
    for (const v of promptCustomVars) {
      const bareKey = String(v.variable_key || "").replace(/^\{\{|\}\}$/g, "").trim();
      if (bareKey) varMap.set(bareKey, v);
    }

    return unknownKeys
      .filter(k => varMap.has(k))
      .map(k => {
        const v = varMap.get(k)!;
        const pt = (v as any).prompt_type;
        const promptType: PromptVar["promptType"] = (pt === "textarea" || pt === "number" || pt === "date") ? pt : "text";
        return { key: k, label: v.label, description: v.description, promptType };
      });
  }, [selectedTemplate, formData.template_id, promptCustomVars]);

  // Reset prompt inputs quando muda a minuta
  useEffect(() => {
    setPromptValues(prev => {
      const next: Record<string, string> = {};
      for (const p of promptVars) next[p.key] = prev[p.key] || "";
      return next;
    });
  }, [promptVars]);

  const previewContract = useMemo(() => {
    if (!contract) return null;

    const currentTemplateId = contract.contract_template_id || contract.template_id || "";
    const selectedTemplateBody = selectedTemplate?.body_html || "";
    const shouldUseSelectedTemplateBody =
      !!formData.template_id &&
      !!selectedTemplateBody &&
      (formData.template_id !== currentTemplateId || !contract.contract_body_html);

    return {
      ...contract,
      contract_template_id: formData.template_id || currentTemplateId || null,
      contract_body_html: shouldUseSelectedTemplateBody
        ? selectedTemplateBody
        : contract.contract_body_html || selectedTemplateBody || "",
    };
  }, [contract, formData.template_id, selectedTemplate]);

  const InfoRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <div className="text-sm font-medium mt-0.5">{value || <span className="text-muted-foreground">—</span>}</div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg ${sc.bg} flex items-center justify-center ${sc.color}`}>
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg">
                  {isNew ? "Novo Contrato" : contract?.contract_number || "Contrato"}
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  {isNew ? "Criar novo contrato a partir de uma proposta." : (
                    <span className="flex items-center gap-1.5">
                      <Badge className={`${sc.bg} ${sc.color} border-0 text-[10px] px-1.5 py-0 gap-1`}>
                        {sc.icon} {getTranslatedStatus(contract?.status || "draft")}
                      </Badge>
                      {contract?._clientName && (
                        <span className="text-muted-foreground">· {contract._clientName}</span>
                      )}
                    </span>
                  )}
                </DialogDescription>
              </div>
            </div>
            {!isNew && contract?.total_value != null && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Valor total</p>
                <p className="text-lg font-bold text-primary">{formatCurrency(contract.total_value, contract.currency)}</p>
              </div>
            )}
          </div>
        </DialogHeader>

        {!isNew && contract && <PipelineBreadcrumb entityType="contract" entityId={contract.id} />}

        {/* Contract progress bar for existing contracts */}
        {!isNew && contractProgress && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progresso do contrato</span>
              <span className="font-medium">
                {contractProgress.daysLeft > 0
                  ? `${contractProgress.daysLeft} dias restantes`
                  : "Expirado"}
              </span>
            </div>
            <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  contractProgress.daysLeft <= 0 ? "bg-red-500"
                    : contractProgress.daysLeft <= 30 ? "bg-red-400"
                    : contractProgress.daysLeft <= 90 ? "bg-orange-400"
                    : "bg-green-500"
                }`}
                style={{ width: `${contractProgress.pct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{contract.start_date ? new Date(contract.start_date).toLocaleDateString("pt-PT") : ""}</span>
              <span>{contractProgress.pct}% decorrido · {contractProgress.totalDays} dias totais</span>
              <span>{contract.end_date ? new Date(contract.end_date).toLocaleDateString("pt-PT") : ""}</span>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-1">
          <TabsList className="w-full">
            <TabsTrigger value="detalhes" className="flex-1 text-xs">
              <FileText className="h-3.5 w-3.5 mr-1" /> Detalhes
            </TabsTrigger>
            {!isNew && (
              <TabsTrigger value="contrato" className="flex-1 text-xs">
                <FileText className="h-3.5 w-3.5 mr-1" /> Contrato
              </TabsTrigger>
            )}
            {!isNew && (
              <TabsTrigger value="documentos" className="flex-1 text-xs">
                <Paperclip className="h-3.5 w-3.5 mr-1" /> Documentos
              </TabsTrigger>
            )}
            {!isNew && (
              <TabsTrigger value="info" className="flex-1 text-xs">
                <Building2 className="h-3.5 w-3.5 mr-1" /> Info
              </TabsTrigger>
            )}
            <TabsTrigger value="notas" className="flex-1 text-xs">
              <StickyNote className="h-3.5 w-3.5 mr-1" /> Notas
            </TabsTrigger>
          </TabsList>

            {!isNew && contract && (
              <TabsContent value="contrato" className="mt-4">
                <ContractBodyTab
                  key={`${contract.id}-${formData.template_id || previewContract?.contract_template_id || "manual"}`}
                  contract={previewContract}
                  readOnly={["signed", "active"].includes(contract.status)}
                />
              </TabsContent>
            )}

            {!isNew && contract && (
              <TabsContent value="documentos" className="mt-4">
                <DocumentsTab
                  entityType="contract"
                  entityId={contract.id}
                  organizationId={contract.organization_id}
                  readOnly={false}
                />
              </TabsContent>
            )}

            {!isNew && contract && (
              <TabsContent value="info" className="mt-4">
                <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
                  <InfoRow icon={<Hash className="h-4 w-4" />} label="Nº Contrato" value={contract.contract_number} />
                  <Separator />
                  <InfoRow icon={<User className="h-4 w-4" />} label="Cliente / Entidade" value={contract._clientName} />
                  <Separator />
                  <InfoRow icon={<Euro className="h-4 w-4" />} label="Valor" value={formatCurrency(contract.total_value, contract.currency)} />
                  <Separator />
                  <InfoRow icon={<CreditCard className="h-4 w-4" />} label="Condições de pagamento" value={contract.payment_terms} />
                  <Separator />
                  <InfoRow icon={<Calendar className="h-4 w-4" />} label="Vigência" value={
                    contract.start_date || contract.end_date
                      ? `${contract.start_date ? new Date(contract.start_date).toLocaleDateString("pt-PT") : "—"} → ${contract.end_date ? new Date(contract.end_date).toLocaleDateString("pt-PT") : "—"}`
                      : null
                  } />
                  <Separator />
                  <InfoRow icon={<User className="h-4 w-4" />} label="Criado por" value={contract.assigned_to_name} />
                  <Separator />
                  <InfoRow icon={<Clock className="h-4 w-4" />} label="Criado em" value={new Date(contract.created_at).toLocaleString("pt-PT")} />
                  <Separator />
                  <InfoRow icon={<Clock className="h-4 w-4" />} label="Última actualização" value={new Date(contract.updated_at).toLocaleString("pt-PT")} />
                </div>
              </TabsContent>
            )}

          <form onSubmit={handleSubmit}>
            <TabsContent value="detalhes" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Proposta *
                </Label>
                <Select
                  value={formData.proposal_id}
                  onValueChange={v => setFormData({ ...formData, proposal_id: v })}
                  disabled={!!contract}
                >
                  <SelectTrigger><SelectValue placeholder="Seleccionar proposta" /></SelectTrigger>
                  <SelectContent>
                    {proposals.length === 0 ? (
                      <div className="px-2 py-4 text-sm text-muted-foreground text-center">Nenhuma proposta encontrada</div>
                    ) : (
                      proposals.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {getProposalName(p)} - {formatCurrency(getProposalTotal(p), "EUR")}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Template
                </Label>
                <Select value={formData.template_id} onValueChange={v => setFormData({ ...formData, template_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar template" /></SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>



              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Data Início
                  </Label>
                  <Input type="date" value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Data Fim
                  </Label>
                  <Input type="date" value={formData.end_date} onChange={e => setFormData({ ...formData, end_date: e.target.value })} />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-muted-foreground" /> Condições de pagamento
                </Label>
                <Input
                  placeholder="Ex: 30 dias, transferência bancária"
                  value={formData.payment_terms}
                  onChange={e => setFormData({ ...formData, payment_terms: e.target.value })}
                />
              </div>
            </TabsContent>

            <TabsContent value="notas" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <StickyNote className="h-3.5 w-3.5 text-muted-foreground" /> Notas internas
                </Label>
                <Textarea
                  placeholder="Notas sobre este contrato..."
                  rows={5}
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
            </TabsContent>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={(!isNew && !contract) || (isNew && !formData.proposal_id) || saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                {isNew ? "Criar" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
