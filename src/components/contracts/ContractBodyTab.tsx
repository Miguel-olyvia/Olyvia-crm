import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/RichTextEditor";
import { toast } from "sonner";
import { Eye, RefreshCw, Pencil, FileText, Loader2, ShieldCheck, PenTool, Smartphone } from "lucide-react";
import { extractPromptTokens, substituteVariables } from "@/utils/contractVariables";
import { GenerateFromTemplateDialog } from "@/components/contracts/GenerateFromTemplateDialog";
import { FillPromptVariablesDialog, type PromptVariable } from "@/components/contracts/FillPromptVariablesDialog";
import { useDocumentSettings } from "@/hooks/useDocumentSettings";
import { gatherContractData, applyQuoteItemsToken, applyFormulaChips, stripVariableChips, injectSignatoryIntoSignatureBlock, fetchTemplateSignatory } from "@/components/contracts/contractDocument";
import { renderContractHeaderHtml } from "@/components/contracts/contractHeader";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

interface ContractBodyTabProps {
  contract: any;
  readOnly?: boolean;
}

export function ContractBodyTab({ contract, readOnly }: ContractBodyTabProps) {
  const { activeCompany } = useCompany();
  const { settings: docSettings } = useDocumentSettings();
  const queryClient = useQueryClient();
  const [bodyHtml, setBodyHtml] = useState(contract?.contract_body_html || "");
  const [isEditing, setIsEditing] = useState(!contract?.contract_body_html);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [generatedFromName, setGeneratedFromName] = useState<string | null>(null);
  const [showCompanySign, setShowCompanySign] = useState(false);
  const [companySigning, setCompanySigning] = useState(false);

  // Prompt-at-fill custom variables dialog state
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [pendingPromptVars, setPendingPromptVars] = useState<PromptVariable[]>([]);
  const [pendingGeneration, setPendingGeneration] = useState<{ html: string; templateId: string; templateName: string } | null>(null);

  // SMS OTP state for company signature
  const [otpStep, setOtpStep] = useState<"idle" | "sending" | "input" | "verifying" | "verified">("idle");
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");

  useEffect(() => {
    setBodyHtml(contract?.contract_body_html || "");
    setIsEditing(!contract?.contract_body_html);
    setGeneratedFromName(null);
  }, [contract?.id, contract?.contract_body_html]);

  const isLocked = readOnly || ["signed", "active"].includes(contract?.status);

  const { data: templates = [] } = useQuery({
    queryKey: ["contract-templates-for-body", activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany?.id) return [];
      const { data, error } = await (supabase as any)
        .from("client_contract_templates")
        .select("id, name, body_html, doc_settings, is_default")
        .eq("organization_id", activeCompany.id)
        .eq("is_active", true)
        .order("is_default", { ascending: false });
      return data || [];
    },
    enabled: !!activeCompany?.id,
  });

  const { data: variableData } = useQuery({
    queryKey: ["contract-variable-data", contract?.id, activeCompany?.id],
    queryFn: async () => {
      if (!contract) return null;
      return await gatherContractData(contract, activeCompany?.id);
    },
    enabled: !!contract,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const { data: organization } = useQuery({
    queryKey: ["contract-org", activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany?.id) return null;
      const { data } = await (supabase as any).from("anew_organizations").select("name, metadata, logo_url").eq("id", activeCompany.id).single();
      return data;
    },
    enabled: !!activeCompany?.id,
  });
  const previewContext = { variableData, organization } as any;

  const saveMutation = useMutation({
    mutationFn: async (html: string) => {
      const { error } = await (supabase as any)
        .from("client_contracts")
        .update({ contract_body_html: html })
        .eq("id", contract.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Corpo do contrato guardado com sucesso");
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["client-contracts"] });
    },
    onError: (err: any) => toast.error("Erro ao guardar: " + err.message),
  });

  const finalizeGeneration = async (html: string, templateId: string, templateName: string, promptValues: Record<string, string>) => {
    // Apply auto-resolved substitutions (empresa_nome, etc.) — html may be raw baseWithItems
    // from GenerateFromTemplateDialog which passes pre-substitution HTML to allow full token detection.
    let base = variableData ? substituteVariables(html, variableData as any) : html;
    // Bake prompt values filled by the user permanently into the body.
    let withPrompts = base;
    for (const [k, v] of Object.entries(promptValues)) {
      const safeKey = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      withPrompts = withPrompts.replace(new RegExp(`\\{\\{\\s*${safeKey}\\s*\\}\\}`, "g"), v);
    }
    // Injecta o signatário da minuta no bloco final de assinatura (markup, não token).
    const sig = await fetchTemplateSignatory(templateId);
    const finalHtml = injectSignatoryIntoSignatureBlock(withPrompts, sig?.name, sig?.roleName);
    setBodyHtml(finalHtml);
    setGeneratedFromName(templateName);
    setIsEditing(true);
    toast.success(`Contrato gerado a partir da minuta "${templateName}". Reveja e guarde.`);
    const updatePayload: any = { contract_template_id: templateId };
    if (promptValues && Object.keys(promptValues).length > 0) {
      // Merge with existing prompt_values so previously filled keys persist.
      updatePayload.prompt_values = { ...(contract?.prompt_values || {}), ...promptValues };
    }
    (supabase as any)
      .from("client_contracts")
      .update(updatePayload)
      .eq("id", contract.id)
      .then(() => queryClient.invalidateQueries({ queryKey: ["client-contracts"] }));
  };

  const handleGenerated = async (html: string, templateId: string, templateName: string) => {
    try {
      const unknownKeys = extractPromptTokens(html);

      if (unknownKeys.length > 0) {
        // 2. Look up definitions for the detected tokens (same org + parent orgs).
        const { data: customVars } = await (supabase as any)
          .from("custom_contract_variables")
          .select("variable_key, label, description, default_value, linked_field_key")
          .in("organization_id", [activeCompany?.id].filter(Boolean))
          .eq("is_active", true)
          .is("default_value", null)
          .is("linked_field_key", null);

        const varMap = new Map<string, { label: string; description: string | null }>();
        for (const v of (customVars || []) as Array<{ variable_key: string; label: string; description: string | null }>) {
          const bareKey = String(v.variable_key || "").replace(/^\{\{|\}\}$/g, "").trim();
          if (bareKey) varMap.set(bareKey, { label: v.label, description: v.description });
        }

        // 3. Build prompt list — tokens with a "preencher" definition in the DB.
        //    Tokens without a definition are left in the HTML (auto-resolved elsewhere or kept as-is).
        const prompts: PromptVariable[] = unknownKeys
          .filter(k => varMap.has(k))
          .map(k => ({ key: k, label: varMap.get(k)!.label, description: varMap.get(k)!.description }));

        if (prompts.length > 0) {
          setPendingPromptVars(prompts);
          setPendingGeneration({ html, templateId, templateName });
          setPromptDialogOpen(true);
          return;
        }
      }
    } catch (e) {
      console.error("Falha a detectar variáveis a preencher:", e);
    }

    finalizeGeneration(html, templateId, templateName, {});
  };

  // ── SMS OTP flow for company signature ──
  const handleSendOtp = async () => {
    setOtpStep("sending");
    setOtpError("");
    try {
      const { data, error } = await supabase.functions.invoke("sms-otp", {
        body: {
          action: "send_otp",
          reference_id: contract.id,
          reference_type: "contract_company",
          purpose: "company_signature",
          caller_type: "crm",
        },
      });

      // Try to extract structured payload even when invoke flagged non-2xx
      let payload: any = data;
      if (error && !payload) {
        try { payload = await (error as any).context?.json?.(); } catch { /* ignore */ }
      }

      if (payload?.error) {
        if (payload.error === "no_phone") {
          setOtpError(payload.message || "Não foi encontrado um número de telefone associado à sua conta. Atualize o seu perfil.");
          setOtpStep("idle");
          return;
        }
        throw new Error(payload.message || payload.error);
      }
      if (error) throw new Error(error.message);

      setMaskedPhone(payload?.masked_phone || "");
      setOtpStep("input");
      toast.success(`Código SMS enviado para ${payload?.masked_phone}`);
    } catch (err: any) {
      setOtpError(err.message);
      setOtpStep("idle");
      toast.error("Erro ao enviar SMS: " + err.message);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) return;
    setOtpStep("verifying");
    setOtpError("");
    try {
      const { data, error } = await supabase.functions.invoke("sms-otp", {
        body: {
          action: "verify_otp",
          reference_id: contract.id,
          reference_type: "contract_company",
          code: otpCode,
          purpose: "company_signature",
          caller_type: "crm",
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) {
        setOtpError(data.message || "Código inválido");
        setOtpStep("input");
        setOtpCode("");
        return;
      }

      setOtpStep("verified");
      // Sign the contract after OTP verification
      await handleCompanySignAfterOtp();
    } catch (err: any) {
      setOtpError(err.message);
      setOtpStep("input");
      setOtpCode("");
    }
  };

  const handleCompanySignAfterOtp = async () => {
    setCompanySigning(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data: anewUser } = await (supabase as any)
        .from("anew_users")
        .select("id, name")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      const signerName = anewUser?.name || user.email || "Representante";

      await (supabase as any)
        .from("client_contracts")
        .update({
          company_signature_date: new Date().toISOString(),
          company_signed_by_name: signerName,
          company_signed_by_id: anewUser?.id || user.id,
        })
        .eq("id", contract.id);

      queryClient.invalidateQueries({ queryKey: ["client-contracts"] });
      toast.success("Contrato assinado pela empresa via SMS OTP!");
      setShowCompanySign(false);
      resetOtpState();
    } catch (err: any) {
      toast.error("Erro ao assinar: " + err.message);
    } finally {
      setCompanySigning(false);
    }
  };

  const resetOtpState = () => {
    setOtpStep("idle");
    setOtpCode("");
    setOtpError("");
    setMaskedPhone("");
  };

  const handleCloseSignDialog = () => {
    setShowCompanySign(false);
    resetOtpState();
  };

  const renderDocumentPreview = () => {
    const ds = docSettings as any;
    const variableData = previewContext?.variableData;
    const organization = previewContext?.organization;
    const metadata = organization?.metadata || {};
    const isLandscape = ds?.page_orientation === "landscape";
    const pageWidth = isLandscape ? "297mm" : "210mm";
    const pageHeight = isLandscape ? "210mm" : "297mm";
    const headerLayout = ds?.header_layout || "left";
    const logoUrl = ds?.logo_url || organization?.logo_url || null;
    const companyName = ds?.company_name_override || variableData?.empresa_nome || organization?.name || activeCompany?.name || "";

    const headerLineOne = [
      ds?.show_nif !== false && variableData?.empresa_nif ? `NIF: ${variableData.empresa_nif}` : null,
      ds?.show_address !== false && variableData?.empresa_morada ? variableData.empresa_morada : null,
    ].filter(Boolean).join(" · ");

    const phoneVal = (variableData as any)?.empresa_telefone || metadata?.phone;
    const emailVal = (variableData as any)?.empresa_email || metadata?.email;
    const websiteVal = ds?.company_website || (variableData as any)?.empresa_website || metadata?.website;
    const headerLineTwo = [
      ds?.show_phone !== false && phoneVal ? `Tel: ${phoneVal}` : null,
      ds?.show_email !== false && emailVal ? emailVal : null,
      ds?.show_website !== false && websiteVal ? websiteVal : null,
    ].filter(Boolean).join(" · ");

    const currentTemplate = (templates as any[]).find(t => t.id === contract?.contract_template_id);
    const templateDocSettings = currentTemplate?.doc_settings || {};
    const mergedDs = { ...(ds || {}), ...(templateDocSettings || {}) };
    const primaryColor = (templateDocSettings as any)?.primary_color || ds?.accent_color || ds?.primary_color || "#7C3AED";
    // autoAppendIfMissing=false: o body do contrato guardado já tem a tabela
    // substituída na criação; não duplicar ao re-renderizar o preview.
    const htmlWithItems = applyQuoteItemsToken(bodyHtml, variableData || {}, templateDocSettings, primaryColor, false);
    const substituted = variableData
      ? substituteVariables(htmlWithItems, variableData)
      : htmlWithItems;
    const processedHtml = applyFormulaChips(substituted, (variableData || {}) as any);
    const withSignatory = injectSignatoryIntoSignatureBlock(
      processedHtml,
      (variableData as any)?.signatario_nome,
      (variableData as any)?.signatario_cargo,
    );

    const sanitized = DOMPurify.sanitize(stripVariableChips(withSignatory));

    return (
      <div className="flex justify-center overflow-auto max-h-[70vh]">
        <div
          className="bg-white shadow-lg border"
          style={{
            width: pageWidth,
            minHeight: pageHeight,
            padding: `${mergedDs?.margin_top ?? 20}mm ${mergedDs?.margin_right ?? 20}mm ${mergedDs?.margin_bottom ?? 20}mm ${mergedDs?.margin_left ?? 20}mm`,
            fontFamily: ds?.body_font || "'Segoe UI', sans-serif",
            fontSize: `${ds?.body_font_size || 11}pt`,
            color: "#1a1a1a",
            lineHeight: "1.6",
          }}
        >
          {/* Shared header (matches template preview & PDF) */}
          {mergedDs?.show_header !== false && (
            <div
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(renderContractHeaderHtml(mergedDs as any, (variableData || {}) as any)),
              }}
            />
          )}

          {/* Body */}
          <style>{`
            .contract-body-content table td { color: #111827 !important; }
          `}</style>
          <div
            className="contract-body-content"
            dangerouslySetInnerHTML={{ __html: sanitized }}
          />

          {/* Signature block - show when either party has signed */}
          {(contract?.company_signature_date || contract?.signature_date) && (
            <div className="mt-10 pt-6 border-t-2 border-dashed" style={{ borderColor: "#d1d5db" }}>
              <div className="flex justify-between gap-8">
                {/* Company (First Party) */}
                <div className="text-center">
                  {contract.company_signature_date ? (
                    <div style={{ width: "200px", margin: "0 auto 8px" }}>
                      <div className="flex items-center justify-center gap-2" style={{ color: "#2563eb" }}>
                        <ShieldCheck style={{ width: "16px", height: "16px" }} />
                        <span style={{ fontSize: "11px", fontWeight: 600 }}>Assinado via SMS OTP</span>
                      </div>
                      {contract.company_signed_by_name && (
                        <p className="text-xs font-medium mt-1" style={{ color: "#374151" }}>{contract.company_signed_by_name}</p>
                      )}
                      <p className="text-xs mt-1" style={{ color: "#6b7280" }}>
                        {format(new Date(contract.company_signature_date), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: pt })}
                      </p>
                    </div>
                  ) : (
                    <div style={{ width: "200px", margin: "0 auto 8px", color: "#9ca3af", fontSize: "11px" }}>
                      Aguarda assinatura
                    </div>
                  )}
                  <div style={{ borderBottom: `1px solid ${contract.company_signature_date ? "#2563eb" : "#9ca3af"}`, width: "200px", margin: "0 auto 8px" }} />
                  <p className="text-sm font-medium" style={{ color: "#6b7280" }}>A PRIMEIRA CONTRATANTE</p>
                </div>

                {/* Client (Second Party) */}
                <div className="text-center">
                  {contract.signature_date ? (
                    <div style={{ width: "200px", margin: "0 auto 8px" }}>
                      <div className="flex items-center justify-center gap-2" style={{ color: "#059669" }}>
                        <ShieldCheck style={{ width: "16px", height: "16px" }} />
                        <span style={{ fontSize: "11px", fontWeight: 600 }}>Assinado via SMS OTP</span>
                      </div>
                      {contract.signed_by_name && (
                        <p className="text-xs font-medium mt-1" style={{ color: "#374151" }}>{contract.signed_by_name}</p>
                      )}
                      <p className="text-xs mt-1" style={{ color: "#6b7280" }}>
                        {format(new Date(contract.signature_date), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: pt })}
                      </p>
                      {contract.signature_ip && (
                        <p className="text-[10px]" style={{ color: "#9ca3af" }}>IP: {contract.signature_ip}</p>
                      )}
                    </div>
                  ) : (
                    <div style={{ width: "200px", margin: "0 auto 8px", color: "#9ca3af", fontSize: "11px" }}>
                      Aguarda assinatura
                    </div>
                  )}
                  <div style={{ borderBottom: `1px solid ${contract.signature_date ? "#059669" : "#9ca3af"}`, width: "200px", margin: "0 auto 8px" }} />
                  <p className="text-sm font-medium" style={{ color: "#6b7280" }}>O SEGUNDO CONTRATANTE</p>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          {ds?.show_footer !== false && ds?.footer_text && (
            <div style={{
              marginTop: "auto",
              paddingTop: "16px",
              borderTop: "1px solid #e5e7eb",
              textAlign: "center",
              fontSize: "7pt",
              color: "#9ca3af",
            }}>
              {ds?.footer_text}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {bodyHtml && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <FileText className="h-3 w-3" />
              {generatedFromName
                ? `Gerado da minuta: ${generatedFromName}`
                : contract?.contract_template_id
                  ? "Gerado da minuta"
                  : "Escrito manualmente"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Company sign button */}
          {bodyHtml && !contract?.company_signature_date && !isEditing && (
            <Button
              size="sm"
              className="gap-1.5"
              style={{ backgroundColor: "#2563eb" }}
              onClick={() => setShowCompanySign(true)}
            >
              <PenTool className="h-3.5 w-3.5 text-white" />
              <span className="text-white">Assinar (Empresa)</span>
            </Button>
          )}
          {contract?.company_signature_date && (
            <Badge variant="outline" className="text-[10px] gap-1 border-blue-300 text-blue-600">
              <PenTool className="h-3 w-3" /> Assinado pela empresa
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => setIsGenerateOpen(true)} disabled={isLocked} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            {bodyHtml ? "Regenerar" : "Gerar de Minuta"}
          </Button>
          {bodyHtml && (
            <>
              <Button variant="outline" size="sm" onClick={() => setIsPreviewOpen(true)} className="gap-1.5">
                <Eye className="h-3.5 w-3.5" /> Preview
              </Button>
              {!isLocked && !isEditing && (
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {isEditing && !isLocked ? (
        <div className="space-y-3">
          <RichTextEditor
            value={bodyHtml}
            onChange={setBodyHtml}
            placeholder="Escreva o corpo do contrato ou gere a partir de uma minuta..."
            variables={CONTRACT_VARIABLES}
            minHeight="400px"
          />
          <div className="flex justify-end gap-2">
            {contract?.contract_body_html && (
              <Button variant="outline" onClick={() => { setBodyHtml(contract.contract_body_html); setIsEditing(false); }}>
                Cancelar
              </Button>
            )}
            <Button onClick={() => saveMutation.mutate(bodyHtml)} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Guardar
            </Button>
          </div>
        </div>
      ) : bodyHtml ? (
        renderDocumentPreview()
      ) : (
        <div className="text-center py-12 border rounded-lg border-dashed text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Sem corpo de contrato</p>
          <p className="text-xs mt-1">Gere a partir de uma minuta ou escreva manualmente</p>
        </div>
      )}

      <GenerateFromTemplateDialog
        open={isGenerateOpen}
        onOpenChange={setIsGenerateOpen}
        templates={templates}
        contract={contract}
        orgId={activeCompany?.id}
        hasExistingBody={!!bodyHtml}
        onGenerated={handleGenerated}
      />

      <FillPromptVariablesDialog
        open={promptDialogOpen}
        onOpenChange={(open) => {
          setPromptDialogOpen(open);
          if (!open) {
            setPendingPromptVars([]);
            setPendingGeneration(null);
          }
        }}
        variables={pendingPromptVars}
        onConfirm={(values) => {
          if (pendingGeneration) {
            finalizeGeneration(pendingGeneration.html, pendingGeneration.templateId, pendingGeneration.templateName, values);
          }
          setPendingPromptVars([]);
          setPendingGeneration(null);
        }}
      />

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pré-visualização do Contrato</DialogTitle>
          </DialogHeader>
          {renderDocumentPreview()}
        </DialogContent>
      </Dialog>

      {/* Company Sign via SMS OTP Dialog */}
      <Dialog open={showCompanySign} onOpenChange={handleCloseSignDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenTool className="h-5 w-5" /> Assinar contrato pela empresa
            </DialogTitle>
            <DialogDescription>
              A assinatura será validada através de um código SMS enviado para o seu telemóvel.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {otpStep === "idle" && (
              <div className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                  <Smartphone className="h-8 w-8 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Será enviado um código de 6 dígitos para o telemóvel associado à sua conta.
                  </p>
                </div>
                {otpError && (
                  <p className="text-sm text-destructive">{otpError}</p>
                )}
                <Button onClick={handleSendOtp} className="w-full gap-2" style={{ backgroundColor: "#2563eb" }}>
                  <Smartphone className="h-4 w-4 text-white" />
                  <span className="text-white">Enviar código SMS</span>
                </Button>
              </div>
            )}

            {otpStep === "sending" && (
              <div className="text-center py-4">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">A enviar código SMS...</p>
              </div>
            )}

            {otpStep === "input" && (
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  Código enviado para <strong>{maskedPhone}</strong>
                </p>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {otpError && (
                  <p className="text-sm text-destructive">{otpError}</p>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleSendOtp} className="flex-1 text-xs">
                    Reenviar código
                  </Button>
                  <Button
                    onClick={handleVerifyOtp}
                    disabled={otpCode.length !== 6}
                    className="flex-1 gap-1.5"
                    style={{ backgroundColor: "#2563eb" }}
                  >
                    {companySigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4 text-white" />}
                    <span className="text-white">Verificar e Assinar</span>
                  </Button>
                </div>
              </div>
            )}

            {otpStep === "verifying" && (
              <div className="text-center py-4">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">A verificar código e assinar...</p>
              </div>
            )}

            {otpStep === "verified" && (
              <div className="text-center py-4">
                <ShieldCheck className="h-10 w-10 text-green-600 mx-auto mb-3" />
                <p className="text-sm font-medium text-green-600">Contrato assinado com sucesso!</p>
              </div>
            )}
          </div>

          {otpStep === "idle" && (
            <DialogFooter>
              <Button variant="ghost" onClick={handleCloseSignDialog}>
                Cancelar
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
