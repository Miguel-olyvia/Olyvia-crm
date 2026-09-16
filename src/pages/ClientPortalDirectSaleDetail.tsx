import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Loader2, Receipt, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClientPortalLayout } from "@/components/portal/ClientPortalLayout";
import { parseEdgeFunctionPayload } from "@/utils/edgeFunctionResponse";
import { generateProformaPdfBlob, downloadBlob, type ProformaPdfPrefetch } from "@/utils/generateProformaPdfBlob";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
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
//   - não há "tenho dúvidas" nesta fase — o backend expõe apenas
//     accept_direct_sale e reject_direct_sale;
//   - o PDF só existe depois de aceite (Fase 4b): é a proforma, e só há
//     proforma quando o trigger da BD lhe atribui um número.
//
// A rejeição segue o molde das propostas (ClientPortalProposalDetail): motivo
// de uma lista fixa + comentário opcional, e SEM OTP — tal como o
// reject_proposal, o backend só exige posse do documento. O código SMS existe
// para provar o compromisso de aceitar, não para recusar.
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
  // "rascunho" e "enviada" são estados internos do comercial; para o cliente
  // são a mesma coisa — um documento à espera da decisão dele. É o mesmo que
  // as propostas mostram por omissão (ProposalPortalDocument.tsx:100).
  rascunho: { label: "A aguardar decisão", variant: "secondary" },
  enviada: { label: "A aguardar decisão", variant: "secondary" },
  aceite: { label: "Venda direta aceite", variant: "default" },
  rejeitada: { label: "Venda direta rejeitada", variant: "destructive" },
  cancelada: { label: "Venda direta cancelada", variant: "destructive" },
};

// Exactamente os mesmos 6 motivos das propostas
// (ClientPortalProposalDetail.tsx:35-42) — o relatório de motivos de perda
// tem de poder juntar os dois fluxos sem traduzir nada.
const REJECTION_REASONS = [
  "Preço alto",
  "Encontrei alternativa",
  "Já não preciso",
  "Prazo não serve",
  "Vou adiar",
  "Outro",
];

interface DirectSaleHeader {
  id: string;
  sale_number: string | null;
  title: string | null;
  description: string | null;
  status: string;
  // `notes` não existe aqui de propósito: é o campo interno do comercial e o
  // backend deixou de o enviar ao portal. Só `client_notes` é para o cliente.
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

/**
 * Resposta de client-portal-action#get_direct_sale_pdf_data.
 *
 * Declarada à parte de DirectSaleHeader/DirectSaleLine de propósito: é outra
 * ação, com outro conjunto de colunas (traz `proforma_*`, `company` e `client`,
 * não traz `sent_at`/`valid_until`/`rejected_at`). Os campos numéricos vêm de
 * colunas `numeric`, que o PostgREST tanto pode serializar como número como
 * como string — daí o `number | string | null` e a coerção explícita.
 */
interface ProformaPdfPayload {
  direct_sale: {
    sale_number: string | null;
    title: string | null;
    client_notes: string | null;
    currency: string | null;
    subtotal: number | string | null;
    total: number | string | null;
    iva_rate: number | string | null;
    proforma_number: string | null;
    proforma_issued_at: string | null;
  } | null;
  lines: Array<{
    id: string;
    descricao_snapshot: string | null;
    qt: number | string | null;
    unidade: string | null;
    retail_price_unit: number | string | null;
    iva_percent: number | string | null;
    total_sem_iva: number | string | null;
    total_com_iva: number | string | null;
    total_com_desconto: number | string | null;
  }> | null;
  company: { name: string | null; vat: string | null; address: string | null; logo_url: string | null } | null;
  client: { name: string | null; vat: string | null; address: string | null } | null;
  error?: string;
  message?: string;
}

/** Coerção segura para o gerador do PDF: nunca transformar um null em 0. */
function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  // Estado próprio do PDF: gerar a proforma demora (edge function + render do
  // @react-pdf), e não deve bloquear nem ser bloqueado pelas ações de aceitar/
  // rejeitar, que vivem noutro painel.
  const [pdfLoading, setPdfLoading] = useState(false);

