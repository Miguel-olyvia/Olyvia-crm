/**
 * Faltas e justificacoes (fluxo 7). O sistema so SUGERE a falta (uma linha na lista do RH, que nao desconta
 * nada); o RH MARCA (dia, hora de inicio e de fim). Cada falta tem o estado da justificacao em texto e abre o
 * detalhe, onde se justifica, se decide e se ve o calculo de exemplo do desconto. O prazo para justificar e uma
 * regra da organizacao, configuravel aqui.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { useGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { definirPrazoDeJustificacao } from "@/components/rh-exemplo/dados/accoesAssiduidadeB";
import { FaltaDetalhe } from "@/components/rh-exemplo/fluxosB/faltas/FaltaDetalhe";
import { MarcarFaltaForm, type FaltaPreenchida } from "@/components/rh-exemplo/fluxosB/faltas/MarcarFaltaForm";
import { formatarData, formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { rotuloDaJustificacao, sugestoesDeFalta } from "@/components/rh-exemplo/lib/faltasB";

export function FaltasPainel() {
  const { t } = useTranslation();
  const faltas = useGestao((g) => g.faltas);
  const alertas = useFluxosB((e) => e.alertas);
  const prazoDias = useFluxosB((e) => e.prazoFaltaDias);
  const fichas = useEstadoRh((e) => e.fichas);
  const [marcar, setMarcar] = useState<{ inicial: FaltaPreenchida | null } | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  const nomeDe = (pessoaId: string): string => fichas[pessoaId]?.pessoa.nome_completo ?? pessoaId;
  const sugestoes = useMemo(() => sugestoesDeFalta(alertas, faltas), [alertas, faltas]);
  const ordenadas = useMemo(
    () => [...faltas].sort((a, b) => b.data.localeCompare(a.data) || b.hora_inicio.localeCompare(a.hora_inicio)),
    [faltas],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("rhExemplo.fal.titulo")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("rhExemplo.fal.ajuda")}</p>
          <div className="flex flex-wrap items-end gap-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="rhb-prazo-falta">{t("rhExemplo.fal.prazoConfig")}</Label>
              <Input
                id="rhb-prazo-falta"
                type="number"
                min={1}
                max={30}
                className="min-h-11 w-28"
                value={prazoDias}
                onChange={(e) => definirPrazoDeJustificacao(Number(e.target.value))}
              />
            </div>
            {marcar === null && (
              <Button type="button" className="min-h-11" onClick={() => setMarcar({ inicial: null })}>
                {t("rhExemplo.fal.marcarTitulo")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {marcar && <MarcarFaltaForm key={marcar.inicial?.alertaId ?? "livre"} inicial={marcar.inicial} onFechar={() => setMarcar(null)} />}

          <section aria-label={t("rhExemplo.fal.sugestoesTitulo")} className="space-y-2">
            <h3 className="text-sm font-semibold">{t("rhExemplo.fal.sugestoesTitulo")}</h3>
            <p className="text-xs text-muted-foreground">{t("rhExemplo.fal.sugestoesAjuda")}</p>
            {sugestoes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("rhExemplo.fal.semSugestoes")}</p>
            ) : (
              <ul className="divide-y">
                {sugestoes.map((s) => (
                  <li key={s.alertaId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <span className="min-w-40 font-medium">{nomeDe(s.pessoaId)}</span>
                    <span className="tabular-nums">{formatarData(s.data)}</span>
                    <span className="tabular-nums text-muted-foreground">{`${s.inicio}–${s.fim} · ${formatarHorasMinutos(s.minutos)}`}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="ml-auto min-h-11"
                      onClick={() => setMarcar({ inicial: { pessoaId: s.pessoaId, data: s.data, inicio: s.inicio, fim: s.fim, alertaId: s.alertaId } })}
                    >
                      {t("rhExemplo.fal.marcarEsta")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label={t("rhExemplo.fal.listaTitulo")} className="space-y-2">
            <h3 className="text-sm font-semibold">{t("rhExemplo.fal.listaTitulo")}</h3>
            {ordenadas.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("rhExemplo.fal.semFaltas")}</p>
            ) : (
              <ul className="divide-y">
                {ordenadas.map((falta) => (
                  <li key={falta.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <span className="min-w-40 font-medium">{nomeDe(falta.pessoa_id)}</span>
                    <span className="tabular-nums">{formatarData(falta.data)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {`${falta.hora_inicio.slice(0, 5)}–${falta.hora_fim.slice(0, 5)} · ${formatarHorasMinutos(falta.minutos)}`}
                    </span>
                    <Badge variant="outline" className="font-normal">
                      {falta.estado === "activa" ? t(`rhExemplo.fal.estado.${rotuloDaJustificacao(falta)}`) : t(`rhExemplo.fal.estadoFalta.${falta.estado}`)}
                    </Badge>
                    <Button type="button" size="sm" variant="ghost" className="ml-auto min-h-11" onClick={() => setAberta(falta.id)}>
                      {t("rhExemplo.fal.verDetalhe")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </CardContent>
      </Card>

      {aberta && <FaltaDetalhe faltaId={aberta} onFechar={() => setAberta(null)} />}
    </div>
  );
}
