/**
 * Separador «Cálculo do mês»: o total bruto ESTIMADO de cada pessoa activa, passo a passo, e o fecho do periodo.
 * Tudo vem do processamento salarial real: assiduidade, retribuicoes vigentes, codigos activos e valores pontuais
 * (`hr_processamento_lancamentos`) pelo mesmo calculo da «Visao geral» (`useCalculoRealDoMes`). O periodo
 * (`hr_periodos_processamento`) abre-se e fecha-se por RPC; nao ha reabertura nem recibo guardado (ver FecharReabrirMes).
 */
import { useMemo, useRef, useState } from "react";
import { Eye, Lock, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { SemAcessoCard } from "@/components/rh-exemplo/SemAcessoCard";
import { usePermissions } from "@/components/rh-exemplo/hooks/usePermissions";
import { totalDoMes } from "@/components/rh-exemplo/processamento/calculoReal";
import { mesPorOmissao } from "@/components/rh-exemplo/processamento/mesPorOmissao";
import { RecolhaDeAssiduidade, useCalculoRealDoMes } from "@/components/rh-exemplo/processamento/useCalculoReal";
import type { HrProcessamentoLancamento } from "@/components/rh-exemplo/tipos";
import { useTranslation } from "@/hooks/useTranslation";
import { euros, dataCurta, nomeDoMes } from "./formatosC";
import { FecharReabrirMes } from "./FecharReabrirMes";
import { AnularLancamentoDialog, PontualDialog } from "./PontualDialog";
import { ProcessamentoDetalheDialog } from "./ProcessamentoDetalheDialog";

const COLUNAS_NUMERICAS = ["base", "codigos", "faltas", "subsidios", "pontuais", "total"] as const;
const CHAVE_COLUNA: Record<(typeof COLUNAS_NUMERICAS)[number], string> = {
  base: "rhFluxosC.proc.coluna.base",
  codigos: "rhProcReal.coluna.codigos",
  faltas: "rhProcReal.coluna.faltas",
  subsidios: "rhFluxosC.proc.coluna.subsidios",
  pontuais: "rhFluxosC.proc.coluna.pontuais",
  total: "rhFluxosC.proc.coluna.total",
};

export function ProcessamentoFluxoTab() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const [mes, setMes] = useState(mesPorOmissao);
  const ano = Number(mes.slice(0, 4)) || 0;
  const mesNum = Number(mes.slice(5, 7)) || 1;
  const calculo = useCalculoRealDoMes(ano, mesNum);
  const [detalhe, setDetalhe] = useState<{ id: string; nome: string } | null>(null);
  const [pontual, setPontual] = useState<{ id: string; nome: string } | null>(null);
  const [paraAnular, setParaAnular] = useState<HrProcessamentoLancamento | null>(null);
  const estadoDoMesRef = useRef<HTMLParagraphElement>(null);

  const podeVerPeriodo = hasPermission("hr.processamento.periodo.view");
  const podeGerirPeriodo = hasPermission("hr.processamento.periodo.gerir");
  const podeGerirLancamentos = hasPermission("hr.processamento.lancamentos.gerir");

  const { periodoHook, lancamentosHook, retribuicoesHook, resultados, pessoasActivas } = calculo;
  const { periodo } = periodoHook;
  const fechado = periodo?.estado === "fechado";
  const semRetribuicoes = retribuicoesHook.recusado;
  const total = useMemo(() => totalDoMes(resultados.values()), [resultados]);

  if (!podeVerPeriodo) return <SemAcessoCard className="m-0" />;

  // `periodoHook.loading` so e true no primeiro carregamento de um mes: abrir/fechar relê em silencio, por isso a
  // tabela, a recolha de assiduidade e o botao nao desmontam (nem repetem pedidos) a cada mudanca de estado.
  const aCarregar = periodoHook.loading || calculo.pessoasACarregar;
  // O botao que se clicou pode desaparecer (fechado nao tem botao): o foco passa para a mensagem de estado do mes.
  const depoisDeGravar = (accao: () => Promise<string | null>) => async (): Promise<string | null> => {
    const erro = await accao();
    if (!erro) requestAnimationFrame(() => estadoDoMesRef.current?.focus());
    return erro;
  };
  const celula = (valor: number | null | undefined, ligado: boolean): string =>
    !ligado || valor === null || valor === undefined ? "—" : euros(valor);
  const anular = (l: HrProcessamentoLancamento) => {
    setDetalhe(null);
    setParaAnular(l);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-48">
          <Label htmlFor="fluxo-mes" className="mb-1.5 block">{t("rhFluxosC.proc.mes")}</Label>
          <input id="fluxo-mes" type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        {!aCarregar && (
          <FecharReabrirMes
            mes={mes} periodo={periodo} podeGerir={podeGerirPeriodo} aGravar={periodoHook.saving}
            aoAbrir={depoisDeGravar(periodoHook.abrir)} aoFechar={depoisDeGravar(periodoHook.fechar)}
          />
        )}
      </div>

      {calculo.pessoasErro && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t("rhProcReal.erro.pessoas", { erro: calculo.pessoasErro })}
        </p>
      )}
      {periodoHook.recusado && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{t("rhProcReal.aviso.periodoRecusado")}</p>}
      {semRetribuicoes && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{t("rhProcReal.aviso.retribuicaoRecusada")}</p>}
      {lancamentosHook.recusado && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{t("rhProcReal.aviso.lancamentosRecusados")}</p>}
      {calculo.incompletas > 0 && (
        <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{t("rhProcReal.aviso.assiduidadeIncompleta", { n: calculo.incompletas })}</p>
      )}

      {aCarregar ? (
        <div className="flex justify-center py-12"><OlyviaLoader /></div>
      ) : !periodo ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <p>{t("hr.vencimento.visaoGeral.semPeriodo")}</p>
            {!podeGerirPeriodo && <p className="mt-2">{t("hr.vencimento.visaoGeral.semPermissaoAbrir")}</p>}
          </CardContent>
        </Card>
      ) : (
        <>
          <RecolhaDeAssiduidade calculo={calculo} ano={ano} mes={mesNum} />

          {fechado ? (
            <p ref={estadoDoMesRef} tabIndex={-1} role="status" className="flex items-start gap-2 rounded-md border bg-muted/50 p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {t("rhProcReal.periodoFechado", { mes: nomeDoMes(mes), data: periodo.fechado_em ? dataCurta(periodo.fechado_em.slice(0, 10)) : "—" })}
              {" "}{t("rhProcReal.semReabrir")}
            </p>
          ) : (
            <p ref={estadoDoMesRef} tabIndex={-1} className="text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("rhProcReal.periodoAberto", { mes: nomeDoMes(mes) })}</p>
          )}
          {calculo.pendentes > 0 && <p role="status" className="text-sm text-muted-foreground">{t("rhProcReal.aCalcular", { n: calculo.pendentes })}</p>}

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("rhFluxosC.proc.tabela")}</caption>
                <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2">{t("rhFluxosC.proc.coluna.pessoa")}</th>
                    {COLUNAS_NUMERICAS.map((c) => (
                      <th key={c} scope="col" className="px-4 py-2 text-right">{t(CHAVE_COLUNA[c])}</th>
                    ))}
                    <th scope="col" className="px-4 py-2 text-right">{t("rhFluxosC.he.coluna.acoes")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pessoasActivas.map((pessoa) => {
                    const r = resultados.get(pessoa.id);
                    const res = r?.resultado;
                    const semValor = !semRetribuicoes && res?.totalBrutoEstimado === null;
                    return (
                      <tr key={pessoa.id} className="border-b align-top last:border-b-0">
                        <th scope="row" className="px-4 py-3 text-left font-medium">
                          {pessoa.nome_completo}
                          {res && res.avisos.length > 0 && (
                            <span className="mt-0.5 flex items-center gap-1 text-xs font-normal text-amber-800 dark:text-amber-300">
                              <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                              {t("rhFluxosC.proc.nAvisos", { n: res.avisos.length })}
                            </span>
                          )}
                        </th>
                        {!r || !res ? (
                          <td colSpan={COLUNAS_NUMERICAS.length} className="px-4 py-3 text-right"><OlyviaLoader size={16} /></td>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-right tabular-nums">{celula(res.baseMes, !semRetribuicoes)}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{celula(res.totalCodigosAutomaticos, !semRetribuicoes)}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{celula(res.descontoFaltas > 0 ? -res.descontoFaltas : 0, !semRetribuicoes)}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{celula(res.subsidioAlimentacao, !semRetribuicoes)}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{euros(res.lancamentosPontuais)}</td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums">
                              {semValor ? t("rhFluxosC.proc.semValor") : celula(res.totalBrutoEstimado, !semRetribuicoes)}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => setDetalhe({ id: pessoa.id, nome: pessoa.nome_completo })}>
                              <Eye className="mr-1 h-4 w-4" aria-hidden="true" />{t("rhFluxosC.proc.comoChegamos")}
                              <span className="sr-only"> {pessoa.nome_completo}</span>
                            </Button>
                            {podeGerirLancamentos && !fechado && (
                              <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setPontual({ id: pessoa.id, nome: pessoa.nome_completo })}>
                                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />{t("rhFluxosC.proc.pontual.abrir")}
                                <span className="sr-only"> {pessoa.nome_completo}</span>
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
                    <th scope="row" colSpan={COLUNAS_NUMERICAS.length} className="px-4 py-3 text-left text-sm">{t("rhFluxosC.proc.totalMes")}</th>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                      {semRetribuicoes || calculo.pendentes > 0 ? "—" : euros(total.total)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
          {!semRetribuicoes && calculo.pendentes === 0 && total.semValor > 0 && (
            <p className="text-xs text-muted-foreground">{t("rhProcReal.totalSemValor", { n: total.semValor })}</p>
          )}
        </>
      )}

      <ProcessamentoDetalheDialog
        pessoa={detalhe}
        calculo={detalhe ? resultados.get(detalhe.id) ?? null : null}
        lancamentos={detalhe ? calculo.lancamentosPorPessoa.get(detalhe.id) ?? [] : []}
        retribuicaoRecusada={semRetribuicoes}
        podeAnular={podeGerirLancamentos && !fechado}
        aoAnular={anular}
        aoFechar={() => setDetalhe(null)}
      />
      <PontualDialog
        pessoa={pontual}
        codigosActivos={calculo.codigosActivos}
        aGravar={lancamentosHook.saving}
        aoGuardar={lancamentosHook.criar}
        aoFechar={() => setPontual(null)}
      />
      <AnularLancamentoDialog
        lancamento={paraAnular}
        aGravar={lancamentosHook.saving}
        aoAnular={lancamentosHook.anular}
        aoFechar={() => setParaAnular(null)}
      />
    </div>
  );
}
