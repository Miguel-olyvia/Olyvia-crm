/**
 * Processamento salarial > Configuracao > «Margem de tempo».
 *
 * A margem (0 a 120 minutos, ou «sem margem» = desligado) diz ate que diferenca entre o horario planeado e o picado o dia conta
 * como normal. Dentro da margem o dia conta como normal; fora dela fica «A validar» ate o RH decidir (Fila de trabalho). Sem
 * margem configurada nada muda. Cada gravacao e uma versao nova a partir de uma data (o historico nao se altera); ler pede
 * `hr.assiduidade.view`, gravar `hr.assiduidade.gerir`. Grava-se SO depois de confirmar, porque muda o que conta no relatorio e no
 * processamento. Uma correccao de picagens reabre dias ja validados (de proposito): o ecra di-lo.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { hojeLisboa, useDesviosMargem, type VersaoMargem } from "@/components/rh-exemplo/hooks/horasExtraReal";
import { usePermissoesAssiduidade } from "@/components/rh-exemplo/hooks/usePermissoesAssiduidade";
import { dataCurta } from "./formatosC";

const MARGEM_MIN = 0;
const MARGEM_MAX = 120;
const PADRAO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const ID_ERRO = "margem-invalido";

type Modo = "sem" | "com";

export function ConfiguracaoMargemTempo() {
  const { t } = useTranslation();
  const { permissoes } = usePermissoesAssiduidade();
  const { margem, aCarregar, aGuardar, indisponivel, erro, guardar } = useDesviosMargem(permissoes.view);
  const [modo, setModo] = useState<Modo>("com");
  const [minutos, setMinutos] = useState("10");
  const [inicio, setInicio] = useState(() => hojeLisboa());
  const [confirmar, setConfirmar] = useState(false);
  const [erroGuardar, setErroGuardar] = useState<string | null>(null);

  const emVigor = margem?.emVigor ?? null;
  // O formulario parte do que esta em vigor (a pessoa corrige a partir dai), sem pisar o que ja escreveu.
  const idEmVigor = emVigor?.id ?? null;
  useEffect(() => {
    if (!emVigor) return;
    setModo(emVigor.margem_min === null ? "sem" : "com");
    if (emVigor.margem_min !== null) setMinutos(String(emVigor.margem_min));
    // So quando muda a versao em vigor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idEmVigor]);

  const minutosOk = minutos.trim() !== "" && Number.isInteger(Number(minutos)) && Number(minutos) >= MARGEM_MIN && Number(minutos) <= MARGEM_MAX;
  const valido = PADRAO_DATA.test(inicio) && (modo === "sem" || minutosOk);
  const editavel = permissoes.gerir && !indisponivel;
  const margemEscolhida: number | null = modo === "sem" ? null : Number(minutos);

  const gravar = async (): Promise<void> => {
    if (!valido || !editavel || aGuardar) return;
    setErroGuardar(null);
    const r = await guardar(inicio, margemEscolhida);
    setConfirmar(false);
    if (!r.ok) {
      setErroGuardar(r.erro);
      return;
    }
    toast.success(t("rhDesvios.margem.guardado"));
  };

  const textoMargem = (v: VersaoMargem): string =>
    v.margem_min === null ? t("rhDesvios.margem.valorSem") : t("rhDesvios.margem.valorMinutos", { min: String(v.margem_min) });

  return (
    <Card data-testid="cfg-margem-tempo">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("rhDesvios.margem.titulo")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("rhDesvios.margem.ajuda")}</p>
        <p role="note" className="text-xs text-muted-foreground">{t("rhDesvios.margem.aviso")}</p>
        {indisponivel && <p role="status" className="text-sm text-muted-foreground">{t("rhDesvios.margem.indisponivel")}</p>}
        {!permissoes.gerir && margem && !indisponivel && <p role="note" className="text-xs text-muted-foreground">{t("rhDesvios.margem.soLeitura")}</p>}
        {erro && <p role="alert" className="text-sm text-destructive">{t("rhDesvios.margem.erroLeitura", { erro })}</p>}
        {aCarregar && <p role="status" className="text-xs text-muted-foreground">{t("rhDesvios.margem.aCarregar")}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {margem && !indisponivel && (
          <p className="text-sm font-medium" data-testid="cfg-margem-em-vigor">
            {emVigor === null
              ? margem.versoes.length === 0
                ? t("rhDesvios.margem.nunca")
                : t("rhDesvios.margem.emVigorSem")
              : emVigor.margem_min === null
                ? t("rhDesvios.margem.emVigorSem")
                : t("rhDesvios.margem.emVigor", { min: String(emVigor.margem_min), data: dataCurta(emVigor.valido_de) })}
          </p>
        )}

        <fieldset className="space-y-2" disabled={!editavel}>
          <legend className="text-sm font-medium">{t("rhDesvios.margem.modo")}</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {(["com", "sem"] as const).map((valor) => (
              <label key={valor} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="margem-modo"
                  value={valor}
                  checked={modo === valor}
                  onChange={() => setModo(valor)}
                  className="h-4 w-4 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
                {t(valor === "com" ? "rhDesvios.margem.modoCom" : "rhDesvios.margem.modoSem")}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="margem-minutos">{t("rhDesvios.margem.minutos")}</Label>
            <Input
              id="margem-minutos"
              type="number"
              inputMode="numeric"
              min={MARGEM_MIN}
              max={MARGEM_MAX}
              step={1}
              className="min-h-11"
              value={minutos}
              disabled={!editavel || modo === "sem"}
              aria-invalid={editavel && modo === "com" && !minutosOk}
              aria-describedby={editavel && modo === "com" && !minutosOk ? ID_ERRO : undefined}
              onChange={(e) => setMinutos(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="margem-inicio">{t("rhDesvios.margem.inicio")}</Label>
            <Input id="margem-inicio" type="date" className="min-h-11" value={inicio} disabled={!editavel} aria-invalid={editavel && !PADRAO_DATA.test(inicio)} aria-describedby={editavel && !PADRAO_DATA.test(inicio) ? ID_ERRO : undefined} onChange={(e) => setInicio(e.target.value)} />
          </div>
        </div>

        {editavel && !valido && <p id={ID_ERRO} role="alert" className="text-sm text-destructive">{t("rhDesvios.margem.invalido")}</p>}
        {erroGuardar && <p role="alert" className="text-sm text-destructive">{erroGuardar}</p>}
        <Button type="button" className="min-h-11" disabled={!valido || !editavel || aGuardar} onClick={() => setConfirmar(true)}>
          {t("rhDesvios.margem.guardar")}
        </Button>

        {margem && margem.versoes.length > 0 && (
          <section aria-labelledby="margem-historico" className="space-y-1">
            <h3 id="margem-historico" className="text-sm font-medium">{t("rhDesvios.margem.historico")}</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {margem.versoes.map((v) => (
                <li key={v.id} className="tabular-nums">
                  {t("rhDesvios.margem.historicoLinha", {
                    de: dataCurta(v.valido_de),
                    ate: v.valido_ate ? dataCurta(v.valido_ate) : t("rhDesvios.margem.historicoSemFim"),
                    margem: textoMargem(v),
                  })}
                  {v.substituida_em ? ` (${t("rhDesvios.margem.substituida")})` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>

      <Dialog open={confirmar} onOpenChange={(aberto) => !aberto && !aGuardar && setConfirmar(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rhDesvios.margem.confirmarTitulo")}</DialogTitle>
            <DialogDescription>
              {margemEscolhida === null
                ? t("rhDesvios.margem.confirmarSem", { data: dataCurta(inicio) })
                : t("rhDesvios.margem.confirmarCom", { data: dataCurta(inicio), min: String(margemEscolhida) })}
            </DialogDescription>
          </DialogHeader>
          <p role="note" className="rounded-md border p-3 text-sm">{t("rhDesvios.margem.confirmarAviso")}</p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" className="min-h-11" disabled={aGuardar} onClick={() => setConfirmar(false)}>
              {t("rhDesvios.margem.cancelar")}
            </Button>
            <Button type="button" className="min-h-11" disabled={aGuardar} onClick={() => void gravar()}>
              {t("rhDesvios.margem.guardar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
