import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";

interface AcoesModuloProps {
  modulo: string;
  aoMarcar: () => void;
  aoLimpar: () => void;
}

/** "Marcar tudo" e "Limpar" de um módulo, dois botões à parte (nunca dentro do cabeçalho do módulo, que já é um botão). */
export function AcoesModulo({ modulo, aoMarcar, aoLimpar }: AcoesModuloProps) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={modulo} className="mb-2 flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" className={cn("min-h-11", FOCO)} aria-label={t("usersProfiles.form.matrix.markAllLabel", { module: modulo })} onClick={aoMarcar}>
        {t("usersProfiles.form.matrix.markAll")}
      </Button>
      <Button type="button" variant="outline" size="sm" className={cn("min-h-11", FOCO)} aria-label={t("usersProfiles.form.matrix.clearLabel", { module: modulo })} onClick={aoLimpar}>
        {t("usersProfiles.form.matrix.clear")}
      </Button>
    </div>
  );
}
