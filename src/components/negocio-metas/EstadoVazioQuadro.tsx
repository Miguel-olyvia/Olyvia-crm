import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";

interface EstadoVazioQuadroProps {
  /** "Os meus" está ligado: o vazio pode ser só por não haver negócios seus. */
  meus: boolean;
  comFiltros: boolean;
  aoVerTodos: () => void;
  aoLimpar: () => void;
}

/** Sem negócios a mostrar: diz porquê e dá a saída ("Ver todos" quando é "Os meus", "Limpar" quando há filtros). */
export function EstadoVazioQuadro({ meus, comFiltros, aoVerTodos, aoLimpar }: EstadoVazioQuadroProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
      <p className="text-sm text-foreground">{t(meus ? "businessGoals.emptyMine" : "businessGoals.empty")}</p>
      {meus && (
        <Button type="button" className="min-h-11" onClick={aoVerTodos}>
          {t("businessGoals.viewAll")}
        </Button>
      )}
      {comFiltros && (
        <Button type="button" variant="outline" className="min-h-11" onClick={aoLimpar}>
          {t("businessGoals.clear")}
        </Button>
      )}
    </div>
  );
}
