import { useTranslation } from "@/hooks/useTranslation";
import { CARTAO } from "./estilosDashboard";
import { formatarMeta } from "./formatoMetas";
import { percentagem } from "./negocioMetas";
import { cn } from "@/lib/utils";

interface TooltipEvolucaoProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: { nome: string; ganho: number; meta: number } }>;
}

/** Conteúdo do tooltip do gráfico: valor ganho, meta e % da meta do mês sob o cursor. */
export function TooltipEvolucao({ active, payload }: TooltipEvolucaoProps) {
  const { t } = useTranslation();
  const linha = payload?.[0]?.payload;
  if (!active || !linha) return null;
  return (
    <div role="tooltip" className={cn(CARTAO, "px-3 py-2 text-sm text-foreground shadow-md")}>
      <p className="font-medium capitalize">{linha.nome}</p>
      <p className="text-muted-foreground">
        {t("businessGoals.evolution.won")}:{" "}
        <span className="font-mono tabular-nums text-foreground">{formatarMeta("euro", linha.ganho)}</span>
      </p>
      <p className="text-muted-foreground">
        {t("businessGoals.evolution.goal")}:{" "}
        <span className="font-mono tabular-nums text-foreground">{formatarMeta("euro", linha.meta)}</span>
      </p>
      <p className="font-mono font-semibold tabular-nums">
        {t("businessGoals.evolution.ofGoal", { percent: percentagem(linha.ganho, linha.meta) })}
      </p>
    </div>
  );
}
