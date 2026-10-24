// A barra de progresso do assistente: «Passo 2 de 5» em texto e uma barra por passo (a atual e as feitas ficam cheias).
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { PASSOS } from "../lib/formulario";

export function ProgressoPassos({ passo, titulo }: { passo: number; titulo: string }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{t("cd.passo", { n: passo + 1, total: PASSOS })}</span> · {titulo}
      </p>
      <div role="progressbar" aria-valuemin={1} aria-valuemax={PASSOS} aria-valuenow={passo + 1} aria-label={t("cd.progresso")} className="flex gap-1">
        {Array.from({ length: PASSOS }, (_, i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= passo ? "bg-primary" : "bg-border")} />
        ))}
      </div>
    </div>
  );
}
