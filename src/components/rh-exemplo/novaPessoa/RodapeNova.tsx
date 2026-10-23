// O rodapé fixo do painel "Nova pessoa": o aviso dos erros que faltam corrigir, "Cancelar", "Criar e enviar convite"
// (secundária: a pessoa preenche o resto; o link vale 7 dias) e "Criar pessoa" (o único botão primário).
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { DIAS_DO_CONVITE } from "@/components/rh-exemplo/dados/fichaNovaPessoa";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface RodapeNovaProps {
  erros: number;
  aoCancelar: () => void;
  aoCriarEConvidar: () => void;
}

export function RodapeNova({ erros, aoCancelar, aoCriarEConvidar }: RodapeNovaProps) {
  const { t } = useTranslation();
  return (
    <footer className="space-y-2 border-t border-border p-4 px-6">
      <p role="status" className="min-h-5 text-sm text-destructive">
        {erros === 0 ? "" : t(erros === 1 ? "rhNova.erros.um" : "rhNova.erros.varios", { n: erros })}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="ghost" onClick={aoCancelar} className={cn("min-h-11", FOCO)}>
          {t("rhForm.nova.cancel")}
        </Button>
        <Button
          type="button" variant="outline" onClick={aoCriarEConvidar} aria-describedby="rh-nova-convite-nota"
          className={cn("min-h-11", FOCO)}
        >
          {t("rhNova.criarEConvidar")}
        </Button>
        <Button type="submit" className={cn("min-h-11", FOCO)}>{t("rhForm.nova.create")}</Button>
      </div>
      <p id="rh-nova-convite-nota" className="text-right text-xs text-muted-foreground">
        {t("rhNova.convite.nota", { dias: DIAS_DO_CONVITE })}
      </p>
    </footer>
  );
}
