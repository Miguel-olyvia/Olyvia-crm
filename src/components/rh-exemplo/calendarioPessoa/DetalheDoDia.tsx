/**
 * O detalhe de um dia, num painel lateral: o previsto, as picagens, a diferenca e as horas extra do dia — com
 * Confirmar e Rejeitar para o RH (as mesmas accoes do store das horas extra) — e o caminho para corrigir ou pedir
 * justificacao no registo do dia que ja existe. O movimento do banco de horas so aparece para quem o tem.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DecidirHoraExtraDialog, type PedidoDecisao } from "@/components/rh-exemplo/fluxosC/DecidirHoraExtraDialog";
import { JustificacaoDiaRh } from "@/components/rh-exemplo/fluxosB/justificacaoDia/JustificacaoDiaRh";
import { EstadoHoraExtraBadge } from "@/components/rh-exemplo/fluxosC/EstadoHoraExtraBadge";
import { estadoVisivel, type HoraExtra } from "@/components/rh-exemplo/fluxosC/horasExtraRegras";
import { useTranslation } from "@/hooks/useTranslation";
import { ChipDoDia } from "./ChipDoDia";
import { JustificacaoDeDiaPessoa } from "./JustificacaoDeDiaPessoa";
import { JustificacaoDoDia } from "./JustificacaoDoDia";
import { duracao, duracaoComSinal, textoFeito, textoPrevisto } from "./formatos";
import type { DiaCalendario } from "./montarMes";

interface Props {
  dia: DiaCalendario | null;
  dataLonga: string;
  pessoaNome: string;
  /** O RH decide as horas extra (e nunca as proprias). */
  podeDecidir: boolean;
  /** Pode corrigir ou justificar no registo do dia; senao so o consulta. */
  podeCorrigir: boolean;
  /** Quem ve e a propria pessoa: nunca corrige, so justifica (dentro do prazo) e consulta. */
  souAPessoa?: boolean;
  pessoaId: string;
  aoFechar: () => void;
  aoAbrirRegisto: (data: string) => void;
}

function Seccao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground">{titulo}</h4>
      {children}
    </section>
  );
}

