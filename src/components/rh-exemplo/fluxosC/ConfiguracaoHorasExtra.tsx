/**
 * Processamento salarial > Configuração > «Horas extra».
 *
 * REAL: os coeficientes de pagamento (`CoeficientesHorasExtraReais`, códigos de processamento da base).
 *
 * O LIMITE ANUAL NÃO SE EDITA AQUI: é o da regra salarial da organização em vigor (`he_limite_anual_min`), mostrado só em
 * leitura com ligação à secção «Regras salariais». Já não vem do contrato da pessoa nem de `hr_horas_extra_config.ano_min`
 * (a base deixou de os ler); o `ano_min` que a RPC ainda exige segue tal como está, sem o ecrã o tocar.
 *
 * TAMBEM REAL: o limite por dia, o alerta (% do limite anual) e o minimo de tempo a mais, guardados por organizacao
 * (`rpc_hr_horas_extra_config_*`). Ler pede `hr.assiduidade.view`; guardar, `hr.assiduidade.gerir`.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { CoeficientesHorasExtraReais } from "./CoeficientesHorasExtraReais";
import { ContagemHorasExtraAprovadas } from "./ContagemHorasExtraAprovadas";
import { useHorasExtraConfig } from "@/components/rh-exemplo/hooks/horasExtraReal";
import { useRegrasSalariais } from "@/components/rh-exemplo/hooks/useRegrasSalariais";
import { usePermissoesAssiduidade } from "@/components/rh-exemplo/hooks/usePermissoesAssiduidade";

type CampoRegra = "diaH" | "alertaPct" | "minimoMin";
const CAMPOS_REGRA: CampoRegra[] = ["diaH", "alertaPct", "minimoMin"];
const ROTULO_REGRA: Record<CampoRegra, string> = {
  diaH: "rhFluxosD.cfg.diaH",
  alertaPct: "rhFluxosC.he.limites.alertaPct",
  minimoMin: "rhFluxosC.he.limites.minimoMin",
};

const positivo = (v: string): boolean => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) > 0;
const inteiroEntre = (v: string, min: number, max: number): boolean => v.trim() !== "" && Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max;

/** A mesma validacao da base: minimo inteiro de 1 a 240 minutos, alerta inteiro de 1 a 100 %, limite por dia positivo. */
/** O limite anual por omissão da base quando ainda não há regra salarial em vigor (100 h). */
const LIMITE_ANUAL_OMISSAO_MIN = 6000;
const MINIMO_MIN = 1;
const MINIMO_MAX = 240;
const ALERTA_MIN = 1;
const ALERTA_MAX = 100;

const horasTexto = (min: number): string => String(Math.round((min / 60) * 100) / 100).replace(".", ",");

interface ConfiguracaoHorasExtraProps {
  /** Leva à secção «Regras salariais» da Configuração, onde se altera o limite anual. */
  aoIrParaRegrasSalariais?: () => void;
}

