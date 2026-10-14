/** O interruptor «pode fazer horas extra» de uma pessoa. Montado na aba Laborais da ficha. */
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { definirPodeHorasExtra, useFluxosC } from "./lojaFluxosC";

export function InterruptorHorasExtra({ pessoaId }: { pessoaId: string }) {
  const { t } = useTranslation();
  const pode = useFluxosC((e) => e.podeHE[pessoaId] === true);
  const alterar = (valor: boolean) => {
    definirPodeHorasExtra(pessoaId, valor);
    toast.success(t(valor ? "rhFluxosC.marca.ligada" : "rhFluxosC.marca.desligada"));
  };
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 pt-6">
        <div className="space-y-1">
          <Label htmlFor={`he-marca-${pessoaId}`} className="text-sm font-medium">{t("rhFluxosC.marca.titulo")}</Label>
          <p className="text-sm text-muted-foreground">{t("rhFluxosC.marca.ajuda")}</p>
          <p className="text-xs text-muted-foreground" aria-live="polite">{t(pode ? "rhFluxosC.marca.estadoSim" : "rhFluxosC.marca.estadoNao")}</p>
        </div>
        <Switch id={`he-marca-${pessoaId}`} checked={pode} onCheckedChange={alterar} className="mt-1 shrink-0" />
      </CardContent>
    </Card>
  );
}
