import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ClientPortalLayout } from "@/components/portal/ClientPortalLayout";
import { useSyncActiveOrgWithDocument } from "@/contexts/PortalCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  InputOTP, InputOTPGroup, InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCooldown, cooldownLabel, OTP_COOLDOWN_SECONDS } from "@/hooks/useCooldown";
import { OtpCooldownNotice } from "@/components/ui/otp-cooldown-notice";
import { ArrowLeft, ScrollText, Download, CheckSquare, FileDown, Smartphone, ShieldCheck, Loader2 } from "lucide-react";
import DOMPurify from "dompurify";
import { formatCurrency } from "@/lib/utils";
import { MOTIVOS_REJEICAO_CONTRATO } from "@/components/portal/motivosRejeicao";
import {
  mensagemDeChave,
  mensagemDeTexto,
  resolverMensagem,
  usePortalFormato,
  usePortalT,
  type MensagemDoPortal,
} from "@/portal-i18n";
import { PassosDoNegocio, passoDoNegocio } from "@/components/portal/negocio/PassosDoNegocio";
import { ConversaDoNegocio } from "@/components/portal/negocio/ConversaDoNegocio";
import { ClausulasObra } from "@/components/portal/obra/ClausulasObra";
import { contratoDaVista } from "@/components/portal/obra/dadosObra";
import { useVistaObra } from "@/components/portal/obra/useVistaObra";
import { injectSignaturesIntoBlock, resolveContractDocument, downloadContractDocumentPdf } from "@/components/contracts/contractDocument";
import { captureFlowError } from "@/lib/observability/captureFlowError";

// Código de estado do contrato (vem da base, não muda) -> chave da etiqueta. Um estado sem etiqueta aparece como o código.
const ESTADO_CHAVES: Readonly<Record<string, string>> = {
  draft: "pc.contratoDet.estado.draft",
  pending: "pc.contratoDet.estado.pending",
  sent: "pc.contratoDet.estado.sent",
  active: "pc.contratoDet.estado.active",
  signed: "pc.contratoDet.estado.signed",
  rejected: "pc.contratoDet.estado.rejected",
  expired: "pc.contratoDet.estado.expired",
  cancelled: "pc.contratoDet.estado.cancelled",
};

const ClientPortalContractDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, idioma } = usePortalT();
  const { formatarData, formatarDataHora } = usePortalFormato();
  const otpCooldown = useCooldown(OTP_COOLDOWN_SECONDS);
  const otpSendingRef = useRef(false);

  const [contract, setContract] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // OTP states
  const [otpStep, setOtpStep] = useState<"idle" | "sending" | "input" | "verifying" | "verified">("idle");
  const [otpCode, setOtpCode] = useState("");
  // O Reenviar não muda o passo (o campo do código fica); só desactiva o botão durante o pedido.
  const [reenviando, setReenviando] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState("");
  // Guarda a CHAVE (ou o texto do servidor) e traduz ao mostrar: mudar de idioma muda o erro visível.
  const [otpErro, setOtpError] = useState<MensagemDoPortal | null>(null);
  const otpError = resolverMensagem(otpErro, idioma);

  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");

  const [showQuestion, setShowQuestion] = useState(false);
  const [questionText, setQuestionText] = useState("");

  // Link de email pode abrir um contrato de outra empresa do grupo: a empresa
  // ativa acompanha o documento em vez de o esconder.
  useSyncActiveOrgWithDocument(contract?.organization_id);

  // O negócio do contrato com a vista do cliente: por baixo da minuta, as cláusulas do negócio e as adendas assinadas (só leitura;
  // o corpo gravado do contrato não muda). Sem vista, fica como sempre.
  const vistaObra = useVistaObra(contract?.negocio_id, "client-portal-contract");
  const contractStatus: string | undefined = contract?.status;
  const obra = useMemo(() => contratoDaVista(vistaObra, { proposta: "accepted", contrato: contractStatus }), [vistaObra, contractStatus]);

  useEffect(() => {
    if (!id) return;
    loadData();
    logView();
  }, [id]);

  async function logView() {
    try {
      await supabase.functions.invoke("client-portal-action", {
        body: { action: "log_view", document_type: "contract", document_id: id },
      });
    } catch {}
  }

  async function loadData() {
    const { data: cont } = await supabase
      .from("client_contracts")
      .select("*")
      .eq("id", id!)
      .maybeSingle();

    setContract(cont);

    if (cont) {
      const { data: docs } = await (supabase as any)
        .from("documents")
        .select("id, file_name, file_url, file_type, file_size, document_type, created_at")
        .eq("entity_type", "contract")
        .eq("entity_id", id!)
        .order("created_at", { ascending: false });
      setDocuments(docs || []);
    }

    setLoading(false);
  }

  // M2: formatCurrency now imported from @/lib/utils (preserves sign for negatives)


  // "pending_signature" e o nome actual do estado (ver ClientContracts.tsx) --
  // "pending"/"sent" mantidos so por seguranca, para contratos antigos que
  // possam ainda ter esses valores gravados.
  // 19/11 (auditoria): um rascunho ("draft") ja nao se assina -- o servidor
  // (client-portal-action, sign_contract) recusa-o; sem o botao, o cliente nao
  // pede o codigo por SMS para nada.
  const canSign = contract && (contract.status === "pending_signature" || contract.status === "pending" || contract.status === "sent");
  const isSigned = contract?.status === "signed";

  // Descarregar o PDF do contrato. Usa exactamente o mesmo caminho do CRM
  // (resolveContractDocument + downloadContractDocumentPdf), para o cliente
  // receber o mesmo documento que a equipa vê — incluindo o bloco de
  // assinaturas, que reflecte o estado real de cada parte.
  //
  // Não precisa de acesso a orçamentos: o corpo do contrato é guardado já
  // substituído em contract_body_html no momento em que é gerado. As tabelas
  // que este caminho lê (client_contracts, anew_organizations,
  // organization_document_settings, client_contract_templates) são todas
  // legíveis pelo utilizador do portal.
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const handleDownloadContractPdf = async () => {
    if (!contract?.organization_id) {
      toast({ title: t("pc.contratoDet.pdf.naoGerar"), description: t("pc.contratoDet.pdf.semOrganizacao"), variant: "destructive" });
      return;
    }
    setDownloadingPdf(true);
    try {
      const resolved = await resolveContractDocument(contract, contract.organization_id);
      if (!resolved) {
        toast({ title: t("pc.contratoDet.pdf.naoGerar"), description: t("pc.contratoDet.pdf.semConteudo"), variant: "destructive" });
        return;
      }
      const label = contract.contract_number || contract.title || t("pc.contratoDet.tituloPadrao");
      await downloadContractDocumentPdf(resolved, label, label);
    } catch (error: any) {
      console.error("[portal] contract PDF download failed:", error);
      captureFlowError(error, "client-portal-contract");
      toast({ title: t("pc.contratoDet.pdf.erroTitulo"), description: error?.message || t("pc.contratoDet.pdf.tenteNovamente"), variant: "destructive" });
    } finally {
      setDownloadingPdf(false);
    }
  };
  const isRejected = contract?.status === "rejected";
  const isCancelled = contract?.status === "cancelled";

  // A contagem de 60 s é só do Reenviar: no primeiro envio começa quando o servidor aceita;
  // no Reenviar começa no clique e não é reposta se o servidor recusar.
  async function sendOtp(isResend: boolean) {
    if (!id) return; // H4
    // Ref (e não estado) para que um segundo clique durante o pedido seja ignorado.
    if (otpSendingRef.current) return;
    if (isResend && !otpCooldown.iniciar()) return;
    otpSendingRef.current = true;
    if (isResend) setReenviando(true);
    else setOtpStep("sending");
    setOtpError(null);
    try {
      const { data, error } = await supabase.functions.invoke("sms-otp", {
        body: { action: "send_otp", reference_id: id, reference_type: "contract", purpose: "contract_signature" },
      });

      if (error) throw new Error(error.message);
      if (data?.error) {
        if (data.error === "no_phone") {
          setOtpError(mensagemDeChave("pc.contratoDet.sms.semTelefone"));
          if (!isResend) setOtpStep("idle");
          return;
        }
        throw new Error(data.message || data.error);
      }

      setMaskedPhone(data.masked_phone || "");
      setOtpStep("input");
      if (!isResend) otpCooldown.iniciar();
      toast({ title: t("pc.contratoDet.sms.enviadoTitulo"), description: t("pc.contratoDet.sms.enviadoTexto", { telefone: data.masked_phone }) });
    } catch (err: any) {
      setOtpError(mensagemDeTexto(err.message));
      if (!isResend) setOtpStep("idle");
      captureFlowError(err, "client-portal-contract");
      toast({ title: t("pc.contratoDet.sms.erroEnviar"), description: err.message, variant: "destructive" });
    } finally {
      otpSendingRef.current = false;
      setReenviando(false);
    }
  }

  // 3/11 (Rúben): antes do código, o cliente confirma que leu o contrato e aceita os termos
  const [showLeitura, setShowLeitura] = useState(false);
  const [leuAceita, setLeuAceita] = useState(false);
  const handleSendOtp = () => { setLeuAceita(false); setShowLeitura(true); };
  const confirmarLeitura = () => { setShowLeitura(false); void sendOtp(false); };
  const handleResendOtp = () => sendOtp(true);

  async function handleVerifyOtp() {
    if (!id) return; // H4
    if (otpCode.length !== 6) return;
    setOtpStep("verifying");
    setOtpError(null);
    try {
      const { data, error } = await supabase.functions.invoke("sms-otp", {
        body: { action: "verify_otp", reference_id: id, reference_type: "contract", code: otpCode, purpose: "contract_signature" },
      });

      if (error) throw new Error(error.message);
      if (data?.error) {
        setOtpError(data.message ? mensagemDeTexto(data.message) : mensagemDeChave("pc.contratoDet.sms.codigoInvalido"));
        setOtpStep("input");
        setOtpCode("");
        return;
      }

      // M9 — only mark verified AFTER sign succeeds
      await signContractAfterOtp();
      setOtpStep("verified");
    } catch (err: any) {
      setOtpError(mensagemDeTexto(err.message));
      setOtpStep("input");
      setOtpCode("");
    }
  }

  async function signContractAfterOtp() {
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

      // Was previously not checked at all: a failed sign (e.g. OTP expired/
      // already used) returned {error: ...} with a non-2xx status, which
      // `invoke()` surfaces as `error` — silently ignored here, so the
      // client always saw the success toast below even when nothing was
      // persisted (client_contracts.status never left "draft"/"sent").
      const { data, error: invokeError } = await supabase.functions.invoke("client-portal-action", {
        body: { action: "sign_contract", contract_id: id, signature_image: "OTP_SMS_VERIFIED", client_ip: clientIp },
      });
      if (invokeError) {
        // Surface the real reason (e.g. otp_required/Forbidden, or a network/CORS
        // failure message) instead of a generic SDK message that hides the cause.
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

      toast({ title: t("pc.contratoDet.assinatura.sucessoTitulo"), description: t("pc.contratoDet.assinatura.sucessoTexto") });
      await loadData(); // M11
    } catch (err: any) {
      captureFlowError(err, "client-portal-contract");
      toast({ title: t("pc.contratoDet.assinatura.erroTitulo"), description: err.message, variant: "destructive" });
      throw err; // M9 — propagate so verify catch resets step
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRejectContract() {
    if (!id) return;
    setActionLoading(true);
    try {
      await supabase.functions.invoke("client-portal-action", {
        body: { action: "reject_contract", contract_id: id, reason_code: rejectReason, reason_text: rejectNotes },
      });
      toast({ title: t("pc.contratoDet.rejeitar.feitoTitulo"), description: t("pc.contratoDet.rejeitar.feitoTexto") });
      setShowReject(false);
      setRejectReason("");
      setRejectNotes("");
      await loadData(); // M11
    } catch (err: any) {
      captureFlowError(err, "client-portal-contract");
      toast({ title: t("pc.contratoDet.erro"), description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAskQuestion() {
    if (!id || !questionText.trim()) return;
    setActionLoading(true);
    try {
      await supabase.functions.invoke("client-portal-action", {
        body: { action: "ask_question", document_type: "contract", document_id: id, message: questionText.trim() },
      });
      toast({ title: t("pc.contratoDet.duvida.enviadaTitulo"), description: t("pc.contratoDet.duvida.enviadaTexto") });
      setShowQuestion(false);
      setQuestionText("");
    } catch (err: any) {
      captureFlowError(err, "client-portal-contract");
      toast({ title: t("pc.contratoDet.erro"), description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <ClientPortalLayout>
        <div className="space-y-4 max-w-4xl mx-auto">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ClientPortalLayout>
    );
  }

  if (!contract) {
    return (
      <ClientPortalLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t("pc.contratoDet.naoEncontrado")}</p>
          <Button variant="ghost" onClick={() => navigate("/client-portal/negocios")} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> {t("pc.contratoDet.voltar")}
          </Button>
        </div>
      </ClientPortalLayout>
    );
  }

  return (
    <ClientPortalLayout>
      <div className="space-y-5 max-w-4xl mx-auto py-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/client-portal/negocios")} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> {t("pc.contratoDet.voltar")}
        </Button>

        {contract.negocio_id && (
          <PassosDoNegocio passo={passoDoNegocio("accepted", contract.status)} titulo={contract.contract_number || t("pc.contratoDet.tituloPadrao")} total={contract.total_value} />
        )}

        {/* Decision Banner */}
        {canSign && otpStep !== "verified" && (
          <div className="rounded-xl border bg-gradient-to-r from-primary/5 to-primary/10 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-foreground">{t("pc.contratoDet.banner.decisaoTitulo")}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("pc.contratoDet.banner.decisaoTexto")}
              </p>
            </div>
          </div>
        )}

        {/* Signed Banner */}
        {isSigned && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800 p-5">
            <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{t("pc.contratoDet.banner.assinado")}</h3>
            {contract.signature_date && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                {t("pc.contratoDet.assinadoEm", { data: formatarDataHora(contract.signature_date, "longo") })}
              </p>
            )}
            {contract.signed_by_name && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                {t("pc.contratoDet.banner.assinadoPor")} <span className="font-semibold">{contract.signed_by_name}</span>
              </p>
            )}
            {contract.signature_ip && (
              <p className="text-xs text-emerald-500 dark:text-emerald-500 mt-1">
                {t("pc.contratoDet.banner.ip", { ip: contract.signature_ip })}
              </p>
            )}
          </div>
        )}

        {/* Rejected Banner */}
        {isRejected && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
            <h3 className="text-lg font-bold text-destructive">{t("pc.contratoDet.banner.rejeitado")}</h3>
          </div>
        )}

        {/* Cancelled Banner */}
        {isCancelled && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
            <h3 className="text-lg font-bold text-destructive">{t("pc.contratoDet.banner.anulado")}</h3>
            {contract.cancellation_reason && (
              <p className="text-sm text-muted-foreground mt-1">{t("pc.contratoDet.banner.motivo", { motivo: contract.cancellation_reason })}</p>
            )}
            {contract.cancelled_at && (
              <p className="text-xs text-muted-foreground mt-1">
                {t("pc.contratoDet.anuladoEm", { data: formatarDataHora(contract.cancelled_at, "longo") })}
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-2">
              {t("pc.contratoDet.banner.anuladoTexto")}
            </p>
          </div>
        )}

        {/* Contract Info */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ScrollText className="h-5 w-5" />
                {t("pc.contratoDet.dados.titulo", { numero: contract.contract_number || "" })}
              </CardTitle>
            </div>
            <Badge variant="outline" className="shrink-0">
              📋 {Object.prototype.hasOwnProperty.call(ESTADO_CHAVES, contract.status) ? t(ESTADO_CHAVES[contract.status]) : contract.status}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {contract.contract_number && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("pc.contratoDet.dados.numero")}</p>
                  <p className="font-bold text-lg">{contract.contract_number}</p>
                </div>
              )}
              {contract.total_value != null && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("pc.contratoDet.dados.valor")}</p>
                  <p className="font-bold text-lg text-primary">{formatCurrency(contract.total_value)}</p>
                </div>
              )}
              {contract.start_date && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("pc.contratoDet.dados.inicio")}</p>
                  <p className="font-bold text-lg">{formatarData(contract.start_date, "numerico")}</p>
                </div>
              )}
              {contract.end_date && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("pc.contratoDet.dados.fim")}</p>
                  <p className="font-bold text-lg">{formatarData(contract.end_date, "numerico")}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Contract Body */}
        {contract.contract_body_html && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">{t("pc.contratoDet.corpo.titulo")}</CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={handleDownloadContractPdf}
                disabled={downloadingPdf}
              >
                {downloadingPdf
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <FileDown className="h-3.5 w-3.5" />}
                {downloadingPdf ? t("pc.contratoDet.corpo.aGerar") : t("pc.contratoDet.corpo.descarregarPdf")}
              </Button>
            </CardHeader>
            <CardContent>
              <div
                className="prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(
                    injectSignaturesIntoBlock(
                      contract.contract_body_html,
                      {
                        signed: !!contract.company_signature_date,
                        name: contract.company_signed_by_name,
                        signedAt: contract.company_signature_date,
                        showOtpBadge: true,
                      },
                      {
                        signed: !!contract.signature_date,
                        name: contract.signed_by_name,
                        signedAt: contract.signature_date,
                        ip: contract.signature_ip,
                        showOtpBadge: true,
                      },
                    ),
                  ),
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* As cláusulas do negócio e as adendas assinadas (a vista do cliente), por baixo da minuta */}
        {obra && <ClausulasObra dados={obra} idioma={idioma} />}

        {/* Documents */}
        {documents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("pc.contratoDet.anexos.titulo")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 transition-colors">
                    <FileDown className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.document_type} • {formatarData(doc.created_at)}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={async () => {
                      const { data, error } = await supabase.storage.from("documents").download(doc.file_url);
                      if (error || !data) { toast({ title: t("pc.contratoDet.anexos.erroDescarregar"), variant: "destructive" }); return; }
                      // M3: full download pattern (Firefox/Safari safe)
                      const url = URL.createObjectURL(data);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = doc.file_name;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* OTP SMS Signature */}
        {canSign && (
          <Card className="border-2 border-dashed border-primary/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                {t("pc.contratoDet.sms.titulo")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("pc.contratoDet.sms.descricao")}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {otpStep === "idle" && (
                <div className="text-center space-y-3">
                  <Button
                    size="lg"
                    className="gap-2"
                    onClick={handleSendOtp}
                    disabled={actionLoading}
                  >
                    <Smartphone className="h-5 w-5" />
                    {t("pc.contratoDet.sms.enviarCodigo")}
                  </Button>
                  {otpError && (
                    <p className="text-sm text-destructive">{otpError}</p>
                  )}
                </div>
              )}

              {otpStep === "sending" && (
                <div className="text-center space-y-3 py-4">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                  <p className="text-sm text-muted-foreground">{t("pc.contratoDet.sms.aEnviar")}</p>
                </div>
              )}

              {otpStep === "input" && (
                <div className="text-center space-y-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      {t("pc.contratoDet.sms.codigoEnviadoPara")} <span className="font-mono font-bold text-foreground">{maskedPhone}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{t("pc.contratoDet.sms.validade")}</p>
                  </div>
                  <div className="flex justify-center">
                    <InputOTP autoFocus maxLength={6} value={otpCode} onChange={setOtpCode}>
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
                  <OtpCooldownNotice activo={otpCooldown.activo} texto={t("pc.contratoDet.otp.aguarde")} />
                  <div className="flex gap-3 justify-center">
                    <Button variant="outline" size="sm" onClick={handleResendOtp} disabled={actionLoading || otpCooldown.activo || reenviando}>
                      {cooldownLabel(t("pc.contratoDet.sms.reenviar"), otpCooldown.restante)}
                    </Button>
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={handleVerifyOtp}
                      disabled={otpCode.length !== 6 || actionLoading}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {t("pc.contratoDet.sms.verificar")}
                    </Button>
                  </div>
                </div>
              )}

              {otpStep === "verifying" && (
                <div className="text-center space-y-3 py-4">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                  <p className="text-sm text-muted-foreground">{t("pc.contratoDet.sms.aVerificar")}</p>
                </div>
              )}

              {otpStep === "verified" && (
                <div className="text-center space-y-3 py-4">
                  <ShieldCheck className="h-10 w-10 mx-auto text-emerald-600" />
                  <p className="text-sm font-medium text-emerald-600">{t("pc.contratoDet.sms.verificado")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        {canSign && otpStep === "idle" && (
          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <div className="text-center mb-4">
                <h3 className="text-xl font-bold">{t("pc.contratoDet.decisao.titulo")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("pc.contratoDet.decisao.texto")}</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2"
                  disabled={actionLoading}
                  onClick={() => setShowQuestion(true)}
                >
                  {t("pc.contratoDet.decisao.duvidas")}
                </Button>
                <Button
                  variant="destructive"
                  size="lg"
                  className="gap-2"
                  disabled={actionLoading}
                  onClick={() => setShowReject(true)}
                >
                  {t("pc.contratoDet.decisao.rejeitar")}
                </Button>
                <Button
                  size="lg"
                  className="gap-2"
                  style={{ backgroundColor: "#16a34a" }}
                  disabled={actionLoading}
                  onClick={handleSendOtp}
                >
                  <CheckSquare className="h-5 w-5 text-white" />
                  <span className="text-white">{t("pc.contratoDet.decisao.aceitar")}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Leu e aceita: a pergunta antes de assinar (3/11) */}
        <Dialog open={showLeitura} onOpenChange={setShowLeitura}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("pc.contratoDet.leitura.titulo")}</DialogTitle>
              <DialogDescription>
                {t("pc.contratoDet.leitura.descricao", { numero: contract.contract_number || "" })}
              </DialogDescription>
            </DialogHeader>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-primary" checked={leuAceita} onChange={(e) => setLeuAceita(e.target.checked)} />
              <span>{t("pc.contratoDet.leitura.caixa")}</span>
            </label>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowLeitura(false)}>{t("pc.contratoDet.leitura.voltar")}</Button>
              <Button onClick={confirmarLeitura} disabled={!leuAceita || actionLoading}>{t("pc.contratoDet.leitura.assinar")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={showReject} onOpenChange={setShowReject}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("pc.contratoDet.rejeitar.titulo")}</DialogTitle>
              <DialogDescription>{t("pc.contratoDet.rejeitar.descricao")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("pc.contratoDet.rejeitar.motivo")}</label>
                <Select value={rejectReason} onValueChange={setRejectReason}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("pc.contratoDet.rejeitar.motivoPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_REJEICAO_CONTRATO.map((motivo) => (
                      <SelectItem key={motivo.valor} value={motivo.valor}>{t(motivo.chave)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("pc.contratoDet.rejeitar.comentario")}</label>
                <Textarea value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} placeholder={t("pc.contratoDet.rejeitar.comentarioPlaceholder")} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowReject(false)}>{t("pc.contratoDet.rejeitar.cancelar")}</Button>
              <Button variant="destructive" onClick={handleRejectContract} disabled={actionLoading}>{t("pc.contratoDet.rejeitar.confirmar")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* A conversa com a equipa (só nos negócios): o que o cliente escreve chega às Operações e a resposta aparece aqui. */}
        {contract.negocio_id && <ConversaDoNegocio negocioId={contract.negocio_id} />}

        {/* Ask Question Dialog */}
        <Dialog open={showQuestion} onOpenChange={setShowQuestion}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("pc.contratoDet.duvida.titulo")}</DialogTitle>
              <DialogDescription>{t("pc.contratoDet.duvida.descricao")}</DialogDescription>
            </DialogHeader>
            <Textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder={t("pc.contratoDet.duvida.placeholder")}
              rows={4}
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowQuestion(false)}>{t("pc.contratoDet.duvida.cancelar")}</Button>
              <Button onClick={handleAskQuestion} disabled={actionLoading || !questionText.trim()}>{t("pc.contratoDet.duvida.enviar")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ClientPortalLayout>
  );
};

export default ClientPortalContractDetail;
