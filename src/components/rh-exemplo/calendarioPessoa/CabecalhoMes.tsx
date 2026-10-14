/**
 * O cabecalho do mes: navegacao (mes anterior, seguinte, «Hoje») e os totais — horas previstas, feitas, extra,
 * faltas e, SO no banco de horas, o saldo. Para os outros tipos de horario nao ha saldo nenhum.
 */
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { duracao, duracaoComSinal } from "./formatos";
import type { TotaisMes } from "./totaisMes";

interface Props {
  nomeDoMes: string;
  totais: TotaisMes;
  aoMudar: (passo: number) => void;
  aoIrParaHoje: () => void;
  acoes?: ReactNode;
}

function Total({ rotulo, valor, nota, id }: { rotulo: string; valor: string; nota?: string; id: string }) {
  return (
    <div className="min-w-28 flex-1 rounded-md border bg-card p-2.5" data-testid={id}>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-base font-semibold tabular-nums">{valor}</dd>
      {nota && <dd className="text-xs text-muted-foreground">{nota}</dd>}
    </div>
  );
}

export function CabecalhoMes({ nomeDoMes, totais, aoMudar, aoIrParaHoje, acoes }: Props) {
  const { t } = useTranslation();
  const porMarcar = totais.faltasSugeridasMin > 0 ? t("rhCal.cab.faltasPorMarcar", { t: duracao(totais.faltasSugeridasMin) }) : undefined;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-base font-semibold capitalize">{nomeDoMes}</h3>
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label={t("rhCal.mesAnterior")} onClick={() => aoMudar(-1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={aoIrParaHoje}>{t("rhCal.hoje")}</Button>
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label={t("rhCal.mesSeguinte")} onClick={() => aoMudar(1)}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        {acoes}
      </div>
      <dl className="flex flex-wrap gap-2" aria-label={t("rhCal.titulo")}>
        <Total id="rhcal-previstas" rotulo={t("rhCal.cab.previstas")} valor={duracao(totais.previstoMin)} />
        <Total id="rhcal-feitas" rotulo={t("rhCal.cab.feitas")} valor={duracao(totais.feitoMin)} />
        <Total id="rhcal-extra" rotulo={t("rhCal.cab.extra")} valor={duracao(totais.extraMin)} nota={t("rhCal.cab.extraAjuda")} />
        <Total id="rhcal-faltas" rotulo={t("rhCal.cab.faltas")} valor={duracao(totais.faltasMin)} nota={porMarcar ?? t("rhCal.cab.faltasDias", { n: String(totais.diasComFalta) })} />
        {totais.bancoSaldoMin !== null && (
          <Total id="rhcal-saldo" rotulo={t("rhCal.cab.saldo")} valor={duracaoComSinal(totais.bancoSaldoMin)} />
        )}
      </dl>
      <p className="text-xs text-muted-foreground">{t("rhCal.cab.ateOntem")}</p>
    </div>
  );
}
