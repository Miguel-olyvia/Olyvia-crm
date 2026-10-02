import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import {
  LIMITES_FICHA_TECNICA,
  type ErrosFichaTecnica,
  type FichaTecnicaValores,
} from "@/lib/addresses/fichaTecnicaEdificio";

interface FichaTecnicaCamposProps {
  valor: FichaTecnicaValores;
  onChange: (valor: FichaTecnicaValores) => void;
  erros?: ErrosFichaTecnica;
  idPrefix: string;
  disabled?: boolean;
  /** Aberta ao início (por omissão só se já tiver dados ou erros). */
  defaultOpen?: boolean;
}

// Valor do rádio para "não indicado" (o Radix não aceita value="").
const NAO_INDICADO = "nd";

/**
 * Secção colapsável "Ficha técnica do edifício" da morada de entrega.
 * Controlada (o pai guarda o valor e os erros — ver validarFichaTecnica).
 * O piso não está aqui: é o campo "Andar" da morada.
 */
export const FichaTecnicaCampos = ({ valor, onChange, erros, idPrefix, disabled, defaultOpen }: FichaTecnicaCamposProps) => {
  const { t } = useTranslation();
  const temErros = !!erros && Object.keys(erros).length > 0;
  const [aberta, setAberta] = useState<boolean>(defaultOpen ?? false);
  const open = aberta || temErros;

  const set = <K extends keyof FichaTecnicaValores>(campo: K, v: FichaTecnicaValores[K]) => {
    const next: FichaTecnicaValores = { ...valor, [campo]: v };
    // Coerência: tirar o que deixa de fazer sentido.
    if (campo === "acesso" && v !== "dificil") next.impacto_percent = "";
    if (campo === "tem_elevador" && v === false) next.n_elevadores = "";
    if (campo === "estacionamento" && (v === "" || v === "sem_estacionamento")) next.zona_estacionamento = "";
    onChange(next);
  };

  const erro = (campo: keyof ErrosFichaTecnica) =>
    erros?.[campo] ? <p id={`${idPrefix}_${campo}_erro`} className="text-xs text-destructive">{erros[campo]}</p> : null;

  const radios = <K extends "acesso" | "estacionamento" | "zona_estacionamento">(
    campo: K,
    label: string,
    opcoes: { value: Exclude<FichaTecnicaValores[K], "">; label: string }[],
  ) => (
    <div className="space-y-1">
      <Label className="text-xs" id={`${idPrefix}_${campo}_label`}>{label}</Label>
      <RadioGroup
        aria-labelledby={`${idPrefix}_${campo}_label`}
        aria-invalid={!!erros?.[campo]}
        className="flex flex-wrap gap-x-4 gap-y-1"
        value={valor[campo] || NAO_INDICADO}
        onValueChange={(v) => set(campo, (v === NAO_INDICADO ? "" : v) as FichaTecnicaValores[K])}
        disabled={disabled}
      >
        {[{ value: NAO_INDICADO, label: t("deliveryAddresses.building.notSet") }, ...opcoes].map((o) => (
          <div key={o.value} className="flex items-center gap-1.5">
            <RadioGroupItem value={o.value} id={`${idPrefix}_${campo}_${o.value}`} />
            <Label htmlFor={`${idPrefix}_${campo}_${o.value}`} className="text-sm font-normal">{o.label}</Label>
          </div>
        ))}
      </RadioGroup>
      {erro(campo)}
    </div>
  );

  const numero = (
    campo: "impacto_percent" | "n_elevadores" | "n_andares" | "n_fracoes_por_andar",
    label: string,
    extraDisabled?: boolean,
  ) => {
    const id = `${idPrefix}_${campo}`;
    const { min, max } = LIMITES_FICHA_TECNICA[campo];
    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs">{label}</Label>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          step={1}
          min={min}
          max={max}
          value={valor[campo]}
          onChange={(e) => set(campo, e.target.value)}
          disabled={disabled || extraDisabled}
          aria-invalid={!!erros?.[campo]}
          aria-describedby={erros?.[campo] ? `${id}_erro` : undefined}
          className={erros?.[campo] ? "border-destructive focus-visible:ring-destructive" : undefined}
        />
        {erro(campo)}
      </div>
    );
  };

  return (
    <Collapsible open={open} onOpenChange={setAberta} className="rounded-md border">
      <CollapsibleTrigger
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
        disabled={temErros}
      >
        {t("deliveryAddresses.building.title")}
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-3 pb-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start">
          <div className="sm:col-span-3">
            {radios("acesso", t("deliveryAddresses.building.access"), [
              { value: "facil", label: t("deliveryAddresses.building.accessEasy") },
              { value: "dificil", label: t("deliveryAddresses.building.accessHard") },
            ])}
          </div>
          {numero("impacto_percent", t("deliveryAddresses.building.impact"), valor.acesso !== "dificil")}
        </div>
        {radios("estacionamento", t("deliveryAddresses.building.parking"), [
          { value: "pago", label: t("deliveryAddresses.building.parkingPaid") },
          { value: "nao_pago", label: t("deliveryAddresses.building.parkingFree") },
          { value: "sem_estacionamento", label: t("deliveryAddresses.building.parkingNone") },
        ])}
        {(valor.estacionamento && valor.estacionamento !== "sem_estacionamento") || valor.zona_estacionamento
          ? radios("zona_estacionamento", t("deliveryAddresses.building.parkingZone"), [
              { value: "verde", label: t("deliveryAddresses.building.zoneGreen") },
              { value: "amarela", label: t("deliveryAddresses.building.zoneYellow") },
              { value: "vermelha", label: t("deliveryAddresses.building.zoneRed") },
            ])
          : null}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}_tem_elevador`} className="text-xs">{t("deliveryAddresses.building.hasElevator")}</Label>
            <div className="flex h-10 items-center">
              <Switch
                id={`${idPrefix}_tem_elevador`}
                checked={valor.tem_elevador}
                onCheckedChange={(v) => set("tem_elevador", v)}
                disabled={disabled}
              />
            </div>
          </div>
          {numero("n_elevadores", t("deliveryAddresses.building.elevators"), !valor.tem_elevador)}
          {numero("n_andares", t("deliveryAddresses.building.floors"))}
          {numero("n_fracoes_por_andar", t("deliveryAddresses.building.unitsPerFloor"))}
        </div>
        {erros?.piso
          ? <p className="text-xs text-destructive">{erros.piso}</p>
          : <p className="text-xs text-muted-foreground">{t("deliveryAddresses.building.floorHint")}</p>}
      </CollapsibleContent>
    </Collapsible>
  );
};
