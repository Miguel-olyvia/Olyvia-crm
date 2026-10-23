/**
 * O calculo de exemplo do desconto de vencimento de uma falta (fluxo 7): so desconta a falta marcada que NAO seja
 * justificada e paga, mais os atrasos acima da tolerancia (5 minutos). Mostra a conta passo a passo, com o valor
 * da hora tirado da ficha (retribuicao mensal / horas planeadas do mes) e o total da pessoa.
 */
import { useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { valorHoraDaFicha } from "@/components/rh-exemplo/fluxosB/faltas/valorHora";
import { formatarEuros, formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { descontoDaFalta, totalDeDescontos } from "@/components/rh-exemplo/lib/faltasB";
import { TOLERANCIA_ATRASO_MINUTOS } from "@/components/rh-exemplo/lib/horarioTipos";
import type { Falta } from "@/components/rh-exemplo/tiposAssiduidade";

export function DescontoDaFaltaCard({ falta }: { falta: Falta }) {
  const { t, language } = useTranslation();
  const ficha = useEstadoRh((e) => e.fichas[falta.pessoa_id] ?? null);
  const todas = useGestao((g) => g.faltas);
  const base = useMemo(() => valorHoraDaFicha(ficha), [ficha]);
  const desconto = descontoDaFalta(falta, base.valorHora);
  const totalDaPessoa = useMemo(
    () => totalDeDescontos(todas.filter((f) => f.pessoa_id === falta.pessoa_id), base.valorHora),
    [todas, falta.pessoa_id, base.valorHora],
  );

  return (
    <section aria-label={t("rhExemplo.fal.descontoTitulo")} className="space-y-2 rounded-md border p-3 text-sm" data-testid="rhb-desconto">
      <h3 className="font-semibold">{t("rhExemplo.fal.descontoTitulo")}</h3>
      <p className="text-muted-foreground">{t("rhExemplo.fal.descontoRegra", { minutos: String(TOLERANCIA_ATRASO_MINUTOS) })}</p>
      <p>
        {t("rhExemplo.fal.valorHora", {
          valor: formatarEuros(base.valorHora, language),
          conta: base.porOmissao
            ? t("rhExemplo.fal.valorHoraOmissao")
            : `${formatarEuros(base.valorMensal ?? 0, language)} / (${base.horasSemanais} h × 4)`,
        })}
      </p>
      <p className="font-medium tabular-nums">
        {desconto.desconta
          ? t("rhExemplo.fal.contaDesconta", {
              tempo: formatarHorasMinutos(desconto.minutos),
              valorHora: formatarEuros(base.valorHora, language),
              total: formatarEuros(desconto.valor, language),
            })
          : t("rhExemplo.fal.contaNaoDesconta", { total: formatarEuros(0, language) })}
      </p>
      <p className="text-muted-foreground">
        {t(`rhExemplo.fal.razao.${desconto.razao}`)}
        {desconto.provisorio ? ` ${t("rhExemplo.fal.provisorio")}` : ""}
      </p>
      <p className="tabular-nums text-muted-foreground">
        {t("rhExemplo.fal.totalDaPessoa", { total: formatarEuros(totalDaPessoa, language) })}
      </p>
    </section>
  );
}
