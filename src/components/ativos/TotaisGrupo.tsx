/**
 * O topo de cada separador: o VALOR ATUAL em grande, a barra repartida «Amortizado / Valor atual» com a legenda e, ao lado, quatro
 * indicadores (ativos em uso, valor de compra, rendas por mês e um do grupo: sem valor atual no Serviço, equipamentos parados na
 * Estrutura, livres em Pessoas). Aparece sempre, mesmo a zeros. A conta é a de `totaisAtivos` (a mesma do detalhe) e SÓ dos comprados:
 * os alugados não têm valor de compra nem amortização e vão nas rendas. O que não tem valor atual (só vida em horas, ou modelo sem vida)
 * conta na quantidade e na compra, não no valor atual, e fica dito numa legenda. Os desativados nunca entram (com «Todos» ou
 * «Desativados» a legenda diz-o) e, se a lista foi cortada nos 2000, os totais dizem que são parciais.
 */
import type { ReactNode } from "react";
import { euros } from "@/components/rh-exemplo/custo/formato";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { ICONE_GRUPO, MARCA_VALOR, TOM_GRUPO, partirTexto } from "./lib/ativosUi";
import type { TotaisAtivos } from "./lib/resumoAtivo";
import type { GrupoAtivo } from "./lib/tipos";

const ROTULO = "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CARTAO = "rounded-2xl border bg-card shadow-sm";

/** Um indicador: rótulo, valor em grande e uma legenda curta. */
function Indicador({ rotulo, valor, legenda, id }: { rotulo: string; valor: string; legenda?: string; id?: string }) {
  return (
    <div className={cn(CARTAO, "min-w-0 px-4 py-3.5 sm:px-5 sm:py-4")}>
      <dt className={ROTULO}>{rotulo}</dt>
      <dd className="mt-1.5 min-w-0">
        <span data-testid={id} className="block truncate text-xl font-bold tabular-nums tracking-tight sm:text-2xl">{valor}</span>
        {legenda && <span className="mt-0.5 block text-xs text-muted-foreground">{legenda}</span>}
      </dd>
    </div>
  );
}

/**
 * Um indicador cujo texto é uma frase com o valor no meio («Rendas: 450,00 € por mês (1 alugado)»): o rótulo é o que vem antes, o valor
 * vai em grande e a legenda é o resto. O conteúdo do elemento é a frase inteira, tal como antes.
 */
function IndicadorFrase({ frase, valor, id }: { frase: string; valor: string; id?: string }) {
  const [antes, depois] = partirTexto(frase, MARCA_VALOR);
  // «Rendas: » -> o rótulo sem os dois pontos à vista; o «: » fica para o leitor de ecrã (e o texto do elemento não muda).
  const [, rotulo, pontos] = /^(.*?)(:?\s*)$/s.exec(antes) ?? [antes, antes, ""];
  return (
    <div data-testid={id} className={cn(CARTAO, "min-w-0 px-4 py-3.5 sm:px-5 sm:py-4")}>
      <dt className={ROTULO}>{rotulo}{pontos && <span className="sr-only">{pontos}</span>}</dt>
      <dd className="mt-1.5 min-w-0">
        <span className="block truncate text-xl font-bold tabular-nums tracking-tight sm:text-2xl">{valor}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{depois}</span>
      </dd>
    </div>
  );
}

interface Props {
  grupo: GrupoAtivo;
  totais: TotaisAtivos;
  /** A lista foi cortada nos 2000 ativos que a base devolve: os totais podem estar incompletos. */
  parcial?: boolean;
  /** O filtro de estado mostra também (ou só) desativados: os totais continuam a contar só os em uso. */
  soEmUso?: boolean;
  /** Só no separador Estrutura: o que custam este mês os equipamentos de Pessoas que ninguém tem. */
  parado?: number | null;
  /** Só no separador Pessoas: quantos em uso estão livres (ninguém os tem). */
  livres?: number | null;
}

