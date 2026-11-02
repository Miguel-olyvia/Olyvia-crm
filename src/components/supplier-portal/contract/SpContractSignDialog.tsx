// Assinatura do contrato de fornecedor no portal, pelo titular da conta.
// O mesmo fluxo e os mesmos componentes da contra-assinatura no CRM
// (SupplierContractCountersignDialog: sms-otp send_otp → InputOTP →
// verify_otp → RPC que consome o OTP), com um passo antes: confirmar o
// telemóvel (ou pedi-lo e gravá-lo com sp_set_my_phone), porque quem já
// confirmou os dados antes de haver este campo nunca o indicou.
//   sms-otp: caller_type "supplier", reference_type "supplier_contract",
//            purpose "supplier_signature", reference_id = contrato
//   RPC:     sp_supplier_contract_sign(p_contract_id, p_document_sha256) com o
//            SHA-256 tal como veio de sp_supplier_contract_get.
import { useEffect, useRef, useState } from "react";
import { Loader2, PenTool, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { OtpCooldownNotice } from "@/components/ui/otp-cooldown-notice";
import { useCooldown, cooldownLabel, OTP_COOLDOWN_SECONDS } from "@/hooks/useCooldown";
import { useToast } from "@/hooks/use-toast";
import { getSpHint } from "@/lib/supplierPortal/spRpc";
import {
  TELEMOVEL_INVALIDO,
  describeSpContractError,
  invokeSpContractOtp,
  normalizarTelemovel,
  otpErrorText,
  spContractsRpc,
  telemovelParaEditar,
} from "@/lib/supplierContracts/portal";
import { SpMobileField } from "./SpMobileField";
import { useSpMyPhone } from "./useSpContracts";

type Step = "phone" | "sending" | "input" | "verifying" | "signing" | "retry" | "done";

export interface SpContractSignTarget {
  id: string;
  /** "CF-2026-0001 · v1" */
  label: string;
  /** Tal como veio de sp_supplier_contract_get. */
  document_sha256: string;
  phone_set: boolean;
  phone_masked: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: SpContractSignTarget;
  onSigned: () => void;
  /** O contrato mudou no servidor (documento, estado, validade): recarregar. */
  onStale: () => void;
  /** O telemóvel foi gravado (sp_set_my_phone). */
  onPhoneSaved?: () => void;
}

export function SpContractSignDialog({ open, onOpenChange, contract, onSigned, onStale, onPhoneSaved }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("phone");
  const [phoneMasked, setPhoneMasked] = useState<string | null>(contract.phone_set ? contract.phone_masked : null);
  const [editingPhone, setEditingPhone] = useState(!contract.phone_set);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [savingPhone, setSavingPhone] = useState(false);
  const [code, setCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [resending, setResending] = useState(false);
  const cooldown = useCooldown(OTP_COOLDOWN_SECONDS);
  const sendingRef = useRef(false);
  const myPhone = useSpMyPhone(open && editingPhone);

  // Pré-preencher o número atual ao escolher "Usar outro número".
  useEffect(() => {
    if (editingPhone && myPhone.data?.phone && phoneInput === "") setPhoneInput(telemovelParaEditar(myPhone.data.phone));
    // Só quando chega o número; não reescrever o que o utilizador apagou.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingPhone, myPhone.data?.phone]);

  const reset = () => {
    setStep("phone");
    setCode("");
    setOtpError("");
    setPhoneError(null);
    setSentTo("");
  };

  const busy = step === "sending" || step === "verifying" || step === "signing" || savingPhone;

  const handleClose = (next: boolean) => {
    if (next) return onOpenChange(true);
    if (busy) return;
    reset();
    onOpenChange(false);
  };

  const fail = (msg: string) => {
    setOtpError(msg);
    toast({ title: "Não foi possível assinar", description: msg, variant: "destructive" });
  };

  // A contagem de 60 s é só do Reenviar (como no CRM).
  const sendOtp = async (isResend: boolean) => {
    if (sendingRef.current) return;
    if (isResend && !cooldown.iniciar()) return;
    sendingRef.current = true;
    if (isResend) setResending(true);
    else setStep("sending");
    setOtpError("");
    try {
      const r = await invokeSpContractOtp("send_otp", contract.id);
      if (r.error) {
        const msg = otpErrorText(r);
        setOtpError(msg);
        if (r.error === "no_phone") {
          setEditingPhone(true);
          setStep("phone");
        } else if (r.error === "invalid_state" || r.error === "contract_not_found" || r.error === "not_owner") {
          toast({ title: "Não foi possível assinar", description: msg, variant: "destructive" });
          reset();
          onOpenChange(false);
          onStale();
        } else if (!isResend) {
          setStep("phone");
        }
        return;
      }
      setSentTo(r.masked_phone || phoneMasked || "");
      setStep("input");
      setCode("");
      if (!isResend) cooldown.iniciar();
    } finally {
      sendingRef.current = false;
      setResending(false);
    }
  };

  const savePhoneAndSend = async () => {
    const normalized = normalizarTelemovel(phoneInput);
    if (!normalized) {
      setPhoneError(TELEMOVEL_INVALIDO);
      return;
    }
    setPhoneError(null);
    setSavingPhone(true);
    try {
      const r = await spContractsRpc.setMyPhone(normalized);
      setPhoneMasked(r.phone_masked);
      setEditingPhone(false);
      onPhoneSaved?.();
    } catch (err) {
      setPhoneError(describeSpContractError(err));
      return;
    } finally {
      setSavingPhone(false);
    }
    await sendOtp(false);
  };

  const sign = async () => {
    setStep("signing");
    setOtpError("");
    try {
      await spContractsRpc.sign(contract.id, contract.document_sha256);
      setStep("done");
      toast({ title: "Contrato assinado", description: `Contrato ${contract.label} assinado. Falta a contra-assinatura da empresa.` });
      onSigned();
    } catch (err) {
      const hint = getSpHint(err);
      const msg = describeSpContractError(err);
      if (hint === "document_changed" || hint === "invalid_state" || hint === "expired" || hint === "not_owner" || hint === "not_found") {
        toast({ title: "Não foi possível assinar", description: msg, variant: "destructive" });
        reset();
        onOpenChange(false);
        onStale();
        return;
      }
      if (hint === "no_phone") {
        setEditingPhone(true);
        setStep("phone");
        setCode("");
        fail(msg);
        return;
      }
      if (hint === "otp_required") {
        // O código já não serve (expirou, foi usado ou o número mudou): pedir outro.
        setStep("phone");
        setCode("");
        fail(msg);
        return;
      }
      // Rede/servidor: o código verificado continua válido uns minutos.
      setStep("retry");
      fail(msg);
    }
  };

  const verifyAndSign = async () => {
    if (code.length !== 6) return;
    setStep("verifying");
    setOtpError("");
    const r = await invokeSpContractOtp("verify_otp", contract.id, code);
    if (r.error || r.verified !== true) {
      setOtpError(otpErrorText(r.error ? r : { message: "Código inválido." }));
      setStep("input");
      setCode("");
      return;
    }
    await sign();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" hideClose={busy}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenTool className="h-5 w-5" aria-hidden="true" /> Assinar o contrato
          </DialogTitle>
          <DialogDescription>
            Contrato {contract.label}. A assinatura é feita com um código SMS enviado para o seu telemóvel e fica ligada a
            este documento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2" aria-live="polite">
          {step === "phone" && !editingPhone && phoneMasked && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Smartphone className="h-8 w-8 text-primary" aria-hidden="true" />
              </div>
              <p className="text-sm text-muted-foreground">
                Vamos enviar um código de 6 dígitos para <strong className="text-foreground">{phoneMasked}</strong>. É o seu
                telemóvel atual?
              </p>
              {otpError && (
                <p className="text-sm text-destructive" role="alert">
                  {otpError}
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1"
                  onClick={() => {
                    setEditingPhone(true);
                    setOtpError("");
                  }}
                >
                  Usar outro número
                </Button>
                <Button type="button" className="h-11 flex-1 gap-2" onClick={() => void sendOtp(false)}>
                  <Smartphone className="h-4 w-4" aria-hidden="true" />
                  Enviar código SMS
                </Button>
              </div>
            </div>
          )}

          {step === "phone" && (editingPhone || !phoneMasked) && (
            <form
              className="space-y-4"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void savePhoneAndSend();
              }}
            >
              {otpError && (
                <p className="text-sm text-destructive" role="alert">
                  {otpError}
                </p>
              )}
              <SpMobileField
                id="sp-sign-phone"
                value={phoneInput}
                onChange={(v) => {
                  setPhoneInput(v);
                  setPhoneError(null);
                }}
                error={phoneError}
                disabled={savingPhone}
                required
                autoFocus
                hint="Fica guardado na sua conta. O código SMS da assinatura é enviado para este número."
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                {phoneMasked && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 flex-1"
                    onClick={() => {
                      setEditingPhone(false);
                      setPhoneError(null);
                    }}
                    disabled={savingPhone}
                  >
                    Voltar
                  </Button>
                )}
                <Button type="submit" className="h-11 flex-1 gap-2" disabled={savingPhone}>
                  {savingPhone ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Smartphone className="h-4 w-4" aria-hidden="true" />}
                  Guardar e enviar código
                </Button>
              </div>
            </form>
          )}

          {step === "sending" && (
            <div className="py-4 text-center" role="status">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">A enviar o código SMS…</p>
            </div>
          )}

          {step === "input" && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Código enviado para <strong className="text-foreground">{sentTo || "o seu telemóvel"}</strong>
              </p>
              <div className="flex justify-center">
                <InputOTP autoFocus maxLength={6} value={code} onChange={setCode} aria-label="Código SMS">
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
              <OtpCooldownNotice activo={cooldown.activo} />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void sendOtp(true)}
                  disabled={cooldown.activo || resending}
                  className="h-11 flex-1 text-xs"
                >
                  {cooldownLabel("Reenviar código", cooldown.restante)}
                </Button>
                <Button type="button" onClick={() => void verifyAndSign()} disabled={code.length !== 6} className="h-11 flex-1 gap-1.5">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Verificar e assinar
                </Button>
              </div>
            </div>
          )}

          {(step === "verifying" || step === "signing") && (
            <div className="py-4 text-center" role="status">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                {step === "verifying" ? "A verificar o código…" : "A assinar o contrato…"}
              </p>
            </div>
          )}

          {step === "retry" && (
            <div className="space-y-4 text-center">
              {otpError && (
                <p className="text-sm text-destructive" role="alert">
                  {otpError}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                O código já foi verificado. Pode tentar assinar de novo nos próximos minutos.
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setStep("phone")}>
                  Pedir novo código
                </Button>
                <Button type="button" className="h-11 flex-1 gap-1.5" onClick={() => void sign()}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Tentar assinar de novo
                </Button>
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="space-y-3 py-4 text-center" role="status">
              <ShieldCheck className="mx-auto h-10 w-10 text-emerald-600" aria-hidden="true" />
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Contrato assinado.</p>
              <p className="text-sm text-muted-foreground">
                Falta a contra-assinatura da empresa: as condições entram em vigor logo que o faça.
              </p>
            </div>
          )}
        </div>

        {(step === "phone" || step === "done") && (
          <DialogFooter>
            <Button type="button" variant={step === "done" ? "default" : "ghost"} className="h-11" onClick={() => handleClose(false)}>
              {step === "done" ? "Fechar" : "Cancelar"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
