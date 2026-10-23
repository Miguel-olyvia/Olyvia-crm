import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SheetClose, SheetFooter } from "@/components/ui/sheet";
import { FOCO } from "@/components/negocio-metas/estilos";

/** O rodapé fixo: Cancelar e UM só botão primário (sem ele, quando só se pode ver, o botão passa a Fechar). */
export function RodapeForm({ submeter, desativado }: { submeter: string | null; desativado?: boolean }) {
  const { t } = useTranslation();
  return (
    <SheetFooter className="shrink-0 gap-2 border-t border-border px-6 py-4 sm:space-x-0">
      <SheetClose asChild>
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)}>
          {t(submeter ? "usersProfiles.form.cancel" : "usersProfiles.form.closeButton")}
        </Button>
      </SheetClose>
      {submeter && <Button type="submit" disabled={desativado} className={cn("min-h-11", FOCO)}>{submeter}</Button>}
    </SheetFooter>
  );
}