export function ConfiguracaoHorasExtra({ aoIrParaRegrasSalariais }: ConfiguracaoHorasExtraProps = {}) {
  const { t } = useTranslation();
  const { permissoes } = usePermissoesAssiduidade();
  const { limites, omissao, aCarregar, aGuardar, erro, guardar } = useHorasExtraConfig(permissoes.view);
  const { emVigor, isLoading: aCarregarRegra, estado: estadoRegras } = useRegrasSalariais();
  // So uma leitura BOA sem regra em vigor quer dizer «sem regra, vale a omissao»; recusa, erro ou base sem as regras nao o provam.
  const regrasNaoLidas = estadoRegras !== "ok";
  const [r, setR] = useState<Record<CampoRegra, string>>({ diaH: "", alertaPct: "", minimoMin: "" });
  const [erroGuardar, setErroGuardar] = useState<string | null>(null);
  useEffect(() => {
    if (limites) setR({ diaH: String(limites.diaMin / 60), alertaPct: String(limites.alertaPct), minimoMin: String(limites.minimoMin) });
  }, [limites]);
  const regrasValidas = positivo(r.diaH) && inteiroEntre(r.alertaPct, ALERTA_MIN, ALERTA_MAX) && inteiroEntre(r.minimoMin, MINIMO_MIN, MINIMO_MAX);
  const editavel = permissoes.gerir && limites !== null;

  const guardarRegras = async () => {
    if (!regrasValidas || !editavel || !limites || aGuardar) return;
    setErroGuardar(null);
    const res = await guardar({ diaMin: Math.round(Number(r.diaH) * 60), anoMin: limites.anoMin, alertaPct: Number(r.alertaPct), minimoMin: Math.round(Number(r.minimoMin)) });
    if (!res.ok) {
      setErroGuardar(res.erro);
      return;
    }
    toast.success(t("rhFluxosC.he.limites.guardado"));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("rhFluxosD.cfg.regrasTitulo")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("rhFluxosD.cfg.regrasAjuda")}</p>
          {omissao && <p role="note" className="text-xs text-muted-foreground" data-testid="he-cfg-omissao">{t("rhHeReal.config.omissao")}</p>}
          {!permissoes.gerir && limites && <p role="note" className="text-xs text-muted-foreground">{t("rhHeReal.config.soLeitura")}</p>}
          {erro && <p role="alert" className="text-sm text-destructive">{t("rhHeReal.config.erroLeitura", { erro })}</p>}
          {aCarregar && <p role="status" className="text-xs text-muted-foreground">{t("rhHeReal.aCarregar")}</p>}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {CAMPOS_REGRA.map((k) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={`he-cfg-${k}`}>{t(ROTULO_REGRA[k])}</Label>
                <Input id={`he-cfg-${k}`} type="number" min={1} max={k === "alertaPct" ? ALERTA_MAX : k === "minimoMin" ? MINIMO_MAX : undefined} step={k === "alertaPct" || k === "minimoMin" ? 1 : "any"} className="min-h-11"
                  value={r[k]} disabled={!editavel} onChange={(e) => setR((x) => ({ ...x, [k]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div role="note" className="rounded-md bg-muted/50 p-3 text-sm" data-testid="he-cfg-limite-anual">
            <p className="font-medium">{t("rhFluxosD.cfg.anoRegra")}</p>
            <p className="text-muted-foreground" role={regrasNaoLidas && !aCarregarRegra ? (estadoRegras === "erro" ? "alert" : "status") : undefined}>
              {aCarregarRegra
                ? t("rhHeReal.aCarregar")
                : regrasNaoLidas
                  ? t("rhFluxosD.cfg.anoRegraNaoLida")
                  : emVigor
                  ? t("rhFluxosD.cfg.anoRegraValor", { horas: horasTexto(emVigor.he_limite_anual_min) })
                  : t("rhFluxosD.cfg.anoRegraSem", { horas: horasTexto(LIMITE_ANUAL_OMISSAO_MIN) })}
            </p>
            {aoIrParaRegrasSalariais && (
              <Button type="button" variant="link" className="h-auto min-h-11 p-0" onClick={aoIrParaRegrasSalariais}>
                {t("rhFluxosD.cfg.anoRegraLigacao")}
              </Button>
            )}
          </div>
          {editavel && !regrasValidas && <p role="alert" className="text-sm text-destructive">{t("rhHeReal.config.invalido")}</p>}
          {erroGuardar && <p role="alert" className="text-sm text-destructive">{erroGuardar}</p>}
          <Button type="button" className="min-h-11" disabled={!regrasValidas || !editavel || aGuardar} onClick={() => void guardarRegras()}>{t("rhFluxosC.comum.guardar")}</Button>
        </CardContent>
      </Card>

      <ContagemHorasExtraAprovadas />

      <CoeficientesHorasExtraReais />
    </div>
  );
}
