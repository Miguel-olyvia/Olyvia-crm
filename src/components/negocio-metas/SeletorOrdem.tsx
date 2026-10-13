import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { NativeSelect } from "@/components/ui/native-select";
import { FOCO } from "./estilos";
import { ORDENS_SELECT, ordemDoSelect, selectDaOrdem, type Ordem } from "./ordenacaoQuadro";

interface SeletorOrdemProps {
  ordem: Ordem | null;
  aoMudar: (ordem: Ordem | null) => void;
}

/** O select "Ordenar": a mesma ordem para o Quadro e para a Lista (os cabeçalhos da Lista mudam-na também). */
export function SeletorOrdem({ ordem, aoMudar }: SeletorOrdemProps) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">{t("businessGoals.sort.label")}</label>
      <NativeSelect
        id={id}
        value={selectDaOrdem(ordem)}
        onValueChange={(v) => aoMudar(ordemDoSelect(v))}
        options={ORDENS_SELECT.map((o) => ({ value: o, label: t(`businessGoals.sort.${o}`) }))}
        className={`h-11 w-44 ${FOCO}`}
      />
    </div>
  );
}
