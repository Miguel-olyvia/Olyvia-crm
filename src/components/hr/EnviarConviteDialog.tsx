/**
 * "Enviar convite de admissao": o gatilho, na ficha da pessoa, do fluxo sem
 * conta descrito no PLANO FECHADO (seccao 3). Atras de
 * `hr.pessoas.convite.enviar` -- quem monta este dialogo decide se o mostra.
 *
 * Pede so o e-mail de destino (a pessoa pode ja ter um em
 * `pessoas.email_pessoal`, mas o convite pode ir para outro -- por exemplo,
 * antes de a pessoa ter e-mail pessoal registado).
 *
 * DOIS MODOS: `enviar` (primeiro convite) e `reenviar` (substitui o anterior,
 * que deixa de servir; o rascunho que a pessoa ja tinha escrito passa para o
 * novo se o e-mail for o mesmo). O e-mail do reenvio vem pre-preenchido com o
 * do convite actual.
 *
 * O LINK SO SE MOSTRA UMA VEZ
 * ----------------------------
 * Se o e-mail nao sair (SMTP em baixo, caixa inexistente), o servidor devolve
 * o link nessa resposta e em mais nenhuma. O dialogo NAO fecha: passa ao
 * estado `link`, com o texto em modo de leitura, "Copiar link" e um aviso de
 * que nao volta a aparecer. O link vive so neste estado local -- nunca em
 * estado global, storage, URL, log nem toast -- e perde-se ao fechar. Quem o
 * fechou sem o copiar tem "Reenviar", que gera outro.
 *
 * O motivo tecnico do falhanco do e-mail aparece so ao RH, em letra pequena;
 * nunca chega a quem recebe o convite.
 */
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Copy, Loader2, Send } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useEnviarConviteAdmissao } from "@/hooks/useEnviarConviteAdmissao";
import { toast } from "@/lib/toast";

interface EnviarConviteDialogProps {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  pessoaId: string;
  emailSugerido: string | null;
  /** `reenviar` muda o titulo e assume o e-mail do convite actual em `emailSugerido`. */
  modo?: "enviar" | "reenviar";
  /** Chamado quando o servidor aceitou o convite (com ou sem e-mail). */
  onEnviado?: () => void;
}

/**
 * O convite JA existe mas o e-mail nao saiu. `link` e `null` quando a resposta
 * nao o trouxe (Edge Function antiga, campo perdido): e um ERRO, nao um
 * sucesso parcial -- o convite fica criado e o link perdeu-se, por isso o
 * dialogo nao fecha e oferece Reenviar.
 */
interface LinkMostrado {
  link: string | null;
  emailErro: string | null;
}

/** Quanto tempo o botao diz "Copiado" antes de voltar a "Copiar link". */
const COPIADO_VISIVEL_MS = 2000;

