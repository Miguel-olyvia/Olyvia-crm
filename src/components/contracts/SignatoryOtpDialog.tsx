import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Phone } from "lucide-react";
import type { Signatory } from "./SignatoriesPanel";

interface SignatoryOtpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signatory: Signatory | null;
  templateId?: string;
  onVerified: (signatory: Signatory) => void;
}

export function SignatoryOtpDialog({ open, onOpenChange, signatory, templateId, onVerified }: SignatoryOtpDialogProps) {
  const [step, setStep] = useState<"send" | "verify">("send");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");

  const referenceId = templateId || `template_sig_${signatory?.userId}`;

  const handleSendOtp = async () => {
    if (!signatory) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("sms-otp", {
        body: {
          action: "send_otp",
          caller_type: "crm",
          target_user_id: signatory.userId,
          reference_id: referenceId,
          reference_type: "template_signature",
          purpose: "template_signature",
        },
      });

      if (error) throw error;
      if (data?.error) {
        if (data.error === "no_phone") {
          toast.error("O signatário não tem número de telefone associado.");
        } else {
          toast.error(data.message || "Erro ao enviar SMS");
        }
        return;
      }

      setMaskedPhone(data.masked_phone || "");
      setStep("verify");
      toast.success("Código enviado por SMS");
    } catch (err: any) {
      console.error("Send OTP error:", err);
      toast.error("Erro ao enviar código SMS");
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    if (!code.trim() || !signatory) return;
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("sms-otp", {
        body: {
          action: "verify_otp",
          caller_type: "crm",
          reference_id: referenceId,
          reference_type: "template_signature",
          purpose: "template_signature",
          code: code.trim(),
        },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.message || "Código inválido");
        return;
      }

      if (data?.verified) {
        toast.success("Assinatura verificada com sucesso!");
        onVerified(signatory);
        handleClose();
      }
    } catch (err: any) {
      console.error("Verify OTP error:", err);
      toast.error("Erro ao verificar código");
    } finally {
      setVerifying(false);
    }
  };

  const handleClose = () => {
    setStep("send");
    setCode("");
    setMaskedPhone("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Verificar Assinatura
          </DialogTitle>
          <DialogDescription>
            {step === "send"
              ? `Será enviado um código SMS para o número de ${signatory?.userName} para confirmar a assinatura.`
              : `Introduza o código enviado para ${maskedPhone}.`}
          </DialogDescription>
        </DialogHeader>

        {step === "send" ? (
          <div className="space-y-4 py-4">
            <div className="border rounded-lg p-4 bg-muted/20 space-y-2">
              <p className="text-sm font-medium">{signatory?.userName}</p>
              <p className="text-xs text-muted-foreground">{signatory?.roleName}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button onClick={handleSendOtp} disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Phone className="h-4 w-4 mr-2" />}
                Enviar Código SMS
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Input
                placeholder="000000"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-2xl tracking-[0.5em] font-mono"
                maxLength={6}
                autoFocus
              />
              <p className="text-xs text-muted-foreground text-center">O código é válido por 5 minutos</p>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="ghost" size="sm" onClick={handleSendOtp} disabled={sending}>
                {sending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                Reenviar código
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>Cancelar</Button>
                <Button onClick={handleVerify} disabled={verifying || code.length < 6}>
                  {verifying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                  Verificar
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
