import { Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { OtpCooldownNotice } from "@/components/ui/otp-cooldown-notice";
import { cooldownLabel } from "@/hooks/useCooldown";
import type { PortalTraducao } from "@/portal-i18n";

export type ProposalOtpStep = "idle" | "sending" | "input" | "verifying" | "verified";

interface ProposalPortalOtpSectionProps {
  /** Tradução já ligada ao idioma do documento (traduzirEm). */
  t: PortalTraducao["t"];
  isPreview: boolean;
  otpStep: ProposalOtpStep;
  otpCode: string;
  maskedPhone: string;
  otpError: string;
  otpCooldown: number;
  actionLoading: boolean;
  onSendOtp?: () => void;
  onResendOtp?: () => void;
  onVerifyOtp?: () => void;
  onOtpCodeChange?: (code: string) => void;
}

const SLOTS = [0, 1, 2, 3, 4, 5];

/** Cartão «Verificação por SMS» do documento da proposta (aceitar com código OTP). */
export function ProposalPortalOtpSection({
  t,
  isPreview,
  otpStep,
  otpCode,
  maskedPhone,
  otpError,
  otpCooldown,
  actionLoading,
  onSendOtp,
  onResendOtp,
  onVerifyOtp,
  onOtpCodeChange,
}: ProposalPortalOtpSectionProps) {
  return (
    <Card className="border-2 border-dashed border-primary/30">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Smartphone className="h-5 w-5" />
          {t("pc.docProposta.otp.titulo")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("pc.docProposta.otp.intro")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPreview ? (
          <div className="text-center space-y-3 pointer-events-none opacity-50">
            <Button size="lg" className="gap-2" disabled>
              <Smartphone className="h-5 w-5" />
              {t("pc.docProposta.otp.enviar")}
            </Button>
          </div>
        ) : (
          <>
            {otpStep === "idle" && (
              <div className="text-center space-y-3">
                <Button size="lg" className="gap-2" onClick={onSendOtp} disabled={actionLoading}>
                  <Smartphone className="h-5 w-5" />
                  {t("pc.docProposta.otp.enviar")}
                </Button>
                {otpError && <p className="text-sm text-destructive">{otpError}</p>}
              </div>
            )}

            {otpStep === "sending" && (
              <div className="text-center space-y-3 py-4">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">{t("pc.docProposta.otp.aEnviar")}</p>
              </div>
            )}

            {otpStep === "input" && (
              <div className="text-center space-y-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {t("pc.docProposta.otp.enviadoPara")} <span className="font-mono font-bold text-foreground">{maskedPhone}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{t("pc.docProposta.otp.validade")}</p>
                </div>
                <div className="flex justify-center">
                  <InputOTP autoFocus maxLength={6} value={otpCode} onChange={(val) => onOtpCodeChange?.(val)}>
                    <InputOTPGroup>
                      {SLOTS.map((index) => (
                        <InputOTPSlot key={index} index={index} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {otpError && <p className="text-sm text-destructive">{otpError}</p>}
                <OtpCooldownNotice activo={otpCooldown > 0} texto={t("pc.docProposta.otp.aguarde")} />
                <div className="flex gap-3 justify-center">
                  <Button variant="outline" size="sm" onClick={onResendOtp ?? onSendOtp} disabled={actionLoading || otpCooldown > 0}>
                    {cooldownLabel(t("pc.docProposta.otp.reenviar"), otpCooldown)}
                  </Button>
                  <Button size="sm" className="gap-2" onClick={onVerifyOtp} disabled={otpCode.length !== 6 || actionLoading}>
                    <ShieldCheck className="h-4 w-4" />
                    {t("pc.docProposta.otp.verificar")}
                  </Button>
                </div>
              </div>
            )}

            {otpStep === "verifying" && (
              <div className="text-center space-y-3 py-4">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">{t("pc.docProposta.otp.aVerificar")}</p>
              </div>
            )}

            {otpStep === "verified" && (
              <div className="text-center space-y-3 py-4">
                <ShieldCheck className="h-10 w-10 mx-auto text-emerald-600" />
                <p className="text-sm font-medium text-emerald-600">{t("pc.docProposta.otp.verificado")}</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
