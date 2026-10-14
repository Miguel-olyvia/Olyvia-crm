import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LIMITE_NOTA_CHAMADA } from "./opcoesPessoa";

/** A partir de quantos caracteres a nota avisa que está perto do limite. */
const MARGEM_AVISO_NOTA = 10;

/** A nota da chamada com o contador "N de 140 caracteres"; o aviso do limite só aparece perto dele. */
export function NotaChamada({ nota, aoMudar }: { nota: string; aoMudar: (n: string) => void }) {
  const { t } = useTranslation();
  const idCampo = useId();
  const idContagem = useId();
  const pertoDoLimite = nota.length >= LIMITE_NOTA_CHAMADA - MARGEM_AVISO_NOTA;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={idCampo} className="text-sm font-semibold">{t("pessoasPagina.panel.callNote")}</Label>
      <Textarea
        id={idCampo} value={nota} maxLength={LIMITE_NOTA_CHAMADA} rows={2} className="min-h-0"
        aria-describedby={idContagem} onChange={(e) => aoMudar(e.target.value)}
      />
      <p id={idContagem} className="text-right text-xs tabular-nums text-muted-foreground">
        {t("pessoasPagina.panel.noteCount", { count: nota.length, max: LIMITE_NOTA_CHAMADA })}
      </p>
      <span role="status" className="sr-only">{pertoDoLimite ? t("pessoasPagina.panel.noteLimit", { max: LIMITE_NOTA_CHAMADA }) : ""}</span>
    </div>
  );
}
