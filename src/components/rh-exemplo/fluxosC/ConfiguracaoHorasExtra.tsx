/**
 * Processamento salarial > Configuração > «Horas extra».
 *
 * REAL: os coeficientes de pagamento (`CoeficientesHorasExtraReais`, códigos de processamento da base) e o limite anual
 * de cada pessoa, que é o «Horas anuais máximas» do contrato (`limitePessoa.ts`).
 *
 * AINDA EM MEMÓRIA (não há equivalente na base, ver o cartão): o limite por dia, o anual por omissão, o alerta (% do
 * limite anual da pessoa) e o mínimo de tempo a mais. Recarregar a página repõe-nos.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { CoeficientesHorasExtraReais } from "./CoeficientesHorasExtraReais";
import { definirLimitesHorasExtra, useFluxosC } from "./lojaFluxosC";

type CampoRegra = "diaH" | "anoH" | "alertaPct" | "minimoMin";
const CAMPOS_REGRA: CampoRegra[] = ["diaH", "anoH", "alertaPct", "minimoMin"];
const ROTULO_REGRA: Record<CampoRegra, string> = {
  diaH: "rhFluxosD.cfg.diaH",
  anoH: "rhFluxosD.cfg.anoH",
  alertaPct: "rhFluxosC.he.limites.alertaPct",
  minimoMin: "rhFluxosC.he.limites.minimoMin",
};

const positivo = (v: string): boolean => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) > 0;

export function ConfiguracaoHorasExtra() {
  const { t } = useTranslation();
  const limites = useFluxosC((e) => e.limites);
  const [r, setR] = useState<Record<CampoRegra, string>>({
    diaH: String(limites.diaMin / 60), anoH: String(limites.anoMin / 60), alertaPct: String(limites.alertaPct), minimoMin: String(limites.minimoMin),
  });
  const regrasValidas = CAMPOS_REGRA.every((k) => positivo(r[k])) && Number(r.alertaPct) <= 100;

  const guardarRegras = () => {
    if (!regrasValidas) return;
    definirLimitesHorasExtra({ diaMin: Math.round(Number(r.diaH) * 60), anoMin: Math.round(Number(r.anoH) * 60), alertaPct: Number(r.alertaPct), minimoMin: Math.round(Number(r.minimoMin)) });
    toast.success(t("rhFluxosC.he.limites.guardado"));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("rhFluxosD.cfg.regrasTitulo")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("rhFluxosD.cfg.regrasAjuda")}</p>
          <p role="note" className="text-xs text-muted-foreground" data-testid="he-cfg-sem-base">{t("rhHeReal.regrasSemBase")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {CAMPOS_REGRA.map((k) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={`he-cfg-${k}`}>{t(ROTULO_REGRA[k])}</Label>
                <Input id={`he-cfg-${k}`} type="number" min={1} max={k === "alertaPct" ? 100 : undefined} className="min-h-11"
                  value={r[k]} onChange={(e) => setR((x) => ({ ...x, [k]: e.target.value }))} />
              </div>
            ))}
          </div>
          {!regrasValidas && <p role="alert" className="text-sm text-destructive">{t("rhFluxosC.he.limites.invalido")}</p>}
          <Button type="button" className="min-h-11" disabled={!regrasValidas} onClick={guardarRegras}>{t("rhFluxosC.comum.guardar")}</Button>
        </CardContent>
      </Card>

      <CoeficientesHorasExtraReais />
    </div>
  );
}
