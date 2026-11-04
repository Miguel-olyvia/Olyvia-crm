import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";

interface AcoesModuloProps {
  modulo: string;
  aoMarcar: () => void;
  aoLimpar: () => void;
}

/** "Tudo" e "Limpar" de um módulo, dois botões à parte, ao lado do cabeçalho do módulo (nunca dentro dele, que já é um botão). */
export function AcoesModulo({ modulo, aoMarcar, aoLimpar }: AcoesModuloProps) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={modulo} className="flex shrink-0 gap-1.5">
      <Button type="button" variant="outline" size="sm" className={cn("h-9 px-3 text-xs", FOCO)} aria-label={t("usersProfiles.form.matrix.markAllLabel", { module: modulo })} onClick={aoMarcar}>
        {t("usersProfiles.form.matrix.grid.all")}
      </Button>
      <Button type="button" variant="outline" size="sm" className={cn("h-9 px-3 text-xs", FOCO)} aria-label={t("usersProfiles.form.matrix.clearLabel", { module: modulo })} onClick={aoLimpar}>
        {t("usersProfiles.form.matrix.grid.clear")}
      </Button>
    </div>
  );
}
