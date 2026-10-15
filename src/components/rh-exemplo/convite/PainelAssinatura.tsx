// O painel de assinar (ou recusar assinar) um documento, na página pública do link: a pessoa confirma o nome completo e aceita,
// ou recusa com um motivo. Serve ao contrato (que usa a lógica de `accoesAdmissao`) e aos outros documentos que o RH envia
// para assinar (lógica de `accoesPortalDocumentos`). Só memória.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MIN_MOTIVO } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { chaveErroPortal, type ErroPortal } from "@/components/rh-exemplo/lib/portalDocumentos";
import { useTranslation } from "@/hooks/useTranslation";

export interface RespostaPainel {
  ok: boolean;
  erro?: ErroPortal;
}

interface PainelAssinaturaProps {
  /** Distingue os ids quando há vários painéis na mesma página. */
  idBase: string;
  assinar: (nome: string, aceite: boolean) => RespostaPainel;
  recusar: (motivo: string) => RespostaPainel;
  /** O texto do aceite: «Li o contrato e aceito.» ou «Li o documento e aceito.». */
  chaveAceite?: string;
}

function Recusa({ idBase, recusar }: Pick<PainelAssinaturaProps, "idBase" | "recusar">) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const enviar = () => {
    if (motivo.trim().length < MIN_MOTIVO) return setErro(t("rhAdm.erro.motivoCurto", { n: MIN_MOTIVO }));
    const r = recusar(motivo);
    if (!r.ok && r.erro) setErro(t(chaveErroPortal(r.erro)));
  };
  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label htmlFor={`${idBase}-recusa-motivo`}>{t("rhAdm.pub.contrato.recusaMotivo")}</Label>
      <Textarea
        id={`${idBase}-recusa-motivo`} value={motivo} aria-invalid={erro ? true : undefined}
        onChange={(e) => { setMotivo(e.target.value); setErro(null); }}
      />
      {erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}
      <Button type="button" variant="outline" className="min-h-11" onClick={enviar}>{t("rhAdm.pub.contrato.recusaEnviar")}</Button>
    </div>
  );
}

export function PainelAssinatura({ idBase, assinar, recusar, chaveAceite = "rhAdm.pub.contrato.aceito" }: PainelAssinaturaProps) {
  const { t } = useTranslation();
  const [nome, setNome] = useState("");
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recusando, setRecusando] = useState(false);
  const aoAssinar = () => {
    const r = assinar(nome, aceite);
    if (!r.ok && r.erro) setErro(t(chaveErroPortal(r.erro)));
  };
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${idBase}-nome`}>{t("rhAdm.pub.contrato.nomeCompleto")}</Label>
        <Input
          id={`${idBase}-nome`} className="h-11" value={nome} autoComplete="name" aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${idBase}-erro` : undefined} onChange={(e) => { setNome(e.target.value); setErro(null); }}
        />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={aceite} onChange={(e) => { setAceite(e.target.checked); setErro(null); }} />
        {t(chaveAceite)}
      </label>
      {erro && <p id={`${idBase}-erro`} role="alert" className="text-sm text-destructive">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" onClick={aoAssinar}>{t("rhAdm.pub.contrato.assinar")}</Button>
        <Button type="button" variant="outline" className="min-h-11" aria-expanded={recusando} onClick={() => setRecusando((r) => !r)}>
          {t("rhAdm.pub.contrato.recusar")}
        </Button>
      </div>
      {recusando && <Recusa idBase={idBase} recusar={recusar} />}
    </div>
  );
}
