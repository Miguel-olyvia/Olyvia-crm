/** Limites por omissão (2 h por dia, 150 h por ano), alerta a 80 % e mínimo de 15 min, editáveis no exemplo. */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { definirLimitesHorasExtra, useFluxosC } from "./lojaFluxosC";

type Campo = "diaH" | "anoH" | "alertaPct" | "minimoMin";
const CAMPOS: Campo[] = ["diaH", "anoH", "alertaPct", "minimoMin"];

export function LimitesHorasExtraCard() {
  const { t } = useTranslation();
  const limites = useFluxosC((e) => e.limites);
  const [rascunho, setRascunho] = useState<Record<Campo, string>>({
    diaH: String(limites.diaMin / 60),
    anoH: String(limites.anoMin / 60),
    alertaPct: String(limites.alertaPct),
    minimoMin: String(limites.minimoMin),
  });
  const n = (c: Campo): number => Number(rascunho[c]);
  const valido = CAMPOS.every((c) => rascunho[c].trim() !== "" && Number.isFinite(n(c)) && n(c) > 0) && n("alertaPct") <= 100;

  const guardar = () => {
    if (!valido) return;
    definirLimitesHorasExtra({ diaMin: Math.round(n("diaH") * 60), anoMin: Math.round(n("anoH") * 60), alertaPct: n("alertaPct"), minimoMin: Math.round(n("minimoMin")) });
    toast.success(t("rhFluxosC.he.limites.guardado"));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("rhFluxosC.he.limites.titulo")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("rhFluxosC.he.limites.ajuda")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CAMPOS.map((c) => (
            <div key={c} className="space-y-1.5">
              <Label htmlFor={`he-lim-${c}`}>{t(`rhFluxosC.he.limites.${c}`)}</Label>
              <Input id={`he-lim-${c}`} type="number" min={1} max={c === "alertaPct" ? 100 : undefined} className="min-h-11"
                value={rascunho[c]} onChange={(e) => setRascunho((r) => ({ ...r, [c]: e.target.value }))} />
            </div>
          ))}
        </div>
        {!valido && <p role="alert" className="text-sm text-destructive">{t("rhFluxosC.he.limites.invalido")}</p>}
        <Button type="button" className="min-h-11" disabled={!valido} onClick={guardar}>{t("rhFluxosC.comum.guardar")}</Button>
      </CardContent>
    </Card>
  );
}
