/**
 * O que se vê ao abrir um ativo comprado: quanto já amortizou desde a compra, em euros e em percentagem, com uma barra de progresso,
 * os meses decorridos sobre os totais, o que falta e o mês em que fica totalmente amortizado. Só mostra; a conta é de
 * `amortizacaoAtivo.ts` (a mesma do custo da pessoa no RH). O valor atual está em grande no topo da ficha, e a linha de vida por cima
 * desta barra desenha o mesmo.
 */
import { euros, pct } from "@/components/rh-exemplo/custo/formato";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Dado, TITULO_SECCAO } from "./DetalheBlocos";
import type { ResumoAmortizacao } from "./lib/amortizacaoAtivo";
import { mesPt } from "./lib/resumoAtivo";

interface Props {
  resumo: ResumoAmortizacao;
  /** O ativo está desativado: a amortização parou (o «fim» é o mês da desativação). */
  desativado: boolean;
}

export function AmortizacaoAtivo({ resumo, desativado }: Props) {
  const { t } = useTranslation();
  const percentagem = pct(resumo.percentagem);
  const mesesQueFaltam = Math.max(0, resumo.mesesTotais - resumo.mesesDecorridos);
  const rotuloFim = desativado ? "ativos.amort.fimDesativado" : resumo.concluida ? "ativos.amort.fimConcluida" : "ativos.amort.fim";
  const mostraFalta = resumo.falta > 0 && mesesQueFaltam > 0 && !desativado;
  return (
    <div className="space-y-4" data-testid="detalhe-amortizacao">
      <div
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={resumo.percentagem}
        aria-label={t("ativos.amort.barra", { pct: percentagem })} data-testid="detalhe-amortizacao-barra"
        className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none", desativado ? "bg-muted-foreground/60" : "bg-primary")}
          style={{ width: `${resumo.percentagem}%` }}
        />
      </div>
      <section aria-labelledby="ativo-amortizacao">
        <h3 id="ativo-amortizacao" className={TITULO_SECCAO}>{t("ativos.detalhe.seccaoAmortizacao")}</h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Dado rotulo={t("ativos.amort.amortizado")} id="detalhe-amortizado">
            {t("ativos.amort.amortizadoValor", { valor: euros(resumo.amortizado, "—"), pct: percentagem })}
          </Dado>
          <Dado rotulo={t("ativos.amort.meses")} id="detalhe-meses">{t("ativos.amort.mesesValor", { n: resumo.mesesDecorridos, total: resumo.mesesTotais })}</Dado>
          {mostraFalta && (
            <Dado rotulo={t("ativos.amort.falta")} id="detalhe-falta">
              {t(mesesQueFaltam === 1 ? "ativos.amort.faltaUm" : "ativos.amort.faltaValor", { valor: euros(resumo.falta, "—"), n: mesesQueFaltam })}
            </Dado>
          )}
          <Dado rotulo={t(rotuloFim)} id="detalhe-fim-amortizacao">{mesPt(resumo.fim)}</Dado>
        </dl>
      </section>
    </div>
  );
}
