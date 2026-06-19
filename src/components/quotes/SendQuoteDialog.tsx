import { useState, useEffect, useRef } from "react";
import { Send, Mail, User, MessageSquare, Loader2, Paperclip, X, FileIcon, Plus } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { TemplateSelector } from "@/components/email-templates/TemplateSelector";
import { resolveEntityVariables } from "@/utils/emailTemplateVariables";
import { MultiEmailInput } from "@/components/email/MultiEmailInput";
import { RichTextEditor } from "@/components/RichTextEditor";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";

interface SendQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: {
    id: string;
    quote_number: string | null;
    cliente_id: string | null;
    deal_id?: string | null;
    organization_id?: string | null;
  } | null;
  onSent?: () => void;
  initialSubject?: string;
  initialMessage?: string;
}

export function SendQuoteDialog({ open, onOpenChange, quote, onSent, initialSubject, initialMessage }: SendQuoteDialogProps) {
  const { toast } = useToast();
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
  const [attachments, setAttachments] = useState<Array<{ file: File; id: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_EXT = ["pdf","png","jpg","jpeg","webp","gif","doc","docx","xls","xlsx","csv","txt"];
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

  const formatBytes = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(2)} MB`;

  const handleFilesPicked = (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files);
    const accepted: Array<{ file: File; id: string }> = [];
    let total = attachments.reduce((s, a) => s + a.file.size, 0);
    for (const f of incoming) {
      const ext = f.name.split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_EXT.includes(ext)) {
        toast({ title: "Tipo não permitido", description: `${f.name}: .${ext}`, variant: "destructive" });
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        toast({ title: "Ficheiro demasiado grande", description: `${f.name} excede 10 MB`, variant: "destructive" });
        continue;
      }
      if (total + f.size > MAX_TOTAL_BYTES) {
        toast({ title: "Limite total atingido", description: "Máx. 20 MB no total", variant: "destructive" });
        break;
      }
      total += f.size;
      accepted.push({ file: f, id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2,8)}` });
    }
    if (accepted.length) setAttachments((prev) => [...prev, ...accepted]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  useEffect(() => {
    if (open && quote) {
      const label = quote.quote_number || quote.id.slice(0, 8);
      setSubject(initialSubject || `Orçamento: ${label}`);
      setAttachments([]);
      setCc([]);
      setShowCc(false);

      const fetchRecipientData = async () => {
        setLoading(true);
        let name = "";
        let email = "";
        let firstName = "";

        try {
          // Resolve variables for template substitution
          const vars = await resolveEntityVariables("quotes", quote.id, quote.organization_id || undefined);
          setResolvedVars(vars);

          // Resolve the entity_id from any of the available references on the quote
          let resolvedEntityId: string | null = null;
          let leadFieldValues: Record<string, any> | null = null;

          // 1) Direct entity_id on the quote (newer rows)
          try {
            const { data: quoteRow } = await (supabase as any)
              .from("quotes")
              .select("entity_id")
              .eq("id", quote.id)
              .maybeSingle();
            resolvedEntityId = quoteRow?.entity_id || null;
          } catch { /* column may not exist */ }

          // 2) Via cliente_id -> anew_clients.entity_id
          if (!resolvedEntityId && quote.cliente_id) {
            const { data: clientData } = await (supabase as any)
              .from("anew_clients").select("entity_id").eq("id", quote.cliente_id).maybeSingle();
            resolvedEntityId = clientData?.entity_id || null;
          }

          // 3) Via deal_id -> deals.entity_id, then deals.lead_id -> anew_leads
          if (!resolvedEntityId && quote.deal_id) {
            const { data: deal } = await supabase
              .from("deals").select("entity_id, lead_id").eq("id", quote.deal_id).maybeSingle();
            resolvedEntityId = (deal as any)?.entity_id || null;
            if (!resolvedEntityId && deal?.lead_id) {
              const { data: anewLead } = await (supabase as any)
                .from("anew_leads").select("entity_id, field_values").eq("id", deal.lead_id).maybeSingle();
              resolvedEntityId = anewLead?.entity_id || null;
              leadFieldValues = anewLead?.field_values || null;
            }
          }

          // Fetch entity display_name + primary email (fallback to any email)
          if (resolvedEntityId) {
            const [entityRes, emailsRes] = await Promise.all([
              (supabase as any).from("anew_entities").select("display_name, first_name, last_name").eq("id", resolvedEntityId).maybeSingle(),
              (supabase as any).from("anew_entity_emails").select("email, is_primary").eq("entity_id", resolvedEntityId).order("is_primary", { ascending: false }).limit(1),
            ]);
            const ent = entityRes.data;
            if (ent) {
              name = ent.display_name || `${ent.first_name || ""} ${ent.last_name || ""}`.trim();
              firstName = ent.first_name || (name ? name.split(" ")[0] : "");
            }
            email = emailsRes.data?.[0]?.email || "";
          }

          // Final fallback: lead field_values aliases (po_email, etc.)
          if ((!email || !name) && leadFieldValues) {
            const { extractLeadContactInfo } = await import("@/utils/leadContactInfo");
            const info = extractLeadContactInfo(leadFieldValues);
            if (!email) email = info.email || "";
            if (!name) {
              name = info.name || "";
              firstName = info.firstName || (name ? name.split(" ")[0] : "");
            }
          }

          setRecipientName(name);
          setRecipientEmail(email);
          setRecipients(email ? [email] : []);
          setMessage(initialMessage || `<p>Olá${firstName ? ` ${firstName}` : ""},</p><p>Segue o orçamento "${label}" para a sua análise.</p><p>Aguardamos o seu feedback.</p><p>Cumprimentos</p>`);
        } catch (error) {
          console.error("Error fetching recipient data:", error);
        } finally {
          setLoading(false);
        }
      };

      fetchRecipientData();
    }
  }, [open, quote]);

  const handleTemplateSelect = (templateSubject: string, templateBody: string) => {
    setSubject(templateSubject);
    setMessage(templateBody);
  };

  const handleSend = async () => {
    if (!quote || !recipientEmail) return;
    setSending(true);
    try {
      let extraAttachments: Array<{ filename: string; content: string; contentType: string }> | undefined;
      if (attachments.length) {
        extraAttachments = await Promise.all(
          attachments.map(async (a) => ({
            filename: a.file.name,
            content: await fileToBase64(a.file),
            contentType: a.file.type || "application/octet-stream",
          }))
        );
      }
      const finalRecipients = recipients.length ? recipients : (recipientEmail ? [recipientEmail] : []);
      const { data, error } = await supabase.functions.invoke("send-quote-email", {
        body: {
          quote_id: quote.id,
          recipient_email: recipientEmail,
          recipient_name: recipientName,
          recipients: finalRecipients,
          cc,
          subject,
          message,
          attachments: extraAttachments,
        },
      });
      if (error) throw new Error(error.message || "Erro ao enviar");
      if (data?.error) throw new Error(data.error);
      toast({ title: "Orçamento enviado", description: `Email enviado para ${recipientEmail}` });
      onOpenChange(false);
      onSent?.();
    } catch (error: any) {
      console.error("Error sending quote:", error);
      const description = await getFriendlyErrorMessage(error, "Não foi possível enviar o orçamento");
      toast({ title: "Erro ao enviar", description, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> Enviar Orçamento</DialogTitle>
          <DialogDescription>Envie o orçamento por email para o cliente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Template Selector */}
          <div className="flex items-center gap-2">
            <TemplateSelector
              module="quotes"
              organizationId={quote?.organization_id || undefined}
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
            <MultiEmailInput
              values={recipients}
              onChange={(next) => {
                setRecipients(next);
                // Keep recipientEmail (used for tracking) in sync with the first chip.
                const first = next[0] || "";
                if (first.toLowerCase() !== recipientEmail.toLowerCase()) {
                  setRecipientEmail(first);
                }
              }}
              primaryEmail={recipientEmail}
              allowRemovePrimary
              placeholder="cliente@email.com"
            />
          </div>
          {showCc && (
            <div className="space-y-2">
              <Label className="flex items-center justify-between">
                <span><Mail className="h-3 w-3 inline mr-1" />CC</span>
                <button type="button" onClick={() => { setShowCc(false); setCc([]); }} className="text-xs text-muted-foreground hover:underline">
                  Remover CC
                </button>
              </Label>
              <MultiEmailInput values={cc} onChange={setCc} placeholder="copia@email.com" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="subject">Assunto</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Assunto do email" />
          </div>
          <div className="space-y-2">
            <Label><MessageSquare className="h-3 w-3 inline mr-1" />Mensagem</Label>
            <RichTextEditor value={message} onChange={setMessage} placeholder="Mensagem personalizada..." minHeight="140px" maxHeight="220px" />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              <span><Paperclip className="h-3 w-3 inline mr-1" />Anexos</span>
              <span className="text-xs text-muted-foreground font-normal">Máx. 10 MB por ficheiro · 20 MB no total</span>
            </Label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt"
              onChange={(e) => handleFilesPicked(e.target.files)}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="h-4 w-4 mr-2" /> Anexar ficheiros
            </Button>
            {attachments.length > 0 && (
              <div className="space-y-1 mt-2">
                {attachments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 text-sm bg-muted/40 rounded px-2 py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{a.file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{formatBytes(a.file.size)}</span>
                    </div>
                    <button type="button" onClick={() => removeAttachment(a.id)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={sending || loading || !recipientEmail}>
            {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Send className="h-4 w-4 mr-2" /> Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
