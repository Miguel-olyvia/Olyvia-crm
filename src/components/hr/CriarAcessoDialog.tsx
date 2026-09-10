/**
 * "Criar acesso" / "Reenviar credenciais" -- o gatilho, na ficha da pessoa,
 * do fluxo COM credenciais descrito no PLANO FECHADO (seccao 5-7). Atras de
 * `hr.pessoas.conta.criar` -- quem monta este dialogo decide se o mostra.
 *
 * Ao CRIAR, o papel de acesso e escolhido aqui -- nunca adivinhado -- com o
 * mesmo selector do assistente de criacao de pessoa
 * (`usePapeisDaOrganizacao`). Ao REENVIAR, a pessoa ja tem conta ligada e
 * papel atribuido: nao ha nada a escolher, so a confirmacao.
 *
 * A password nunca aparece aqui: a Edge Function nunca a devolve (ver
 * `useCriarAcessoPessoa`).
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KeyRound, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useCriarAcessoPessoa } from "@/hooks/useCriarAcessoPessoa";
import { usePapeisDaOrganizacao } from "@/hooks/usePapeisDaOrganizacao";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface CriarAcessoDialogProps {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  pessoaId: string;
  modo: "criar" | "reenviar";
  onCriado?: () => void;
}

export function CriarAcessoDialog({
  open,
  onOpenChange,
  pessoaId,
  modo,
  onCriado,
}: CriarAcessoDialogProps) {
  const { t } = useTranslation();
  const { criarAcesso, processando } = useCriarAcessoPessoa();
  const { papeis, loading: papeisLoading } = usePapeisDaOrganizacao();
  const [roleId, setRoleId] = useState("");
  const [tocado, setTocado] = useState(false);

  const precisaDePapel = modo === "criar";
  const podeConfirmar = !precisaDePapel || roleId !== "";
  const erroPapel =
    tocado && precisaDePapel && roleId === "" ? t("hr.acesso.erroPapelObrigatorio") : null;

  const confirmar = async () => {
    setTocado(true);
    if (!podeConfirmar) return;
    const resultado = await criarAcesso(pessoaId, roleId, {
      forcarNovaPassword: modo === "reenviar",
    });
    if (!resultado.ok) {
      toast.error(resultado.erro ?? t("hr.acesso.erroCriar"));
      return;
    }
    if (resultado.aviso === "conta_criada_sem_email") {
      toast.warning(t("hr.acesso.criadaSemEmail"));
    } else {
      toast.success(
        resultado.emailEnviado ? t("hr.acesso.enviadoComSucesso") : t("hr.acesso.criadoSemEmail"),
      );
    }
    onOpenChange(false);
    onCriado?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            {t(modo === "criar" ? "hr.acesso.tituloDialogoCriar" : "hr.acesso.tituloDialogoReenviar")}
          </DialogTitle>
          <DialogDescription>
            {t(
              modo === "criar"
                ? "hr.acesso.descricaoDialogoCriar"
                : "hr.acesso.descricaoDialogoReenviar",
            )}
          </DialogDescription>
        </DialogHeader>

        {precisaDePapel && (
          <div className="space-y-1.5">
            <Label htmlFor="hr-acesso-papel">
              {t("hr.acesso.papel")}
              <span aria-hidden="true" className="ml-0.5 text-destructive">
                *
              </span>
              <span className="sr-only"> ({t("hr.campos.obrigatorio")})</span>
            </Label>
            <Select value={roleId} onValueChange={setRoleId} disabled={papeisLoading}>
              <SelectTrigger
                id="hr-acesso-papel"
                aria-required="true"
                aria-invalid={erroPapel ? true : undefined}
                aria-describedby={erroPapel ? "hr-acesso-papel-erro" : undefined}
                className={cn(erroPapel && "border-destructive")}
                onBlur={() => setTocado(true)}
              >
                <SelectValue placeholder={t("hr.acesso.papelPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {papeis.map((papel) => (
                  <SelectItem key={papel.id} value={papel.id}>
                    {papel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {erroPapel && (
              <p id="hr-acesso-papel-erro" className="text-xs text-destructive">
                {erroPapel}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={processando}>
            {t("employees.form.cancel")}
          </Button>
          <Button onClick={confirmar} disabled={processando}>
            {processando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t(modo === "criar" ? "hr.acesso.criar" : "hr.acesso.reenviar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
