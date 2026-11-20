import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Paperclip, Download, FileText, Image as ImageIcon, File as FileIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClientPortalLayout } from "@/components/portal/ClientPortalLayout";
import { useSyncActiveOrgWithDocument } from "@/contexts/PortalCompanyContext";
import { ProposalPortalDocument } from "@/components/proposals/ProposalPortalDocument";
import { loadProposalPortalData, type ProposalPortalData } from "@/components/proposals/proposalPortalData";
import { generateProposalPdfBlob, downloadBlob, type ProposalPdfPrefetch } from "@/utils/generateProposalPdfBlob";
import { parseEdgeFunctionPayload, describeEdgeFunctionError } from "@/utils/edgeFunctionResponse";
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
import { useCooldown, OTP_COOLDOWN_SECONDS } from "@/hooks/useCooldown";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { resolverIdiomasDaProposta } from "@/utils/idiomasDaProposta";
import { idiomasDisponiveisProposta, idiomaVisivelDoDocumento } from "@/lib/idiomaDocumento";
import { ehPortalIdioma, type PortalIdioma } from "@/portal-i18n/tipos";
import { MOTIVOS_REJEICAO_PROPOSTA } from "@/components/portal/motivosRejeicao";
import {
  mensagemDeChave,
  mensagemDeTexto,
  resolverMensagem,
  usePortalFormato,
  usePortalT,
  type MensagemDoPortal,
} from "@/portal-i18n";

// Código de estado (vem da base, não muda) -> chave da etiqueta.
const STATUS_LABEL_KEYS: Record<string, string> = {
  sent: "pc.propostaDet.estado.aguardaDecisao",
  pending: "pc.propostaDet.estado.aguardaDecisao",
  draft: "pc.propostaDet.estado.rascunho",
  accepted: "pc.propostaDet.estado.aceite",
  rejected: "pc.propostaDet.estado.rejeitada",
  expired: "pc.propostaDet.estado.expirada",
};

import { PassosDoNegocio, passoDoNegocio } from "@/components/portal/negocio/PassosDoNegocio";
import { ConversaDoNegocio } from "@/components/portal/negocio/ConversaDoNegocio";
import { DocumentoObra } from "@/components/portal/obra/DocumentoObra";
import { propostaDaVista } from "@/components/portal/obra/dadosObra";
import { useVistaObra } from "@/components/portal/obra/useVistaObra";

const ClientPortalProposalDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, idioma } = usePortalT();
  const { formatarData } = usePortalFormato();
  const otpCooldown = useCooldown(OTP_COOLDOWN_SECONDS);
  const otpSendingRef = useRef(false);

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
  // A versão de idioma que o cliente escolheu no seletor (só há seletor com mais de um idioma). Vazia = ainda não
  // escolheu: vale o idioma da interface. Fica na página para o PDF e a obra seguirem a versão que se está a ver.
  const [idiomaEscolhido, setIdiomaEscolhido] = useState<string | null>(null);

  // OTP states
  const [otpStep, setOtpStep] = useState<"idle" | "sending" | "input" | "verifying" | "verified">("idle");
  const [otpCode, setOtpCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  // Guarda a CHAVE (ou o texto do servidor) e traduz ao mostrar: mudar de idioma muda o erro visível.
  const [otpErro, setOtpError] = useState<MensagemDoPortal | null>(null);
  const otpError = resolverMensagem(otpErro, idioma);

  const hasLoadedOnceRef = useRef(false);

  // Link de email pode abrir uma proposta de outra empresa do grupo: a empresa
  // ativa acompanha o documento em vez de o esconder.
  useSyncActiveOrgWithDocument(portalData?.proposal?.organization_id);

  // O negócio da proposta com a vista do cliente: o documento mostra os blocos da obra (sem vista, fica como sempre).
  const vistaObra = useVistaObra(portalData?.proposal?.negocio_id, "client-portal-proposal");
  const proposalStatus: string | undefined = portalData?.proposal?.status;
  const proposalValidUntil: string | null = portalData?.proposal?.valid_until ?? null;
  const commercialName: string | null = portalData?.commercial?.name ?? null;
  const obra = useMemo(
    () => propostaDaVista(vistaObra, { docs: { proposta: proposalStatus }, validaAte: proposalValidUntil, comercial: commercialName }),
    [vistaObra, proposalStatus, proposalValidUntil, commercialName],
  );

  const reloadPortalData = useCallback(async () => {
    if (!id) return;
    if (!hasLoadedOnceRef.current) setLoading(true);
    const data = await loadProposalPortalData(id);
    setPortalData(data);
    hasLoadedOnceRef.current = true;
      setLoading(false);
  }, [id]);

  // Ao voltar a este separador, a proposta (e o passo do negócio por cima dela) acompanha o que mudou entretanto.
  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === "visible") void reloadPortalData(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [reloadPortalData]);

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
    setIdiomaEscolhido(null);
    void reloadPortalData();
    void loadAttachments();
    void logView();
  }, [id, logView, reloadPortalData, loadAttachments]);

  async function handleDownloadAttachment(att: any) {
    const { data, error } = await supabase.storage.from("documents").download(att.file_url);
    if (error || !data) {
      captureFlowError(error, "client-portal-proposal");
      toast({ title: t("pc.propostaDet.anexos.erroDescarregar"), description: error?.message, variant: "destructive" });
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
      toast({ title: t("pc.propostaDet.orcamento.aceiteTitulo"), description: t("pc.propostaDet.orcamento.aceiteTexto") });
      await reloadPortalData();
    } catch (error: any) {
      captureFlowError(error, "client-portal-proposal");
      toast({ title: t("pc.propostaDet.erro"), description: error.message, variant: "destructive" });
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
      toast({ title: t("pc.propostaDet.orcamento.rejeitadoTitulo") });
      await reloadPortalData();
    } catch (error: any) {
      captureFlowError(error, "client-portal-proposal");
      toast({ title: t("pc.propostaDet.erro"), description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  // A contagem de 60 s é só do Reenviar: no primeiro envio começa quando o servidor aceita;
  // no Reenviar começa no clique e não é reposta se o servidor recusar.
  async function sendOtp(isResend: boolean) {
    if (!id) return; // H4
    // Validação local primeiro: sem orçamento seleccionado não se pede SMS nem começa a contagem.
    const quotes = portalData?.quotes || [];
    const hasAcceptedQuote = quotes.some((q) => q.estado === "aceite");
    const hasSelectedQuote = selectedQuoteIds.length > 0;
    if (quotes.length > 0 && !hasAcceptedQuote && !hasSelectedQuote) {
      toast({
        title: t("pc.propostaDet.orcamento.aceitePeloMenosUmTitulo"),
        description: t("pc.propostaDet.orcamento.aceitePeloMenosUmTexto"),
        variant: "destructive",
      });
      return;
    }

    // Ref (e não estado) para que um segundo clique durante o pedido seja ignorado.
    if (otpSendingRef.current) return;
    if (isResend && !otpCooldown.iniciar()) return;
    otpSendingRef.current = true;
    // No Reenviar o passo não muda: o campo do código e o que já foi escrito mantêm-se.
    if (!isResend) setOtpStep("sending");
    setOtpError(null);
    try {
      const { data, error } = await supabase.functions.invoke("sms-otp", {
        body: { action: "send_otp", reference_id: id, reference_type: "proposal", purpose: "proposal_signature" },
      });

      if (error) throw new Error(error.message);
      if (data?.error) {
        if (data.error === "no_phone") {
          setOtpError(mensagemDeChave("pc.propostaDet.sms.semTelefone"));
          if (!isResend) setOtpStep("idle");
          return;
        }
        throw new Error(data.message || data.error);
      }

      setMaskedPhone(data.masked_phone || "");
      setOtpStep("input");
      if (!isResend) otpCooldown.iniciar();
      toast({ title: t("pc.propostaDet.sms.enviadoTitulo"), description: t("pc.propostaDet.sms.enviadoTexto", { telefone: data.masked_phone }) });
    } catch (err: any) {
      setOtpError(mensagemDeTexto(err.message));
      if (!isResend) setOtpStep("idle");
      captureFlowError(err, "client-portal-proposal");
      toast({ title: t("pc.propostaDet.sms.erroEnviar"), description: err.message, variant: "destructive" });
    } finally {
      otpSendingRef.current = false;
    }
  }

  const handleSendOtp = () => sendOtp(false);
  const handleResendOtp = () => sendOtp(true);

  async function handleVerifyOtp() {
    if (!id) return; // H4
    if (otpCode.length !== 6) return;
    setOtpStep("verifying");
    setOtpError(null);
    try {
      const { data, error } = await supabase.functions.invoke("sms-otp", {
        body: { action: "verify_otp", reference_id: id, reference_type: "proposal", code: otpCode, purpose: "proposal_signature" },
      });

      // On non-2xx, supabase-js sets error and data is null; parse the response body for a friendly message
      if (error) {
        let friendly: MensagemDoPortal = mensagemDeChave("pc.propostaDet.sms.codigoInvalidoTentar");
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            if (body?.message) friendly = mensagemDeTexto(body.message);
          } else if (ctx?.body) {
            const body = typeof ctx.body === "string" ? JSON.parse(ctx.body) : ctx.body;
            if (body?.message) friendly = mensagemDeTexto(body.message);
          }
        } catch {}
        setOtpError(friendly);
        setOtpStep("input");
        setOtpCode("");
        return;
      }
      if (data?.error) {
        setOtpError(data.message ? mensagemDeTexto(data.message) : mensagemDeChave("pc.propostaDet.sms.codigoInvalido"));
        setOtpStep("input");
        setOtpCode("");
        return;
      }

      // M9 — only mark verified AFTER sign succeeds
      await signProposalAfterOtp();
      setOtpStep("verified");
    } catch (err: any) {
      // Was previously always "Ocorreu um erro ao verificar o código." here,
      // even when the OTP was correct and the failure was actually downstream
      // (sign_proposal rejected, or a network/CORS failure) — that message
      // wrongly told the client the code they entered was wrong. Now shows the
      // real reason propagated from signProposalAfterOtp()/client-portal-action.
      setOtpError(err.message ? mensagemDeTexto(err.message) : mensagemDeChave("pc.propostaDet.assinatura.erroGenerico"));
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
        // Bounded — an unbounded third-party fetch here (blocked/slow on some
        // networks) could push the call to client-portal-action past the
        // 10-minute OTP freshness window it checks, silently failing the sign.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const ipRes = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
        clearTimeout(timeoutId);
        const ipData = await ipRes.json();
        clientIp = ipData.ip;
      } catch {}

      const { data, error: invokeError } = await supabase.functions.invoke("client-portal-action", {
        body: { action: "sign_proposal", proposal_id: id, signature_image: "OTP_SMS_VERIFIED", client_ip: clientIp, selected_quote_ids: selectedQuoteIds },
      });
      if (invokeError) {
        // Surface the real reason (e.g. otp_required/Forbidden, or a network/CORS
        // failure message) instead of letting a generic SDK message reach the
        // catch below, which used to always blame the SMS code.
        let friendly = invokeError.message;
        try {
          const ctx: any = (invokeError as any).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            if (body?.message) friendly = body.message;
          } else if (ctx?.body) {
            const body = typeof ctx.body === "string" ? JSON.parse(ctx.body) : ctx.body;
            if (body?.message) friendly = body.message;
          }
        } catch {}
        throw new Error(friendly);
      }
      if (data?.error) throw new Error(data.message || data.error);

      toast({
        title: t("pc.propostaDet.assinatura.sucessoTitulo"),
        description: portalData?.commercial?.name
          ? t("pc.propostaDet.assinatura.sucessoComercial", { nome: portalData.commercial.name })
          : t("pc.propostaDet.assinatura.sucessoGenerico"),
      });

      await reloadPortalData();
    } catch (error: any) {
      captureFlowError(error, "client-portal-proposal");
      toast({ title: t("pc.propostaDet.assinatura.erroTitulo"), description: error.message, variant: "destructive" });
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
      toast({ title: t("pc.propostaDet.rejeitar.feitaTitulo"), description: t("pc.propostaDet.rejeitar.feitaTexto") });
      setShowReject(false);
      setRejectReason("");
      setRejectNotes("");
      await reloadPortalData();
    } catch (error: any) {
      captureFlowError(error, "client-portal-proposal");
      toast({ title: t("pc.propostaDet.erro"), description: error.message, variant: "destructive" });
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
      toast({ title: t("pc.propostaDet.duvida.enviadaTitulo"), description: t("pc.propostaDet.duvida.enviadaTexto") });
      setShowQuestion(false);
      setQuestionText("");
    } catch (error: any) {
      captureFlowError(error, "client-portal-proposal");
      toast({ title: t("pc.propostaDet.erro"), description: error.message, variant: "destructive" });
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
          <p className="text-muted-foreground">{t("pc.propostaDet.naoEncontrada")}</p>
          <Button variant="ghost" onClick={() => navigate("/client-portal/negocios")} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("pc.propostaDet.voltar")}
          </Button>
        </div>
      </ClientPortalLayout>
    );
  }

  const proposal = portalData.proposal;
  const canActOnProposal = !["accepted", "rejected", "expired"].includes(proposal.status);
  const statusLabelKey = proposal.status === "draft" && canActOnProposal ? "pc.propostaDet.estado.aguardaDecisao" : STATUS_LABEL_KEYS[proposal.status];
  const statusLabel = statusLabelKey ? t(statusLabelKey) : proposal.status;
  // Idiomas do documento. Um template SEM versões de idioma fica exatamente como hoje: o documento não recebe idiomas
  // (as palavras seguem o idioma do portal) e a obra também. Com versões, o idioma do documento é o do botão do portal
  // quando o template tem essa versão (senão o base), ou o que a proposta gravou; decide-se ao desenhar, e não ao
  // carregar, porque o cliente pode trocar o idioma sem recarregar a proposta. O PDF usa os mesmos.
  const temVersoes = idiomasDisponiveisProposta(portalData.template).length > 1;
  const idiomasDoDocumento = resolverIdiomasDaProposta({
    linha: proposal,
    template: portalData.template,
    idiomaDoPortal: idioma,
  });
  // Com mais de um idioma o portal mostra UMA versão de cada vez (seletor no topo do documento) e o PDF leva a mesma.
  // Só contam os idiomas que o portal sabe escrever (os mesmos que o documento oferece); com um só, tudo como antes.
  const idiomasComSeletor = idiomasDoDocumento.filter(ehPortalIdioma);
  const idiomaVisivel = idiomasComSeletor.length > 1
    ? idiomaVisivelDoDocumento({ disponiveis: idiomasComSeletor, escolhido: idiomaEscolhido, idiomaDaInterface: idioma })
    : null;
  const idiomasDoPdf = idiomaVisivel ? [idiomaVisivel] : idiomasDoDocumento;
  // O idioma em que o documento se lê (e em que vêm a obra e os rótulos do PDF da obra): a versão visível, a única
  // versão do documento, ou (template sem versões) o do portal, como hoje.
  const versaoUnica = idiomasComSeletor.length === 1 ? idiomasComSeletor[0] : null;
  const idiomaDoDocumento: PortalIdioma = temVersoes
    ? ((idiomaVisivel ?? versaoUnica ?? idioma) as PortalIdioma)
    : idioma;

  return (
    <ClientPortalLayout>
      <div className="mx-auto w-full max-w-4xl space-y-5 py-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/client-portal/negocios")} className="w-fit gap-1">
          <ArrowLeft className="h-4 w-4" /> {t("pc.propostaDet.voltar")}
        </Button>

        {proposal.negocio_id && (
          <PassosDoNegocio passo={passoDoNegocio(proposal.status)} titulo={proposal.title} total={proposal.value} />
        )}

        <ProposalPortalDocument
          proposal={proposal}
          template={portalData.template}
          quotes={portalData.quotes}
          quoteLines={portalData.quoteLines}
          quoteFees={portalData.quoteFees}
          commercial={portalData.commercial}
          company={portalData.company}
          mode="portal"
          idioma={idioma}
          idiomasDoDocumento={temVersoes ? idiomasDoDocumento : undefined}
          modoVersoes="seletor"
          idiomaEscolhido={idiomaEscolhido}
          onIdiomaEscolhidoChange={setIdiomaEscolhido}
          documentoObra={obra ? <DocumentoObra dados={obra} idioma={idiomaDoDocumento} cor={portalData.template?.primary_color || undefined} /> : undefined}
          statusLabel={statusLabel}
          canActOnProposal={canActOnProposal}
          actionLoading={actionLoading}
          otpStep={otpStep}
          otpCode={otpCode}
          maskedPhone={maskedPhone}
          otpError={otpError}
          onSendOtp={handleSendOtp}
          onResendOtp={handleResendOtp}
          otpCooldown={otpCooldown.restante}
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
              // The generator builds the proposal PDF by merging its quotes'
              // PDFs, and RLS keeps portal users out of `quotes`/`quote_lines`
              // — so calling it directly always found zero quotes and threw,
              // and the button did nothing. The data comes from the Edge
              // Function instead, already stripped of cost and margin columns,
              // and is handed to the very same generator the CRM uses.
              const { data, error } = await supabase.functions.invoke("client-portal-action", {
                body: { action: "get_proposal_pdf_data", params: { proposal_id: proposal.id } },
              });
              if (error) throw error;

              // The function returns JSON but sets no `Content-Type`, so
              // `invoke` hands back the raw JSON *string* and every field read
              // off it is `undefined`. Reading `data.quotes` directly made a
              // successful HTTP 200 look like a proposal with no quotes, and
              // the button reported exactly that to every client.
              // See utils/edgeFunctionResponse.ts.
              const payload = parseEdgeFunctionPayload<ProposalPdfPrefetch>(data);
              if (!payload) {
                throw new Error(t("pc.propostaDet.pdf.formatoInesperado"));
              }
              if (!payload.quotes?.length) {
                toast({
                  title: t("pc.propostaDet.pdf.semConteudoTitulo"),
                  description: t("pc.propostaDet.pdf.semConteudoTexto"),
                  variant: "destructive",
                });
                return;
              }
              // Com a vista do negócio, o PDF leva também a obra (os mesmos blocos do ecrã), no idioma do documento. Com
              // várias versões, o PDF leva só a que o cliente está a ver (o PDF com todas continua no CRM).
              const obraNoPdf = obra ? { dados: obra, idioma: idiomaDoDocumento, cor: portalData.template?.primary_color || undefined } : null;
              const { blob, fileName } = await generateProposalPdfBlob(proposal.id, payload, obraNoPdf, { idiomas: idiomasDoPdf });
              downloadBlob(blob, fileName);
            } catch (e: unknown) {
              toast({
                title: t("pc.propostaDet.pdf.erroTitulo"),
                description: await describeEdgeFunctionError(e),
                variant: "destructive",
              });
            }
          }}
        />

        {attachments.length > 0 && (
          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Paperclip className="h-4 w-4" />
                {t("pc.propostaDet.anexos.titulo", { n: attachments.length })}
              </h3>
              <div className="space-y-2">
                {attachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                    {getAttachmentIcon(att.file_name)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{att.file_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {(att.file_type || "").toString().toUpperCase()} · {formatBytes(att.file_size)} · {formatarData(att.created_at, "numerico")}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleDownloadAttachment(att)} className="gap-1.5">
                      <Download className="h-3.5 w-3.5" /> {t("pc.propostaDet.anexos.descarregar")}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* A conversa com a equipa (só nos negócios): o que o cliente escreve chega às Operações e a resposta aparece aqui. */}
        {proposal.negocio_id && <ConversaDoNegocio negocioId={proposal.negocio_id} />}

        {/* Reject Dialog */}
        <Dialog open={showReject} onOpenChange={setShowReject}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("pc.propostaDet.rejeitar.titulo")}</DialogTitle>
              <DialogDescription>
                {t("pc.propostaDet.rejeitar.descricao")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("pc.propostaDet.rejeitar.motivo")}</label>
                <Select value={rejectReason} onValueChange={setRejectReason}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("pc.propostaDet.rejeitar.motivoPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_REJEICAO_PROPOSTA.map((motivo) => (
                      <SelectItem key={motivo.valor} value={motivo.valor}>{t(motivo.chave)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("pc.propostaDet.rejeitar.comentario")}</label>
                <Textarea
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder={t("pc.propostaDet.rejeitar.comentarioPlaceholder")}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowReject(false)}>{t("pc.propostaDet.rejeitar.cancelar")}</Button>
              <Button variant="destructive" onClick={handleRejectProposal} disabled={actionLoading}>
                {t("pc.propostaDet.rejeitar.confirmar")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Ask Question Dialog */}
        <Dialog open={showQuestion} onOpenChange={setShowQuestion}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("pc.propostaDet.duvida.titulo")}</DialogTitle>
              <DialogDescription>
                {t("pc.propostaDet.duvida.descricao")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Textarea
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                placeholder={t("pc.propostaDet.duvida.placeholder")}
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowQuestion(false)}>{t("pc.propostaDet.duvida.cancelar")}</Button>
              <Button onClick={handleAskQuestion} disabled={actionLoading || !questionText.trim()}>
                {t("pc.propostaDet.duvida.enviar")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ClientPortalLayout>
  );
};

export default ClientPortalProposalDetail;
