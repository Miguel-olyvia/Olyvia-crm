/**
 * O interruptor «pode fazer horas extra» de uma pessoa. Vive UMA vez, no grupo «Tempo de trabalho» da aba Contrato,
 * ao lado dos máximos de horas (que só ficam ativos com ele ligado) e da isenção de horário.
 */
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { definirPodeHorasExtra, useFluxosC } from "./lojaFluxosC";

export function usePodeHorasExtra(pessoaId: string | undefined): boolean {
  return useFluxosC((e) => (pessoaId ? e.podeHE[pessoaId] === true : false));
}

export function InterruptorHorasExtra({ pessoaId, disabled = false }: { pessoaId: string; disabled?: boolean }) {
  const { t } = useTranslation();
  const pode = usePodeHorasExtra(pessoaId);
  const alterar = (valor: boolean) => {
    definirPodeHorasExtra(pessoaId, valor);
    toast.success(t(valor ? "rhFluxosC.marca.ligada" : "rhFluxosC.marca.desligada"));
  };
  return (
    <div className="space-y-1 self-end pb-2 sm:col-span-2 xl:col-span-1">
      <div className="flex items-center gap-2">
        <Switch id={`he-marca-${pessoaId}`} aria-labelledby={`he-marca-rotulo-${pessoaId}`} checked={pode} disabled={disabled} onCheckedChange={alterar} />
        <Label id={`he-marca-rotulo-${pessoaId}`} htmlFor={`he-marca-${pessoaId}`} className="font-normal">{t("rhFluxosC.marca.titulo")}</Label>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">{t(pode ? "rhFluxosC.marca.estadoSim" : "rhFluxosC.marca.estadoNao")}</p>
    </div>
  );
}