  // Rejeição — mesmo desenho das propostas (motivo + comentário opcional)
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");

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

  async function handleRejectSale() {
    if (!id) return;
    setActionLoading(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("client-portal-action", {
        body: {
          action: "reject_direct_sale",
          direct_sale_id: id,
          reason_code: rejectReason,
          reason_text: rejectNotes,
        },
      });
      // Mesmo unwrap do acceptAfterOtp: em não-2xx o supabase-js só põe uma
      // mensagem genérica em `error` e o motivo real ("Motivo deve ter entre
      // 10 e 500 caracteres") fica no corpo da resposta.
      if (invokeError) {
        let friendly = invokeError.message;
        try {
          const ctx: any = (invokeError as any).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            if (body?.message || body?.error) friendly = body.message || body.error;
          } else if (ctx?.body) {
            const body = typeof ctx.body === "string" ? JSON.parse(ctx.body) : ctx.body;
            if (body?.message || body?.error) friendly = body.message || body.error;
          }
        } catch {}
        throw new Error(friendly);
      }
      const payload = parseEdgeFunctionPayload<{ error?: string; message?: string }>(data);
      if (payload?.error) throw new Error(payload.message || payload.error);

      toast({ title: "Venda direta rejeitada", description: "Lamentamos. Obrigado pelo seu feedback." });
      setShowReject(false);
      setRejectReason("");
      setRejectNotes("");
      await reloadSale();
    } catch (error: any) {
      captureFlowError(error, FLOW);
      toast({ title: "Erro ao rejeitar", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDownloadProforma() {
    if (!id) return;
    setPdfLoading(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("client-portal-action", {
        body: { action: "get_direct_sale_pdf_data", direct_sale_id: id },
      });
      // Mesmo unwrap do acceptAfterOtp/handleRejectSale. Aqui é o que faz a
      // diferença entre "Proforma ainda não emitida" (o 404 real, acionável) e
      // o "Edge Function returned a non-2xx status code" que o supabase-js põe
      // em `error.message` e que não diz nada ao cliente.
      if (invokeError) {
        let friendly = invokeError.message;
        try {
          const ctx: any = (invokeError as any).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            if (body?.message || body?.error) friendly = body.message || body.error;
          } else if (ctx?.body) {
            const body = typeof ctx.body === "string" ? JSON.parse(ctx.body) : ctx.body;
            if (body?.message || body?.error) friendly = body.message || body.error;
          }
        } catch {}
        throw new Error(friendly);
      }

      const payload = parseEdgeFunctionPayload<ProformaPdfPayload>(data);
      if (payload?.error) throw new Error(payload.message || payload.error);
      const saleData = payload?.direct_sale;
      if (!saleData) throw new Error("Não foi possível obter os dados da proforma.");

      // MODO PREFETCHED, OBRIGATÓRIO NO PORTAL. Sem isto o gerador vai ele
      // próprio ao Supabase buscar venda, linhas, organização e cliente — e a
      // RLS do portal bloqueia tudo isso em silêncio, produzindo uma proforma
      // vazia (ver ProformaPdfPrefetch em generateProformaPdfBlob.ts). Tudo o
      // que o documento mostra tem de vir da edge function, incluindo o
      // logótipo, que já chega em data URI base64.
      const prefetched: ProformaPdfPrefetch = {
        sale: {
          sale_number: saleData.sale_number ?? null,
          proforma_number: saleData.proforma_number ?? null,
          proforma_issued_at: saleData.proforma_issued_at ?? null,
          title: saleData.title ?? null,
          client_notes: saleData.client_notes ?? null,
          currency: saleData.currency ?? null,
          subtotal: toNumberOrNull(saleData.subtotal),
          total: toNumberOrNull(saleData.total),
          iva_rate: toNumberOrNull(saleData.iva_rate),
        },
        // Já vêm só as visíveis ao cliente e já ordenadas por `ordem` — não se
        // reordena nem se filtra nada aqui.
        lines: (payload?.lines ?? []).map(line => ({
          id: line.id,
          descricao_snapshot: line.descricao_snapshot ?? null,
          qt: toNumberOrNull(line.qt),
          unidade: line.unidade ?? null,
          retail_price_unit: toNumberOrNull(line.retail_price_unit),
          iva_percent: toNumberOrNull(line.iva_percent),
          total_sem_iva: toNumberOrNull(line.total_sem_iva),
          total_com_iva: toNumberOrNull(line.total_com_iva),
          total_com_desconto: toNumberOrNull(line.total_com_desconto),
        })),
        // `email`/`phone` não vêm no payload do portal (a edge function só
        // envia name/vat/address/logo_url): explicitamente null, para não
        // parecer um esquecimento.
        company: {
          name: payload?.company?.name ?? null,
          vat: payload?.company?.vat ?? null,
          address: payload?.company?.address ?? null,
          email: null,
          phone: null,
          logo_url: payload?.company?.logo_url ?? null,
        },
        client: {
          name: payload?.client?.name ?? null,
          vat: payload?.client?.vat ?? null,
          address: payload?.client?.address ?? null,
        },
      };

      const { blob, fileName } = await generateProformaPdfBlob(id, prefetched);
      downloadBlob(blob, fileName);
    } catch (err: any) {
      captureFlowError(err, FLOW);
      toast({
        title: "Erro ao gerar proforma",
        description: err?.message || "Não foi possível gerar o PDF da proforma.",
        variant: "destructive",
      });
    } finally {
      setPdfLoading(false);
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
  // Paridade com as propostas: o portal não exige um estado concreto para
  // deixar aceitar — o ProposalPortalDocument só recusa quando já foi aceite ou
  // rejeitada (ProposalPortalDocument.tsx:247-248). Quem chega aqui é porque a
  // RLS o deixou ver o documento, ou seja, ele foi mesmo publicado; o estado é
  // do comercial e não deve poder bloquear a decisão do cliente.
  // "cancelada" é o único estado extra da venda direta e não deve ser aceitável.
  const isAccepted = sale.status === "aceite";
  const isRejected = sale.status === "rejeitada";
  const canAccept = !isAccepted && sale.status !== "rejeitada" && sale.status !== "cancelada";

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
              {/* Sem número não há documento: o proforma_number é escrito pelo
                  trigger da BD ao aceitar, e a edge function devolve 404 até lá.
                  Esconder o botão evita oferecer um download que não existe. */}
              {sale.proforma_number && (
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleDownloadProforma}
                    disabled={pdfLoading}
                  >
                    {pdfLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {pdfLoading ? "A gerar proforma..." : "Descarregar proforma"}
                  </Button>
                  <p className="pt-2 text-xs text-muted-foreground">
                    <span className="font-mono font-medium text-foreground">{sale.proforma_number}</span>
                    {sale.proforma_issued_at ? ` · emitida em ${formatDate(sale.proforma_issued_at)}` : ""}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Estado rejeitado — a par do painel de "aceite" acima */}
        {isRejected && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="space-y-2 py-6 text-center">
              <XCircle className="mx-auto h-10 w-10 text-destructive" />
              <p className="text-sm font-medium text-destructive">
                Venda direta rejeitada{sale.rejected_at ? ` em ${formatDate(sale.rejected_at)}` : ""}.
              </p>
              <p className="text-xs text-muted-foreground">
                Obrigado pelo seu feedback. Se mudar de ideias, fale com o seu comercial.
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

              {/* Rejeitar — mesma condição do aceitar (quem pode aceitar pode
                  recusar), mas deliberadamente discreto: ghost e pequeno, para
                  não competir com o botão de aceitação acima. A cor forte de
                  destructive fica só para o "Confirmar Rejeição" do diálogo. */}
              {otpStep !== "verified" && (
                <div className="border-t pt-3 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setShowReject(true)}
                    disabled={actionLoading}
                  >
                    Rejeitar venda direta
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Diálogo de rejeição */}
        <Dialog open={showReject} onOpenChange={setShowReject}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Rejeitar Venda Direta</DialogTitle>
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
              <Button variant="destructive" onClick={handleRejectSale} disabled={actionLoading}>
                Confirmar Rejeição
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ClientPortalLayout>
  );
};

export default ClientPortalDirectSaleDetail;
