import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, Phone } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { generateQuotePdfBlob, blobToBase64 } from "@/utils/generateQuotePdfBlob";
import { resolveBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

export interface DealProposalOption {
  id: string;
  title: string;
  value: number | null;
  type: "deal" | "proposal" | "quote";
  documentUrl?: string | null;
}

export interface PdfAttachment {
  base64: string;
  fileName: string;
  url?: string;
}

export interface ChannelContext {
  dealOrProposal?: DealProposalOption | null;
  pdfAttachment?: PdfAttachment | null;
}

interface RegisterCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  entityName: string;
  organizationId: string;
  contactId: string;
  onCallRegistered?: () => void;
  onOpenWhatsApp?: (entityId: string, entityName: string, ctx?: ChannelContext) => void;
  onOpenEmail?: (entityId: string, entityName: string, ctx?: ChannelContext) => void;
}

const CALL_RESULTS = [
  { value: "answered", label: "Atendeu" },
  { value: "no_answer", label: "Não atendeu" },
  { value: "busy", label: "Ocupado" },
  { value: "voicemail", label: "Voicemail" },
  { value: "wrong_number", label: "Número errado" },
];

const NEXT_ACTIONS = [
  { value: "follow_up", label: "Follow-up" },
  { value: "send_proposal", label: "Enviar proposta" },
  { value: "schedule_meeting", label: "Agendar reunião" },
  { value: "send_info", label: "Enviar informação" },
];

