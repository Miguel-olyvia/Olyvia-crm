import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";

/** "Todos os negócios desta lead estão perdidos", com o botão "Marcar como perdida" (abre o painel de perder). */
export function AvisoNegociosPerdidos({ aoMarcar }: { aoMarcar: (origem: HTMLElement) => void }) {
  const { t } = useTranslation();
  return (
    <div className="mx-6 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-muted/60 p-3">
      <AlertCircle className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[15px] text-foreground">
        <strong className="font-semibold">{t("pessoasPagina.alert.allLost")}</strong> {t("pessoasPagina.alert.allLostHint")}
      </p>
      <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={(e) => aoMarcar(e.currentTarget)}>
        {t("pessoasPagina.bar.markLost")}
      </Button>
    </div>
  );
}
