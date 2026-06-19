import { useState, useEffect } from "react";
import { Send, Mail, User, MessageSquare, Loader2, Plus } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { TemplateSelector } from "@/components/email-templates/TemplateSelector";
import { resolveEntityVariables } from "@/utils/emailTemplateVariables";
import { resolveSendProposalAlerts } from "@/lib/notifications/resolveSendProposalAlerts";
import { MultiEmailInput } from "@/components/email/MultiEmailInput";

interface SendProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: {
    id: string;
    title: string;
    deal_id?: string | null;
    organization_id?: string | null;
  } | null;
  onSent?: () => void;
  initialSubject?: string;
  initialMessage?: string;
}

export function SendProposalDialog({ open, onOpenChange, proposal, onSent, initialSubject, initialMessage }: SendProposalDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [resolvedVars, setResolvedVars] = useState<Record<string, string>>({});
  const [entityId, setEntityId] = useState<string | null>(null);

  useEffect(() => {
    if (open && proposal) {
      setSubject(initialSubject || `Proposta: ${proposal.title}`);
      setCc([]);
      setShowCc(false);

      const fetchRecipientData = async () => {
        setLoading(true);
        let name = "";
        let email = "";
        let firstName = "";
        let resolvedEntityId: string | null = null;

        try {
          const vars = await resolveEntityVariables("proposals", proposal.id, proposal.organization_id || undefined);
          setResolvedVars(vars);

          const { data: proposalData } = await (supabase.from("proposals") as any)
            .select("entity_id, deal_id")
            .eq("id", proposal.id)
            .maybeSingle();

          resolvedEntityId = proposalData?.entity_id || null;

          if (!resolvedEntityId && (proposalData?.deal_id || proposal.deal_id)) {
            const dealId = proposalData?.deal_id || proposal.deal_id;
            const { data: deal } = await supabase.from("deals").select("entity_id").eq("id", dealId).maybeSingle();
            resolvedEntityId = deal?.entity_id || null;
          }

          if (resolvedEntityId) {
            const [entityRes, emailRes] = await Promise.all([
              supabase.from("anew_entities").select("display_name, first_name, last_name").eq("id", resolvedEntityId).maybeSingle(),
              supabase.from("anew_entity_emails").select("email").eq("entity_id", resolvedEntityId).eq("is_primary", true).maybeSingle(),
            ]);

            if (entityRes.data) {
              firstName = entityRes.data.first_name || "";
              name = entityRes.data.display_name || `${entityRes.data.first_name || ""} ${entityRes.data.last_name || ""}`.trim();
              email = emailRes.data?.email || "";
            }
          }

          setEntityId(resolvedEntityId);
          setRecipientName(name);
          setRecipientEmail(email);
          setRecipients(email ? [email] : []);
          setMessage(initialMessage || `Olá${firstName ? ` ${firstName}` : ""},\n\nSegue a proposta "${proposal.title}" para a sua análise.\n\nClique no link abaixo para visualizar os detalhes completos e aceitar ou recusar a proposta.\n\nAguardamos o seu feedback.\n\nCumprimentos`);
        } catch (error) {
          console.error("Error fetching recipient data:", error);
        } finally {
          setLoading(false);
        }
      };

      fetchRecipientData();
    }
  }, [open, proposal]);

  const handleTemplateSelect = (templateSubject: string, templateBody: string) => {
    setSubject(templateSubject);
    setMessage(templateBody);
  };

  const handleSend = async () => {
    if (!proposal || !recipientEmail) return;
    setSending(true);
    try {
      const finalRecipients = recipients.length ? recipients : [recipientEmail];
      const { data, error } = await supabase.functions.invoke("send-proposal-email", {
        body: { proposal_id: proposal.id, recipient_email: recipientEmail, recipient_name: recipientName, recipients: finalRecipients, cc, subject, message },
      });
      if (error) throw new Error(error.message || "Erro ao enviar");
      if (data?.error) throw new Error(data.error);
      await resolveSendProposalAlerts(entityId, proposal.organization_id || null);
      toast({ title: "Proposta enviada", description: `Email enviado para ${recipientEmail}` });
      onOpenChange(false);
      onSent?.();
    } catch (error: any) {
      console.error("Error sending proposal:", error);
      toast({ title: "Erro ao enviar", description: error.message || "Não foi possível enviar a proposta", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Enviar Proposta
          </DialogTitle>
          <DialogDescription>
            Envie a proposta por email para o cliente. Será incluído um link de tracking.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Template Selector */}
          <div className="flex items-center gap-2">
            <TemplateSelector
              module="proposals"
              organizationId={proposal?.organization_id || undefined}
              variables={resolvedVars}
              onSelect={handleTemplateSelect}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipientName"><User className="h-3 w-3 inline mr-1" />Nome do Destinatário</Label>
            <Input id="recipientName" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Nome do cliente" />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              <span><Mail className="h-3 w-3 inline mr-1" />Para *</span>
              {!showCc && (
                <button type="button" onClick={() => setShowCc(true)} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Adicionar CC
                </button>
              )}
            </Label>
            <MultiEmailInput values={recipients} onChange={setRecipients} primaryEmail={recipientEmail} placeholder="cliente@email.com" />
          </div>
          {showCc && (
            <div className="space-y-2">
              <Label className="flex items-center justify-between">
                <span><Mail className="h-3 w-3 inline mr-1" />CC</span>
                <button type="button" onClick={() => { setShowCc(false); setCc([]); }} className="text-xs text-muted-foreground hover:underline">Remover CC</button>
              </Label>
              <MultiEmailInput values={cc} onChange={setCc} placeholder="copia@email.com" />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="subject">Assunto</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Assunto do email" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message"><MessageSquare className="h-3 w-3 inline mr-1" />Mensagem</Label>
            <Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Mensagem personalizada..." rows={6} />
            <p className="text-xs text-muted-foreground">O link para visualizar a proposta será adicionado automaticamente.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={sending || loading || !recipientEmail}>
            {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Send className="h-4 w-4 mr-2" />
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
