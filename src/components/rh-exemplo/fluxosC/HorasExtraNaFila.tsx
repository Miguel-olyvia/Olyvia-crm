/**
 * As horas extra PENDENTES da base como linhas da fila de trabalho do RH (separador «Fila de trabalho» do mapa de assiduidade).
 * Cada linha e UMA hora extra (com a marca «acima do limite» e/ou «sem autorizacao» quando for o caso). Confirmar e Rejeitar
 * abrem o dialogo de decisao, que chama a base; as ja tratadas saem daqui. «Detetar» cria as pendentes a partir do horario
 * planeado e das horas realizadas; «Registar tempo a mais» cria uma a mao.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHorasExtraListar } from "@/components/rh-exemplo/hooks/horasExtraReal";
import { usePermissoesAssiduidade } from "@/components/rh-exemplo/hooks/usePermissoesAssiduidade";
import { useTranslation } from "@/hooks/useTranslation";
import { DecidirHoraExtraDialog, type PedidoDecisao } from "./DecidirHoraExtraDialog";
import { DetetarHorasExtraDialog } from "./DetetarHorasExtraDialog";
import { EstadoHoraExtraBadge } from "./EstadoHoraExtraBadge";
import { dataCurta, minutosEmHoras } from "./formatosC";
import type { HoraExtra } from "./horasExtraRegras";
import { RegistarTempoAMaisDialog } from "./RegistarTempoAMaisDialog";

/** Quantas horas extra esperam decisao (para o contador do separador). 0 enquanto carrega, sem permissao de ver ou se a leitura falhar. */
export function usePendentesHorasExtra(): number {
  const { permissoes } = usePermissoesAssiduidade();
  const { total } = useHorasExtraListar({ estado: "pendente", enabled: permissoes.view });
  return total;
}

export function HorasExtraNaFila() {
  const { t } = useTranslation();
  const { permissoes, loading: permissoesALoad } = usePermissoesAssiduidade();
  const { horas, total, aCarregar, erro } = useHorasExtraListar({ estado: "pendente", enabled: permissoes.view });
  const [pedido, setPedido] = useState<PedidoDecisao | null>(null);
  const [registarAberto, setRegistarAberto] = useState(false);
  const [detetarAberto, setDetetarAberto] = useState(false);

  const pendentes = useMemo(() => [...horas].sort((a, b) => b.data.localeCompare(a.data)), [horas]);
  const nome = (h: HoraExtra): string => h.pessoaNome || t("rhHeReal.pessoaSemNome");
  const decidir = (hora: HoraExtra, decisao: "confirmar" | "rejeitar") => setPedido({ hora, decisao, pessoaNome: nome(hora) });

  return (
    <Card aria-labelledby="rhd-fila-he-titulo" data-testid="rhd-fila-horas-extra">
      <CardHeader className="pb-3">
        <CardTitle id="rhd-fila-he-titulo" className="text-base">{t("rhFluxosD.fila.horasExtraTitulo")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("rhFluxosD.fila.horasExtraAjuda")}</p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {!permissoes.view ? "" : aCarregar ? t("rhHeReal.aCarregar") : t("rhFluxosD.fila.contagem", { n: String(total) })}
          </p>
          {permissoes.gerir && (
            <>
              <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setDetetarAberto(true)}>
                {t("rhHeReal.detetar.abrir")}
              </Button>
              <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setRegistarAberto(true)}>
                {t("rhFluxosC.he.registar.abrir")}
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!permissoes.view ? (
          <p role="note" className="py-6 text-center text-sm text-muted-foreground">{permissoesALoad ? t("rhHeReal.aCarregar") : t("rhHeReal.semPermissaoVer")}</p>
        ) : erro ? (
          <p role="alert" className="py-6 text-center text-sm text-destructive">{t("rhHeReal.listaErro", { erro })}</p>
        ) : pendentes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{aCarregar ? t("rhHeReal.aCarregar") : t("rhFluxosD.fila.vazia")}</p>
        ) : (
          <>
          {total > pendentes.length && (
            <p role="note" className="pb-2 text-xs text-muted-foreground">{t("rhHeReal.listaCortada", { n: String(pendentes.length), total: String(total) })}</p>
          )}
          <ul className="divide-y">
            {pendentes.map((h) => (
              <li key={h.id} data-testid={`rhd-fila-he-${h.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm">
                <span className="min-w-40 font-medium">{nome(h)}</span>
                <span className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                  {t("rhFluxosD.fila.chip")}
                </span>
                {h.acimaDoLimite && <EstadoHoraExtraBadge estado="acima_limite" />}
                {h.semAutorizacao === true && (
                  <span className="inline-flex items-center rounded-full border border-destructive/50 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                    {t("rhHeReal.semAutorizacao")}
                  </span>
                )}
                <span className="tabular-nums text-muted-foreground">{dataCurta(h.data)}</span>
                <span className="tabular-nums">{t("rhFluxosD.fila.tempoAMais", { t: minutosEmHoras(h.minutos) })}</span>
                {h.nocturnoMin > 0 && <span className="tabular-nums text-muted-foreground">{t("rhHeReal.nocturnas", { t: minutosEmHoras(h.nocturnoMin) })}</span>}
                <span className="text-muted-foreground">{t(`rhFluxosC.he.origem.${h.origem}`)}</span>
                {h.horaInicio && h.horaFim && (
                  <span className="tabular-nums text-muted-foreground">{t("rhHeReal.tramo", { de: h.horaInicio, ate: h.horaFim })}</span>
                )}
                {h.motivoOrigem && <span className="basis-full text-xs text-muted-foreground">{h.motivoOrigem}</span>}
                {permissoes.gerir && (
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-11"
                      onClick={() => decidir(h, "confirmar")}
                      aria-label={t("rhFluxosD.fila.accaoConfirmar", { pessoa: nome(h), dia: dataCurta(h.data) })}
                    >
                      {t("rhFluxosC.he.acao.confirmar")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => decidir(h, "rejeitar")}
                      aria-label={t("rhFluxosD.fila.accaoRejeitar", { pessoa: nome(h), dia: dataCurta(h.data) })}
                    >
                      {t("rhFluxosC.he.acao.rejeitar")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          </>
        )}
      </CardContent>
      <DecidirHoraExtraDialog pedido={pedido} aoFechar={() => setPedido(null)} />
      <RegistarTempoAMaisDialog aberto={registarAberto} aoFechar={() => setRegistarAberto(false)} />
      <DetetarHorasExtraDialog aberto={detetarAberto} aoFechar={() => setDetetarAberto(false)} />
    </Card>
  );
}
