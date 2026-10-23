// Passo 4: rever e enviar. Resumo, o aviso de que o texto livre pode identificar a pessoa e a declaração de boa-fé.
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/hooks/useTranslation";
import type { PassoProps } from "./PassoModo";

interface PassoReverProps extends PassoProps {
  onIrPara: (passo: number) => void;
}

interface LinhaResumoProps {
  rotulo: string;
  valor: string;
  passo: number;
  onIrPara: (passo: number) => void;
}

function LinhaResumo({ rotulo, valor, passo, onIrPara }: LinhaResumoProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{rotulo}</dt>
        <dd className="whitespace-pre-line break-words text-sm">{valor || t("cd.rever.vazio")}</dd>
      </div>
      <Button type="button" variant="ghost" size="sm" className="min-h-11 shrink-0" onClick={() => onIrPara(passo)}>
        {t("cd.rever.editar")}
        <span className="sr-only"> {rotulo}</span>
      </Button>
    </div>
  );
}

export function PassoRever({ dados, erros, onChange, onIrPara }: PassoReverProps) {
  const { t } = useTranslation();
  const modo = dados.anonima === false ? t("cd.origem.identificada") : t("cd.origem.anonima");
  const contacto = dados.anonima === false ? [dados.nome, dados.email, dados.telefone].filter(Boolean).join(" · ") : "";
  return (
    <div className="space-y-4">
      <dl className="divide-y rounded-lg border bg-card">
        <LinhaResumo rotulo={t("cd.rever.modo")} valor={contacto ? `${modo} — ${contacto}` : modo} passo={0} onIrPara={onIrPara} />
        <LinhaResumo rotulo={t("cd.campo.tipo")} valor={dados.tipo ? t(`cd.tipo.${dados.tipo}`) : ""} passo={1} onIrPara={onIrPara} />
        <LinhaResumo rotulo={t("cd.campo.descricao")} valor={dados.descricao.trim()} passo={1} onIrPara={onIrPara} />
        <LinhaResumo rotulo={t("cd.campo.quando")} valor={`${dados.quando.trim()} (${t(`cd.resposta.${dados.aindaAcontece}`)})`} passo={1} onIrPara={onIrPara} />
        <LinhaResumo rotulo={t("cd.campo.onde")} valor={dados.onde.trim()} passo={1} onIrPara={onIrPara} />
        <LinhaResumo rotulo={t("cd.campo.envolvidos")} valor={dados.envolvidos.trim()} passo={2} onIrPara={onIrPara} />
        <LinhaResumo rotulo={t("cd.rever.provas")} valor={dados.anexos.map((a) => a.nome).join(", ")} passo={3} onIrPara={onIrPara} />
      </dl>
      <div role="note" className="flex items-start gap-2 rounded-lg border border-border bg-muted p-3 text-sm">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{t("cd.rever.aviso")}</p>
      </div>
      <div className="space-y-1.5">
        <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm">
          <Checkbox
            className="mt-1"
            checked={dados.boaFe}
            aria-describedby={erros.boaFe ? "den-boafe-erro" : undefined}
            aria-invalid={erros.boaFe ? true : undefined}
            onCheckedChange={(v) => onChange({ boaFe: v === true })}
          />
          {t("cd.rever.boaFe")}
        </label>
        {erros.boaFe && <p id="den-boafe-erro" className="text-sm text-destructive">{t(erros.boaFe)}</p>}
      </div>
    </div>
  );
}
