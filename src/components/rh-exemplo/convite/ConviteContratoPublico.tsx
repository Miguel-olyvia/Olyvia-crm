// O contrato, na página pública (o mesmo login temporário): a pessoa lê, e ASSINA (confirma o nome completo e aceita) ou
// RECUSA assinar com um motivo; o RH decide então reenviar ou anular. Depois de assinado o contrato é imutável. Só memória.
import { useState } from "react";
import { FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { assinarPeloLink, recusarContratoPeloLink } from "@/components/rh-exemplo/dados/accoesAdmissao";
import { MIN_MOTIVO, type Admissao } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { useTranslation } from "@/hooks/useTranslation";
import { ConviteFaixaPrazo } from "./ConviteFaixaPrazo";

interface ConviteContratoPublicoProps {
  token: string | undefined;
  admissao: Admissao;
  nome: string | null;
}

function Recusa({ token }: { token: string | undefined }) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const enviar = () => {
    if (motivo.trim().length < MIN_MOTIVO) return setErro(t("rhAdm.erro.motivoCurto", { n: MIN_MOTIVO }));
    const r = recusarContratoPeloLink(token, motivo);
    if (!r.ok) setErro(t(`rhAdm.erro.${r.erro}`));
  };
  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label htmlFor="convite-recusa-motivo">{t("rhAdm.pub.contrato.recusaMotivo")}</Label>
      <Textarea id="convite-recusa-motivo" value={motivo} onChange={(e) => { setMotivo(e.target.value); setErro(null); }} aria-invalid={erro ? true : undefined} />
      {erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}
      <Button type="button" variant="outline" className="min-h-11" onClick={enviar}>{t("rhAdm.pub.contrato.recusaEnviar")}</Button>
    </div>
  );
}

function Assinatura({ token }: { token: string | undefined }) {
  const { t } = useTranslation();
  const [nome, setNome] = useState("");
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recusando, setRecusando] = useState(false);
  const assinar = () => {
    const r = assinarPeloLink(token, nome, aceite);
    if (!r.ok) setErro(t(`rhAdm.erro.${r.erro}`));
  };
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="convite-assinatura-nome">{t("rhAdm.pub.contrato.nomeCompleto")}</Label>
        <Input
          id="convite-assinatura-nome" className="h-11" value={nome} autoComplete="name"
          onChange={(e) => { setNome(e.target.value); setErro(null); }} aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? "convite-assinatura-erro" : undefined}
        />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={aceite} onChange={(e) => { setAceite(e.target.checked); setErro(null); }} />
        {t("rhAdm.pub.contrato.aceito")}
      </label>
      {erro && <p id="convite-assinatura-erro" role="alert" className="text-sm text-destructive">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" onClick={assinar}>{t("rhAdm.pub.contrato.assinar")}</Button>
        <Button type="button" variant="outline" className="min-h-11" aria-expanded={recusando} onClick={() => setRecusando((r) => !r)}>
          {t("rhAdm.pub.contrato.recusar")}
        </Button>
      </div>
      {recusando && <Recusa token={token} />}
    </div>
  );
}

export function ConviteContratoPublico({ token, admissao, nome }: ConviteContratoPublicoProps) {
  const { t } = useTranslation();
  const contrato = admissao.contrato;
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 py-10">
      <ConviteFaixaPrazo admissao={admissao} />
      <Card>
        <CardHeader>
          <h1 className="flex items-center gap-2 text-2xl font-semibold leading-none tracking-tight">
            <FileSignature className="h-6 w-6 text-primary" aria-hidden="true" />
            {t("rhAdm.pub.contrato.titulo")}
          </h1>
          {nome && <CardDescription>{t("hr.convite.saudacao", { nome })}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">
          <article aria-label={contrato?.titulo ?? t("rhAdm.pub.contrato.titulo")} className="space-y-2 rounded-md border bg-muted/30 p-4 text-sm">
            <h2 className="text-base font-semibold">{contrato?.titulo}</h2>
            {contrato?.linhas.map((linha) => <p key={linha}>{linha}</p>)}
          </article>
          {contrato?.recusa ? (
            <p role="status" className="text-sm">{t("rhAdm.pub.contrato.recusado", { motivo: contrato.recusa.motivo })}</p>
          ) : (
            <Assinatura token={token} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
