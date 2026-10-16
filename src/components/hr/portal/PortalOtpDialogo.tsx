/**
 * O passo do codigo (OTP) do portal: 6 algarismos enviados para o e-mail do convite.
 *
 *  - um so campo (`autocomplete="one-time-code"`, `inputmode="numeric"`), para o telemovel o
 *    preencher sozinho a partir do SMS ou do e-mail;
 *  - o codigo nunca aparece na interface: so o que a pessoa escreve, e apaga-se ao confirmar;
 *  - o e-mail so se diz mascarado, e so se a Edge o mandar;
 *  - tentativas (5 por codigo), bloqueio e reenvio (so depois de 60 s) sao anunciados:
 *    os erros em `role="alert"`; a contagem so se anuncia no inicio e no fim, nao a cada segundo.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDevolverFoco } from "@/components/hr/useDevolverFoco";
import { useTranslation } from "@/hooks/useTranslation";
import type { EstadoOtp } from "@/hooks/useConviteAdmissaoPublico";
import { ESPERA_REENVIO_MS, TENTATIVAS_OTP, mensagemErroPortal } from "@/lib/hr/portalAdmissao";

interface PortalOtpDialogoProps {
  aberto: boolean;
  otp: EstadoOtp;
  aoFechar: () => void;
  aoPedirNovo: () => void;
  aoConfirmar: (codigo: string) => Promise<boolean>;
}

/** Os segundos que faltam ate `instante`, tick a tick, so enquanto ainda faltam. */
function useSegundosAte(instante: number | null): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (instante === null) return;
    setAgora(Date.now());
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [instante]);
  return instante === null ? 0 : Math.max(0, Math.ceil((instante - agora) / 1000));
}

export function PortalOtpDialogo({ aberto, otp, aoFechar, aoPedirNovo, aoConfirmar }: PortalOtpDialogoProps) {
  const { t } = useTranslation();
  const devolverFoco = useDevolverFoco(aberto);
  const [codigo, setCodigo] = useState("");
  const [anuncio, setAnuncio] = useState("");
  const campoRef = useRef<HTMLInputElement>(null);
  const faltam = useSegundosAte(otp.reenviarApos);
  const anterior = useRef({ aVerificar: false, pedido: false, faltam: 0 });

  // O codigo escrito nao sobrevive ao dialogo.
  useEffect(() => {
    if (!aberto) setCodigo("");
  }, [aberto]);

  useEffect(() => {
    const antes = anterior.current;
    // Um codigo errado limpa o campo e devolve-lhe o foco, para se poder tentar de novo.
    if (antes.aVerificar && !otp.aVerificar && aberto) {
      setCodigo("");
      campoRef.current?.focus();
    }
    // O codigo acabou de ser enviado: o foco vai para o campo e anuncia-se o intervalo.
    if (!antes.pedido && otp.pedido) {
      campoRef.current?.focus();
      setAnuncio(t("portal.otp.enviado", { n: Math.round(ESPERA_REENVIO_MS / 1000) }));
    }
    // O reenvio ficou livre.
    if (antes.faltam > 0 && faltam === 0 && otp.pedido) setAnuncio(t("portal.otp.reenviarLivre"));
    anterior.current = { aVerificar: otp.aVerificar, pedido: otp.pedido, faltam };
  }, [otp.aVerificar, otp.pedido, faltam, aberto, t]);

  const incompleto = codigo.length !== 6;
  const confirmar = async () => {
    if (incompleto || otp.aVerificar || otp.bloqueado) return;
    await aoConfirmar(codigo);
  };
  const erro = otp.erro ? mensagemErroPortal(t, otp.erro, { restantes: otp.restantes }) : null;
  const reenvioBloqueado = faltam > 0 || otp.aPedir;

  return (
    <Dialog open={aberto} onOpenChange={(abrir) => !abrir && aoFechar()}>
      <DialogContent onCloseAutoFocus={devolverFoco}>
        <DialogHeader>
          <DialogTitle>{t("portal.otp.titulo")}</DialogTitle>
          <DialogDescription>
            {otp.emailMascarado ? t("portal.otp.descricaoEmail", { email: otp.emailMascarado }) : t("portal.otp.descricao")}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="portal-otp-codigo">{t("portal.otp.rotulo")}</Label>
            <Input
              id="portal-otp-codigo"
              ref={campoRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              className="min-h-11 text-lg tracking-[0.4em]"
              value={codigo}
              disabled={otp.bloqueado || !otp.pedido}
              aria-invalid={erro ? true : undefined}
              aria-describedby="portal-otp-ajuda"
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <p id="portal-otp-ajuda" className="text-xs text-muted-foreground">
              {t("portal.otp.ajuda")}
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            {otp.aPedir && !otp.pedido
              ? t("portal.otp.aPedir")
              : otp.restantes !== null
                ? t("portal.otp.tentativasRestantes", { n: otp.restantes })
                : t("portal.otp.tentativas", { n: TENTATIVAS_OTP })}
          </p>

          {erro && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {erro}
            </p>
          )}

          {/* So se anuncia o inicio e o fim da espera, nunca a contagem segundo a segundo. */}
          <p role="status" className="sr-only">
            {anuncio}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-col items-start gap-1">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                aria-disabled={reenvioBloqueado}
                onClick={() => {
                  if (!reenvioBloqueado) aoPedirNovo();
                }}
              >
                {otp.aPedir && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {t("portal.otp.reenviar")}
              </Button>
              {faltam > 0 && <span className="text-xs text-muted-foreground">{t("portal.otp.reenviarEm", { n: faltam })}</span>}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="min-h-11" onClick={aoFechar}>
                {t("portal.otp.cancelar")}
              </Button>
              <Button
                type="submit"
                className="min-h-11"
                disabled={otp.bloqueado}
                aria-disabled={incompleto || otp.aVerificar}
              >
                {otp.aVerificar && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {otp.aVerificar ? t("portal.otp.aConfirmar") : t("portal.otp.confirmar")}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("portal.otp.naoRecebeu")}</p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
