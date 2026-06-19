import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Paperclip, Download, FileText, Image as ImageIcon, File as FileIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClientPortalLayout } from "@/components/portal/ClientPortalLayout";
import { ProposalPortalDocument } from "@/components/proposals/ProposalPortalDocument";
import { loadProposalPortalData, type ProposalPortalData } from "@/components/proposals/proposalPortalData";
import { generateProposalPdfBlob, downloadBlob } from "@/utils/generateProposalPdfBlob";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  sent: "A aguardar decisão",
  pending: "A aguardar decisão",
  draft: "Rascunho",
  accepted: "Proposta aceite",
  rejected: "Proposta rejeitada",
  expired: "Proposta expirada",
};

const REJECTION_REASONS = [
  "Preço alto",
  "Encontrei alternativa",
  "Já não preciso",
  "Prazo não serve",
  "Vou adiar",
  "Outro",
];

const ClientPortalProposalDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [portalData, setPortalData] = useState<ProposalPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");
  const [showQuestion, setShowQuestion] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);

  // OTP states
  const [otpStep, setOtpStep] = useState<"idle" | "sending" | "input" | "verifying" | "verified">("idle");
  const [otpCode, setOtpCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [otpError, setOtpError] = useState("");

  const reloadPortalData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const data = await loadProposalPortalData(id);
    setPortalData(data);
    setLoading(false);
  }, [id]);

  const loadAttachments = useCallback(async () => {
    if (!id) return;
    const { data } = await (supabase as any)
      .from("documents")
      .select("id, file_name, file_url, file_type, file_size, document_type, created_at")
      .eq("entity_type", "proposal")
      .eq("entity_id", id)
      .order("created_at", { ascending: false });
    setAttachments(data || []);
  }, [id]);

  const logView = useCallback(async () => {
    if (!id) return;
    try {
      await supabase.functions.invoke("client-portal-action", {
        body: { action: "log_view", document_type: "proposal", document_id: id },
      });
    } catch {}
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void reloadPortalData();
    void loadAttachments();
    void logView();
  }, [id, logView, reloadPortalData, loadAttachments]);

  async function handleDownloadAttachment(att: any) {
    const { data, error } = await supabase.storage.from("documents").download(att.file_url);
    if (error || !data) {
      toast({ title: "Erro ao descarregar", description: error?.message, variant: "destructive" });
      return;
    }
    // M3: full download pattern (Firefox/Safari safe)
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = att.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function getAttachmentIcon(name: string) {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (["jpg","jpeg","png","gif","webp"].includes(ext)) return <ImageIcon className="h-5 w-5 text-pink-500" />;
    if (ext === "pdf") return <FileText className="h-5 w-5 text-red-500" />;
    return <FileIcon className="h-5 w-5 text-muted-foreground" />;
  }

  function formatBytes(bytes: number | null) {
    if (bytes === null || bytes === undefined) return "—";
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }


  async function handleAcceptQuote(quoteId: string) {
    setActionLoading(true);
    try {
      const { error } = await supabase.functions.invoke("client-portal-action", {
        body: { action: "accept_quote", quote_id: quoteId },
      });
      if (error) throw error;
      toast({ title: "Orçamento aceite", description: "O orçamento foi aceite com sucesso." });
      await reloadPortalData();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRejectQuote(quoteId: string) {
    setActionLoading(true);
    try {
      await supabase.functions.invoke("client-portal-action", {
        body: { action: "reject_quote", quote_id: quoteId },
      });
      toast({ title: "Orçamento rejeitado" });
      await reloadPortalData();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSendOtp() {
    if (!id) return; // H4
    setOtpStep("sending");
    setOtpError("");
    try {
      // Check if at least one quote is selected or already accepted
      const quotes = portalData?.quotes || [];
      const hasAcceptedQuote = quotes.some((q) => q.estado === "aceite");
      const hasSelectedQuote = selectedQuoteIds.length > 0;
      if (quotes.length > 0 && !hasAcceptedQuote && !hasSelectedQuote) {
        toast({
          title: "Aceite pelo menos 1 orçamento",
          description: "Antes de assinar a proposta, aceite pelo menos um orçamento.",
          variant: "destructive",
        });
        setOtpStep("idle");
        return;
      }

      const { data, error } = await supabase.functions.invoke("sms-otp", {
        body: { action: "send_otp", reference_id: id, reference_type: "proposal", purpose: "proposal_signature" },
      });

      if (error) throw new Error(error.message);
      if (data?.error) {
        if (data.error === "no_phone") {
          setOtpError("Não foi encontrado um número de telefone associado à sua conta. Contacte o comercial.");
          setOtpStep("idle");
          return;
        }
        throw new Error(data.message || data.error);
      }

      setMaskedPhone(data.masked_phone || "");
      setOtpStep("input");
      toast({ title: "Código SMS enviado", description: `Enviámos um código para ${data.masked_phone}` });
    } catch (err: any) {
      setOtpError(err.message);
      setOtpStep("idle");
      toast({ title: "Erro ao enviar SMS", description: err.message, variant: "destructive" });
    }
  }

  async function handleVerifyOtp() {
    if (!id) return; // H4
    if (otpCode.length !== 6) return;
    setOtpStep("verifying");
    setOtpError("");
    try {
      const { data, error } = await supabase.functions.invoke("sms-otp", {
        body: { action: "verify_otp", reference_id: id, reference_type: "proposal", code: otpCode, purpose: "proposal_signature" },
      });

      // On non-2xx, supabase-js sets error and data is null; parse the response body for a friendly message
      if (error) {
        let friendly = "Código inválido. Tente novamente.";
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            if (body?.message) friendly = body.message;
          } else if (ctx?.body) {
            const body = typeof ctx.body === "string" ? JSON.parse(ctx.body) : ctx.body;
            if (body?.message) friendly = body.message;
          }
        } catch {}
        setOtpError(friendly);
        setOtpStep("input");
        setOtpCode("");
        return;
      }
      if (data?.error) {
        setOtpError(data.message || "Código inválido");
        setOtpStep("input");
        setOtpCode("");
        return;
      }

      // M9 — only mark verified AFTER sign succeeds
      await signProposalAfterOtp();
      setOtpStep("verified");
    } catch (err: any) {
      setOtpError("Ocorreu um erro ao verificar o código. Tente novamente.");
      setOtpStep("input");
      setOtpCode("");
    }
  }


  async function signProposalAfterOtp() {
    if (!id) return; // H4
    setActionLoading(true);
    try {
      let clientIp = "";
      try {
        const ipRes = await fetch("https://api.ipify.org?format=json");
        const ipData = await ipRes.json();
        clientIp = ipData.ip;
      } catch {}

      const { error: invokeError } = await supabase.functions.invoke("client-portal-action", {
        body: { action: "sign_proposal", proposal_id: id, signature_image: "OTP_SMS_VERIFIED", client_ip: clientIp, selected_quote_ids: selectedQuoteIds },
      });
      if (invokeError) throw new Error(invokeError.message);

      toast({
        title: "Proposta assinada com sucesso! 🎉",
        description: portalData?.commercial?.name
          ? `Obrigado! O comercial ${portalData.commercial.name} irá contactá-lo brevemente.`
          : "Obrigado! Entraremos em contacto brevemente.",
      });

      await reloadPortalData();
    } catch (error: any) {
      toast({ title: "Erro ao assinar", description: error.message, variant: "destructive" });
      throw error; // M9 — let verify catch reset the OTP step
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRejectProposal() {
    if (!id) return;
    setActionLoading(true);
    try {
      await supabase.functions.invoke("client-portal-action", {
        body: { action: "reject_proposal", proposal_id: id, reason_code: rejectReason, reason_text: rejectNotes },
      });
      toast({ title: "Proposta rejeitada", description: "Lamentamos. Obrigado pelo seu feedback." });
      setShowReject(false);
      setRejectReason("");
      setRejectNotes("");
      await reloadPortalData();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAskQuestion() {
    if (!id || !questionText.trim()) return;
    setActionLoading(true);
    try {
      await supabase.functions.invoke("client-portal-action", {
        body: {
          action: "ask_question",
          document_type: "proposal",
          document_id: id,
          message: questionText.trim(),
        },
      });
      toast({ title: "Dúvida enviada!", description: "O comercial será notificado e entrará em contacto." });
      setShowQuestion(false);
      setQuestionText("");
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <ClientPortalLayout>
        <div className="mx-auto w-full max-w-4xl space-y-4 py-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ClientPortalLayout>
    );
  }

  if (!portalData?.proposal) {
    return (
      <ClientPortalLayout>
        <div className="py-12 text-center">
          <p className="text-muted-foreground">Proposta não encontrada.</p>
          <Button variant="ghost" onClick={() => navigate("/client-portal/proposals")} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
        </div>
      </ClientPortalLayout>
    );
  }

  const proposal = portalData.proposal;
  const canActOnProposal = !["accepted", "rejected", "expired"].includes(proposal.status);
  const statusLabel = proposal.status === "draft" && canActOnProposal ? "A aguardar decisão" : STATUS_LABELS[proposal.status] || proposal.status;

  return (
    <ClientPortalLayout>
      <div className="mx-auto w-full max-w-4xl space-y-5 py-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/client-portal/proposals")} className="w-fit gap-1">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>

        <ProposalPortalDocument
          proposal={proposal}
          template={portalData.template}
          quotes={portalData.quotes}
          quoteLines={portalData.quoteLines}
          quoteFees={portalData.quoteFees}
          commercial={portalData.commercial}
          company={portalData.company}
          mode="portal"
          statusLabel={statusLabel}
          canActOnProposal={canActOnProposal}
          actionLoading={actionLoading}
          otpStep={otpStep}
          otpCode={otpCode}
          maskedPhone={maskedPhone}
          otpError={otpError}
          onSendOtp={handleSendOtp}
          onVerifyOtp={handleVerifyOtp}
          onOtpCodeChange={setOtpCode}
          onAcceptQuote={handleAcceptQuote}
          onRejectQuote={handleRejectQuote}
          onSignProposal={handleSendOtp}
          onRejectProposal={() => setShowReject(true)}
          onAskQuestion={() => setShowQuestion(true)}
          onSelectedQuotesChange={setSelectedQuoteIds}
          onDownloadPdf={async () => {
            try {
              const { blob, fileName } = await generateProposalPdfBlob(proposal.id);
              downloadBlob(blob, fileName);
            } catch (e: any) {
              toast({ title: "Erro ao gerar PDF", description: e?.message || "Tenta novamente.", variant: "destructive" });
            }
          }}
        />

        {attachments.length > 0 && (
          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Paperclip className="h-4 w-4" />
                Documentos anexos ({attachments.length})
              </h3>
              <div className="space-y-2">
                {attachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                    {getAttachmentIcon(att.file_name)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{att.file_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {(att.file_type || "").toString().toUpperCase()} · {formatBytes(att.file_size)} · {new Date(att.created_at).toLocaleDateString("pt-PT")}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleDownloadAttachment(att)} className="gap-1.5">
                      <Download className="h-3.5 w-3.5" /> Descarregar
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reject Dialog */}
        <Dialog open={showReject} onOpenChange={setShowReject}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Rejeitar Proposta</DialogTitle>
              <DialogDescription>
                Indique o motivo da rejeição para nos ajudar a melhorar.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Motivo</label>
                <Select value={rejectReason} onValueChange={setRejectReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {REJECTION_REASONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Comentário (opcional)</label>
                <Textarea
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder="Adicione um comentário..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowReject(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={handleRejectProposal} disabled={actionLoading}>
                Confirmar Rejeição
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Ask Question Dialog */}
        <Dialog open={showQuestion} onOpenChange={setShowQuestion}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>💬 Tenho dúvidas</DialogTitle>
              <DialogDescription>
                Envie a sua dúvida ao comercial responsável. Será notificado e entrará em contacto consigo.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Textarea
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                placeholder="Escreva a sua dúvida ou pedido de esclarecimento..."
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowQuestion(false)}>Cancelar</Button>
              <Button onClick={handleAskQuestion} disabled={actionLoading || !questionText.trim()}>
                Enviar Dúvida
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ClientPortalLayout>
  );
};

export default ClientPortalProposalDetail;
