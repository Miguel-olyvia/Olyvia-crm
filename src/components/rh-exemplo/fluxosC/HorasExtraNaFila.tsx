/**
 * As horas extra PENDENTES como linhas da fila de trabalho do RH (separador «Fila de trabalho» do mapa de assiduidade).
 * Confirmar e Rejeitar usam o mesmo diálogo e a mesma ação do store da frente C que a página «Horas extra»; as já
 * tratadas saem daqui (a página continua a ter os filtros e o histórico).
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useTranslation } from "@/hooks/useTranslation";
import { DecidirHoraExtraDialog, type PedidoDecisao } from "./DecidirHoraExtraDialog";
import { EstadoHoraExtraBadge } from "./EstadoHoraExtraBadge";
import { dataCurta, minutosEmHoras } from "./formatosC";
import type { HoraExtra } from "./horasExtraRegras";
import { RegistarTempoAMaisDialog } from "./RegistarTempoAMaisDialog";
import { useFluxosC } from "./lojaFluxosC";

const ehPendente = (h: HoraExtra): boolean => h.estado === "pendente";

/** Quantas horas extra esperam decisão (para o contador do separador). */
export function usePendentesHorasExtra(): number {
  return useFluxosC((e) => e.horasExtra.filter(ehPendente).length);
}

export function HorasExtraNaFila() {
  const { t } = useTranslation();
  const horas = useFluxosC((e) => e.horasExtra);
  const fichas = useEstadoRh((e) => e.fichas);
  const [pedido, setPedido] = useState<PedidoDecisao | null>(null);
  const [registarAberto, setRegistarAberto] = useState(false);

  const pendentes = useMemo(() => horas.filter(ehPendente).sort((a, b) => b.data.localeCompare(a.data)), [horas]);
  const nome = (id: string): string => fichas[id]?.pessoa.nome_completo ?? id;
  const decidir = (hora: HoraExtra, decisao: "confirmar" | "rejeitar") =>
    setPedido({ hora, decisao, pessoaNome: nome(hora.pessoaId) });

  return (
    <Card aria-labelledby="rhd-fila-he-titulo" data-testid="rhd-fila-horas-extra">
      <CardHeader className="pb-3">
        <CardTitle id="rhd-fila-he-titulo" className="text-base">{t("rhFluxosD.fila.horasExtraTitulo")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("rhFluxosD.fila.horasExtraAjuda")}</p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {t("rhFluxosD.fila.contagem", { n: String(pendentes.length) })}
          </p>
          <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setRegistarAberto(true)}>
            {t("rhFluxosC.he.registar.abrir")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {pendentes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("rhFluxosD.fila.vazia")}</p>
        ) : (
          <ul className="divide-y">
            {pendentes.map((h) => (
              <li key={h.id} data-testid={`rhd-fila-he-${h.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm">
                <span className="min-w-40 font-medium">{nome(h.pessoaId)}</span>
                <span className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                  {t("rhFluxosD.fila.chip")}
                </span>
                {h.acimaDoLimite && <EstadoHoraExtraBadge estado="acima_limite" />}
                <span className="tabular-nums text-muted-foreground">{dataCurta(h.data)}</span>
                <span className="tabular-nums">{t("rhFluxosD.fila.tempoAMais", { t: minutosEmHoras(h.minutos) })}</span>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11"
                    onClick={() => decidir(h, "confirmar")}
                    aria-label={t("rhFluxosD.fila.accaoConfirmar", { pessoa: nome(h.pessoaId), dia: dataCurta(h.data) })}
                  >
                    {t("rhFluxosC.he.acao.confirmar")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => decidir(h, "rejeitar")}
                    aria-label={t("rhFluxosD.fila.accaoRejeitar", { pessoa: nome(h.pessoaId), dia: dataCurta(h.data) })}
                  >
                    {t("rhFluxosC.he.acao.rejeitar")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <DecidirHoraExtraDialog pedido={pedido} aoFechar={() => setPedido(null)} />
      <RegistarTempoAMaisDialog aberto={registarAberto} aoFechar={() => setRegistarAberto(false)} />
    </Card>
  );
}
