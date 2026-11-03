// Contra-assinatura do contrato de fornecedor pela empresa, por código SMS.
// O mesmo fluxo e os mesmos componentes da contra-assinatura dos contratos de
// cliente (ContractBodyTab.tsx: sms-otp send_otp → InputOTP → verify_otp →
// RPC que consome o OTP), só muda a referência:
//   reference_type 'supplier_contract_company', purpose 'company_signature'
// e a RPC rpc_supplier_contract_countersign (exige suppliers.contract_manage e
// um papel com can_sign_contracts; consome o OTP verificado há <= 10 min).
import { useRef, useState } from "react";
import { Loader2, PenTool, ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { OtpCooldownNotice } from "@/components/ui/otp-cooldown-notice";
import { useCooldown, cooldownLabel, OTP_COOLDOWN_SECONDS } from "@/hooks/useCooldown";
import { toast } from "@/lib/toast";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { describeContractError, supplierContractsRpc } from "@/lib/supplierContracts/rpc";

export const SUPPLIER_CONTRACT_OTP_REFERENCE_TYPE = "supplier_contract_company";
export const SUPPLIER_CONTRACT_OTP_PURPOSE = "company_signature";

type OtpStep = "idle" | "sending" | "input" | "verifying" | "verified";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  contractLabel: string;
  onSigned: () => void;
}

