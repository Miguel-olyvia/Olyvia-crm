/** A visão da pessoa: as suas horas extra (dia, tempo, origem, estado) e o total face aos limites. */
import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { useTranslation } from "@/hooks/useTranslation";
import { EstadoHoraExtraBadge } from "./EstadoHoraExtraBadge";
import { dataCurta, minutosEmHoras } from "./formatosC";
import { estadoVisivel, saldoDeLimites } from "./horasExtraRegras";
import { useFluxosC } from "./lojaFluxosC";
import { useLimiteAnualMin } from "./limitePessoa";

export function HorasExtraDaPessoa({ pessoaId }: { pessoaId: string }) {
  const { t } = useTranslation();
  const todas = useFluxosC((e) => e.horasExtra);
  const limites = useFluxosC((e) => e.limites);
  const pode = useFluxosC((e) => e.podeHE[pessoaId] === true);
  const ano = Number(hojeIso().slice(0, 4));
  const minhas = useMemo(() => todas.filter((h) => h.pessoaId === pessoaId).sort((a, b) => b.data.localeCompare(a.data)), [todas, pessoaId]);
  const limiteAno = useLimiteAnualMin(pessoaId, limites.anoMin);
  const saldo = saldoDeLimites(todas, pessoaId, ano, { ...limites, anoMin: limiteAno });
  const pct = Math.min(100, Math.round((saldo.anoMin / saldo.limiteAnoMin) * 100));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("rhFluxosC.pessoa.saldoTitulo").replace("{ano}", String(ano))}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!pode && <p role="note" className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{t("rhFluxosC.pessoa.semMarca")}</p>}
          <div>
            <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-medium tabular-nums">{minutosEmHoras(saldo.anoMin)} / {minutosEmHoras(saldo.limiteAnoMin)}</span>
              <span className="text-muted-foreground tabular-nums">
                {t("rhFluxosC.pessoa.restante").replace("{t}", minutosEmHoras(saldo.restanteMin))}
              </span>
            </div>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
              aria-label={t("rhFluxosC.pessoa.saldoTitulo").replace("{ano}", String(ano))}
              className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div className={`h-full motion-reduce:transition-none ${saldo.emAlerta ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
          {saldo.emAlerta && (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {t(saldo.acimaDoLimite ? "rhFluxosC.pessoa.acimaLimite" : "rhFluxosC.pessoa.alerta")
                .replace("{pct}", String(limites.alertaPct)).replace("{t}", minutosEmHoras(saldo.pontoAlertaMin))}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t("rhFluxosC.pessoa.regraContagem").replace("{dia}", minutosEmHoras(limites.diaMin))}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">{t("rhFluxosC.pessoa.listaTitulo")}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("rhFluxosC.pessoa.listaTitulo")}</caption>
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                {["dia", "tempo", "origem", "estado"].map((c) => <th key={c} scope="col" className="px-4 py-2">{t(`rhFluxosC.he.coluna.${c}`)}</th>)}
              </tr>
            </thead>
            <tbody>
              {minhas.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">{t("rhFluxosC.pessoa.vazio")}</td></tr>
              ) : minhas.map((h) => (
                <tr key={h.id} className="border-b align-top last:border-b-0">
                  <td className="px-4 py-3 tabular-nums">{dataCurta(h.data)}</td>
                  <td className="px-4 py-3 tabular-nums">{minutosEmHoras(h.minutos)}</td>
                  <td className="px-4 py-3">
                    {t(`rhFluxosC.he.origem.${h.origem}`)}
                    {h.motivoOrigem && <span className="block text-xs text-muted-foreground">{h.motivoOrigem}</span>}
                    {h.motivoDecisao && <span className="block text-xs text-muted-foreground">{t("rhFluxosC.he.motivoDecisao").replace("{m}", h.motivoDecisao)}</span>}
                  </td>
                  <td className="px-4 py-3"><EstadoHoraExtraBadge estado={estadoVisivel(h)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
