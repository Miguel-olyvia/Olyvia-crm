import { useState, useEffect, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Send, AlertCircle, Settings, Paperclip, X, Plus, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RichTextEditor } from "@/components/RichTextEditor";
import { TemplateSelector } from "@/components/email-templates/TemplateSelector";
import { getVariablesForModule, replaceVariables, resolveEntityVariables } from "@/utils/emailTemplateVariables";
import { useNavigate } from "react-router-dom";
import type { PdfAttachment } from "@/components/contacts/RegisterCallDialog";
import { MultiEmailInput } from "@/components/email/MultiEmailInput";

interface SendEntityEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: "leads" | "contacts" | "clients" | "contracts";
  entityId: string;
  entityName: string;
  entityEmail: string;
  organizationId?: string;
  onSent?: () => void;
  pdfAttachment?: PdfAttachment | null;
  /** For leads module: the lead ID to update last_contact_at */
  leadId?: string;
  /** For contracts module: the contract ID to log in contract_sends */
  contractId?: string;
  initialSubject?: string;
  initialMessage?: string;
}

export function SendEntityEmailDialog({
  open, onOpenChange, module, entityId, entityName, entityEmail,
  organizationId, onSent, pdfAttachment, leadId, contractId,
  initialSubject, initialMessage,
}: SendEntityEmailDialogProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [to, setTo] = useState(entityEmail);
  const [recipients, setRecipients] = useState<string[]>(entityEmail ? [entityEmail] : []);
  const [cc, setCc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [smtpConfig, setSmtpConfig] = useState<any>(null);
  const [smtpLoading, setSmtpLoading] = useState(true);
  const [noSmtp, setNoSmtp] = useState(false);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<File[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [variablesLoading, setVariablesLoading] = useState(false);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setTo(entityEmail);
      setRecipients(entityEmail ? [entityEmail] : []);
      setCc([]);
      setShowCc(false);
      setSubject(initialSubject || "");
      setBodyHtml(initialMessage || "");
      setAttachments([]);
      setVariables({});
      loadSmtp();
      loadVariables();
    }
  }, [open, entityEmail, entityId]);

  async function loadSmtp() {
    setSmtpLoading(true);
    setNoSmtp(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setNoSmtp(true); return; }
      setUserId(user.id);

      // Check user SMTP
      const { data: userSmtp } = await (supabase as any)
        .from("user_smtp_settings")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .limit(1);

      if (userSmtp?.[0]) {
        setSmtpConfig(userSmtp[0]);
        return;
      }

      // Check org SMTP
      if (organizationId) {
        const { data: orgSmtp } = await (supabase as any)
          .from("organization_smtp_settings")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("is_default", { ascending: false })
          .limit(1);
        if (orgSmtp?.[0]) {
          setSmtpConfig(orgSmtp[0]);
          return;
        }
      }

      setNoSmtp(true);
    } catch (err) {
      console.error("Error loading SMTP:", err);
      setNoSmtp(true);
    } finally {
      setSmtpLoading(false);
    }
  }

  async function loadVariables() {
    setVariablesLoading(true);
    try {
      const vars = await resolveEntityVariables(module, entityId, organizationId);
      setVariables(vars);
    } catch (err) {
      console.error("Error loading variables:", err);
    } finally {
      setVariablesLoading(false);
    }
  }

  async function handleTemplateSelect(subj: string, body: string, _templateId: string) {
    setVariablesLoading(true);
    try {
      const freshVars = await resolveEntityVariables(module, entityId, organizationId);
      setVariables(freshVars);
      setSubject(replaceVariables(subj, freshVars));
      setBodyHtml(replaceVariables(body, freshVars));
    } catch (err) {
      console.error("Error applying template variables:", err);
      setSubject(replaceVariables(subj, variables));
      setBodyHtml(replaceVariables(body, variables));
    } finally {
      setVariablesLoading(false);
    }
  }

  function handleAddFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  }

  function removeAttachment(idx: number) {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  }

  // Build rich text variables for the editor
  const editorVariables = getVariablesForModule(module).map(v => ({
    key: `{{${v.key}}}`,
    label: v.label,
    description: v.category,
  }));

  async function handleSend() {
    if (!to || !subject) {
      toast({ title: "Preenche o destinatário e o assunto", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      // Build attachments array for edge function
      const emailAttachments: { filename: string; content: string; contentType?: string }[] = [];

      // Add PDF attachment from context (quote/proposal)
      if (pdfAttachment?.base64) {
        emailAttachments.push({
          filename: pdfAttachment.fileName,
          content: pdfAttachment.base64,
          contentType: "application/pdf",
        });
      }

      // Add user-selected file attachments
      for (const file of attachments) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        emailAttachments.push({
          filename: file.name,
          content: base64,
          contentType: file.type || "application/octet-stream",
        });
      }

      const finalRecipients = recipients.length ? recipients : [to];
      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          user_id: userId,
          organization_id: organizationId,
          entity_id: entityId || undefined,
          to,
          recipients: finalRecipients,
          cc,
          subject,
          html: bodyHtml || "<p></p>",
          attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
        },
      });
      if (error) throw error;

      // ── Tracking pós-envio (não falhar UX se algo abaixo falhar) ──
      // Resolve business id once
      let interactionCreatedBy: string | null = null;
      if (userId) {
        try {
          const { data: anewUser } = await supabase
            .from("anew_users")
            .select("id")
            .eq("auth_user_id", userId)
            .maybeSingle();
          interactionCreatedBy = anewUser?.id || null;
        } catch {}
      }

      // contract_sends para módulo contratos
      if (module === "contracts" && contractId) {
        try {
          await (supabase as any).from("contract_sends").insert({
            contract_id: contractId,
            organization_id: organizationId || null,
            sent_by: interactionCreatedBy,
            recipient_email: to,
            recipient_name: entityName || null,
            subject,
            channel: "email",
            status: "sent",
            sent_at: new Date().toISOString(),
          });
        } catch (e) {
          console.error("[contract-sends] tracking failed", e);
        }
      }

      // Register in entity_interactions for timeline visibility
      if (entityId && organizationId) {
        try {
          await supabase.from("entity_interactions").insert({
            entity_id: entityId,
            organization_id: organizationId,
            interaction_type: "email",
            subject: `Email: ${subject}`,
            notes: `✉️ Email enviado para ${to}\nAssunto: ${subject}`,
            interaction_at: new Date().toISOString(),
            created_by: interactionCreatedBy,
          });
          window.dispatchEvent(new CustomEvent("entity-interaction-created", {
            detail: { entityId },
          }));
        } catch (e) {
          console.error("[entity-interactions] tracking failed", e);
        }

        // Update lead contact fields if this is a leads module email
        if (module === "leads" && leadId) {
          try {
            const { data: currentLead } = await supabase
              .from("anew_leads")
              .select("contact_attempts")
              .eq("id", leadId)
              .maybeSingle();

            await supabase
              .from("anew_leads")
              .update({
                last_contact_at: new Date().toISOString(),
                last_contact_by: interactionCreatedBy,
                last_contact_result: "email_sent",
                contact_attempts: ((currentLead?.contact_attempts as number) || 0) + 1,
              })
              .eq("id", leadId);
          } catch (e) {
            console.error("[leads-contact-update] failed", e);
          }
        }
      }

      toast({ title: "Email enviado com sucesso", description: `✉️ ${subject} → ${to}` });
      onOpenChange(false);
      onSent?.();
    } catch (err: any) {
      console.error("Error sending email:", err);
      toast({ title: "Erro ao enviar email", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-visible">
        <div className="max-h-[calc(90vh-2rem)] overflow-y-auto pr-1">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Enviar email — {entityName}
          </DialogTitle>
        </DialogHeader>

        {noSmtp && !smtpLoading && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>Configura o teu SMTP em Definições para enviar emails.</span>
              <Button variant="outline" size="sm" onClick={() => navigate("/settings?tab=smtp")} className="ml-2 gap-1">
                <Settings className="h-3.5 w-3.5" />
                Configurar SMTP
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {smtpLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* From */}
            {smtpConfig && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">De</Label>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-xs">
                    {smtpConfig.from_email || smtpConfig.smtp_username}
                  </Badge>
                </div>
              </div>
            )}

            {/* To */}
            <div className="space-y-1">
              <Label className="flex items-center justify-between">
                <span><Mail className="h-3 w-3 inline mr-1" />Para</span>
                {!showCc && (
                  <button type="button" onClick={() => setShowCc(true)} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                    <Plus className="h-3 w-3" /> Adicionar CC
                  </button>
                )}
              </Label>
              <MultiEmailInput values={recipients} onChange={setRecipients} primaryEmail={to} placeholder="email@exemplo.com" />
            </div>
            {showCc && (
              <div className="space-y-1">
                <Label className="flex items-center justify-between">
                  <span><Mail className="h-3 w-3 inline mr-1" />CC</span>
                  <button type="button" onClick={() => { setShowCc(false); setCc([]); }} className="text-xs text-muted-foreground hover:underline">Remover CC</button>
                </Label>
                <MultiEmailInput values={cc} onChange={setCc} placeholder="copia@email.com" />
              </div>
            )}

            {/* Template selector + Subject */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="email-subject">Assunto</Label>
                <TemplateSelector
                  module={module}
                  organizationId={organizationId}
                  variables={variables}
                  disabled={variablesLoading}
                  onSelect={handleTemplateSelect}
                />
              </div>
              <Input id="email-subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Assunto do email" />
            </div>

            {/* Body */}
            <div className="space-y-1">
              <Label>Corpo</Label>
              <RichTextEditor
                value={bodyHtml}
                onChange={setBodyHtml}
                placeholder="Escreve o corpo do email..."
                variables={editorVariables}
                minHeight="200px"
              />
            </div>

            {/* Attachments */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-3.5 w-3.5" />
                  Anexar ficheiro
                </Button>
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleAddFiles} />
              </div>
              {/* PDF attachment from context */}
              {pdfAttachment?.base64 && (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Paperclip className="h-3 w-3" />
                    📄 {pdfAttachment.fileName}
                  </Badge>
                </div>
              )}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((file, idx) => (
                    <Badge key={idx} variant="outline" className="gap-1 pr-1">
                      {file.name}
                      <button onClick={() => removeAttachment(idx)} className="ml-1 rounded-full hover:bg-muted p-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={sending || noSmtp || smtpLoading} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </Button>
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
