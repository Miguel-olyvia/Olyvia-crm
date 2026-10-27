/**
 * O calculo do desconto de vencimento de uma falta (fluxo 7): so desconta a falta marcada que NAO seja justificada e
 * paga, mais os atrasos acima da tolerancia (5 minutos). Mostra a conta passo a passo, com o valor da hora REAL do mes da
 * falta (o do processamento salarial: base do mes / horas planeadas do mes) e o total da pessoa nesse mes.
 * Sem retribuicao ou sem horas planeadas nao ha valor da hora: diz-se, e nao se inventa um valor.
 */
import { useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { nomeDoMes } from "@/components/rh-exemplo/custo/formato";
import { valorHoraDoCalculo } from "@/components/rh-exemplo/fluxosB/faltas/valorHora";
import { formatarEuros, formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { LEITOR_FALTAS, emVigor } from "@/components/rh-exemplo/lib/assiduidade";
import { descontoDaFalta, totalDeDescontos } from "@/components/rh-exemplo/lib/faltasB";
import { TOLERANCIA_ATRASO_MINUTOS } from "@/components/rh-exemplo/lib/horarioTipos";
import { useCalculoRealDaPessoa } from "@/components/rh-exemplo/processamento/useCalculoReal";
import type { Falta } from "@/components/rh-exemplo/tiposAssiduidade";

/** `faltasDaPessoa`: as faltas lidas da base para o total da pessoa (a janela pedida, nao a historia toda). */
export function DescontoDaFaltaCard({ falta, faltasDaPessoa }: { falta: Falta; faltasDaPessoa: readonly Falta[] }) {
  const { t, language } = useTranslation();
  const chaveMes = falta.data.slice(0, 7);
  const calculo = useCalculoRealDaPessoa(falta.pessoa_id, Number(chaveMes.slice(0, 4)) || 0, Number(chaveMes.slice(5, 7)) || 1);
  const base = useMemo(() => valorHoraDoCalculo(calculo.resultado), [calculo.resultado]);
  const valorHora = base?.valorHora ?? null;
  // Sem valor da hora o desconto em tempo e a razao continuam a ver-se; so o valor em euros nao se calcula.
  const desconto = descontoDaFalta(falta, valorHora ?? 0);
  const totalDoMes = useMemo(
    () => valorHora === null
      ? null
      : totalDeDescontos(
        emVigor(faltasDaPessoa.filter((f) => f.pessoa_id === falta.pessoa_id && f.data.startsWith(chaveMes)), LEITOR_FALTAS),
        valorHora,
      ),
    [faltasDaPessoa, falta.pessoa_id, chaveMes, valorHora],
  );

  const linhaDoValorHora = (): string => {
    if (calculo.retribuicaoRecusada) return t("rhProcReal.fal.semPermissao");
    if (calculo.aCarregar || !base) return t("rhProcReal.fal.aCalcular");
    if (valorHora === null || base.baseMes === null) return t("rhProcReal.fal.semValorHora", { mes: nomeDoMes(chaveMes, language) });
    return t("rhExemplo.fal.valorHora", {
      valor: formatarEuros(valorHora, language),
      conta: t("rhProcReal.fal.conta", { base: formatarEuros(base.baseMes, language), horas: Math.round(base.horasPlaneadas * 100) / 100 }),
    });
  };

  return (
    <section aria-label={t("rhExemplo.fal.descontoTitulo")} className="space-y-2 rounded-md border p-3 text-sm" data-testid="rhb-desconto">
      <h3 className="font-semibold">{t("rhExemplo.fal.descontoTitulo")}</h3>
      <p className="text-muted-foreground">{t("rhExemplo.fal.descontoRegra", { minutos: String(TOLERANCIA_ATRASO_MINUTOS) })}</p>
      <p>{linhaDoValorHora()}</p>
      {calculo.incompleta && !calculo.aCarregar && <p role="status" className="text-amber-800 dark:text-amber-300">{t("rhProcReal.fal.incompleto")}</p>}
      {valorHora !== null && (
        <p className="font-medium tabular-nums">
          {desconto.desconta
            ? t("rhExemplo.fal.contaDesconta", {
                tempo: formatarHorasMinutos(desconto.minutos),
                valorHora: formatarEuros(valorHora, language),
                total: formatarEuros(desconto.valor, language),
              })
            : t("rhExemplo.fal.contaNaoDesconta", { total: formatarEuros(0, language) })}
        </p>
      )}
      <p className="text-muted-foreground">
        {t(`rhExemplo.fal.razao.${desconto.razao}`)}
        {desconto.provisorio ? ` ${t("rhExemplo.fal.provisorio")}` : ""}
      </p>
      {totalDoMes !== null && (
        <p className="tabular-nums text-muted-foreground">
          {t("rhProcReal.fal.totalDoMes", { total: formatarEuros(totalDoMes, language) })}
        </p>
      )}
    </section>
  );
}