export function EnviarConviteDialog({
  open,
  onOpenChange,
  pessoaId,
  emailSugerido,
  modo = "enviar",
  onEnviado,
}: EnviarConviteDialogProps) {
  const { t } = useTranslation();
  const { enviarConvite, enviando } = useEnviarConviteAdmissao();
  const [email, setEmail] = useState(emailSugerido ?? "");
  const [tocado, setTocado] = useState(false);
  /** O link, so enquanto o dialogo esta no estado `link`. Nunca sai daqui. */
  const [mostrado, setMostrado] = useState<LinkMostrado | null>(null);
  const campoLinkRef = useRef<HTMLInputElement>(null);
  const reenviarRef = useRef<HTMLButtonElement>(null);
  /** O RH ja copiou o link? Se sim, fechar nao perde nada e nao se pergunta. */
  const [copiado, setCopiado] = useState(false);
  const [aConfirmarFecho, setAConfirmarFecho] = useState(false);
  const temporizadorCopiado = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiadoRecente, setCopiadoRecente] = useState(false);

  // Cada abertura recomeca limpa: o e-mail sugerido do momento, sem erro e,
  // sobretudo, SEM o link da vez anterior.
  useEffect(() => {
    if (open) {
      setEmail(emailSugerido ?? "");
      setTocado(false);
    } else {
      setMostrado(null);
      setCopiado(false);
      setCopiadoRecente(false);
      setAConfirmarFecho(false);
    }
  }, [open, emailSugerido]);

  useEffect(
    () => () => {
      if (temporizadorCopiado.current) clearTimeout(temporizadorCopiado.current);
    },
    [],
  );

  // O botao "Enviar" tinha o foco e desaparece ao passar ao estado do link:
  // sem isto o foco cai para o corpo do dialogo e o leitor de ecra fica calado.
  useEffect(() => {
    if (!mostrado) return;
    (campoLinkRef.current ?? reenviarRef.current)?.focus();
  }, [mostrado]);

  const emailValido = /.+@.+\..+/.test(email.trim());
  const erro = tocado && !emailValido ? t("hr.convite.erroEmailInvalido") : null;

  const enviar = async () => {
    setTocado(true);
    if (!emailValido) return;
    const resultado = await enviarConvite(pessoaId, email.trim());
    if (!resultado.ok) {
      toast.error(resultado.erro ?? t("hr.convite.erroEnviar"));
      return;
    }
    onEnviado?.();
    if (resultado.emailEnviado) {
      toast.success(t("hr.convite.enviadoComSucesso"));
      onOpenChange(false);
      return;
    }
    // E-mail por enviar: NAO se fecha, com ou sem link. Sem link e um erro
    // persistente (o convite existe e o link perdeu-se), nunca um toast.
    setCopiado(false);
    setAConfirmarFecho(false);
    setMostrado({ link: resultado.link, emailErro: resultado.emailErro });
  };

  const copiar = async () => {
    if (!mostrado?.link) return;
    try {
      await navigator.clipboard.writeText(mostrado.link);
      toast.success(t("hr.convite.linkCopiado"));
      setCopiado(true);
      setCopiadoRecente(true);
      if (temporizadorCopiado.current) clearTimeout(temporizadorCopiado.current);
      temporizadorCopiado.current = setTimeout(() => setCopiadoRecente(false), COPIADO_VISIVEL_MS);
    } catch {
      // Sem permissao para a area de transferencia: avisa, e deixa o texto
      // seleccionado para o RH o copiar com Ctrl+C. Nunca em silencio: o link
      // so aparece uma vez.
      toast.warning(t("hr.convite.copiarFalhou"));
      campoLinkRef.current?.focus();
      campoLinkRef.current?.select();
    }
  };

  const fechar = () => {
    setMostrado(null);
    setAConfirmarFecho(false);
    onOpenChange(false);
  };

  // Escape, clique fora e o X chegam aqui. Com um link por copiar, nao se
  // perde por engano: pergunta-se primeiro. O botao "Fechar" e a saida explicita.
  const pedidoDeFecho = () => {
    if (mostrado?.link && !copiado) {
      setAConfirmarFecho(true);
      return;
    }
    fechar();
  };

  const titulo = t(modo === "reenviar" ? "hr.convite.tituloReenviar" : "hr.convite.tituloDialogo");

  return (
    <Dialog open={open} onOpenChange={(aberto) => (aberto ? onOpenChange(true) : pedidoDeFecho())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            {titulo}
          </DialogTitle>
          <DialogDescription>{t("hr.convite.descricaoDialogo")}</DialogDescription>
        </DialogHeader>

        {mostrado ? (
          <div className="space-y-3">
            <Alert role="alert" variant={mostrado.link ? "default" : "destructive"}>
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>
                {mostrado.link ? t("hr.convite.emailNaoEnviado") : t("hr.convite.criadoSemLink")}
              </AlertDescription>
            </Alert>

            {mostrado.link && (
              <div className="space-y-1.5">
                <Label htmlFor="hr-convite-link">{t("hr.convite.linkDoConvite")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="hr-convite-link"
                    ref={campoLinkRef}
                    readOnly
                    value={mostrado.link}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button type="button" variant="outline" className="gap-1.5" onClick={copiar}>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    {copiadoRecente ? t("hr.convite.copiado") : t("hr.convite.copiarLink")}
                  </Button>
                </div>
                {/* Anuncia o "Copiado" a leitores de ecra: o toast fica fora do dialogo modal. */}
                <span className="sr-only" aria-live="polite">
                  {copiadoRecente ? t("hr.convite.copiado") : ""}
                </span>
                <p className="text-xs text-muted-foreground">{t("hr.convite.linkUmaVez")}</p>
              </div>
            )}

            {aConfirmarFecho && (
              <div className="space-y-2 rounded-md border border-destructive/40 p-3">
                <p className="text-sm">{t("hr.convite.fecharSemCopiar")}</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setAConfirmarFecho(false)}>
                    {t("hr.convite.voltarAoLink")}
                  </Button>
                  <Button type="button" variant="destructive" size="sm" onClick={fechar}>
                    {t("hr.convite.fecharMesmoAssim")}
                  </Button>
                </div>
              </div>
            )}

            {mostrado.emailErro && (
              // O texto vem do servidor de e-mail, em bruto: nao esta traduzido,
              // por isso fica atras de um rotulo traduzido, em letra pequena.
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">{t("hr.convite.detalheTecnico")}</summary>
                <p lang="en" className="mt-1 break-words">
                  {mostrado.emailErro}
                </p>
              </details>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="hr-convite-email">
              {t("hr.convite.email")}
              <span aria-hidden="true" className="ml-0.5 text-destructive">
                *
              </span>
              <span className="sr-only"> ({t("hr.campos.obrigatorio")})</span>
            </Label>
            <Input
              id="hr-convite-email"
              type="email"
              required
              aria-required="true"
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? "hr-convite-email-erro" : undefined}
              className={erro ? "border-destructive" : undefined}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTocado(true)}
            />
            {erro && (
              <p id="hr-convite-email-erro" className="text-xs text-destructive">
                {erro}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {mostrado ? (
            <>
              <Button ref={reenviarRef} variant="outline" onClick={enviar} disabled={enviando}>
                {enviando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {t("hr.convite.reenviar")}
              </Button>
              <Button onClick={fechar} disabled={enviando}>
                {t("common.close")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={fechar} disabled={enviando}>
                {t("employees.form.cancel")}
              </Button>
              <Button onClick={enviar} disabled={enviando}>
                {enviando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {t(modo === "reenviar" ? "hr.convite.reenviar" : "hr.convite.enviar")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
