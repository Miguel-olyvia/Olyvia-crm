/**
 * "Enviar convite de admissao": o gatilho, na ficha da pessoa, do fluxo sem
 * conta descrito no PLANO FECHADO (seccao 3). Atras de
 * `hr.pessoas.convite.enviar` -- quem monta este dialogo decide se o mostra.
 *
 * Pede so o e-mail de destino (a pessoa pode ja ter um em
 * `pessoas.email_pessoal`, mas o convite pode ir para outro -- por exemplo,
 * antes de a pessoa ter e-mail pessoal registado). Nao gera nem mostra o
 * token aqui: isso vive so na Edge Function.
 */
import { useState } from "react";
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
import { Loader2, Send } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useEnviarConviteAdmissao } from "@/hooks/useEnviarConviteAdmissao";
import { toast } from "@/lib/toast";

interface EnviarConviteDialogProps {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  pessoaId: string;
  emailSugerido: string | null;
}

export function EnviarConviteDialog({
  open,
  onOpenChange,
  pessoaId,
  emailSugerido,
}: EnviarConviteDialogProps) {
  const { t } = useTranslation();
  const { enviarConvite, enviando } = useEnviarConviteAdmissao();
  const [email, setEmail] = useState(emailSugerido ?? "");
  const [tocado, setTocado] = useState(false);

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
    toast.success(
      resultado.emailEnviado ? t("hr.convite.enviadoComSucesso") : t("hr.convite.criadoSemEmail"),
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            {t("hr.convite.tituloDialogo")}
          </DialogTitle>
          <DialogDescription>{t("hr.convite.descricaoDialogo")}</DialogDescription>
        </DialogHeader>

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

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={enviando}>
            {t("employees.form.cancel")}
          </Button>
          <Button onClick={enviar} disabled={enviando}>
            {enviando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t("hr.convite.enviar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