function LinhaHoraExtra({ hora, dataLonga, podeDecidir, aoDecidir }: {
  hora: HoraExtra; dataLonga: string; podeDecidir: boolean; aoDecidir: (hora: HoraExtra, decisao: "confirmar" | "rejeitar") => void;
}) {
  const { t } = useTranslation();
  const tempo = duracao(hora.minutos);
  return (
    <li className="space-y-2 rounded-md border p-3 text-sm" data-testid={`rhcal-he-${hora.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium tabular-nums">{tempo}</span>
        <EstadoHoraExtraBadge estado={estadoVisivel(hora)} />
        <span className="text-muted-foreground">{t(`rhFluxosC.he.origem.${hora.origem}`)}</span>
      </div>
      {hora.motivoOrigem && <p className="text-xs text-muted-foreground">{hora.motivoOrigem}</p>}
      {hora.motivoDecisao && <p className="text-xs text-muted-foreground">{t("rhCal.detalhe.motivoDecisao", { m: hora.motivoDecisao })}</p>}
      {hora.estado === "pendente" && podeDecidir && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" className="min-h-11" aria-label={t("rhCal.detalhe.confirmarAria", { t: tempo, dia: dataLonga })} onClick={() => aoDecidir(hora, "confirmar")}>
            {t("rhCal.detalhe.confirmar")}
          </Button>
          <Button type="button" size="sm" variant="outline" className="min-h-11" aria-label={t("rhCal.detalhe.rejeitarAria", { t: tempo, dia: dataLonga })} onClick={() => aoDecidir(hora, "rejeitar")}>
            {t("rhCal.detalhe.rejeitar")}
          </Button>
        </div>
      )}
    </li>
  );
}

export function DetalheDoDia({ dia, dataLonga, pessoaNome, podeDecidir, podeCorrigir, souAPessoa = false, pessoaId, aoFechar, aoAbrirRegisto }: Props) {
  const { t } = useTranslation();
  const [pedido, setPedido] = useState<PedidoDecisao | null>(null);
  if (!dia) return null;
  const decidir = (hora: HoraExtra, decisao: "confirmar" | "rejeitar") => setPedido({ hora, decisao, pessoaNome });
  const feito = textoFeito({ previsto: dia.previsto, feitos: dia.feitos, feitoMin: dia.feitoMin, passado: dia.passado, hoje: dia.hoje }, t);
  const semana = dia.semana;
  return (
    <>
      <Sheet open onOpenChange={(aberto) => !aberto && aoFechar()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md" data-testid="rhcal-detalhe">
          <SheetHeader>
            <SheetTitle className="capitalize">{dataLonga}</SheetTitle>
            <SheetDescription>{pessoaNome} · {t("rhCal.detalhe.ajuda")}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            <Seccao titulo={t("rhCal.detalhe.previsto")}>
              <p className="text-sm">{textoPrevisto(dia.previsto, t)}</p>
            </Seccao>
            <Seccao titulo={t("rhCal.detalhe.feito")}>
              {feito && <p className="text-sm">{feito}</p>}
              {dia.previsto.tipo !== "isencao" && (dia.picagens.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("rhCal.detalhe.semPicagens")}</p>
              ) : (
                <ul className="space-y-1 text-sm tabular-nums" aria-label={t("rhCal.detalhe.picagens")}>
                  {dia.picagens.map((p) => <li key={p.id}>{t(p.sentido === "entrada" ? "rhCal.detalhe.entrada" : "rhCal.detalhe.saida", { h: p.hora })}</li>)}
                </ul>
              ))}
              {semana && (
                <p className="text-sm text-muted-foreground tabular-nums">
                  {t("rhCal.detalhe.semana", { de: semana.de.slice(5).split("-").reverse().join("/"), ate: semana.ate.slice(5).split("-").reverse().join("/"), feito: duracao(semana.feitoMin), alvo: duracao(semana.alvoMin) })}
                </p>
              )}
            </Seccao>
            <Seccao titulo={t("rhCal.detalhe.diferenca")}>
              {dia.chips.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("rhCal.detalhe.semDiferenca")}</p>
              ) : (
                <div className="flex flex-col items-start gap-1.5">{dia.chips.map((c, i) => <ChipDoDia key={`${c.tipo}-${c.refId ?? i}`} chip={c} />)}</div>
              )}
            </Seccao>
            <Seccao titulo={t("rhCal.detalhe.horasExtra")}>
              {dia.horasExtra.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("rhCal.detalhe.semHorasExtra")}</p>
              ) : (
                <ul className="space-y-2">
                  {dia.horasExtra.map((h) => <LinhaHoraExtra key={h.id} hora={h} dataLonga={dataLonga} podeDecidir={podeDecidir} aoDecidir={decidir} />)}
                </ul>
              )}
            </Seccao>
            {dia.banco.length > 0 && (
              <Seccao titulo={t("rhCal.detalhe.banco")}>
                <ul className="space-y-1 text-sm">
                  {dia.banco.map((m) => <li key={m.id}><span className="font-medium tabular-nums">{duracaoComSinal(m.minutos)}</span> · {m.motivo}</li>)}
                </ul>
              </Seccao>
            )}
            {souAPessoa ? (
              <>
                <JustificacaoDeDiaPessoa dia={dia} pessoaId={pessoaId} />
                <JustificacaoDoDia pessoaId={pessoaId} data={dia.data} />
              </>
            ) : (
              <>
                <JustificacaoDiaRh pessoaId={pessoaId} pessoaNome={pessoaNome} data={dia.data} />
                <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => aoAbrirRegisto(dia.data)}>
                  {t(podeCorrigir ? "rhCal.detalhe.corrigir" : "rhCal.detalhe.verRegisto")}
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <DecidirHoraExtraDialog pedido={pedido} aoFechar={() => setPedido(null)} />
    </>
  );
}
