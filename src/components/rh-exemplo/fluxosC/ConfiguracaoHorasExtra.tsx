/**
 * Processamento salarial > Configuração > «Horas extra»: as regras da ORGANIZAÇÃO. O limite anual de cada pessoa é o
 * «Horas anuais máximas» da aba Contrato; aqui ficam o limite por dia e o anual por omissão, o alerta (% do limite
 * anual da pessoa), o mínimo de tempo a mais e os coeficientes de pagamento usados no «Cálculo do mês».
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import type { RegrasPagamentoHE } from "./horasExtraRegras";
import { definirLimitesHorasExtra, definirRegrasPagamentoHE, useFluxosC } from "./lojaFluxosC";

type CampoRegra = "diaH" | "anoH" | "alertaPct" | "minimoMin";
const CAMPOS_REGRA: CampoRegra[] = ["diaH", "anoH", "alertaPct", "minimoMin"];
const ROTULO_REGRA: Record<CampoRegra, string> = {
  diaH: "rhFluxosD.cfg.diaH",
  anoH: "rhFluxosD.cfg.anoH",
  alertaPct: "rhFluxosC.he.limites.alertaPct",
  minimoMin: "rhFluxosC.he.limites.minimoMin",
};

type CampoCoef = keyof RegrasPagamentoHE;
const CAMPOS_COEF: Array<{ campo: CampoCoef; chave: string }> = [
  { campo: "primeiraHoraPct", chave: "primeira_hora" },
  { campo: "seguintesPct", chave: "seguintes" },
  { campo: "nocturnoPct", chave: "nocturno" },
  { campo: "feriadoPct", chave: "feriado" },
  { campo: "descansoPct", chave: "descanso" },
];

const positivo = (v: string): boolean => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) > 0;

export function ConfiguracaoHorasExtra() {
  const { t } = useTranslation();
  const limites = useFluxosC((e) => e.limites);
  const regras = useFluxosC((e) => e.regras);
  const [r, setR] = useState<Record<CampoRegra, string>>({
    diaH: String(limites.diaMin / 60), anoH: String(limites.anoMin / 60), alertaPct: String(limites.alertaPct), minimoMin: String(limites.minimoMin),
  });
  const [c, setC] = useState<Record<CampoCoef, string>>({
    primeiraHoraPct: String(regras.primeiraHoraPct), seguintesPct: String(regras.seguintesPct), nocturnoPct: String(regras.nocturnoPct),
    feriadoPct: String(regras.feriadoPct), descansoPct: String(regras.descansoPct),
  });
  const regrasValidas = CAMPOS_REGRA.every((k) => positivo(r[k])) && Number(r.alertaPct) <= 100;
  const coefValidos = CAMPOS_COEF.every(({ campo }) => positivo(c[campo]));

  const guardarRegras = () => {
    if (!regrasValidas) return;
    definirLimitesHorasExtra({ diaMin: Math.round(Number(r.diaH) * 60), anoMin: Math.round(Number(r.anoH) * 60), alertaPct: Number(r.alertaPct), minimoMin: Math.round(Number(r.minimoMin)) });
    toast.success(t("rhFluxosC.he.limites.guardado"));
  };
  const guardarCoef = () => {
    if (!coefValidos) return;
    definirRegrasPagamentoHE({
      primeiraHoraPct: Number(c.primeiraHoraPct), seguintesPct: Number(c.seguintesPct), nocturnoPct: Number(c.nocturnoPct),
      feriadoPct: Number(c.feriadoPct), descansoPct: Number(c.descansoPct),
    });
    toast.success(t("rhFluxosD.cfg.coefGuardado"));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("rhFluxosD.cfg.regrasTitulo")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("rhFluxosD.cfg.regrasAjuda")}</p>
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("rhFluxosD.cfg.coefTitulo")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("rhFluxosC.he.pagamento.ajuda")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {CAMPOS_COEF.map(({ campo, chave }) => (
              <div key={campo} className="space-y-1.5">
                <Label htmlFor={`he-coef-${campo}`}>{t(`rhFluxosC.he.pagamento.regra.${chave}`)} (%)</Label>
                <Input id={`he-coef-${campo}`} type="number" min={1} className="min-h-11" value={c[campo]}
                  onChange={(e) => setC((x) => ({ ...x, [campo]: e.target.value }))} />
              </div>
            ))}
          </div>
          {!coefValidos && <p role="alert" className="text-sm text-destructive">{t("rhFluxosD.cfg.coefInvalido")}</p>}
          <Button type="button" className="min-h-11" disabled={!coefValidos} onClick={guardarCoef}>{t("rhFluxosC.comum.guardar")}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
