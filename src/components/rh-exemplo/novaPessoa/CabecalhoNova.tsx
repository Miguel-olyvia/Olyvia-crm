// O cabeçalho do painel "Nova pessoa": migalhas "Recursos Humanos › Nova pessoa", título, selo "Novo · por gravar" e Fechar.
import { ChevronRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetClose, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

export function CabecalhoNova() {
  const { t } = useTranslation();
  return (
    <SheetHeader className="space-y-2 border-b border-border p-6 text-left">
      <div className="flex items-start justify-between gap-3">
        <nav aria-label={t("rhForm.nova.crumbs")}>
          <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <li>{t("rhForm.nova.area")}</li>
            <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
            <li aria-current="page" className="font-medium text-foreground">{t("rhForm.nova.title")}</li>
          </ol>
        </nav>
        <SheetClose asChild>
          <Button type="button" variant="ghost" size="icon" aria-label={t("rhForm.nova.close")} className={cn("-mr-2 -mt-2 h-11 w-11", FOCO)}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </SheetClose>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SheetTitle className="text-lg">{t("rhForm.nova.title")}</SheetTitle>
        <span className="inline-flex items-center gap-1 rounded-sm border border-primary px-1.5 py-0.5 text-xs font-semibold text-primary dark:text-violet-300">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {t("rhForm.nova.badge")}
        </span>
      </div>
      <SheetDescription>{t("rhNova.description")}</SheetDescription>
      <p className="text-xs text-muted-foreground">{t("rhForm.nova.example")}</p>
    </SheetHeader>
  );
}
