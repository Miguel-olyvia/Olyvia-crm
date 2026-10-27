/**
 * «Como chegámos a este valor»: cada passo do calculo REAL do processamento da pessoa (o mesmo da «Visao geral»), com
 * a conta e o valor, e os valores pontuais do periodo (que se podem anular enquanto o periodo estiver aberto).
 */
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/hooks/useTranslation";
import type { ResultadoCalculoReal } from "@/components/rh-exemplo/processamento/calculoReal";
import type { AvisoProcessamento } from "@/components/rh-exemplo/lib/processamentoTotais";
import type { HrProcessamentoLancamento } from "@/components/rh-exemplo/tipos";
import { euros } from "./formatosC";

interface Props {
  pessoa: { id: string; nome: string } | null;
  calculo: ResultadoCalculoReal | null;
  lancamentos: readonly HrProcessamentoLancamento[];
  /** Sem permissao para ver retribuicoes: nao ha passos para mostrar. */
  retribuicaoRecusada: boolean;
  /** Pode anular lancamentos (permissao e periodo aberto). */
  podeAnular: boolean;
  aoAnular: (lancamento: HrProcessamentoLancamento) => void;
  aoFechar: () => void;
}

const AVISO_CHAVE: Record<AvisoProcessamento, string> = {
  sem_retribuicao: "hr.vencimento.visaoGeral.avisoSemRetribuicao",
  periodicidade_nao_convertivel: "hr.vencimento.visaoGeral.avisoPeriodicidadeNaoConvertivel",
  duodecimos_por_decidir: "hr.vencimento.visaoGeral.avisoDuodecimosPorDecidir",
  sem_subsidio_pessoa: "hr.vencimento.visaoGeral.avisoSemSubsidioPessoa",
  sem_horas_planeadas_no_mes: "hr.vencimento.visaoGeral.avisoSemHorasPlaneadasNoMes",
};

const PERIODICIDADES = new Set(["mensal", "anual", "semanal", "diaria", "hora"]);

const num = (n: number, casas = 2): string => n.toFixed(casas).replace(".", ",");

function Passo({ titulo, conta, valor }: { titulo: string; conta?: string; valor?: string }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b py-2 last:border-b-0">
      <div className="min-w-0">
        <span className="text-sm font-medium">{titulo}</span>
        {conta && <span className="block text-xs tabular-nums text-muted-foreground">{conta}</span>}
      </div>
      {valor && <span className="text-sm font-semibold tabular-nums">{valor}</span>}
    </li>
  );
}

export function ProcessamentoDetalheDialog({ pessoa, calculo, lancamentos, retribuicaoRecusada, podeAnular, aoAnular, aoFechar }: Props) {
  const { t } = useTranslation();
  if (!pessoa) return null;
  const resultado = calculo?.resultado ?? null;

  return (
    <Dialog open onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("rhFluxosC.proc.detalhe.titulo")}</DialogTitle>
          <DialogDescription>{pessoa.nome}</DialogDescription>
        </DialogHeader>

        {retribuicaoRecusada ? (
          <p role="status" className="text-sm text-muted-foreground">{t("hr.vencimento.visaoGeral.semPermissaoRetribuicao")}</p>
        ) : !resultado || !calculo ? (
          <p role="status" className="text-sm text-muted-foreground">{t("rhProcReal.aCalcular", { n: 1 })}</p>
        ) : (
          <>
            {(resultado.avisos.length > 0 || calculo.mudouAMeioDoMes) && (
              <ul className="space-y-1" aria-label={t("rhFluxosC.proc.avisos")}>
                {resultado.avisos.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t(AVISO_CHAVE[a])}
                  </li>
                ))}
                {calculo.mudouAMeioDoMes && (
                  <li className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t("hr.vencimento.visaoGeral.avisoRetribuicaoMudouAMeioDoMes")}
                  </li>
                )}
              </ul>
            )}
            <ol className="max-h-[55vh] overflow-y-auto pr-1">
              <Passo
                titulo={t("hr.vencimento.visaoGeral.detalheSalarioBase")}
                conta={
                  calculo.valorBase === null
                    ? undefined
                    : `${euros(calculo.valorBase)}${calculo.periodicidade && PERIODICIDADES.has(calculo.periodicidade) ? ` · ${t(`rhFluxosC.proc.periodicidade.${calculo.periodicidade}`)}` : ""}`
                }
                valor={resultado.baseMes === null ? "—" : euros(resultado.baseMes)}
              />
              {resultado.divisorDuodecimos !== null && (
                <Passo titulo={t("hr.vencimento.visaoGeral.detalheDivisorDuodecimos")} valor={num(resultado.divisorDuodecimos, 3)} />
              )}
              <Passo
                titulo={t("hr.vencimento.visaoGeral.detalheValorHoraReal")}
                conta={resultado.valorHoraReal === null ? undefined : `${num(calculo.totais.planeadoMinutos / 60, 1)} h`}
                valor={resultado.valorHoraReal === null ? "—" : `${num(resultado.valorHoraReal, 4)} €`}
              />
              {resultado.linhasAutomaticas.length === 0 ? (
                <Passo titulo={t("hr.vencimento.visaoGeral.colunaCodigosAplicados")} conta={t("hr.vencimento.visaoGeral.detalheSemCodigos")} />
              ) : (
                resultado.linhasAutomaticas.map((l) => (
                  <Passo
                    key={l.codigoId}
                    titulo={`${l.codigo} · ${l.nome}`}
                    conta={l.horas === null ? undefined : `${num(Math.round(l.horas * 100) / 100)} h`}
                    valor={euros(l.valor)}
                  />
                ))
              )}
              <Passo titulo={t("hr.vencimento.visaoGeral.detalheDescontoFaltas")} valor={resultado.descontoFaltas > 0 ? `−${euros(resultado.descontoFaltas)}` : euros(0)} />
              <Passo titulo={t("hr.vencimento.visaoGeral.detalheSubsidioAlimentacao")} valor={euros(resultado.subsidioAlimentacao)} />
              <Passo titulo={t("hr.vencimento.visaoGeral.detalheLancamentosPontuais")} valor={euros(resultado.lancamentosPontuais)} />
              <li className="flex items-baseline justify-between gap-4 pt-3">
                <span className="text-sm font-semibold">{t("hr.vencimento.visaoGeral.colunaTotalBrutoEstimado")}</span>
                <span className="text-lg font-bold tabular-nums">{resultado.totalBrutoEstimado === null ? t("rhFluxosC.proc.semValor") : euros(resultado.totalBrutoEstimado)}</span>
              </li>
            </ol>
          </>
        )}

        {lancamentos.length > 0 && (
          <ul className="space-y-1 border-t pt-3 text-sm" aria-label={t("hr.vencimento.visaoGeral.detalheLancamentosPontuais")}>
            {lancamentos.map((l) => (
              <li key={l.id} className={`flex flex-wrap items-center justify-between gap-2 ${l.anulado_em ? "text-muted-foreground line-through" : ""}`}>
                <span>{l.descricao} <span className="tabular-nums">{euros(l.valor)}</span></span>
                {!l.anulado_em && podeAnular && (
                  <Button type="button" size="sm" variant="ghost" className="min-h-11 text-destructive" onClick={() => aoAnular(l)}>
                    {t("hr.vencimento.visaoGeral.anular")}
                    <span className="sr-only"> {l.descricao}</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
