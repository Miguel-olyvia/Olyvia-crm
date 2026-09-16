import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Receipt, ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClientPortalLayout } from "@/components/portal/ClientPortalLayout";
import { parseEdgeFunctionPayload } from "@/utils/edgeFunctionResponse";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { captureFlowError, type BusinessFlow } from "@/lib/observability/captureFlowError";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

// Venda Direta — Fase 3: detalhe e aceitação no portal do cliente.
//
// Fluxo de OTP copiado de ClientPortalProposalDetail.tsx (mesmo sms-otp, mesma
// ordem: enviar -> verificar -> aceitar, e só marca "verified" depois de a
// aceitação ter sucesso). Diferenças deliberadas em relação à proposta:
//   - não há seleção de orçamentos (a venda direta não os tem);
//   - não há rejeição nem "tenho dúvidas" nesta fase — o backend só expõe
//     accept_direct_sale;
//   - não há PDF/proforma nesta fase (Fase 4).
//
// Os dados vêm de client-portal-action#get_direct_sale_data, que já devolve
// apenas as linhas visible_to_client = true e já remove cost_price/
// margem_percent. Esta página nunca mostra campos de custo.
//
// reference_type "direct_sale" e purpose "direct_sale_acceptance" têm de ser
// exatamente estas strings: o backend faz
// consumeVerifiedOtp("direct_sale", direct_sale_id, "direct_sale_acceptance").

// Canal próprio de alertas: falhas da venda direta não devem poluir o de
// "client-portal-proposal".
const FLOW: BusinessFlow = "client-portal-direct-sale";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "outline" },
  enviada: { label: "A aguardar decisão", variant: "secondary" },
  aceite: { label: "Venda direta aceite", variant: "default" },
  rejeitada: { label: "Venda direta rejeitada", variant: "destructive" },
  cancelada: { label: "Venda direta cancelada", variant: "destructive" },
};

interface DirectSaleHeader {
  id: string;
  sale_number: string | null;
  title: string | null;
  description: string | null;
  status: string;
  notes: string | null;
  client_notes: string | null;
  subtotal: number | null;
  total: number | null;
  iva_rate: number | null;
  currency: string | null;
  valid_until: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  proforma_number: string | null;
  proforma_issued_at: string | null;
  organization_id: string | null;
}

interface DirectSaleLine {
  id: string;
  descricao_snapshot: string | null;
  qt: number | null;
  unidade: string | null;
  retail_price_unit: number | null;
  discount_percent: number | null;
  iva_percent: number | null;
  total_sem_iva: number | null;
  total_com_iva: number | null;
  total_com_desconto: number | null;
  ordem: number | null;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return format(new Date(value), "d MMM yyyy", { locale: pt });
}

/** Total da linha tal como foi gravado (com IVA), sem recalcular nada. */
function lineTotal(line: DirectSaleLine): number {
  return line.total_com_desconto ?? line.total_com_iva ?? line.total_sem_iva ?? 0;
}

const ClientPortalDirectSaleDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [sale, setSale] = useState<DirectSaleHeader | null>(null);
  const [lines, setLines] = useState<DirectSaleLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // OTP states — iguais aos da proposta
  const [otpStep, setOtpStep] = useState<"idle" | "sending" | "input" | "verifying" | "verified">("idle");
  const [otpCode, setOtpCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [otpError, setOtpError] = useState("");

  const hasLoadedOnceRef = useRef(false);

  const reloadSale = useCallback(async () => {
    if (!id) return;
    if (!hasLoadedOnceRef.current) setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("client-portal-action", {
        body: { action: "get_direct_sale_data", direct_sale_id: id },
      });
      if (error) throw error;

      const payload = parseEdgeFunctionPayload<{ direct_sale: DirectSaleHeader | null; lines: DirectSaleLine[] | null }>(data);
      setSale(payload?.direct_sale ?? null);
      setLines(payload?.lines ?? []);
    } catch (err: any) {
      captureFlowError(err, FLOW);
      setSale(null);
      setLines([]);
    } finally {
      hasLoadedOnceRef.current = true;
      setLoading(false);
    }
  }, [id]);

  const logView = useCallback(async () => {
    if (!id) return;
    try {
      await supabase.functions.invoke("client-portal-action", {
        body: { action: "log_view", document_type: "direct_sale", document_id: id },
      });
    } catch {}
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void reloadSale();
    void logView();
  }, [id, reloadSale, logView]);

  async function handleSendOtp() {
    if (!id) return;
    setOtpStep("sending");
    setOtpError("");
    try {
      const { data, error } = await supabase.functions.invoke("sms-otp", {
        body: {
          action: "send_otp",
          reference_id: id,
          reference_type: "direct_sale",
          purpose: "direct_sale_acceptance",
        },
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

      setMaskedPhone(data?.masked_phone || "");
      setOtpStep("input");
      toast({ title: "Código SMS enviado", description: `Enviámos um código para ${data?.masked_phone || "o seu telemóvel"}` });
    } catch (err: any) {
      setOtpError(err.message);
      setOtpStep("idle");
      captureFlowError(err, FLOW);
      toast({ title: "Erro ao enviar SMS", description: err.message, variant: "destructive" });
    }
  }

  async function handleVerifyOtp() {
    if (!id) return;
    if (otpCode.length !== 6) return;
    setOtpStep("verifying");
    setOtpError("");
    try {
      const { data, error } = await supabase.functions.invoke("sms-otp", {
        body: {
          action: "verify_otp",
          reference_id: id,
          reference_type: "direct_sale",
          code: otpCode,
          purpose: "direct_sale_acceptance",
        },
      });

      // Em não-2xx o supabase-js põe `error` e `data` fica null; o corpo da
      // resposta é o único sítio com uma mensagem legível.
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

      // Só "verified" DEPOIS de a aceitação ter sucesso — caso contrário o
      // cliente via "aceite" sem nada ter sido gravado.
      await acceptAfterOtp();
      setOtpStep("verified");
    } catch (err: any) {
      // A mensagem tem de ser a real (vinda de accept_direct_sale): dizer
      // sempre "código inválido" culpava o SMS por falhas que eram do backend.
      setOtpError(err.message || "Ocorreu um erro ao aceitar a venda direta. Tente novamente.");
      setOtpStep("input");
      setOtpCode("");
    }
  }

  async function acceptAfterOtp() {
    if (!id) return;
    setActionLoading(true);
    try {
      let clientIp = "";
      try {
        // Limitado no tempo: um fetch a terceiros sem timeout podia empurrar a
        // chamada a client-portal-action para lá da janela de frescura do OTP.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const ipRes = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
        clearTimeout(timeoutId);
        const ipData = await ipRes.json();
        clientIp = ipData.ip;
      } catch {}

      const { data, error: invokeError } = await supabase.functions.invoke("client-portal-action", {
        body: {
          action: "accept_direct_sale",
          direct_sale_id: id,
          signature_image: "OTP_SMS_VERIFIED",
          client_ip: clientIp,
        },
      });
      if (invokeError) {
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
      const payload = parseEdgeFunctionPayload<{ error?: string; message?: string }>(data);
      if (payload?.error) throw new Error(payload.message || payload.error);

      toast({
        title: "Venda direta aceite! 🎉",
        description: "Obrigado! Entraremos em contacto brevemente.",
      });

      await reloadSale();
    } catch (error: any) {
      captureFlowError(error, FLOW);
      toast({ title: "Erro ao aceitar", description: error.message, variant: "destructive" });
      throw error; // deixa o handleVerifyOtp reverter o passo do OTP
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

  if (!sale) {
    return (
      <ClientPortalLayout>
        <div className="py-12 text-center">
          <p className="text-muted-foreground">Venda direta não encontrada.</p>
          <Button variant="ghost" onClick={() => navigate("/client-portal/direct-sales")} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
        </div>
      </ClientPortalLayout>
    );
  }

  const statusInfo = STATUS_MAP[sale.status] || { label: sale.status, variant: "outline" as const };
  const canAccept = sale.status === "enviada";
  const isAccepted = sale.status === "aceite";

  // Totais: vêm do cabeçalho tal como foram gravados. As linhas internas
  // (visible_to_client = false) já não entram nesses valores, por isso
  // recalculá-los a partir das linhas visíveis podia divergir do que o
  // comercial vê. O IVA é a diferença entre os dois, nunca uma soma nova.
  const subtotal = sale.subtotal ?? 0;
  const total = sale.total ?? 0;
  const ivaValue = total - subtotal;
  const lineRates = Array.from(new Set(lines.map(l => Number(l.iva_percent ?? 0))));
  const ivaLabel = lineRates.length === 1
    ? `IVA (${lineRates[0]}%)`
    : lineRates.length === 0 && sale.iva_rate != null
      ? `IVA (${Number(sale.iva_rate)}%)`
      : "IVA";

  return (
    <ClientPortalLayout>
      <div className="mx-auto w-full max-w-4xl space-y-5 py-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/client-portal/direct-sales")} className="w-fit gap-1">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>

        {/* Cabeçalho do documento */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Receipt className="h-4 w-4" />
                  <span>Venda Direta</span>
                  {sale.sale_number && <span className="font-mono font-medium text-foreground">{sale.sale_number}</span>}
                </div>
                <h1 className="text-xl font-bold text-foreground">{sale.title || sale.sale_number || "Venda direta"}</h1>
                {sale.description && (
                  <p className="text-sm text-muted-foreground whitespace-pre-line">{sale.description}</p>
                )}
              </div>
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Enviada em</p>
                <p className="font-medium text-foreground">{formatDate(sale.sent_at)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Válida até</p>
                <p className="font-medium text-foreground">{formatDate(sale.valid_until)}</p>
              </div>
              {sale.accepted_at && (
                <div>
                  <p className="text-muted-foreground">Aceite em</p>
                  <p className="font-medium text-foreground">{formatDate(sale.accepted_at)}</p>
                </div>
              )}
              {sale.rejected_at && (
                <div>
                  <p className="text-muted-foreground">Rejeitada em</p>
                  <p className="font-medium text-foreground">{formatDate(sale.rejected_at)}</p>
                </div>
              )}
            </div>

            {sale.client_notes && (
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs font-semibold text-foreground">Notas</p>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{sale.client_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Linhas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Artigos e serviços</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {lines.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Esta venda direta não tem linhas a apresentar.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Qt.</TableHead>
                      <TableHead className="text-right">Preço unit.</TableHead>
                      <TableHead className="text-right">Total (c/ IVA)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map(line => (
                      <TableRow key={line.id}>
                        <TableCell className="max-w-[320px]">
                          <span className="text-sm">{line.descricao_snapshot || "—"}</span>
                          {Number(line.discount_percent ?? 0) > 0 && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              (desconto {Number(line.discount_percent)}%)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm whitespace-nowrap">
                          {Number(line.qt ?? 0)}{line.unidade ? ` ${line.unidade}` : ""}
                        </TableCell>
                        <TableCell className="text-right text-sm whitespace-nowrap">
                          {formatCurrency(Number(line.retail_price_unit ?? 0))}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium whitespace-nowrap">
                          {formatCurrency(lineTotal(line))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="ml-auto w-full max-w-xs space-y-2 border-t pt-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal (s/ IVA)</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{ivaLabel}</span>
                <span>{formatCurrency(ivaValue)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-lg font-bold">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Estado aceite */}
        {isAccepted && (
          <Card className="border-emerald-200 bg-emerald-50/60 dark:bg-emerald-900/10">
            <CardContent className="space-y-2 py-6 text-center">
              <ShieldCheck className="mx-auto h-10 w-10 text-emerald-600" />
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Venda direta aceite{sale.accepted_at ? ` em ${formatDate(sale.accepted_at)}` : ""}.
              </p>
              <p className="text-xs text-muted-foreground">
                A aceitação foi confirmada por código SMS. Entraremos em contacto brevemente.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Aceitação por OTP */}
        {canAccept && (
          <Card className="border-2 border-dashed border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Smartphone className="h-5 w-5" />
                Verificação por SMS
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Para aceitar esta venda direta, enviaremos um código de verificação por SMS para o seu telemóvel.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {otpStep === "idle" && (
                <div className="space-y-3 text-center">
                  <Button size="lg" className="gap-2" onClick={handleSendOtp} disabled={actionLoading}>
                    <Smartphone className="h-5 w-5" />
                    Enviar código SMS
                  </Button>
                  {otpError && <p className="text-sm text-destructive">{otpError}</p>}
                </div>
              )}

              {otpStep === "sending" && (
                <div className="space-y-3 py-4 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">A enviar código SMS...</p>
                </div>
              )}

              {otpStep === "input" && (
                <div className="space-y-4 text-center">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Código enviado para <span className="font-mono font-bold text-foreground">{maskedPhone}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">Válido por 5 minutos</p>
                  </div>
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={otpCode} onChange={(val) => setOtpCode(val)}>
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
                  {otpError && <p className="text-sm text-destructive">{otpError}</p>}
                  <div className="flex justify-center gap-3">
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
                      Verificar e aceitar
                    </Button>
                  </div>
                </div>
              )}

              {otpStep === "verifying" && (
                <div className="space-y-3 py-4 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">A verificar código e aceitar venda direta...</p>
                </div>
              )}

              {otpStep === "verified" && (
                <div className="space-y-3 py-4 text-center">
                  <ShieldCheck className="mx-auto h-10 w-10 text-emerald-600" />
                  <p className="text-sm font-medium text-emerald-600">Código verificado! Venda direta aceite com sucesso.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ClientPortalLayout>
  );
};

export default ClientPortalDirectSaleDetail;
