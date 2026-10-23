/**
 * O seletor do mês do custo («AAAA-MM») com o botão «Hoje». O mês vive no store do custo, por isso a aba Custo da ficha e o
 * módulo «Custos» mostram sempre o mesmo mês.
 */
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { definirMesCusto, useCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

export function SeletorMesCusto({ id, rotulo }: { id: string; rotulo?: string }) {
  const { t } = useTranslation();
  const mes = useCusto((e) => e.mes);
  const hoje = hojeIso().slice(0, 7);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-48">
        <Label htmlFor={id} className="mb-1.5 block">{rotulo ?? t("rhCustos.mes")}</Label>
        <input
          id={id} type="month" value={mes} onChange={(e) => definirMesCusto(e.target.value)}
          className={cn("h-11 w-full rounded-md border border-input bg-background px-3 text-sm", FOCO)}
        />
      </div>
      <Button type="button" variant="outline" disabled={mes === hoje} onClick={() => definirMesCusto(hoje)} className={cn("min-h-11", FOCO)}>
        {t("rhCustos.hoje")}
      </Button>
    </div>
  );
}
