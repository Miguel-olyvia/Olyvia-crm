/** A visão da pessoa: as suas horas extra (dia, tempo, origem, estado) e o total face aos limites. */
import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { EstadoHoraExtraBadge } from "./EstadoHoraExtraBadge";
import { dataCurta, minutosEmHoras } from "./formatosC";
import { estadoVisivel } from "./horasExtraRegras";
import { hojeLisboa, useHorasExtraAutorizacoes, useHorasExtraListar, useHorasExtraSaldo } from "@/components/rh-exemplo/hooks/horasExtraReal";
import { usePermissoesAssiduidade } from "@/components/rh-exemplo/hooks/usePermissoesAssiduidade";

const saldoAno = (hoje: string): number => Number(hoje.slice(0, 4));

export function HorasExtraDaPessoa({ pessoaId }: { pessoaId: string }) {
  const { t } = useTranslation();
  const { permissoes } = usePermissoesAssiduidade();
  const podeLer = permissoes.view || permissoes.viewOwn;
  // O saldo pede o ano corrente de Lisboa a propria base (ano = null); `ano` so serve para o titulo enquanto carrega.
  const ano = saldoAno(hojeLisboa());
  const lista = useHorasExtraListar({ pessoaId, enabled: podeLer });
  const { saldo, erro: erroSaldo } = useHorasExtraSaldo(pessoaId, null, podeLer);
  // «Pode fazer horas extra» so se le com `hr.assiduidade.view`; a propria pessoa (view.own) nao o ve.
  const autorizacoes = useHorasExtraAutorizacoes(permissoes.view);
  const pode = autorizacoes.pode(pessoaId);
  const minhas = useMemo(() => [...lista.horas].sort((a, b) => b.data.localeCompare(a.data)), [lista.horas]);
  const pct = saldo && saldo.limiteAnoMin > 0 ? Math.min(100, Math.round((saldo.totalAnoMin / saldo.limiteAnoMin) * 100)) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("rhFluxosC.pessoa.saldoTitulo").replace("{ano}", String(saldo?.ano ?? ano))}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {permissoes.view && !autorizacoes.aCarregar && !autorizacoes.erro && !pode && <p role="note" className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{t("rhFluxosC.pessoa.semMarca")}</p>}
          {erroSaldo && <p role="alert" className="text-sm text-destructive">{t("rhHeReal.saldo.erro", { erro: erroSaldo })}</p>}
          {saldo && (<>
          <div>
            <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-medium tabular-nums">{minutosEmHoras(saldo.totalAnoMin)} / {minutosEmHoras(saldo.limiteAnoMin)}</span>
              <span className="text-muted-foreground tabular-nums">
                {t("rhFluxosC.pessoa.restante").replace("{t}", minutosEmHoras(saldo.restanteMin))}
                {" · "}{t(saldo.limiteAnoOrigem === "regra" ? "rhHeReal.saldo.origemRegra" : "rhHeReal.saldo.origemOmissao")}
              </span>
            </div>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
              aria-label={t("rhFluxosC.pessoa.saldoTitulo").replace("{ano}", String(saldo?.ano ?? ano))}
              className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div className={`h-full motion-reduce:transition-none ${saldo.emAlerta ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
          {saldo.pendentesMin > 0 && <p className="text-xs text-muted-foreground">{t("rhHeReal.saldo.pendentes", { t: minutosEmHoras(saldo.pendentesMin) })}</p>}
          {saldo.emAlerta && (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {t(saldo.acimaDoLimite ? "rhFluxosC.pessoa.acimaLimite" : "rhFluxosC.pessoa.alerta")
                .replace("{pct}", String(saldo.alertaPct)).replace("{t}", minutosEmHoras((saldo.limiteAnoMin * saldo.alertaPct) / 100))}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t("rhFluxosC.pessoa.regraContagem").replace("{dia}", minutosEmHoras(saldo.limiteDiaMin))}</p>
          </>)}
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
              {lista.erro ? (
                <tr><td colSpan={4} role="alert" className="px-4 py-8 text-center text-destructive">{t("rhHeReal.listaErro", { erro: lista.erro })}</td></tr>
              ) : minhas.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">{lista.aCarregar ? t("rhHeReal.aCarregar") : t("rhFluxosC.pessoa.vazio")}</td></tr>
              ) : minhas.map((h) => (
                <tr key={h.id} className="border-b align-top last:border-b-0">
                  <td className="px-4 py-3 tabular-nums">{dataCurta(h.data)}</td>
                  <td className="px-4 py-3 tabular-nums">{minutosEmHoras(h.minutos)}</td>
                  <td className="px-4 py-3">
                    {t(`rhFluxosC.he.origem.${h.origem}`)}
                    {h.horaInicio && h.horaFim && <span className="block text-xs text-muted-foreground">{t("rhHeReal.tramo", { de: h.horaInicio, ate: h.horaFim })}</span>}
                    {h.motivoOrigem && <span className="block text-xs text-muted-foreground">{h.motivoOrigem}</span>}
                    {h.motivoDecisao && <span className="block text-xs text-muted-foreground">{t("rhFluxosC.he.motivoDecisao").replace("{m}", h.motivoDecisao)}</span>}
                  </td>
                  <td className="px-4 py-3"><EstadoHoraExtraBadge estado={estadoVisivel(h)} />
                    {h.semAutorizacao === true && <span className="mt-1 block text-xs text-destructive">{t("rhHeReal.semAutorizacao")}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