export function TotaisGrupo({ grupo, totais, parcial = false, soEmUso = false, parado = null, livres = null }: Props) {
  const { t } = useTranslation();
  const nomeGrupo = t(`ativos.grupo.${grupo}`);
  const Icone = ICONE_GRUPO[grupo];
  const base = totais.amortizado + totais.valorAtual;
  const parteAmortizada = base > 0 ? Math.min(100, Math.max(0, (totais.amortizado / base) * 100)) : 0;
  const rendas = t(totais.alugados === 1 ? "ativos.totais.rendas1" : "ativos.totais.rendas", { valor: MARCA_VALOR, n: totais.alugados });

  let quarto: ReactNode;
  if (grupo === "estrutura") {
    const valor = parado ?? 0;
    quarto = <IndicadorFrase frase={t("ativos.totais.parado", { valor: MARCA_VALOR })} valor={euros(valor, "—")} id={valor > 0 ? "total-parado" : undefined} />;
  } else if (grupo === "pessoa") {
    quarto = <Indicador rotulo={t("ativos.ui.kpi.livres")} valor={String(livres ?? 0)} legenda={t("ativos.ui.kpi.livresLegenda")} />;
  } else {
    quarto = <Indicador rotulo={t("ativos.ui.kpi.semValor")} valor={String(totais.semValorAtual)} legenda={t("ativos.ui.kpi.semValorLegenda")} />;
  }

  return (
    <section aria-label={t("ativos.totais.titulo", { grupo: nomeGrupo })} className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <div className={cn(CARTAO, "flex min-w-0 flex-col gap-4 p-5 sm:p-7")}>
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", TOM_GRUPO[grupo])}>
            <Icone className="h-4 w-4" />
          </span>
          <span className={ROTULO}>{t("ativos.ui.hero.rotulo", { grupo: nomeGrupo })}</span>
        </div>
        <p
          data-testid="total-atual"
          className="break-words text-4xl font-bold leading-none tracking-tight tabular-nums sm:text-5xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500"
        >
          {euros(totais.valorAtual, "—")}
        </p>
        <div>
          <div aria-hidden="true" className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary/25 transition-[width] duration-500 motion-reduce:transition-none dark:bg-primary/35"
              style={{ width: `${parteAmortizada}%`, backgroundImage: "repeating-linear-gradient(135deg, hsl(var(--primary) / 0.35) 0 6px, transparent 6px 12px)" }}
            />
            {totais.valorAtual > 0 && <div className="h-full flex-1 bg-primary" />}
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-primary/40" />
              <dt>{t("ativos.totais.amortizado")}</dt>
              <dd data-testid="total-amortizado" className="font-semibold tabular-nums text-foreground">{euros(totais.amortizado, "—")}</dd>
            </div>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-primary" />
              <dt>{t("ativos.totais.atual")}</dt>
              <dd className="font-semibold tabular-nums text-foreground">{euros(totais.valorAtual, "—")}</dd>
            </div>
          </dl>
        </div>
        <div className="space-y-0.5 text-xs text-muted-foreground">
          {totais.alugados > 0 && <p>{t("ativos.totais.soComprados")}</p>}
          {totais.semValorAtual > 0 && <p>{t("ativos.totais.porUso", { n: totais.semValorAtual })}</p>}
          {soEmUso && <p>{t("ativos.totais.soEmUso")}</p>}
          {parcial && <p className="font-semibold text-amber-800 dark:text-warning">{t("ativos.totais.parcial")}</p>}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:gap-4">
        <Indicador id="total-quantidade" rotulo={t("ativos.totais.quantidade")} valor={String(totais.quantidade)} />
        <Indicador id="total-compra" rotulo={t("ativos.totais.compra")} valor={euros(totais.valorCompra, "—")} legenda={t("ativos.ui.kpi.dosComprados")} />
        <IndicadorFrase frase={rendas} valor={euros(totais.rendaMensal, "—")} id={totais.alugados > 0 ? "total-rendas" : undefined} />
        {quarto}
      </dl>
    </section>
  );
}