export function RegisterCallDialog({
  open, onOpenChange, entityId, entityName, organizationId, contactId, onCallRegistered, onOpenWhatsApp, onOpenEmail,
}: RegisterCallDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [channelOpening, setChannelOpening] = useState(false);
  const [result, setResult] = useState("answered");
  const [sentiment, setSentiment] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState("");
  const [nextAction, setNextAction] = useState<string | null>(null);
  const [nextActionDate, setNextActionDate] = useState("");
  const [nextActionChannel, setNextActionChannel] = useState<string | null>(null);
  const [interactionDate, setInteractionDate] = useState<Date>(new Date());

  // Deal/Proposal selection
  const [dealProposalOptions, setDealProposalOptions] = useState<DealProposalOption[]>([]);
  const [selectedDealProposal, setSelectedDealProposal] = useState<string | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const isAnswered = result === "answered";
  const needsChannel = nextAction === "send_proposal" || nextAction === "send_info";

  // Load deals and proposals when "send_proposal" is selected
  useEffect(() => {
    if (needsChannel && entityId) {
      loadDealProposalOptions();
    } else {
      setDealProposalOptions([]);
      setSelectedDealProposal(null);
    }
  }, [needsChannel, entityId]);

  const loadDealProposalOptions = async () => {
    setLoadingOptions(true);
    try {
      const [dealsRes, proposalsRes, quotesRes] = await Promise.all([
        supabase
          .from("deals")
          .select("id, title, value")
          .eq("entity_id", entityId)
          .not("stage_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("proposals")
          .select("id, title, total_value, document_url")
          .eq("entity_id", entityId)
          .order("created_at", { ascending: false })
          .limit(20),
        (supabase as any)
          .from("quotes")
          .select("id, title, total, quote_number")
          .eq("entity_id", entityId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const options: DealProposalOption[] = [];
      (dealsRes.data || []).forEach((d: any) => {
        options.push({ id: d.id, title: d.title, value: d.value, type: "deal" });
      });
      (proposalsRes.data || []).forEach((p: any) => {
        options.push({ id: p.id, title: p.title, value: p.total_value, type: "proposal", documentUrl: p.document_url || null });
      });
      (quotesRes.data || []).forEach((q: any) => {
        options.push({ id: q.id, title: q.title || q.quote_number || "Orçamento", value: q.total, type: "quote" });
      });

      setDealProposalOptions(options);
      // Auto-select if only one
      if (options.length === 1) {
        setSelectedDealProposal(options[0].id);
      }
    } catch (err) {
      console.error("Error loading deals/proposals:", err);
    } finally {
      setLoadingOptions(false);
    }
  };

  const getSelectedOption = (): DealProposalOption | null => {
    if (!selectedDealProposal) return null;
    return dealProposalOptions.find(o => o.id === selectedDealProposal) || null;
  };

  const openChannel = async (channel: string) => {
    setChannelOpening(true);
    const selected = getSelectedOption();
    let pdfAttachment: PdfAttachment | null = null;

    try {
      // Generate/fetch PDF if a quote or proposal with document is selected
      if (selected?.type === "quote") {
        const { blob, fileName } = await generateQuotePdfBlob(selected.id);
        const base64 = await blobToBase64(blob);
        pdfAttachment = { base64, fileName };
      } else if (selected?.type === "proposal" && selected.documentUrl) {
        try {
          const response = await fetch(selected.documentUrl);
          const blob = await response.blob();
          const base64 = await blobToBase64(blob);
          pdfAttachment = {
            base64,
            fileName: `Proposta_${selected.title || selected.id}.pdf`,
            url: selected.documentUrl,
          };
        } catch (err) {
          console.error("Error fetching proposal PDF:", err);
        }
      }
    } catch (err) {
      console.error("Error generating PDF:", err);
    }

    const ctx: ChannelContext = { dealOrProposal: selected, pdfAttachment };

    setTimeout(() => {
      if (channel === "email" && onOpenEmail) {
        onOpenEmail(entityId, entityName, ctx);
      } else if (channel === "whatsapp" && onOpenWhatsApp) {
        onOpenWhatsApp(entityId, entityName, ctx);
      }
      setChannelOpening(false);
    }, 100);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const businessUserId = await resolveBusinessUserId(user.id);
      if (!businessUserId) throw new Error("Business user not resolved");

      const now = interactionDate.toISOString();

      const { error } = await supabase.from("entity_interactions").insert({
        entity_id: entityId,
        organization_id: organizationId,
        interaction_type: "call",
        result,
        sentiment: isAnswered ? sentiment : null,
        subject: isAnswered ? subject || null : null,
        notes: notes || null,
        duration_minutes: duration ? parseInt(duration) : null,
        next_action_type: isAnswered && nextAction ? nextAction : null,
        next_action_date: isAnswered && nextAction && nextActionDate ? new Date(nextActionDate).toISOString() : null,
        next_action_channel: isAnswered && nextAction && needsChannel ? nextActionChannel : null,
        interaction_at: now,
        created_by: businessUserId,
      });
      if (error) throw error;

      // Update last_interaction_at on anew_contacts
      await supabase.from("anew_contacts").update({ last_interaction_at: now } as any).eq("id", contactId);

      // Open WhatsApp or Email dialog if channel selected
      const selectedChannel = needsChannel ? nextActionChannel : null;

      toast({ title: "Atividade registada", description: `Atividade com ${entityName} registada com sucesso.` });
      resetForm();
      onOpenChange(false);
      onCallRegistered?.();

      if (selectedChannel) {
        openChannel(selectedChannel);
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setResult("answered");
    setSentiment(null);
    setSubject("");
    setNotes("");
    setDuration("");
    setNextAction(null);
    setNextActionDate("");
    setNextActionChannel(null);
    setInteractionDate(new Date());
    setSelectedDealProposal(null);
    setDealProposalOptions([]);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (channelOpening) return; if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            Registar Atividade
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{entityName}</p>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Date/time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !interactionDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {format(interactionDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[700]" align="start">
                  <Calendar mode="single" selected={interactionDate} onSelect={(d) => d && setInteractionDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Duração (min)</Label>
              <Input type="number" min="0" placeholder="0" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>

          {/* Result */}
          <div className="space-y-1.5">
            <Label className="text-xs">Resultado</Label>
            <Select value={result} onValueChange={setResult}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CALL_RESULTS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* If answered: sentiment, subject, next action */}
          {isAnswered && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Sentimento</Label>
                <div className="flex gap-2">
                  {[
                    { value: "positive", emoji: "😊", label: "Positivo" },
                    { value: "neutral", emoji: "😐", label: "Neutro" },
                    { value: "negative", emoji: "😟", label: "Negativo" },
                  ].map(s => (
                    <Button
                      key={s.value}
                      type="button"
                      variant={sentiment === s.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSentiment(sentiment === s.value ? null : s.value)}
                      className="flex-1"
                    >
                      <span className="mr-1">{s.emoji}</span> {s.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Assunto</Label>
                <Input placeholder="Assunto da chamada..." value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Próxima ação</Label>
                  <Select value={nextAction || ""} onValueChange={(v) => setNextAction(v || null)}>
                    <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {NEXT_ACTIONS.map(a => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {nextAction && nextAction !== "none" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Data/hora da ação</Label>
                    <Input
                      type="datetime-local"
                      value={nextActionDate}
                      onChange={(e) => setNextActionDate(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Deal/Proposal selector */}
              {needsChannel && dealProposalOptions.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Negócio / Proposta / Orçamento</Label>
                  <Select value={selectedDealProposal || ""} onValueChange={(v) => setSelectedDealProposal(v || null)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {dealProposalOptions.map(opt => (
                        <SelectItem key={opt.id} value={opt.id}>
                          {opt.type === "deal" ? "🤝 " : opt.type === "proposal" ? "📄 " : "📋 "}
                          {opt.title}
                          {opt.value ? ` — €${opt.value.toFixed(2)}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {needsChannel && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Enviar por</Label>
                  <div className="flex gap-2">
                    {[
                      { value: "whatsapp", label: "WhatsApp", emoji: "💬" },
                      { value: "email", label: "Email", emoji: "📧" },
                    ].map(ch => (
                      <Button
                        key={ch.value}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setNextActionChannel(ch.value);
                          openChannel(ch.value);
                        }}
                        className="flex-1"
                      >
                        <span className="mr-1">{ch.emoji}</span> {ch.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">Notas</Label>
            <Textarea placeholder="Notas da chamada..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Registar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
