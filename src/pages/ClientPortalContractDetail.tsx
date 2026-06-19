import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ClientPortalLayout } from "@/components/portal/ClientPortalLayout";
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
import { ArrowLeft, ScrollText, Download, CheckSquare, FileDown, Smartphone, ShieldCheck, Loader2, PenTool } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import DOMPurify from "dompurify";
import { formatCurrency } from "@/lib/utils";
import { CONTRACT_STATUS_LABELS as STATUS_LABELS } from "@/constants/contractStatus";

const REJECTION_REASONS = [
  "Condições não adequadas",
  "Preço alto",
  "Encontrei alternativa",
  "Vou adiar",
  "Outro",
];

const ClientPortalContractDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [contract, setContract] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // OTP states
  const [otpStep, setOtpStep] = useState<"idle" | "sending" | "input" | "verifying" | "verified">("idle");
  const [otpCode, setOtpCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [otpError, setOtpError] = useState("");

  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");

  const [showQuestion, setShowQuestion] = useState(false);
  const [questionText, setQuestionText] = useState("");

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


  const canSign = contract && (contract.status === "draft" || contract.status === "pending" || contract.status === "sent");
  const isSigned = contract?.status === "signed";
  const isRejected = contract?.status === "rejected";

  async function handleSendOtp() {
    if (!id) return; // H4
    setOtpStep("sending");
    setOtpError("");
    try {
      const { data, error } = await supabase.functions.invoke("sms-otp", {
        body: { action: "send_otp", reference_id: id, reference_type: "contract", purpose: "contract_signature" },
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
        body: { action: "verify_otp", reference_id: id, reference_type: "contract", code: otpCode, purpose: "contract_signature" },
      });

      if (error) throw new Error(error.message);
      if (data?.error) {
        setOtpError(data.message || "Código inválido");
        setOtpStep("input");
        setOtpCode("");
        return;
      }

      // M9 — only mark verified AFTER sign succeeds
      await signContractAfterOtp();
      setOtpStep("verified");
    } catch (err: any) {
      setOtpError(err.message);
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
        const ipRes = await fetch("https://api.ipify.org?format=json");
        const ipData = await ipRes.json();
        clientIp = ipData.ip;
      } catch {}

      await supabase.functions.invoke("client-portal-action", {
        body: { action: "sign_contract", contract_id: id, signature_image: "OTP_SMS_VERIFIED", client_ip: clientIp },
      });

      toast({ title: "Contrato assinado com sucesso! 🎉", description: "Obrigado pela sua confirmação." });
      await loadData(); // M11
    } catch (err: any) {
      toast({ title: "Erro ao assinar", description: err.message, variant: "destructive" });
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
      toast({ title: "Contrato rejeitado", description: "Obrigado pelo seu feedback." });
      setShowReject(false);
      setRejectReason("");
      setRejectNotes("");
      await loadData(); // M11
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
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
      toast({ title: "Dúvida enviada!", description: "O comercial será notificado e entrará em contacto." });
      setShowQuestion(false);
      setQuestionText("");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
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
          <p className="text-muted-foreground">Contrato não encontrado.</p>
          <Button variant="ghost" onClick={() => navigate("/client-portal/contracts")} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
        </div>
      </ClientPortalLayout>
    );
  }

  return (
    <ClientPortalLayout>
      <div className="space-y-5 max-w-4xl mx-auto py-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/client-portal/contracts")} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>

        {/* Decision Banner */}
        {canSign && otpStep !== "verified" && (
          <div className="rounded-xl border bg-gradient-to-r from-primary/5 to-primary/10 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-foreground">Contrato aguarda a sua decisão</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Reveja o contrato abaixo, aceite ou peça alterações.
              </p>
            </div>
          </div>
        )}

        {/* Signed Banner */}
        {isSigned && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800 p-5">
            <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-300">✅ Contrato assinado</h3>
            {contract.signature_date && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                Assinado em {format(new Date(contract.signature_date), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: pt })}
              </p>
            )}
            {contract.signed_by_name && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                Assinado por: <span className="font-semibold">{contract.signed_by_name}</span>
              </p>
            )}
            {contract.signature_ip && (
              <p className="text-xs text-emerald-500 dark:text-emerald-500 mt-1">
                IP: {contract.signature_ip} • Verificação por SMS OTP
              </p>
            )}
          </div>
        )}

        {/* Rejected Banner */}
        {isRejected && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
            <h3 className="text-lg font-bold text-destructive">❌ Contrato rejeitado</h3>
          </div>
        )}

        {/* Contract Info */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ScrollText className="h-5 w-5" />
                Contrato {contract.contract_number || ""}
              </CardTitle>
            </div>
            <Badge variant="outline" className="shrink-0">
              📋 {STATUS_LABELS[contract.status] || contract.status}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {contract.contract_number && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Número</p>
                  <p className="font-bold text-lg">{contract.contract_number}</p>
                </div>
              )}
              {contract.total_value != null && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor</p>
                  <p className="font-bold text-lg text-primary">{formatCurrency(contract.total_value)}</p>
                </div>
              )}
              {contract.start_date && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Início</p>
                  <p className="font-bold text-lg">{format(new Date(contract.start_date), "dd/MM/yyyy", { locale: pt })}</p>
                </div>
              )}
              {contract.end_date && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Fim</p>
                  <p className="font-bold text-lg">{format(new Date(contract.end_date), "dd/MM/yyyy", { locale: pt })}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Contract Body */}
        {contract.contract_body_html && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Corpo do Contrato</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(contract.contract_body_html) }}
              />
              {/* Signature block at the end of the contract */}
              {(contract.company_signature_date || contract.signature_date) && (
                <div className="mt-10 pt-6 border-t-2 border-dashed border-muted">
                  <div className="flex flex-col sm:flex-row justify-between gap-8">
                    {/* Company (First Party) */}
                    <div className="text-center">
                      {contract.company_signature_date ? (
                        <div className="w-48 mx-auto mb-2 space-y-1">
                          <div className="flex items-center justify-center gap-2 text-blue-600">
                            <PenTool className="h-4 w-4" />
                            <span className="text-sm font-bold">Assinado</span>
                          </div>
                          {contract.company_signed_by_name && (
                            <p className="text-sm font-semibold text-foreground">{contract.company_signed_by_name}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(contract.company_signature_date), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: pt })}
                          </p>
                        </div>
                      ) : (
                        <div className="w-48 mx-auto mb-2">
                          <p className="text-xs italic text-muted-foreground">Aguarda assinatura</p>
                        </div>
                      )}
                      <div className={`border-b w-48 mx-auto mb-2 ${contract.company_signature_date ? "border-blue-500" : "border-foreground/30"}`} />
                      <p className="text-sm font-medium text-muted-foreground">A PRIMEIRA CONTRATANTE</p>
                    </div>

                    {/* Client (Second Party) */}
                    <div className="text-center">
                      {contract.signature_date ? (
                        <div className="w-48 mx-auto mb-2 space-y-1">
                          <div className="flex items-center justify-center gap-2 text-emerald-600">
                            <ShieldCheck className="h-5 w-5" />
                            <span className="text-sm font-bold">Assinado via SMS OTP</span>
                          </div>
                          {contract.signed_by_name && (
                            <p className="text-sm font-semibold text-foreground">{contract.signed_by_name}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(contract.signature_date), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: pt })}
                          </p>
                          {contract.signature_ip && (
                            <p className="text-xs text-muted-foreground">IP: {contract.signature_ip}</p>
                          )}
                        </div>
                      ) : (
                        <div className="w-48 mx-auto mb-2">
                          <p className="text-xs italic text-muted-foreground">Aguarda assinatura</p>
                        </div>
                      )}
                      <div className={`border-b w-48 mx-auto mb-2 ${contract.signature_date ? "border-emerald-500" : "border-foreground/30"}`} />
                      <p className="text-sm font-medium text-muted-foreground">O SEGUNDO CONTRATANTE</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Documents */}
        {documents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documentos Anexos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 transition-colors">
                    <FileDown className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.document_type} • {format(new Date(doc.created_at), "d MMM yyyy", { locale: pt })}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={async () => {
                      const { data, error } = await supabase.storage.from("documents").download(doc.file_url);
                      if (error || !data) { toast({ title: "Erro ao descarregar", variant: "destructive" }); return; }
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
                Verificação por SMS
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Para aceitar este contrato, enviaremos um código de verificação por SMS para o seu telemóvel.
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
                    Enviar código SMS
                  </Button>
                  {otpError && (
                    <p className="text-sm text-destructive">{otpError}</p>
                  )}
                </div>
              )}

              {otpStep === "sending" && (
                <div className="text-center space-y-3 py-4">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                  <p className="text-sm text-muted-foreground">A enviar código SMS...</p>
                </div>
              )}

              {otpStep === "input" && (
                <div className="text-center space-y-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Código enviado para <span className="font-mono font-bold text-foreground">{maskedPhone}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">Válido por 5 minutos</p>
                  </div>
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
                  <div className="flex gap-3 justify-center">
                    <Button variant="outline" size="sm" onClick={handleSendOtp} disabled={actionLoading}>
                      Reenviar código
                    </Button>
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={handleVerifyOtp}
                      disabled={otpCode.length !== 6 || actionLoading}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Verificar
                    </Button>
                  </div>
                </div>
              )}

              {otpStep === "verifying" && (
                <div className="text-center space-y-3 py-4">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                  <p className="text-sm text-muted-foreground">A verificar código e assinar contrato...</p>
                </div>
              )}

              {otpStep === "verified" && (
                <div className="text-center space-y-3 py-4">
                  <ShieldCheck className="h-10 w-10 mx-auto text-emerald-600" />
                  <p className="text-sm font-medium text-emerald-600">Código verificado! Contrato assinado com sucesso.</p>
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
                <h3 className="text-xl font-bold">Pronto para avançar?</h3>
                <p className="text-sm text-muted-foreground mt-1">Aceite o contrato via SMS ou solicite alterações.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2"
                  disabled={actionLoading}
                  onClick={() => setShowQuestion(true)}
                >
                  💬 Tenho dúvidas
                </Button>
                <Button
                  variant="destructive"
                  size="lg"
                  className="gap-2"
                  disabled={actionLoading}
                  onClick={() => setShowReject(true)}
                >
                  ✕ Rejeitar
                </Button>
                <Button
                  size="lg"
                  className="gap-2"
                  style={{ backgroundColor: "#16a34a" }}
                  disabled={actionLoading}
                  onClick={handleSendOtp}
                >
                  <CheckSquare className="h-5 w-5 text-white" />
                  <span className="text-white">Aceitar e Assinar</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reject Dialog */}
        <Dialog open={showReject} onOpenChange={setShowReject}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Rejeitar Contrato</DialogTitle>
              <DialogDescription>Indique o motivo da rejeição.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Motivo</label>
                <Select value={rejectReason} onValueChange={setRejectReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {REJECTION_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Comentário (opcional)</label>
                <Textarea value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} placeholder="Adicione um comentário..." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowReject(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={handleRejectContract} disabled={actionLoading}>Confirmar Rejeição</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Ask Question Dialog */}
        <Dialog open={showQuestion} onOpenChange={setShowQuestion}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>💬 Tenho dúvidas</DialogTitle>
              <DialogDescription>Envie a sua dúvida ao comercial responsável.</DialogDescription>
            </DialogHeader>
            <Textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Escreva a sua dúvida..."
              rows={4}
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowQuestion(false)}>Cancelar</Button>
              <Button onClick={handleAskQuestion} disabled={actionLoading || !questionText.trim()}>Enviar Dúvida</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ClientPortalLayout>
  );
};

export default ClientPortalContractDetail;
