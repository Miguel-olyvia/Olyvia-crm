/**
 * Separador «Cálculo do mês» (fluxo 10): o total bruto de cada pessoa activa, passo a passo, o fecho do mês
 * (cópia fiel e imutável = o recibo, em modo leitura) e a reabertura. Só as horas extra CONFIRMADAS entram.
 */
import { useMemo, useState } from "react";
import { Eye, Lock, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { mesAtual } from "./dadosFluxosC";
import { euros, dataCurta, nomeDoMes } from "./formatosC";
import { FecharReabrirMes } from "./FecharReabrirMes";
import { useFluxosC } from "./lojaFluxosC";
import { PontualDialog } from "./PontualDialog";
import { ProcessamentoDetalheDialog } from "./ProcessamentoDetalheDialog";
import { useCalculoDoMes } from "./salarioContexto";
import type { ReciboCongelado } from "./salarioFecho";

const somaLinhas = (r: ReciboCongelado, prefixo: string): number =>
  r.resultado.linhas.filter((l) => l.chave.startsWith(prefixo)).reduce((s, l) => s + l.valor, 0);

export function ProcessamentoFluxoTab() {
  const { t } = useTranslation();
  const [mes, setMes] = useState(mesAtual());
  const [ano, mesNum] = mes.split("-").map(Number);
  const fecho = useFluxosC((e) => e.fechos[mes]);
  const todasReaberturas = useFluxosC((e) => e.reaberturas);
  const reaberturas = useMemo(() => todasReaberturas.filter((r) => r.mes === mes), [todasReaberturas, mes]);
  const vivas = useCalculoDoMes(ano || 0, mesNum || 1);
  const [detalhe, setDetalhe] = useState<ReciboCongelado | null>(null);
  const [pontual, setPontual] = useState<{ id: string; nome: string } | null>(null);

  const recibos = useMemo<ReciboCongelado[]>(
    () => (fecho ? Object.values(fecho.recibos) : vivas),
    [fecho, vivas],
  );
  const total = fecho ? fecho.totalBruto : recibos.reduce((s, r) => s + (r.resultado.totalBruto ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-48">
          <Label htmlFor="fluxo-mes" className="mb-1.5 block">{t("rhFluxosC.proc.mes")}</Label>
          <input id="fluxo-mes" type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <FecharReabrirMes mes={mes} fechado={Boolean(fecho)} recibosParaFechar={vivas} />
      </div>

      {fecho ? (
        <p role="status" className="flex items-start gap-2 rounded-md border bg-muted/50 p-3 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t("rhFluxosC.proc.fecho.estado").replace("{quem}", fecho.fechadoPor).replace("{data}", dataCurta(fecho.fechadoEm.slice(0, 10)))}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t("rhFluxosC.proc.fecho.aberto").replace("{mes}", nomeDoMes(mes))}</p>
      )}
      {reaberturas.length > 0 && (
        <ul aria-label={t("rhFluxosC.proc.reabrir.registo")} className="space-y-1 text-xs text-muted-foreground">
          {reaberturas.map((r) => (
            <li key={r.reabertoEm}>{t("rhFluxosC.proc.reabrir.linhaRegisto").replace("{quem}", r.reabertoPor).replace("{data}", dataCurta(r.reabertoEm.slice(0, 10))).replace("{motivo}", r.motivo)}</li>
          ))}
        </ul>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("rhFluxosC.proc.tabela")}</caption>
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                {["pessoa", "base", "extra", "subsidios", "pontuais", "total"].map((c) => (
                  <th key={c} scope="col" className={`px-4 py-2 ${c !== "pessoa" ? "text-right" : ""}`}>{t(`rhFluxosC.proc.coluna.${c}`)}</th>
                ))}
                <th scope="col" className="px-4 py-2 text-right">{t("rhFluxosC.he.coluna.acoes")}</th>
              </tr>
            </thead>
            <tbody>
              {recibos.map((r) => {
                const semValor = r.resultado.totalBruto === null;
                return (
                  <tr key={r.pessoaId} className="border-b align-top last:border-b-0">
                    <th scope="row" className="px-4 py-3 text-left font-medium">
                      {r.pessoaNome}
                      {r.resultado.avisos.length > 0 && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs font-normal text-amber-800 dark:text-amber-300">
                          <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                          {t("rhFluxosC.proc.nAvisos").replace("{n}", String(r.resultado.avisos.length))}
                        </span>
                      )}
                    </th>
                    <td className="px-4 py-3 text-right tabular-nums">{semValor ? "—" : euros(r.resultado.base ?? 0)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{semValor ? "—" : euros(somaLinhas(r, "he_"))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{semValor ? "—" : euros(somaLinhas(r, "subsidio_"))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{semValor ? "—" : euros(somaLinhas(r, "pontual_"))}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{semValor ? t("rhFluxosC.proc.semValor") : euros(r.resultado.totalBruto ?? 0)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => setDetalhe(r)}>
                          <Eye className="mr-1 h-4 w-4" aria-hidden="true" />{t("rhFluxosC.proc.comoChegamos")}
                          <span className="sr-only"> {r.pessoaNome}</span>
                        </Button>
                        {!fecho && (
                          <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setPontual({ id: r.pessoaId, nome: r.pessoaNome })}>
                            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />{t("rhFluxosC.proc.pontual.abrir")}
                            <span className="sr-only"> {r.pessoaNome}</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30">
                <th scope="row" colSpan={5} className="px-4 py-3 text-left text-sm">{t("rhFluxosC.proc.totalMes")}</th>
                <td className="px-4 py-3 text-right font-bold tabular-nums">{euros(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <ProcessamentoDetalheDialog recibo={detalhe} congelado={Boolean(fecho)} aoFechar={() => setDetalhe(null)} />
      <PontualDialog pessoa={pontual} mes={mes} aoFechar={() => setPontual(null)} />
    </div>
  );
}
