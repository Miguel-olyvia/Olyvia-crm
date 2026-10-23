// «Enviar credenciais»: só com o contrato assinado. O RH confirma o e-mail de acesso e o ROLE (o previsto vem escolhido; a pessoa
// nunca escolhe) e vê a pré-visualização do e-mail com utilizador e palavra-passe temporária (simulada). Nenhum e-mail sai.
import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { enviarCredenciais } from "@/components/rh-exemplo/dados/accoesAdmissao";
import { useFichaRh } from "@/components/rh-exemplo/dados/loja";
import { useAdmissao } from "@/components/rh-exemplo/dados/lojaAdmissao";
import { usePapeisDaOrganizacao } from "@/components/rh-exemplo/hooks/usePapeisDaOrganizacao";
import { useTranslation } from "@/hooks/useTranslation";
import { palavraPasseSimulada } from "./auxiliares";

interface EnviarCredenciaisDialogProps {
  pessoaId: string | null;
  aoFechar: () => void;
  aoEnviado: (pessoaId: string) => void;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function PreVisualizacaoEmail({ pessoaId, email }: { pessoaId: string | null; email: string }) {
  const { t } = useTranslation();
  const destino = email.trim() || "—";
  return (
    <section aria-labelledby="rh-adm-cred-preview" className="space-y-2 rounded-md border bg-muted/30 p-4 text-sm">
      <h3 id="rh-adm-cred-preview" className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Mail className="h-3.5 w-3.5" aria-hidden="true" />{t("rhAdm.credenciais.preVisualizacao")}
      </h3>
      <p><span className="text-muted-foreground">{t("rhAdm.credenciais.para")}:</span> {destino}</p>
      <p className="font-medium">{t("rhAdm.credenciais.assunto")}</p>
      <p><span className="text-muted-foreground">{t("rhAdm.credenciais.utilizador")}:</span> {destino}</p>
      <p><span className="text-muted-foreground">{t("rhAdm.credenciais.palavraPasse")}:</span> <code>{pessoaId ? palavraPasseSimulada(pessoaId) : ""}</code></p>
      <p className="text-xs">{t("rhAdm.credenciais.mudarNoPrimeiroAcesso")}</p>
    </section>
  );
}

interface CampoRoleProps {
  roleId: string;
  aoMudar: (roleId: string) => void;
  previsto: string;
  emFalta: boolean;
}

function CampoRole({ roleId, aoMudar, previsto, emFalta }: CampoRoleProps) {
  const { t } = useTranslation();
  const { papeis } = usePapeisDaOrganizacao();
  return (
    <div className="space-y-1.5">
      <Label htmlFor="rh-adm-cred-role">{t("hr.acesso.papel")}</Label>
      <NativeSelect
        id="rh-adm-cred-role" className="h-11" value={roleId} onValueChange={aoMudar} placeholder={t("hr.acesso.papelPlaceholder")}
        options={papeis.map((p) => ({ value: p.id, label: p.name }))} aria-describedby="rh-adm-cred-role-ajuda"
      />
      <p id="rh-adm-cred-role-ajuda" className="text-xs text-muted-foreground">{t("rhAdm.credenciais.roleAjuda", { previsto })}</p>
      {emFalta && <p role="alert" className="text-xs text-destructive">{t("hr.acesso.erroPapelObrigatorio")}</p>}
    </div>
  );
}

function CampoEmail({ email, aoMudar, invalido }: { email: string; aoMudar: (e: string) => void; invalido: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Label htmlFor="rh-adm-cred-email">{t("rhAdm.credenciais.email")}</Label>
      <Input
        id="rh-adm-cred-email" type="email" className="h-11" value={email} onChange={(e) => aoMudar(e.target.value)}
        aria-invalid={invalido ? true : undefined} aria-describedby={invalido ? "rh-adm-cred-email-erro" : undefined}
      />
      {invalido && <p id="rh-adm-cred-email-erro" role="alert" className="text-xs text-destructive">{t("hr.convite.erroEmailInvalido")}</p>}
    </div>
  );
}

/** O estado do formulário: abre com o e-mail da ficha e o role previsto, valida e envia. */
function useFormularioCredenciais(pessoaId: string | null, aoEnviado: (pessoaId: string) => void) {
  const { t } = useTranslation();
  const ficha = useFichaRh(pessoaId);
  const adm = useAdmissao(pessoaId);
  const { papeis } = usePapeisDaOrganizacao();
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [tentou, setTentou] = useState(false);
  const [erroServidor, setErroServidor] = useState<string | null>(null);

  useEffect(() => {
    if (pessoaId === null) return;
    setEmail(ficha?.pessoa.email_trabalho ?? ficha?.pessoa.email_pessoal ?? "");
    setRoleId(adm?.roleId ?? "");
    setTentou(false);
    setErroServidor(null);
    // Só ao abrir para uma pessoa: o que o RH escreve a seguir não se repõe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoaId]);

  const enviar = () => {
    setTentou(true);
    if (!pessoaId || !EMAIL.test(email.trim()) || roleId === "") return;
    const r = enviarCredenciais(pessoaId, { email, roleId });
    if (r.ok) aoEnviado(pessoaId);
    else setErroServidor(t(`rhAdm.erro.${r.erro}`));
  };

  return {
    ficha, email, setEmail, roleId, setRoleId, erroServidor, enviar,
    assinado: Boolean(adm?.contrato?.assinadoEm) && adm?.estado === "contrato_assinado",
    previsto: papeis.find((p) => p.id === adm?.roleId)?.name ?? t("rhAdm.credenciais.semRole"),
    emailInvalido: tentou && !EMAIL.test(email.trim()),
    roleEmFalta: tentou && roleId === "",
  };
}

export function EnviarCredenciaisDialog({ pessoaId, aoFechar, aoEnviado }: EnviarCredenciaisDialogProps) {
  const { t } = useTranslation();
  const f = useFormularioCredenciais(pessoaId, aoEnviado);
  const { ficha, email, roleId, assinado } = f;

  return (
    <Dialog open={pessoaId !== null} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("rhAdm.credenciais.titulo", { nome: ficha?.pessoa.nome_completo ?? "" })}</DialogTitle>
          <DialogDescription>{t("rhAdm.credenciais.descricao")}</DialogDescription>
        </DialogHeader>
        {!assinado && (
          <Alert variant="destructive"><AlertDescription>{t("rhAdm.credenciais.semContrato")}</AlertDescription></Alert>
        )}
        <CampoEmail email={email} aoMudar={f.setEmail} invalido={f.emailInvalido} />
        <CampoRole roleId={roleId} aoMudar={f.setRoleId} previsto={f.previsto} emFalta={f.roleEmFalta} />
        <PreVisualizacaoEmail pessoaId={pessoaId} email={email} />
        <p className="text-xs text-muted-foreground">{t("rhAdm.simulacao.email")}</p>
        {f.erroServidor && <p role="alert" className="text-sm text-destructive">{f.erroServidor}</p>}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" className="min-h-11" onClick={aoFechar}>{t("employees.form.cancel")}</Button>
          <Button type="button" className="min-h-11" disabled={!assinado} onClick={f.enviar}>{t("rhAdm.acao.enviarCredenciais")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
