// A faixa de progresso das fases do negócio aberto: um segmento por fase (só visual) e, por texto, «Fase X de N · depois: Y».
// Deriva da mesma lista da ficha (`fasesDoNegocio`), por isso N varia com o negócio. Um negócio ganho não tem fase atual: só mostra a faixa.
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { EstadoFase, FaseVista } from "./fasesDoNegocio";

const COR_SEGMENTO: Record<EstadoFase, string> = {
  feita: "bg-emerald-600 dark:bg-emerald-400",
  atual: "bg-primary dark:bg-violet-300",
  porFazer: "bg-muted",
  perdida: "bg-destructive",
};

export function FaixaFasesNegocio({ fases }: { fases: readonly FaseVista[] }) {
  const { t } = useTranslation();
  if (fases.length === 0) return null;
  const indice = fases.findIndex((f) => f.estado === "atual" || f.estado === "perdida");
  const seguinte = indice >= 0 && fases[indice].estado === "atual" && fases[indice + 1]?.estado === "porFazer" ? fases[indice + 1] : undefined;
  const params = { current: indice + 1, total: fases.length };
  return (
    <div className="space-y-1.5">
      <div aria-hidden="true" className="flex gap-1">
        {fases.map((f) => <div key={f.id} className={cn("h-1.5 flex-1 rounded-full", COR_SEGMENTO[f.estado])} />)}
      </div>
      {indice >= 0 && (
        <p className="text-sm text-muted-foreground">
          {seguinte
            ? t("pessoasPagina.phases.progressNext", { ...params, next: t(`pessoasPagina.phases.${seguinte.id}`) })
            : t("pessoasPagina.phases.progress", params)}
        </p>
      )}
    </div>
  );
}