export function SupplierContractCountersignDialog({ open, onOpenChange, contractId, contractLabel, onSigned }: Props) {
  const [otpStep, setOtpStep] = useState<OtpStep>("idle");
  const [otpCode, setOtpCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [otpError, setOtpError] = useState("");
  const [reenviando, setReenviando] = useState(false);
  const [signing, setSigning] = useState(false);
  const otpCooldown = useCooldown(OTP_COOLDOWN_SECONDS);
  // Ref (e não estado) para que um segundo clique durante o pedido seja ignorado.
  const otpSendingRef = useRef(false);

  const resetOtpState = () => {
    setOtpStep("idle");
    setOtpCode("");
    setOtpError("");
    setMaskedPhone("");
  };

  const handleClose = (next: boolean) => {
    if (next) return onOpenChange(true);
    if (otpStep === "sending" || otpStep === "verifying" || signing) return;
    resetOtpState();
    onOpenChange(false);
  };

  // A contagem de 60 s é só do Reenviar: no primeiro envio começa quando o servidor aceita;
  // no Reenviar começa no clique e não é reposta se o servidor recusar.
  const sendOtp = async (isResend: boolean) => {
    if (otpSendingRef.current) return;
    if (isResend && !otpCooldown.iniciar()) return;
    otpSendingRef.current = true;
    if (isResend) setReenviando(true);
    else setOtpStep("sending");
    setOtpError("");
    try {
      const { data, error } = await supabase.functions.invoke("sms-otp", {
        body: {
          action: "send_otp",
          reference_id: contractId,
          reference_type: SUPPLIER_CONTRACT_OTP_REFERENCE_TYPE,
          purpose: SUPPLIER_CONTRACT_OTP_PURPOSE,
          caller_type: "crm",
        },
      });

      // Ler o corpo estruturado mesmo quando o invoke marcou não-2xx.
      let payload: { error?: string; message?: string; masked_phone?: string } | null = data;
      if (error && !payload) {
        try {
          payload = await (error as { context?: { json?: () => Promise<typeof payload> } }).context?.json?.() ?? null;
        } catch {
          /* ignorar */
        }
      }

      if (payload?.error) {
        if (payload.error === "no_phone") {
          setOtpError(payload.message || "Não foi encontrado um número de telefone associado à sua conta. Atualize o seu perfil.");
          if (!isResend) setOtpStep("idle");
          return;
        }
        throw new Error(payload.message || payload.error);
      }
      if (error) throw new Error(error.message);

      setMaskedPhone(payload?.masked_phone || "");
      setOtpStep("input");
      if (!isResend) otpCooldown.iniciar();
      toast.success(`Código SMS enviado para ${payload?.masked_phone ?? "o seu telemóvel"}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setOtpError(msg);
      if (!isResend) setOtpStep("idle");
      toast.error("Erro ao enviar SMS: " + msg);
    } finally {
      otpSendingRef.current = false;
      setReenviando(false);
    }
  };

  const signAfterOtp = async () => {
    setSigning(true);
    try {
      const r = await supplierContractsRpc.countersign(contractId);
      toast.success(`Contrato ${contractLabel} contra-assinado por ${r.company_signed_by_name}.`);
      setOtpStep("verified");
      onSigned();
      resetOtpState();
      onOpenChange(false);
    } catch (err) {
      captureFlowError(err, "db-error-leaked-to-ui");
      // O OTP pode já ter sido consumido ou recusado: volta ao início para pedir outro.
      setOtpError(describeContractError(err));
      setOtpStep("idle");
      setOtpCode("");
      toast.error("Erro ao assinar: " + describeContractError(err));
    } finally {
      setSigning(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) return;
    setOtpStep("verifying");
    setOtpError("");
    try {
      const { data, error } = await supabase.functions.invoke("sms-otp", {
        body: {
          action: "verify_otp",
          reference_id: contractId,
          reference_type: SUPPLIER_CONTRACT_OTP_REFERENCE_TYPE,
          code: otpCode,
          purpose: SUPPLIER_CONTRACT_OTP_PURPOSE,
          caller_type: "crm",
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) {
        setOtpError(data.message || "Código inválido");
        setOtpStep("input");
        setOtpCode("");
        return;
      }
      await signAfterOtp();
    } catch (err) {
      captureFlowError(err, "db-error-leaked-to-ui");
      setOtpError(err instanceof Error ? err.message : String(err));
      setOtpStep("input");
      setOtpCode("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenTool className="h-5 w-5" aria-hidden="true" /> Contra-assinar pela empresa
          </DialogTitle>
          <DialogDescription>
            Contrato {contractLabel}. A assinatura é validada por um código SMS enviado para o seu telemóvel; ao assinar,
            as condições passam a valer no fornecedor e nas encomendas novas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {otpStep === "idle" && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
                <Smartphone className="h-8 w-8 text-blue-600" aria-hidden="true" />
              </div>
              <p className="text-sm text-muted-foreground">
                Será enviado um código de 6 dígitos para o telemóvel associado à sua conta.
              </p>
              {otpError && (
                <p className="text-sm text-destructive" role="alert">
                  {otpError}
                </p>
              )}
              <Button onClick={() => void sendOtp(false)} className="w-full gap-2">
                <Smartphone className="h-4 w-4" aria-hidden="true" />
                Enviar código SMS
              </Button>
            </div>
          )}

          {otpStep === "sending" && (
            <div className="py-4 text-center" role="status">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">A enviar código SMS...</p>
            </div>
          )}

          {otpStep === "input" && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Código enviado para <strong>{maskedPhone}</strong>
              </p>
              <div className="flex justify-center">
                <InputOTP autoFocus maxLength={6} value={otpCode} onChange={setOtpCode} aria-label="Código SMS">
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
                <p className="text-sm text-destructive" role="alert">
                  {otpError}
                </p>
              )}
              <OtpCooldownNotice activo={otpCooldown.activo} />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => void sendOtp(true)}
                  disabled={otpCooldown.activo || reenviando}
                  className="flex-1 text-xs"
                >
                  {cooldownLabel("Reenviar código", otpCooldown.restante)}
                </Button>
                <Button onClick={() => void handleVerifyOtp()} disabled={otpCode.length !== 6} className="flex-1 gap-1.5">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Verificar e assinar
                </Button>
              </div>
            </div>
          )}

          {otpStep === "verifying" && (
            <div className="py-4 text-center" role="status">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">A verificar código e assinar...</p>
            </div>
          )}

          {otpStep === "verified" && (
            <div className="py-4 text-center" role="status">
              <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-green-600" aria-hidden="true" />
              <p className="text-sm font-medium text-green-600">Contrato contra-assinado.</p>
            </div>
          )}
        </div>

        {otpStep === "idle" && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => handleClose(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
