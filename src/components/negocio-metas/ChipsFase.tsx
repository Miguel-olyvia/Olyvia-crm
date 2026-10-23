import { BellRing, Check } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { chip } from "./estilos";
import { formatarMilhares } from "./formatoMetas";
import type { ChipFase, ChipParaTratar } from "./logicaQuadro";
import type { FaseNegocio } from "./negocioMetas";

interface ChipsFaseProps {
  fases: ChipFase[];
  paraTratar: ChipParaTratar;
  aoAlternarFase: (fase: FaseNegocio) => void;
  aoAlternarParaTratar: () => void;
}

/**
 * Um chip por fase, com a contagem e o valor ("Proposta 4 · 62 k€"), mais "Para
 * tratar". Os chips de fase somam-se (OU); o ligado ganha uma marca (✓) além da cor.
 * Rolam na horizontal no telemóvel.
 */
export function ChipsFase({ fases, paraTratar, aoAlternarFase, aoAlternarParaTratar }: ChipsFaseProps) {
  const { t } = useTranslation();
  return (
    <div
      role="group" aria-label={t("businessGoals.quick.label")}
      className="-mx-4 -my-1.5 flex gap-2 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      {fases.map((c) => (
        <button
          key={c.fase} type="button" aria-pressed={c.ativo} className={chip(c.ativo)}
          aria-label={t(c.n === 1 ? "businessGoals.chip.phaseLabelOne" : "businessGoals.chip.phaseLabel", {
            phase: t(`businessGoals.phase.${c.fase}`), count: c.n, value: t("businessGoals.units.thousandsLong", { value: formatarMilhares(c.valor) }),
          })}
          onClick={() => aoAlternarFase(c.fase)}
        >
          {c.ativo && <Check className="h-4 w-4" aria-hidden="true" />}
          <span className="tabular-nums">
            {t("businessGoals.chip.phase", {
              phase: t(`businessGoals.phase.${c.fase}`), count: c.n, value: t("businessGoals.units.thousands", { value: formatarMilhares(c.valor) }),
            })}
          </span>
        </button>
      ))}
      <button type="button" aria-pressed={paraTratar.ativo} className={chip(paraTratar.ativo)} onClick={aoAlternarParaTratar}>
        {paraTratar.ativo ? <Check className="h-4 w-4" aria-hidden="true" /> : <BellRing className="h-4 w-4" aria-hidden="true" />}
        {t("businessGoals.chip.toTreat")}{" "}
        <span className="tabular-nums">{paraTratar.n}</span>
      </button>
    </div>
  );
}
